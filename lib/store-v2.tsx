"use client";

// Store del esquema V2 — un solo documento JSON por negocio en Supabase (`app_state`, fila única
// `id = 'main'`), con cache instantáneo en localStorage y sync en tiempo real. Migra
// automáticamente al cargar si lo que hay guardado todavía es el esquema viejo.
//
// FASE 0 (auditoría de persistencia, septiembre 2026): el guardado usaba `upsert` ciego — pisaba
// la fila entera sin preguntar "¿esto cambió desde la última vez que lo leí?". Con dos
// dispositivos (o dos pestañas) editando la misma fila, el que guardaba último ganaba sin aviso,
// y un guardado fallido (sesión vencida, blip de red) se marcaba como exitoso igual porque
// `lastPushed` se actualizaba ANTES de confirmar la escritura. Ver diagnóstico completo en la
// conversación — acá se corrigen las dos causas raíz:
//   1. Escritura condicionada por `version` (concurrencia optimista) en vez de upsert ciego.
//   2. `lastPushed`/`version` solo avanzan tras una escritura CONFIRMADA, nunca antes.
// Cuando la condición de versión falla (alguien más ya guardó), NUNCA se fusiona ni se pisa solo
// — se le muestra a la persona qué secciones difieren y elige qué conservar (pedido explícito:
// nunca inventar una fusión automática de datos reales).

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { emptyData as emptyDataV1, type RicordoData } from "./types";
import { emptyDataV2, type RicordoDataV2, type RicordoDocument } from "./types-v2";
import { mapBackupToRicordoData, repararConceptoPackagingEnRecetas } from "./seed";
import { migrarAV2 } from "./migration/v2";
import backupSeed from "./data/backup-seed.json";
import { supabase, supabaseConfigured } from "./supabase";
import { useAuth } from "./auth-context";
import { backoffDelayMs } from "./sync-engine";

const STORAGE_KEY_V2 = "ricordo_data_v2";
const ROW_ID = "main";

type SetDataV2 = (updater: RicordoDataV2 | ((d: RicordoDataV2) => RicordoDataV2)) => void;
export type SyncStatus = "local" | "syncing" | "synced" | "error" | "conflict";

export interface ConflictoSync {
  local: RicordoDataV2;
  remoto: RicordoDataV2;
  version_remota: number;
}

interface StoreV2Ctx {
  data: RicordoDataV2;
  setData: SetDataV2;
  ready: boolean;
  syncStatus: SyncStatus;
  metadata: RicordoDocument["metadata"];
  conflicto: ConflictoSync | null;
  /** "local" reintenta guardar la versión que tenías en pantalla (contra la versión remota real,
   * ya no contra la vieja); "remoto" descarta el cambio local sin confirmar y carga lo que había
   * en el servidor. Nunca fusiona las dos automáticamente. */
  resolverConflicto: (eleccion: "local" | "remoto") => void;
  /** Reintento manual desde el estado de error (además del automático con backoff). */
  reintentar: () => void;
}

const Ctx = createContext<StoreV2Ctx | null>(null);

function esDocumentoV2(valor: unknown): valor is RicordoDocument {
  return !!valor && typeof valor === "object" && (valor as { schema_version?: unknown }).schema_version === 2;
}

/** Si lo que se cargó ya es esquema V2, lo devuelve tal cual; si es el esquema viejo (o no
 * existe), lo migra. Nunca se pierde nada: `migrarAV2` preserva todo dato dudoso en
 * `datos_pendientes_revision`/`legacy` en vez de descartarlo. */
function comoV2(valorCrudo: unknown): { data: RicordoDataV2; metadata: RicordoDocument["metadata"]; eraV2: boolean } {
  if (esDocumentoV2(valorCrudo)) {
    // Documento ya v2, pero puede venir de antes de que se agregara un campo nuevo al esquema
    // (ej. fondo_reposicion) — se completa con los defaults en vez de asumir que ya existe, así
    // no rompe con un documento real guardado con una versión anterior del esquema v2.
    const base = emptyDataV2();
    const data: RicordoDataV2 = {
      ...base,
      ...valorCrudo.data,
      configuracion: {
        ...base.configuracion,
        ...valorCrudo.data.configuracion,
        caja_inteligente: { ...base.configuracion.caja_inteligente, ...valorCrudo.data.configuracion?.caja_inteligente },
        fondo_reposicion: { ...base.configuracion.fondo_reposicion, ...valorCrudo.data.configuracion?.fondo_reposicion },
      },
    };
    return { data, metadata: valorCrudo.metadata, eraV2: true };
  }
  const v1 = { ...emptyDataV1(), ...((valorCrudo as Partial<RicordoData>) ?? {}) };
  const reparado = repararConceptoPackagingEnRecetas(v1);
  const { documento } = migrarAV2(reparado);
  return { data: documento.data, metadata: documento.metadata, eraV2: false };
}

