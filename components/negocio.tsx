"use client";

// Finanzas → Costos fijos y gastos, Estado de resultados (mes a mes), Abrir un local; y los
// parámetros del negocio para Configuración. Reemplazan COSTOS_FIJOS, GASTOS, EERR_MENSUAL,
// ESCENARIO_LOCAL y PARAMETROS de la planilla de Finanzas.

import React, { useMemo, useState } from "react";
import { Check, Plus, Trash2, Undo2 } from "lucide-react";
import { useStoreV2 } from "@/lib/store-v2";
import { usePeriod, MESES } from "@/lib/period";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import { fARS, fNum, mesAnterior } from "@/lib/calc-v2";
import { fFechaCorta } from "@/lib/calc";
import { NUM_BIG, Bar } from "@/components/ds";
import { Button, Input, Select } from "@/components/ui";
import { Bloque } from "@/components/tablero";
import {
  CATEGORIAS_GASTO,
  CATEGORIA_MAQUINARIA,
  calcularEscenario,
  claveMesN,
  configNegocio,
  conNegocio,
  costosFijosMensuales,
  deudaConSanti,
  estadoCostosFijosMes,
  resultadoMes,
} from "@/lib/negocio";
import { calcularEquilibrioMes } from "@/lib/tablero";
import { ventasPorGustoRef } from "@/lib/planificacion";
import type { ConfigNegocio, ItemCostoFijo } from "@/lib/types-v2";

const hoyIso = () => new Date().toLocaleDateString("sv-SE");

function Cifra({ label, valor, tono = "text-text", nota }: { label: string; valor: string; tono?: string; nota?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] text-text3">{label}</div>
      <div className={`mt-1 text-[22px] leading-none ${NUM_BIG} ${tono}`}>{valor}</div>
      {nota && <div className="mt-1.5 text-[11.5px] text-text3">{nota}</div>}
    </div>
  );
}

