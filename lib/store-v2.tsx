"use client";

// Store del esquema V2 — mismo mecanismo de siempre (una fila en Supabase, `app_state`, con
// cache instantáneo en localStorage y sync en tiempo real), pero migra automáticamente al cargar
// si lo que hay guardado todavía es el esquema viejo (mismo patrón ya usado para reparaciones más
// chicas: transformar al leer, dejar que el guardado automático de abajo persista el resultado).
// Reemplaza lib/store.tsx una vez que todas las pantallas pasen a leer de acá (ver plan de
// refactor) — mientras tanto conviven: las pantallas viejas siguen usando useStore() (V1) sin
// tocarse, las nuevas usan useStoreV2().

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { emptyData as emptyDataV1, type RicordoData } from "./types";
import { emptyDataV2, type RicordoDataV2, type RicordoDocument } from "./types-v2";
import { mapBackupToRicordoData, repararConceptoPackagingEnRecetas } from "./seed";
import { migrarAV2 } from "./migration/v2";
import backupSeed from "./data/backup-seed.json";
import { supabase, supabaseConfigured } from "./supabase";

const STORAGE_KEY_V2 = "ricordo_data_v2";
const ROW_ID = "main";

type SetDataV2 = (updater: RicordoDataV2 | ((d: RicordoDataV2) => RicordoDataV2)) => void;
export type SyncStatus = "local" | "syncing" | "synced" | "error";

interface StoreV2Ctx {
  data: RicordoDataV2;
  setData: SetDataV2;
  ready: boolean;
  syncStatus: SyncStatus;
  metadata: RicordoDocument["metadata"];
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
    return { data: valorCrudo.data, metadata: valorCrudo.metadata, eraV2: true };
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
      return { data: { ...emptyDataV2(), ...parsed.data }, metadata: parsed.metadata };
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

export function StoreV2Provider({ children }: { children: React.ReactNode }) {
  const [data, setDataState] = useState<RicordoDataV2>(() => emptyDataV2());
  const [ready, setReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(supabaseConfigured ? "syncing" : "local");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushed = useRef<string | null>(null);
  // Metadata estable del documento (fecha de migración original) — se fija una sola vez, nunca
  // se regenera en cada guardado (si no, "migrado_en" cambiaría con cada edición). Se espeja en
  // estado (`metadataState`) solo para exponerla a los componentes vía contexto — el ref sigue
  // siendo la fuente de verdad que lee el guardado automático de abajo.
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
      .select("data")
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
          // Si ya era V2, esto coincide exactamente con lo que el guardado automático de abajo
          // recalcula, así que no reintenta nada. Si se acaba de migrar de V1, lastPushed queda
          // apuntando a lo viejo a propósito: el guardado automático detecta la diferencia y
          // empuja la migración a Supabase una sola vez.
          lastPushed.current = JSON.stringify(row.data);
        } else {
          // Primera vez que se usa: sembrar la fila compartida con lo que haya localmente.
          const { data: seedData, metadata } = local ? { data: local.data, metadata: local.metadata } : comoV2(mapBackupToRicordoData(backupSeed));
          setDataState(seedData);
          fijarMetadata(metadata);
          const documento: RicordoDocument = { schema_version: 2, metadata, data: seedData };
          lastPushed.current = JSON.stringify(documento);
          await client.from("app_state").upsert({ id: ROW_ID, data: documento, updated_at: new Date().toISOString() });
        }
        setSyncStatus("synced");
        setReady(true);
      });

    const channel = client
      .channel("app_state_changes_v2")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "app_state", filter: `id=eq.${ROW_ID}` },
        (payload) => {
          if (pendingSave.current) return;
          const incoming = payload.new?.data;
          if (!incoming) return;
          const serialized = JSON.stringify(incoming);
          if (serialized === lastPushed.current) return; // eco de nuestro propio guardado
          lastPushed.current = serialized;
          const { data: dataV2, metadata } = comoV2(incoming);
          setDataState(dataV2);
          fijarMetadata(metadata);
          saveToLocalStorage({ schema_version: 2, metadata, data: dataV2 });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      client.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    pendingSave.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const documento: RicordoDocument = { schema_version: 2, metadata: metadataRef.current, data };
      saveToLocalStorage(documento);
      if (supabaseConfigured && supabase) {
        const serialized = JSON.stringify(documento);
        if (serialized !== lastPushed.current) {
          lastPushed.current = serialized;
          setSyncStatus("syncing");
          const { error } = await supabase.from("app_state").upsert({ id: ROW_ID, data: documento, updated_at: new Date().toISOString() });
          setSyncStatus(error ? "error" : "synced");
        }
      }
      pendingSave.current = false;
    }, 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [data, ready]);

  const setData = useCallback<SetDataV2>((updater) => {
    setDataState((prev) => (typeof updater === "function" ? (updater as (d: RicordoDataV2) => RicordoDataV2)(prev) : updater));
  }, []);

  return <Ctx.Provider value={{ data, setData, ready, syncStatus, metadata: metadataState }}>{children}</Ctx.Provider>;
}

export function useStoreV2(): StoreV2Ctx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStoreV2 must be used within StoreV2Provider");
  return ctx;
}