function loadFromLocalStorage(): { data: RicordoDataV2; metadata: RicordoDocument["metadata"] } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_V2);
    if (raw) {
      const parsed = JSON.parse(raw) as RicordoDocument;
      const base = emptyDataV2();
      return {
        data: {
          ...base,
          ...parsed.data,
          configuracion: {
            ...base.configuracion,
            ...parsed.data.configuracion,
            caja_inteligente: { ...base.configuracion.caja_inteligente, ...parsed.data.configuracion?.caja_inteligente },
            fondo_reposicion: { ...base.configuracion.fondo_reposicion, ...parsed.data.configuracion?.fondo_reposicion },
          },
        },
        metadata: parsed.metadata,
      };
    }
  } catch {
    /* ignore corrupt storage */
  }
  return null;
}

function saveToLocalStorage(documento: RicordoDocument) {
  try {
    window.localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(documento));
  } catch {
    /* storage full/unavailable */
  }
}

type ResultadoGuardado = { estado: "ok"; nuevaVersion: number } | { estado: "conflicto" } | { estado: "error" };

/** Escritura condicionada por versión: solo pisa la fila si `version` en la base todavía coincide
 * con la que teníamos cuando empezamos a editar. Si 0 filas fueron afectadas, alguien más ya
 * guardó una versión más nueva — nunca se reintenta ciego, sube como conflicto. */
async function intentarGuardarUnaVez(documento: RicordoDocument, versionEsperada: number): Promise<ResultadoGuardado> {
  if (!supabase) return { estado: "error" };
  const nuevaVersion = versionEsperada + 1;
  const { data: filas, error } = await supabase
    .from("app_state")
    .update({ data: documento, updated_at: new Date().toISOString(), version: nuevaVersion })
    .eq("id", ROW_ID)
    .eq("version", versionEsperada)
    .select("version");
  if (error) return { estado: "error" };
  if (!filas || filas.length === 0) return { estado: "conflicto" };
  return { estado: "ok", nuevaVersion };
}

/** Auditoría best-effort: si falla, no rompe el guardado principal (ya confirmado) — solo se
 * pierde ESA entrada de historial, no el dato real. */
async function registrarHistorial(documento: RicordoDocument, version: number, changedBy: string | undefined) {
  if (!supabase) return;
  try {
    await supabase.from("app_state_history").insert({ app_state_id: ROW_ID, version, data: documento, changed_by: changedBy ?? null });
  } catch {
    /* auditoría best-effort — no bloquea ni reintenta */
  }
}

