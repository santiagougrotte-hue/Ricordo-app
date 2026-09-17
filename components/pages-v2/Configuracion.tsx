"use client";

import React, { useMemo, useRef, useState } from "react";
import { useStoreV2 } from "@/lib/store-v2";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import {
  PageHeader,
  Card,
  Button,
  FilterTabs,
  FormGrid,
  Field,
  Input,
  Select,
  Textarea,
  TableWrap,
  Th,
  Td,
  TrHover,
  EmptyState,
  Badge,
  InfoRow,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import { fNum } from "@/lib/calc-v2";
import type { AmbitoCategoria, EstadoRevisionItem, RevisionItem, RicordoDocument, ProveedorMapa, MetodoDistribucionCostoRuta } from "@/lib/types-v2";

const GUIA_SECCION: Record<string, string> = {
  pedidos: "Ventas → Pedidos",
  pedido_items: "Ventas → Pedidos",
  productos: "Productos",
  producto_variantes: "Productos",
  recetas: "Productos → Recetas",
  receta_items: "Productos → Recetas",
  ajustes_receta_variante: "Productos → Recetas",
  insumos: "Inventario → Insumos",
  historial_precios: "Inventario → Insumos",
  compra_items: "Inventario → Compras",
  inventario_movimientos: "Inventario → Movimientos",
  produccion: "Operaciones → Producción",
  movimientos_financieros: "Finanzas",
  activos: "Finanzas → Activos e inversiones",
};

function guiaParaSeccion(seccion: string): string {
  return GUIA_SECCION[seccion] ?? "Configuración";
}

const ESTADO_BADGE: Record<EstadoRevisionItem, { texto: string; color: "orange" | "green" | "gold" }> = {
  pendiente: { texto: "Pendiente", color: "orange" },
  resuelto: { texto: "Resuelto", color: "green" },
  ignorado: { texto: "Ignorado", color: "gold" },
};

function GeneralTab() {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const [tc, setTc] = useState(data.configuracion.tipo_cambio);

  function guardarTipoCambio() {
    setData((d) => ({ ...d, configuracion: { ...d.configuracion, tipo_cambio: tc } }));
    toast("Tipo de cambio actualizado");
  }

  function setUmbral<K extends keyof typeof data.configuracion>(key: K, value: (typeof data.configuracion)[K]) {
    setData((d) => ({ ...d, configuracion: { ...d.configuracion, [key]: value } }));
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="Tipo de cambio">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Field label="Valor ARS/USD">
            <Input type="number" value={tc.valor} onChange={(e) => setTc({ ...tc, valor: Number(e.target.value) })} />
          </Field>
          <Field label="Fuente">
            <Input value={tc.fuente} onChange={(e) => setTc({ ...tc, fuente: e.target.value })} placeholder="oficial, blue, MEP…" />
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={guardarTipoCambio}>Guardar</Button>
        </div>
      </Card>

      <Card title="Caja">
        <p className="mb-3 text-[12.5px] text-text3">
          Punto de partida del Flujo de caja (Finanzas → Tesorería → Flujo y proyección) antes de sumar cualquier
          movimiento — no es un ingreso ni un gasto, y nunca debería usarse para forzar el saldo con un movimiento
          artificial (para eso está &ldquo;Ajuste de saldo&rdquo; en Tesorería → Caja).
        </p>
        <Field label="Saldo inicial de caja">
          <Input
            type="number"
            value={data.configuracion.saldo_inicial_caja}
            onChange={(e) => setUmbral("saldo_inicial_caja", Number(e.target.value))}
          />
        </Field>
      </Card>

      <Card title="Umbrales de alerta">
        <FormGrid>
          <Field label="Stock bajo de producto">
            <Input
              type="number"
              value={data.configuracion.umbral_stock_bajo_producto}
              onChange={(e) => setUmbral("umbral_stock_bajo_producto", Number(e.target.value))}
            />
          </Field>
          <Field label="Días de riesgo mayorista">
            <Input
              type="number"
              value={data.configuracion.umbral_dias_mayorista_riesgo}
              onChange={(e) => setUmbral("umbral_dias_mayorista_riesgo", Number(e.target.value))}
            />
          </Field>
          <Field label="Compras/consumo — amarillo %">
            <Input
              type="number"
              value={data.configuracion.umbral_compras_consumo_amber}
              onChange={(e) => setUmbral("umbral_compras_consumo_amber", Number(e.target.value))}
            />
          </Field>
          <Field label="Compras/consumo — rojo %">
            <Input
              type="number"
              value={data.configuracion.umbral_compras_consumo_red}
              onChange={(e) => setUmbral("umbral_compras_consumo_red", Number(e.target.value))}
            />
          </Field>
        </FormGrid>
      </Card>

      <Card title="Envíos">
        <FormGrid>
          <Field label="Precio litro de nafta">
            <Input
              type="number"
              value={data.configuracion.envios.litro_nafta}
              onChange={(e) => setUmbral("envios", { ...data.configuracion.envios, litro_nafta: Number(e.target.value) })}
            />
          </Field>
          <Field label="Consumo cada 100km">
            <Input
              type="number"
              value={data.configuracion.envios.consumo_100km}
              onChange={(e) => setUmbral("envios", { ...data.configuracion.envios, consumo_100km: Number(e.target.value) })}
            />
          </Field>
          <Field label="Km margen gratis">
            <Input
              type="number"
              value={data.configuracion.envios.margen_gratis}
              onChange={(e) => setUmbral("envios", { ...data.configuracion.envios, margen_gratis: Number(e.target.value) })}
            />
          </Field>
          <Field label="Precio de envío fijo">
            <Input
              type="number"
              value={data.configuracion.envios.precio_envio_fijo}
              onChange={(e) => setUmbral("envios", { ...data.configuracion.envios, precio_envio_fijo: Number(e.target.value) })}
            />
          </Field>
        </FormGrid>
      </Card>

      <Card title="Entregas y rutas">
        <p className="mb-3 text-[12.5px] text-text3">
          Base de operaciones y proveedor de mapas usados por Operaciones → Entregas para calcular
          distancia, tiempo y costo de las rutas de reparto.
        </p>
        <FormGrid>
          <Field label="Dirección base" full>
            <Input
              value={data.configuracion.envios.direccion_base ?? ""}
              onChange={(e) => setUmbral("envios", { ...data.configuracion.envios, direccion_base: e.target.value })}
            />
          </Field>
          <Field label="Latitud base">
            <Input
              type="number"
              value={data.configuracion.envios.lat_base ?? ""}
              onChange={(e) => setUmbral("envios", { ...data.configuracion.envios, lat_base: e.target.value ? Number(e.target.value) : undefined })}
            />
          </Field>
          <Field label="Longitud base">
            <Input
              type="number"
              value={data.configuracion.envios.lng_base ?? ""}
              onChange={(e) => setUmbral("envios", { ...data.configuracion.envios, lng_base: e.target.value ? Number(e.target.value) : undefined })}
            />
          </Field>
          <Field label="Vehículo">
            <Input
              value={data.configuracion.envios.vehiculo ?? ""}
              onChange={(e) => setUmbral("envios", { ...data.configuracion.envios, vehiculo: e.target.value })}
              placeholder="Ej: Moto, Fiorino…"
            />
          </Field>
          <Field label="Fecha actualización precio combustible">
            <Input
              type="date"
              value={data.configuracion.envios.fecha_actualizacion_combustible ?? ""}
              onChange={(e) => setUmbral("envios", { ...data.configuracion.envios, fecha_actualizacion_combustible: e.target.value })}
            />
          </Field>
          <Field label="Regresar a base por defecto">
            <Select
              value={data.configuracion.envios.regresar_a_base_default === false ? "no" : "si"}
              onChange={(e) => setUmbral("envios", { ...data.configuracion.envios, regresar_a_base_default: e.target.value === "si" })}
            >
              <option value="si">Sí</option>
              <option value="no">No</option>
            </Select>
          </Field>
          <Field label="Proveedor de mapas">
            <Select
              value={data.configuracion.envios.proveedor_mapa ?? "ninguno"}
              onChange={(e) => setUmbral("envios", { ...data.configuracion.envios, proveedor_mapa: e.target.value as ProveedorMapa })}
            >
              <option value="ninguno">Ninguno (sin cálculo de distancia)</option>
              <option value="haversine">Estimación en línea recta</option>
            </Select>
          </Field>
          <Field label="Método de distribución del costo">
            <Select
              value={data.configuracion.envios.metodo_distribucion_costo ?? "equitativo"}
              onChange={(e) => setUmbral("envios", { ...data.configuracion.envios, metodo_distribucion_costo: e.target.value as MetodoDistribucionCostoRuta })}
            >
              <option value="equitativo">Equitativo (partes iguales)</option>
              <option value="por_distancia_tramo">Proporcional al tramo</option>
            </Select>
          </Field>
        </FormGrid>
      </Card>
    </div>
  );
}

function CategoriasTab() {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const [ambito, setAmbito] = useState<AmbitoCategoria>("producto");
  const [nombre, setNombre] = useState("");

  const filtradas = useMemo(() => data.categorias.filter((c) => c.ambito === ambito), [data.categorias, ambito]);

  function crear() {
    if (!nombre.trim()) {
      toast("El nombre es obligatorio", "error");
      return;
    }
    if (filtradas.some((c) => c.nombre.toLowerCase() === nombre.trim().toLowerCase())) {
      toast("Ya existe una categoría con ese nombre", "error");
      return;
    }
    setData((d) => ({ ...d, categorias: [...d.categorias, { id: uid("CAT"), nombre: nombre.trim(), ambito, activo: true }] }));
    setNombre("");
    toast("Categoría creada");
  }

  function alternarActiva(id: string) {
    setData((d) => ({ ...d, categorias: d.categorias.map((c) => (c.id === id ? { ...c, activo: !c.activo } : c)) }));
  }

  return (
    <div>
      <FilterTabs
        value={ambito}
        onChange={(v) => setAmbito(v as AmbitoCategoria)}
        options={[
          { value: "producto", label: "Productos" },
          { value: "insumo", label: "Insumos" },
          { value: "financiero", label: "Financieras" },
        ]}
      />
      <Card>
        <div className="mb-3 flex gap-2">
          <Input placeholder="Nueva categoría…" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <Button onClick={crear}>+ Agregar</Button>
        </div>
        {filtradas.length === 0 ? (
          <EmptyState text="No hay categorías en este ámbito." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Nombre</Th>
                  <Th>Estado</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((c) => (
                  <TrHover key={c.id}>
                    <Td main>{c.nombre}</Td>
                    <Td>
                      <Badge color={c.activo ? "green" : "red"}>{c.activo ? "Activa" : "Inactiva"}</Badge>
                    </Td>
                    <Td>
                      <Button size="sm" variant="ghost" onClick={() => alternarActiva(c.id)}>
                        {c.activo ? "Desactivar" : "Activar"}
                      </Button>
                    </Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}

type FiltroEstado = EstadoRevisionItem | "todos";

function MigracionTab() {
  const { data, setData, metadata } = useStoreV2();
  const { session } = useAuth();
  const { toast } = useToast();
  const revision = data.datos_pendientes_revision;
  const legacyClaves = Object.keys(data.legacy ?? {});

  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("pendiente");
  const [filtroSeccion, setFiltroSeccion] = useState<string>("todas");
  const [accion, setAccion] = useState<{ id: string; tipo: "resuelto" | "ignorado" } | null>(null);
  const [nota, setNota] = useState("");

  const secciones = useMemo(() => [...new Set(revision.map((r) => r.seccion))].sort(), [revision]);

  const pendientes = useMemo(() => revision.filter((r) => (r.estado ?? "pendiente") === "pendiente"), [revision]);

  const porSeccion = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const r of pendientes) mapa.set(r.seccion, (mapa.get(r.seccion) ?? 0) + 1);
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }, [pendientes]);

  const filtrados = useMemo(() => {
    return revision.filter((r) => {
      const estado = r.estado ?? "pendiente";
      if (filtroEstado !== "todos" && estado !== filtroEstado) return false;
      if (filtroSeccion !== "todas" && r.seccion !== filtroSeccion) return false;
      return true;
    });
  }, [revision, filtroEstado, filtroSeccion]);

  function actualizarItem(id: string, cambios: Partial<RevisionItem>) {
    setData((d) => ({
      ...d,
      datos_pendientes_revision: d.datos_pendientes_revision.map((r) => (r.id === id ? { ...r, ...cambios } : r)),
    }));
  }

  function abrirAccion(id: string, tipo: "resuelto" | "ignorado") {
    setAccion({ id, tipo });
    setNota("");
  }

  function confirmarAccion() {
    if (!accion) return;
    if (accion.tipo === "ignorado" && !nota.trim()) {
      toast("Para ignorar un caso hay que explicar el motivo", "error");
      return;
    }
    actualizarItem(accion.id, {
      estado: accion.tipo,
      resuelto_por: session?.user?.email ?? "usuario",
      resuelto_en: new Date().toISOString(),
      nota_resolucion: nota.trim() || undefined,
    });
    toast(accion.tipo === "resuelto" ? "Caso marcado como resuelto" : "Caso marcado como ignorado");
    setAccion(null);
    setNota("");
  }

  function reabrir(id: string) {
    actualizarItem(id, { estado: "pendiente", resuelto_por: undefined, resuelto_en: undefined, nota_resolucion: undefined });
    toast("Caso reabierto — vuelve a contar como pendiente");
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="Migración al esquema V2">
        <InfoRow label="Migrado desde esquema" value={`V${metadata.desde_version}`} />
        <InfoRow label="Fecha de migración" value={new Date(metadata.migrado_en).toLocaleString("es-AR")} />
        <InfoRow label="Casos pendientes de revisión" value={fNum(pendientes.length, 0)} color={pendientes.length > 0 ? "orange" : "green"} />
        <InfoRow label="Casos totales (incluye resueltos/ignorados)" value={fNum(revision.length, 0)} />
      </Card>

      {porSeccion.length > 0 && (
        <Card title="Pendientes, por sección">
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Sección</Th>
                  <Th>Casos</Th>
                  <Th>Dónde corregirlo</Th>
                </tr>
              </thead>
              <tbody>
                {porSeccion.map(([seccion, n]) => (
                  <TrHover key={seccion}>
                    <Td main>{seccion}</Td>
                    <Td>{n}</Td>
                    <Td>{guiaParaSeccion(seccion)}</Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}

      <Card title="Revisión de datos">
        <p className="mb-3 text-[12.5px] text-text3">
          Estos son casos que la migración no pudo resolver con certeza: nunca se corrige ni se inventa un valor acá. Corregí
          el dato en el módulo indicado y después marcá el caso como resuelto, o ignoralo explicando por qué no hace falta
          corregirlo. Mientras un pedido o línea de pedido esté &ldquo;Pendiente&rdquo;, se excluye de las ventas y el EERR.
        </p>
        <div className="mb-3 flex flex-wrap gap-3">
          <FilterTabs
            value={filtroEstado}
            onChange={(v) => setFiltroEstado(v as FiltroEstado)}
            options={[
              { value: "pendiente", label: `Pendientes (${revision.filter((r) => (r.estado ?? "pendiente") === "pendiente").length})` },
              { value: "resuelto", label: "Resueltos" },
              { value: "ignorado", label: "Ignorados" },
              { value: "todos", label: "Todos" },
            ]}
          />
          {secciones.length > 1 && (
            <Select value={filtroSeccion} onChange={(e) => setFiltroSeccion(e.target.value)} style={{ width: 220 }}>
              <option value="todas">Todas las secciones</option>
              {secciones.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          )}
        </div>

        {filtrados.length === 0 ? (
          <EmptyState text="No hay casos con este filtro." />
        ) : (
          <ul className="flex flex-col gap-2">
            {filtrados.map((r) => {
              const estado = r.estado ?? "pendiente";
              const badge = ESTADO_BADGE[estado];
              return (
                <li key={r.id} className="rounded-md border border-border bg-surface2/40 p-3 text-[12.5px]">
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <Badge color={badge.color}>{badge.texto}</Badge>
                    <span className="text-text3">Corregir en: {guiaParaSeccion(r.seccion)}</span>
                  </div>
                  <div className="text-text2">{r.motivo}</div>
                  {r.nota_resolucion && (
                    <div className="mt-1 text-text3">
                      Nota: {r.nota_resolucion}
                      {r.resuelto_por && ` — ${r.resuelto_por}`}
                      {r.resuelto_en && ` (${new Date(r.resuelto_en).toLocaleDateString("es-AR")})`}
                    </div>
                  )}
                  <div className="mt-2 flex gap-2">
                    {estado === "pendiente" ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => abrirAccion(r.id, "resuelto")}>
                          Marcar resuelto
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => abrirAccion(r.id, "ignorado")}>
                          Ignorar
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => reabrir(r.id)}>
                        Reabrir
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {legacyClaves.length > 0 && (
        <Card title="Datos preservados sin lugar en el esquema nuevo (legacy)">
          <p className="text-[12.5px] text-text3">
            {legacyClaves.join(", ")} — se conservan tal cual estaban, no se muestran en ninguna pantalla porque no tenían uso
            en la app anterior.
          </p>
        </Card>
      )}

      <Modal
        open={accion !== null}
        onClose={() => setAccion(null)}
        title={accion?.tipo === "ignorado" ? "Ignorar caso" : "Marcar caso como resuelto"}
      >
        <p className="mb-3 text-[12.5px] text-text3">
          {accion?.tipo === "ignorado"
            ? "Explicá por qué este caso no requiere corrección (por ejemplo: es un dato de prueba, o el valor es correcto tal cual está)."
            : "Confirmá que ya corregiste el dato en el módulo correspondiente. Podés dejar una nota opcional."}
        </p>
        <Field label={accion?.tipo === "ignorado" ? "Motivo (obligatorio)" : "Nota (opcional)"}>
          <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3} />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setAccion(null)}>
            Cancelar
          </Button>
          <Button onClick={confirmarAccion}>Confirmar</Button>
        </div>
      </Modal>
    </div>
  );
}

function BackupTab() {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  function exportar() {
    const documento: RicordoDocument = { schema_version: 2, metadata: { migrado_en: new Date().toISOString(), desde_version: 1 }, data };
    const blob = new Blob([JSON.stringify(documento, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ricordo_backup_v2_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Backup exportado");
  }

  function importar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (parsed?.schema_version === 2 && parsed.data) {
          setData(parsed.data);
          toast("Datos importados");
        } else {
          toast("El archivo no tiene el formato esquema V2 esperado", "error");
        }
      } catch {
        toast("Archivo inválido", "error");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <Card title="Copia de seguridad">
      <p className="mb-3 text-[12.5px] text-text3">
        El backup se guarda en el formato versionado nuevo ({"{"}schema_version: 2{"}"}). Nunca se borra el original: cada
        exportación es un archivo aparte que podés guardar donde quieras.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={exportar}>💾 Exportar datos</Button>
        <Button variant="ghost" onClick={() => fileRef.current?.click()}>
          📂 Importar datos
        </Button>
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={importar} />
      </div>
    </Card>
  );
}

export function Configuracion() {
  const [tab, setTab] = useState("general");
  return (
    <div>
      <PageHeader title="Configuración" sub="Parámetros generales, categorías, migración y respaldo" />
      <FilterTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "general", label: "General" },
          { value: "categorias", label: "Categorías" },
          { value: "migracion", label: "Migración" },
          { value: "backup", label: "Backup" },
        ]}
      />
      {tab === "general" && <GeneralTab />}
      {tab === "categorias" && <CategoriasTab />}
      {tab === "migracion" && <MigracionTab />}
      {tab === "backup" && <BackupTab />}
    </div>
  );
}