/** Input de monto que guarda al salir del casillero (no en cada tecla). */
function MontoEditable({ valor, onGuardar, ancho = "w-28" }: { valor: number; onGuardar: (v: number) => void; ancho?: string }) {
  const [texto, setTexto] = useState<string | null>(null);
  return (
    <input
      type="text"
      inputMode="decimal"
      value={texto ?? String(valor)}
      onFocus={() => setTexto(String(valor))}
      onChange={(e) => setTexto(e.target.value.replace(/[^0-9.,]/g, ""))}
      onBlur={() => {
        const n = Number((texto ?? "").replace(",", "."));
        if (texto != null && Number.isFinite(n) && n !== valor) onGuardar(n);
        setTexto(null);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={`${ancho} rounded-lg border border-border bg-surface2 px-2 py-1.5 text-right text-[12.5px] text-text outline-none focus:border-accent [font-variant-numeric:tabular-nums]`}
    />
  );
}

// --- Costos fijos y gastos -----------------------------------------------------------------------

function CostosFijos() {
  const { data, setData } = useStoreV2();
  const { mes, anio } = usePeriod();
  const n = configNegocio(data);
  const estado = estadoCostosFijosMes(data, mes, anio);
  const clave = claveMesN(mes, anio);
  const [verLocal, setVerLocal] = useState(false);
  const set = (cambio: (x: ConfigNegocio) => ConfigNegocio) => setData((d) => conNegocio(d, cambio));
  const editar = (id: string, campos: Partial<ItemCostoFijo>) =>
    set((x) => ({ ...x, costos_fijos: x.costos_fijos.map((c) => (c.id === id ? { ...c, ...campos } : c)) }));
  const items = verLocal ? n.costos_fijos : n.costos_fijos.filter((c) => c.monto_casa > 0);

  return (
    <Bloque
      titulo="Costos fijos"
      bajada="Los cargás una vez y se repiten todos los meses. Si un precio cambia, editalo acá y vale desde ese mes."
      derecha={
        <button onClick={() => setVerLocal((v) => !v)} className="min-h-[34px] rounded-full border border-border px-3.5 text-[12.5px] text-text2 hover:border-accent hover:text-text">
          {verLocal ? "Ver solo los de casa" : "Ver también los del local"}
        </button>
      }
    >
      <div className="mb-5 grid grid-cols-2 gap-4 rounded-2xl bg-surface2 p-4 sm:grid-cols-4">
        <Cifra label={`A pagar en ${MESES[mes - 1].toLowerCase()}`} valor={fARS(estado.a_pagar)} nota="De la cuenta de costos fijos" />
        <Cifra label="Ya pagado" valor={fARS(estado.pagado)} tono="text-green" />
        <Cifra label="Falta pagar" valor={fARS(estado.falta)} tono={estado.falta > 0 ? "text-orange" : "text-green"} />
        <Cifra label="A separar en reinversión" valor={fARS(estado.a_separar_reinversion)} nota="Amortizaciones" />
      </div>
      <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 text-[13px] ${estado.alcanza ? "bg-green-dim" : "bg-red-dim"}`}>
        <span className="text-text">
          {estado.alcanza
            ? `Alcanza: en la cuenta de costos fijos te sobran ${fARS(estado.saldo_cuenta - estado.falta)}.`
            : `No alcanza: faltan ${fARS(estado.falta - estado.saldo_cuenta)} en la cuenta de costos fijos.`}
        </span>
        <span className="flex items-center gap-2 text-text2">
          Saldo de la cuenta
          <MontoEditable valor={n.saldo_cuenta_costos_fijos} onGuardar={(v) => set((x) => ({ ...x, saldo_cuenta_costos_fijos: v }))} />
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[12.5px] [font-variant-numeric:tabular-nums]">
          <thead>
            <tr className="text-left text-[12px] text-text3">
              <th className="py-2 pr-3 font-medium">Costo</th>
              <th className="px-2 py-2 text-right font-medium">Por mes (casa)</th>
              {verLocal && <th className="px-2 py-2 text-right font-medium">En el local</th>}
              <th className="px-2 py-2 font-medium">Se paga desde</th>
              <th className="px-2 py-2 text-center font-medium">Pagado este mes</th>
              <th className="py-2 pl-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((c) => {
              const pagado = n.pagos_costos_fijos[`${clave}:${c.id}`];
              const esAmortizacion = c.se_paga_desde === "reinversion";
              return (
                <tr key={c.id} className="border-t border-border">
                  <td className="py-2 pr-3">
                    <input
                      defaultValue={c.nombre}
                      onBlur={(e) => e.target.value.trim() && e.target.value !== c.nombre && editar(c.id, { nombre: e.target.value.trim() })}
                      className="w-full min-w-[160px] rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-[13px] text-text outline-none hover:border-border focus:border-accent"
                    />
                    <div className="px-1.5 text-[11.5px] text-text3">{c.categoria}</div>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <MontoEditable valor={c.monto_casa} onGuardar={(v) => editar(c.id, { monto_casa: v })} />
                  </td>
                  {verLocal && (
                    <td className="px-2 py-2 text-right">
                      <MontoEditable valor={c.monto_local} onGuardar={(v) => editar(c.id, { monto_local: v })} />
                    </td>
                  )}
                  <td className="px-2 py-2">
                    <Select value={c.se_paga_desde} onChange={(e) => editar(c.id, { se_paga_desde: e.target.value as ItemCostoFijo["se_paga_desde"] })} style={{ width: 190 }}>
                      <option value="costos_fijos">Cuenta de costos fijos</option>
                      <option value="reinversion">Se separa en reinversión</option>
                    </Select>
                  </td>
                  <td className="px-2 py-2 text-center">
                    {esAmortizacion || c.monto_casa === 0 ? (
                      <span className="text-[11.5px] text-text3">—</span>
                    ) : (
                      <button
                        aria-pressed={!!pagado}
                        aria-label={pagado ? `Marcar ${c.nombre} como no pagado` : `Marcar ${c.nombre} como pagado`}
                        onClick={() =>
                          set((x) => {
                            const pagos = { ...x.pagos_costos_fijos };
                            if (pagos[`${clave}:${c.id}`]) delete pagos[`${clave}:${c.id}`];
                            else pagos[`${clave}:${c.id}`] = hoyIso();
                            return { ...x, pagos_costos_fijos: pagos };
                          })
                        }
                        className={`inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-lg border px-2 text-[11.5px] ${
                          pagado ? "border-green/40 bg-green-dim text-green" : "border-border text-text3 hover:text-text"
                        }`}
                      >
                        {pagado ? (
                          <>
                            <Check className="h-3.5 w-3.5" /> {fFechaCorta(pagado).slice(0, 5)}
                          </>
                        ) : (
                          "Pagar"
                        )}
                      </button>
                    )}
                  </td>
                  <td className="py-2 pl-2 text-right">
                    <button
                      aria-label={`Borrar ${c.nombre}`}
                      title="Borrar"
                      onClick={() => window.confirm(`¿Borrar "${c.nombre}" de los costos fijos?`) && set((x) => ({ ...x, costos_fijos: x.costos_fijos.filter((y) => y.id !== c.id) }))}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-text3 hover:bg-surface2 hover:text-red"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-border2 font-semibold">
              <td className="py-3 pr-3 text-text">Total por mes</td>
              <td className="px-2 py-3 text-right text-text">{fARS(costosFijosMensuales(data, "casa"))}</td>
              {verLocal && <td className="px-2 py-3 text-right text-text">{fARS(costosFijosMensuales(data, "local"))}</td>}
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>
      <button
        onClick={() =>
          set((x) => ({
            ...x,
            costos_fijos: [...x.costos_fijos, { id: uid("CFI"), nombre: "Nuevo costo fijo", categoria: "Otros", monto_casa: 0, monto_local: 0, se_paga_desde: "costos_fijos" }],
          }))
        }
        className="mt-3 inline-flex min-h-[36px] items-center gap-1.5 text-[12.5px] font-medium text-accent hover:text-accent2"
      >
        <Plus className="h-4 w-4" /> Agregar costo fijo
      </button>
    </Bloque>
  );
}

function Gastos() {
  const { data, setData } = useStoreV2();
  const { mes, anio } = usePeriod();
  const { toast } = useToast();
  const n = configNegocio(data);
  const [form, setForm] = useState({ fecha: hoyIso(), concepto: "", categoria: "Nafta y envíos", monto: "" as number | "", con: "caja" as "caja" | "bolsillo" });
  const set = (cambio: (x: ConfigNegocio) => ConfigNegocio) => setData((d) => conNegocio(d, cambio));
  const delMes = n.gastos.filter((g) => g.fecha.startsWith(claveMesN(mes, anio))).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const deuda = deudaConSanti(data);
  const valido = form.concepto.trim() && typeof form.monto === "number" && form.monto > 0;

  return (
    <Bloque titulo="Gastos" bajada="Lo que no es costo fijo ni compra de insumos: nafta, arreglos, una máquina. Se cargan uno por uno cuando pasan.">
      <div className="grid grid-cols-1 gap-3 rounded-2xl bg-surface2 p-4 sm:grid-cols-6">
        <label className="sm:col-span-2">
          <span className="mb-1.5 block text-[12px] text-text2">Concepto</span>
          <Input value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} placeholder="Ej.: nafta del reparto" />
        </label>
        <label>
          <span className="mb-1.5 block text-[12px] text-text2">Monto</span>
          <Input type="number" min={0} value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value === "" ? "" : Number(e.target.value) })} />
        </label>
        <label>
          <span className="mb-1.5 block text-[12px] text-text2">Fecha</span>
          <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
        </label>
        <label>
          <span className="mb-1.5 block text-[12px] text-text2">Categoría</span>
          <Select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
            {CATEGORIAS_GASTO.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </label>
        <label>
          <span className="mb-1.5 block text-[12px] text-text2">Lo pagué con</span>
          <Select value={form.con} onChange={(e) => setForm({ ...form, con: e.target.value as "caja" | "bolsillo" })}>
            <option value="caja">La caja del negocio</option>
            <option value="bolsillo">Mi bolsillo</option>
          </Select>
        </label>
        <div className="flex items-end justify-between gap-3 sm:col-span-6">
          <p className="text-[11.5px] text-text3">
            {form.categoria === CATEGORIA_MAQUINARIA
              ? "Maquinaria no es gasto del mes: se descuenta del fondo de reinversión."
              : form.con === "bolsillo"
                ? "El negocio te lo debe hasta que marques que te lo devolviste."
                : "Entra al resultado del mes."}
          </p>
          <Button
            disabled={!valido}
            onClick={() => {
              if (!valido) return;
              set((x) => ({ ...x, gastos: [...x.gastos, { id: uid("GAS"), fecha: form.fecha, concepto: form.concepto.trim(), categoria: form.categoria, monto: form.monto as number, con: form.con }] }));
              setForm({ ...form, concepto: "", monto: "" });
              toast("Gasto cargado");
            }}
          >
            Cargar gasto
          </Button>
        </div>
      </div>

      {deuda.total > 0 && (
        <div className="mt-4 rounded-2xl bg-orange-dim px-4 py-3 text-[13px] text-text">
          El negocio te debe <strong>{fARS(deuda.total)}</strong> de gastos que pagaste de tu bolsillo.
        </div>
      )}

      <div className="mt-4">
        {delMes.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-text3">No hay gastos cargados en {MESES[mes - 1].toLowerCase()}.</p>
        ) : (
          <ul className="divide-y divide-border">
            {delMes.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3 py-3 text-[13px]">
                <span className="min-w-0">
                  <span className="block truncate text-text">{g.concepto}</span>
                  <span className="text-[12px] text-text3">
                    {fFechaCorta(g.fecha)}, {g.categoria}
                    {g.con === "bolsillo" && (g.reintegrado_el ? `, te lo devolviste el ${fFechaCorta(g.reintegrado_el)}` : ", de tu bolsillo")}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-semibold text-text [font-variant-numeric:tabular-nums]">{fARS(g.monto)}</span>
                  {g.con === "bolsillo" && (
                    <Button
                      variant={g.reintegrado_el ? "ghost" : "green"}
                      size="sm"
                      onClick={() => set((x) => ({ ...x, gastos: x.gastos.map((y) => (y.id === g.id ? { ...y, reintegrado_el: y.reintegrado_el ? undefined : hoyIso() } : y)) }))}
                    >
                      {g.reintegrado_el ? <Undo2 className="h-3.5 w-3.5" /> : "Me lo devolví"}
                    </Button>
                  )}
                  <button
                    aria-label={`Borrar ${g.concepto}`}
                    title="Borrar"
                    onClick={() => window.confirm(`¿Borrar "${g.concepto}" (${fARS(g.monto)})?`) && set((x) => ({ ...x, gastos: x.gastos.filter((y) => y.id !== g.id) }))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-text3 hover:bg-surface2 hover:text-red"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Bloque>
  );
}

export function CostosGastosTab() {
  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      <CostosFijos />
      <Gastos />
    </div>
  );
}

// --- Estado de resultados mes a mes --------------------------------------------------------------

export function EerrMensualTab() {
  const { data } = useStoreV2();
  const { mes, anio } = usePeriod();
  const meses = useMemo(() => {
    const out: { mes: number; anio: number }[] = [{ mes, anio }];
    let m = { mes, anio };
    for (let i = 0; i < 5; i++) {
      m = mesAnterior(m.mes, m.anio);
      out.unshift(m);
    }
    return out.filter((x) => `${x.anio}-${String(x.mes).padStart(2, "0")}` >= "2026-09");
  }, [mes, anio]);
  const cols = useMemo(() => meses.map((m) => resultadoMes(data, m.mes, m.anio)), [data, meses]);
  type Fila = { label: string; valor: (r: (typeof cols)[number]) => number; tipo?: "total" | "resta" | "final" | "detalle" };
  const categoriasFijos = [...new Set(cols.flatMap((r) => r.costos_fijos_por_categoria.map((c) => c.categoria)))];
  const categoriasGastos = [...new Set(cols.flatMap((r) => r.gastos_por_categoria.map((c) => c.categoria)))];
  const filas: Fila[] = [
    { label: "Ventas netas", valor: (r) => r.ventas },
    { label: "Costo de la mercadería (CMV)", valor: (r) => r.cmv, tipo: "resta" },
    { label: "Margen bruto", valor: (r) => r.margen_bruto, tipo: "total" },
    { label: "Envíos y otros variables", valor: (r) => r.costos_variables, tipo: "resta" },
    { label: "Margen antes de tu sueldo", valor: (r) => r.margen_antes_sueldo, tipo: "total" },
    { label: "Costos fijos", valor: (r) => r.costos_fijos, tipo: "resta" },
    ...categoriasFijos.map<Fila>((c) => ({ label: c, valor: (r) => r.costos_fijos_por_categoria.find((x) => x.categoria === c)?.monto ?? 0, tipo: "detalle" })),
    { label: "Gastos anotados", valor: (r) => r.gastos, tipo: "resta" },
    ...categoriasGastos.map<Fila>((c) => ({ label: c, valor: (r) => r.gastos_por_categoria.find((x) => x.categoria === c)?.monto ?? 0, tipo: "detalle" })),
    { label: "Lo que el negocio pudo pagarte", valor: (r) => r.sueldo_cubierto, tipo: "total" },
    { label: "Sueldo objetivo", valor: (r) => r.sueldo_objetivo, tipo: "resta" },
    { label: "Resultado neto", valor: (r) => r.resultado_neto, tipo: "final" },
  ];
  const nombre = (m: { mes: number; anio: number }) => `${MESES[m.mes - 1].slice(0, 3).toLowerCase()} ${String(m.anio).slice(2)}`;
  const actual = cols[cols.length - 1];
  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      {actual && (
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          {[
            { l: "Ventas del mes", v: actual.ventas },
            { l: "Margen antes de tu sueldo", v: actual.margen_antes_sueldo, n: actual.margen_antes_sueldo_pct != null ? `${fNum(actual.margen_antes_sueldo_pct, 0)}% de las ventas` : undefined },
            { l: "Pudo pagarte de sueldo", v: actual.sueldo_cubierto, n: `Objetivo ${fARS(actual.sueldo_objetivo)}` },
            { l: "Resultado neto", v: actual.resultado_neto },
          ].map((k) => (
            <div key={k.l} className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
              <Cifra label={k.l} valor={fARS(k.v)} tono={k.l === "Resultado neto" ? (k.v >= 0 ? "text-green" : "text-red") : "text-text"} nota={k.n} />
            </div>
          ))}
        </div>
      )}
      <Bloque titulo="Estado de resultados mes a mes" bajada="Igual que tu planilla: el sueldo objetivo completo se resta al final, y la mano de obra queda adentro de lo que el negocio pudo pagarte.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[12.5px] [font-variant-numeric:tabular-nums]">
            <thead>
              <tr className="text-[12px] text-text3">
                <th className="py-2 pr-3 text-left font-medium">Concepto</th>
                {meses.map((m, i) => (
                  <th key={i} className={`px-2 py-2 text-right font-medium ${i === meses.length - 1 ? "text-accent" : ""}`}>
                    {nombre(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.label} className={`border-t border-border ${f.tipo === "total" || f.tipo === "final" ? "font-semibold" : ""} ${f.tipo === "final" ? "border-border2" : ""}`}>
                  <td className={`py-2.5 pr-3 ${f.tipo === "resta" ? "pl-4 text-text2" : f.tipo === "detalle" ? "pl-9 text-[12px] text-text3" : "text-text"}`}>
                    {f.tipo === "resta" ? `− ${f.label}` : f.label}
                  </td>
                  {cols.map((r, i) => {
                    const v = f.valor(r);
                    const tono = f.tipo === "final" ? (v >= 0 ? "text-green" : "text-red") : f.tipo === "resta" ? "text-text2" : f.tipo === "detalle" ? "text-[12px] text-text3" : "text-text";
                    return (
                      <td key={i} className={`px-2 py-2.5 text-right ${tono}`}>
                        {f.tipo === "detalle" && v === 0 ? "—" : fARS(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Bloque>
    </div>
  );
}

// --- Abrir un local ------------------------------------------------------------------------------

export function EscenarioLocalTab() {
  const { data, setData } = useStoreV2();
  const { mes, anio } = usePeriod();
  const hoy = hoyIso();
  const n = configNegocio(data);
  const eq = useMemo(() => calcularEquilibrioMes(data, mes, anio, hoy), [data, mes, anio, hoy]);
  const mejorMes = useMemo(() => {
    let mejor = 0;
    let m = { mes, anio };
    for (let i = 0; i < 12; i++) {
      const v = ventasPorGustoRef(data, `${m.anio}-${String(m.mes).padStart(2, "0")}-01`, `${m.anio}-${String(m.mes).padStart(2, "0")}-31`);
      mejor = Math.max(mejor, Math.round([...v.values()].reduce((a, x) => a + x, 0)));
      m = mesAnterior(m.mes, m.anio);
    }
    return mejor;
  }, [data, mes, anio]);
  const e = calcularEscenario(data, eq.precio_promedio_caja ?? 0, eq.margen_contribucion_pct ?? 0, mejorMes);
  const set = (cambio: (x: ConfigNegocio) => ConfigNegocio) => setData((d) => conNegocio(d, cambio));
  const setEsc = (campos: Partial<ConfigNegocio["escenario"]>) => set((x) => ({ ...x, escenario: { ...x.escenario, ...campos } }));

  const fila = (label: string, casa: React.ReactNode, local: React.ReactNode, nota?: string) => (
    <tr className="border-t border-border">
      <td className="py-2.5 pr-3 text-text">
        {label}
        {nota && <div className="text-[11.5px] text-text3">{nota}</div>}
      </td>
      <td className="px-2 py-2.5 text-right">{casa}</td>
      <td className="py-2.5 pl-2 text-right">{local}</td>
    </tr>
  );

  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5 sm:p-6">
          <Cifra label="Ganancia por mes en casa" valor={fARS(e.ganancia_casa)} tono={e.ganancia_casa >= 0 ? "text-green" : "text-red"} nota={`Con ${e.cajas_casa} cajas (tu mejor mes)`} />
        </div>
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5 sm:p-6">
          <Cifra label="Ganancia por mes en el local" valor={fARS(e.ganancia_local)} tono={e.ganancia_local >= 0 ? "text-green" : "text-red"} nota={`Con ${e.cajas_local} cajas`} />
        </div>
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5 sm:p-6">
          <Cifra
            label="Recuperás la inversión en"
            valor={e.meses_recupero != null ? `${fNum(e.meses_recupero, 1)} meses` : "No se recupera"}
            tono={e.meses_recupero != null ? "text-text" : "text-red"}
            nota={`Inversión de ${fARS(e.inversion_total)}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Bloque titulo="Seguir en casa o abrir un local" bajada="Con el precio promedio por caja y tu margen de los últimos meses.">
          <table className="w-full text-[12.5px] [font-variant-numeric:tabular-nums]">
            <thead>
              <tr className="text-[12px] text-text3">
                <th className="py-2 pr-3 text-left font-medium" />
                <th className="px-2 py-2 text-right font-medium">Taller en casa</th>
                <th className="py-2 pl-2 text-right font-medium">Local</th>
              </tr>
            </thead>
            <tbody className="text-text2">
              {fila(
                "Capacidad máxima (cajas por mes)",
                <MontoEditable ancho="w-20" valor={n.escenario.capacidad_casa} onGuardar={(v) => setEsc({ capacidad_casa: v })} />,
                <MontoEditable ancho="w-20" valor={n.escenario.capacidad_local} onGuardar={(v) => setEsc({ capacidad_local: v })} />
              )}
              {fila("Precio promedio por caja", fARS(e.precio_caja), fARS(e.precio_caja))}
              {fila("Margen por caja antes de tu sueldo", fARS(e.margen_por_caja), fARS(e.margen_por_caja))}
              {fila("Costos fijos + sueldo objetivo", fARS(e.fijos_casa), fARS(e.fijos_local), "Los del local se cargan en Costos fijos")}
              {fila("Punto de equilibrio (cajas por mes)", e.equilibrio_casa ?? "—", e.equilibrio_local ?? "—")}
              {fila(
                "Equilibrio sobre la capacidad",
                e.pct_capacidad_casa != null ? `${fNum(e.pct_capacidad_casa, 0)}%` : "—",
                e.pct_capacidad_local != null ? `${fNum(e.pct_capacidad_local, 0)}%` : "—",
                "Más de 100%: con esa capacidad no se llega"
              )}
              {fila(
                "Cajas que esperás vender por mes",
                e.cajas_casa,
                <MontoEditable ancho="w-20" valor={n.escenario.cajas_esperadas_local} onGuardar={(v) => setEsc({ cajas_esperadas_local: v })} />,
                "Casa: tu mejor mes registrado"
              )}
            </tbody>
          </table>
          {e.pct_capacidad_local != null && (
            <div className="mt-5">
              <div className="mb-1.5 text-[12px] text-text3">Cuánto de la capacidad del local necesitás para no perder plata</div>
              <Bar pct={e.pct_capacidad_local} color={e.pct_capacidad_local > 80 ? "red" : e.pct_capacidad_local > 60 ? "orange" : "green"} height={8} />
            </div>
          )}
        </Bloque>

        <Bloque titulo="Inversión inicial para abrir el local">
          <ul className="divide-y divide-border">
            {n.escenario.inversion.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                <input
                  defaultValue={i.concepto}
                  onBlur={(ev) => ev.target.value.trim() && setEsc({ inversion: n.escenario.inversion.map((x) => (x.id === i.id ? { ...x, concepto: ev.target.value.trim() } : x)) })}
                  className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-text outline-none hover:border-border focus:border-accent"
                />
                <MontoEditable valor={i.monto} onGuardar={(v) => setEsc({ inversion: n.escenario.inversion.map((x) => (x.id === i.id ? { ...x, monto: v } : x)) })} />
                <button
                  aria-label={`Borrar ${i.concepto}`}
                  onClick={() => setEsc({ inversion: n.escenario.inversion.filter((x) => x.id !== i.id) })}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-text3 hover:bg-surface2 hover:text-red"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between border-t border-border2 pt-3 text-[13px] font-semibold text-text">
            <span>Total</span>
            <span>{fARS(e.inversion_total)}</span>
          </div>
          <button
            onClick={() => setEsc({ inversion: [...n.escenario.inversion, { id: uid("INV"), concepto: "Otro", monto: 0 }] })}
            className="mt-3 inline-flex min-h-[36px] items-center gap-1.5 text-[12.5px] font-medium text-accent hover:text-accent2"
          >
            <Plus className="h-4 w-4" /> Agregar
          </button>
        </Bloque>
      </div>
    </div>
  );
}

// --- Parámetros (Configuración) ------------------------------------------------------------------

export function ParametrosNegocio() {
  const { data, setData } = useStoreV2();
  const n = configNegocio(data);
  const set = (campos: Partial<ConfigNegocio>) => setData((d) => conNegocio(d, (x) => ({ ...x, ...campos })));
  const campo = (label: string, key: "sueldo_objetivo" | "margen_objetivo_minorista" | "margen_objetivo_mayorista" | "colchon_pct", nota: string, sufijo?: string) => (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] text-text2">{label}</span>
      <span className="flex items-center gap-2">
        <MontoEditable ancho="w-32" valor={n[key]} onGuardar={(v) => set({ [key]: v })} />
        {sufijo && <span className="text-[12px] text-text3">{sufijo}</span>}
      </span>
      <span className="mt-1 block text-[11.5px] text-text3">{nota}</span>
    </label>
  );
  return (
    <Bloque titulo="Parámetros del negocio" bajada="Los usan el punto de equilibrio, el estado de resultados, los márgenes y la planificación.">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {campo("Sueldo objetivo por mes", "sueldo_objetivo", "Lo que querés que el negocio te pague. Se suma a los costos fijos para el punto de equilibrio.")}
        {campo("Colchón para planificar", "colchon_pct", "Se suma a la proyección al calcular cuánto producir.", "%")}
        {campo("Margen objetivo minorista", "margen_objetivo_minorista", "Debajo de esto, Productos te avisa que revises el precio.", "%")}
        {campo("Margen objetivo mayorista", "margen_objetivo_mayorista", "Ídem para las presentaciones mayoristas.", "%")}
      </div>
    </Bloque>
  );
}