export function StoreV2Provider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [data, setDataState] = useState<RicordoDataV2>(() => emptyDataV2());
  const [ready, setReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(supabaseConfigured ? "syncing" : "local");
  const [conflicto, setConflicto] = useState<ConflictoSync | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushed = useRef<string | null>(null);
  const versionRef = useRef(1);
  const savingRef = useRef(false);
  const intentoRef = useRef(0);
  const conflictoRef = useRef<ConflictoSync | null>(null);
  const sessionEmailRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    sessionEmailRef.current = session?.user?.email;
  }, [session]);
  // Espejo siempre-actualizado de `data` — el guardado y los reintentos lo leen acá en vez de
  // capturar `data` en un closure viejo, así un reintento demorado manda la edición MÁS RECIENTE,
  // nunca una versión vieja que pisaría algo más nuevo.
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Metadata estable del documento (fecha de migración original) — se fija una sola vez, nunca
  // se regenera en cada guardado.
  const metadataInicial: RicordoDocument["metadata"] = { migrado_en: new Date().toISOString(), desde_version: 1 };
  const metadataRef = useRef<RicordoDocument["metadata"]>(metadataInicial);
  const [metadataState, setMetadataState] = useState<RicordoDocument["metadata"]>(metadataInicial);
  function fijarMetadata(m: RicordoDocument["metadata"]) {
    metadataRef.current = m;
    setMetadataState(m);
  }
  // True desde que hay una edición local pendiente hasta que se confirma el push a Supabase —
  // evita que un eco de realtime atrasado pise una edición local más nueva.
  const pendingSave = useRef(false);
  // Indirección para el reintento con backoff: `intentarGuardar` no puede llamarse a sí mismo por
  // nombre (el linter de hooks lo rechaza como referencia inestable) — llama a esta ref en cambio,
  // que un efecto mantiene apuntando siempre a la versión vigente.
  const intentarGuardarRef = useRef<() => void>(() => {});

  const intentarGuardar = useCallback(async () => {
    if (savingRef.current || conflictoRef.current) return; // ya hay un guardado en vuelo, o hay un conflicto sin resolver
    const documento: RicordoDocument = { schema_version: 2, metadata: metadataRef.current, data: dataRef.current };
    saveToLocalStorage(documento);
    if (!supabaseConfigured || !supabase) {
      pendingSave.current = false;
      return;
    }

    const serialized = JSON.stringify(documento);
    if (serialized === lastPushed.current) {
      // Nada que guardar (ej. un reintento disparado justo después de que otro guardado ya
      // confirmó este mismo contenido).
      pendingSave.current = false;
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
      return;
    }

    savingRef.current = true;
    setSyncStatus("syncing");
    const resultado = await intentarGuardarUnaVez(documento, versionRef.current);
    savingRef.current = false;

    if (resultado.estado === "ok") {
      versionRef.current = resultado.nuevaVersion;
      lastPushed.current = serialized;
      intentoRef.current = 0;
      pendingSave.current = false;
      setSyncStatus("synced");
      void registrarHistorial(documento, resultado.nuevaVersion, sessionEmailRef.current);
      return;
    }

    if (resultado.estado === "conflicto") {
      const { data: filaRemota } = await supabase.from("app_state").select("data, version").eq("id", ROW_ID).maybeSingle();
      if (filaRemota) {
        const { data: remotoV2 } = comoV2(filaRemota.data);
        const nuevoConflicto: ConflictoSync = { local: dataRef.current, remoto: remotoV2, version_remota: filaRemota.version };
        conflictoRef.current = nuevoConflicto;
        setConflicto(nuevoConflicto);
        setSyncStatus("conflict");
      } else {
        setSyncStatus("error");
      }
      // pendingSave sigue en true: el cambio local todavía no está confirmado en ningún lado.
      return;
    }

    // Error de red/servidor — nunca se marca como guardado. Reintento automático con backoff.
    setSyncStatus("error");
    intentoRef.current += 1;
    const espera = backoffDelayMs(intentoRef.current);
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = setTimeout(() => {
      intentarGuardarRef.current();
    }, espera);
  }, []);

  useEffect(() => {
    intentarGuardarRef.current = () => {
      void intentarGuardar();
    };
  }, [intentarGuardar]);

  const resolverConflicto = useCallback<StoreV2Ctx["resolverConflicto"]>(
    (eleccion) => {
      const c = conflictoRef.current;
      if (!c) return;
      if (eleccion === "remoto") {
        setDataState(c.remoto);
        dataRef.current = c.remoto;
        versionRef.current = c.version_remota;
        lastPushed.current = JSON.stringify({ schema_version: 2, metadata: metadataRef.current, data: c.remoto });
        saveToLocalStorage({ schema_version: 2, metadata: metadataRef.current, data: c.remoto });
        pendingSave.current = false;
        intentoRef.current = 0;
        conflictoRef.current = null;
        setConflicto(null);
        setSyncStatus("synced");
        return;
      }
      // "local": conservamos lo que estaba en pantalla, pero ahora sabemos la versión remota real
      // — el próximo intento de guardado se hace contra ESA versión, no contra la vieja.
      versionRef.current = c.version_remota;
      conflictoRef.current = null;
      setConflicto(null);
      setSyncStatus("syncing");
      void intentarGuardar();
    },
    [intentarGuardar]
  );

  const reintentar = useCallback(() => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    intentoRef.current = 0;
    void intentarGuardar();
  }, [intentarGuardar]);

  useEffect(() => {
    const local = loadFromLocalStorage();
    if (local) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratación inicial, SSR no tiene window/localStorage
      setDataState(local.data);
      fijarMetadata(local.metadata);
    }

    const client = supabase;
    if (!supabaseConfigured || !client) {
      if (!local) {
        const { data: seedData, metadata } = comoV2(mapBackupToRicordoData(backupSeed));
        setDataState(seedData);
        fijarMetadata(metadata);
      }
      setReady(true);
      return;
    }

    let cancelled = false;
    client
      .from("app_state")
      .select("data, version")
      .eq("id", ROW_ID)
      .maybeSingle()
      .then(async ({ data: row, error }) => {
        if (cancelled) return;
        if (error) {
          setSyncStatus("error");
          setReady(true);
          return;
        }
        if (row?.data) {
          const { data: dataV2, metadata } = comoV2(row.data);
          setDataState(dataV2);
          fijarMetadata(metadata);
          versionRef.current = row.version ?? 1;
          // Si ya era V2, esto coincide exactamente con lo que el guardado automático de abajo
          // recalcula, así que no reintenta nada. Si se acaba de migrar de V1, lastPushed queda
          // apuntando a lo viejo a propósito: el guardado automático detecta la diferencia y
          // empuja la migración a Supabase una sola vez (con la versión ya conocida, así que no
          // choca con nadie).
          lastPushed.current = JSON.stringify(row.data);
        } else {
          // Primera vez que se usa: sembrar la fila compartida con lo que haya localmente.
          const { data: seedData, metadata } = local ? { data: local.data, metadata: local.metadata } : comoV2(mapBackupToRicordoData(backupSeed));
          setDataState(seedData);
          fijarMetadata(metadata);
          const documento: RicordoDocument = { schema_version: 2, metadata, data: seedData };
          const { error: insertError } = await client.from("app_state").insert({ id: ROW_ID, data: documento, updated_at: new Date().toISOString(), version: 1 });
          if (insertError) {
            // Alguien más ya sembró la fila justo antes (carrera muy poco probable en una app de
            // un solo negocio, pero posible) — no perdemos nada: el guardado automático de abajo
            // va a leer la versión que haya y reintentar contra esa, no contra la vieja.
            setReady(true);
            return;
          }
          versionRef.current = 1;
          lastPushed.current = JSON.stringify(documento);
        }
        setSyncStatus("synced");
        setReady(true);
      });

    function manejarCambioRemoto(payload: { new?: { data?: unknown; version?: number } }) {
      const incoming = payload.new?.data;
      const incomingVersion = payload.new?.version;
      if (!incoming) return;
      const serialized = JSON.stringify(incoming);
      if (serialized === lastPushed.current) {
        // Eco de nuestro propio guardado — solo confirma la versión, no hay nada más que hacer.
        if (incomingVersion) versionRef.current = incomingVersion;
        return;
      }
      if (pendingSave.current || conflictoRef.current) {
        // Hay una edición local sin confirmar (o un conflicto ya abierto) — no la pisamos acá.
        // El próximo intento de guardado va a chocar con la versión nueva y va a abrir el flujo
        // de conflicto correctamente, en vez de perder este cambio remoto en silencio.
        return;
      }
      if (incomingVersion) versionRef.current = incomingVersion;
      const { data: dataV2, metadata } = comoV2(incoming);
      setDataState(dataV2);
      fijarMetadata(metadata);
      saveToLocalStorage({ schema_version: 2, metadata, data: dataV2 });
    }

    // Reconexión real del canal si se cae (dormir/despertar el equipo, blip de red): supabase-js
    // reintenta la conexión del socket solo en la mayoría de los casos, pero si el canal queda en
    // un estado terminal (CHANNEL_ERROR/TIMED_OUT/CLOSED) hay que volver a suscribirlo a mano —
    // si no, la app sigue mostrando el último estado conocido sin recibir más cambios de otros
    // dispositivos, y ahí es donde el guardado ciego de antes perdía datos en silencio.
    let canalActivo: ReturnType<typeof client.channel> | null = null;
    let reintentosCanal = 0;
    let timerReconexion: ReturnType<typeof setTimeout> | null = null;

    function suscribirCanal() {
      const channel = client!
        .channel(`app_state_changes_v2_${Date.now()}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "app_state", filter: `id=eq.${ROW_ID}` }, manejarCambioRemoto)
        .subscribe((status) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            reintentosCanal = 0;
            return;
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            reintentosCanal += 1;
            const espera = backoffDelayMs(reintentosCanal);
            timerReconexion = setTimeout(() => {
              if (cancelled) return;
              client!.removeChannel(channel);
              suscribirCanal();
            }, espera);
          }
        });
      canalActivo = channel;
    }
    suscribirCanal();

    return () => {
      cancelled = true;
      if (timerReconexion) clearTimeout(timerReconexion);
      if (canalActivo) client.removeChannel(canalActivo);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    pendingSave.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void intentarGuardar();
    }, 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [data, ready, intentarGuardar]);

  // Si se corta y vuelve la conexión mientras había un guardado pendiente en estado de error,
  // reintentar apenas el navegador avisa que hay red de nuevo — no esperar todo el backoff.
  useEffect(() => {
    function alVolverConexion() {
      if (syncStatus === "error") reintentar();
    }
    window.addEventListener("online", alVolverConexion);
    return () => window.removeEventListener("online", alVolverConexion);
  }, [syncStatus, reintentar]);

  useEffect(() => {
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, []);

  const setData = useCallback<SetDataV2>((updater) => {
    setDataState((prev) => (typeof updater === "function" ? (updater as (d: RicordoDataV2) => RicordoDataV2)(prev) : updater));
  }, []);

  return (
    <Ctx.Provider value={{ data, setData, ready, syncStatus, metadata: metadataState, conflicto, resolverConflicto, reintentar }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStoreV2(): StoreV2Ctx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStoreV2 must be used within StoreV2Provider");
  return ctx;
}
