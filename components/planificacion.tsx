"use client";

// Operaciones → Planificación: la planificación de compras que antes vivía en las planillas
// (PLAN_MASA_SEMANAL, PROYECCION_MENSUAL, PLAN_RELLENOS_MENSUAL). Lo que se carga a mano (cajas a
// armar, ajuste %, proyección manual, "ya tengo en casa") se guarda en configuracion.plan_compras.

import React, { useMemo, useState } from "react";
import { CircleAlert, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useStoreV2 } from "@/lib/store-v2";
import { usePeriod, MESES } from "@/lib/period";
import { fARS, fNum } from "@/lib/calc-v2";
import { NUM_BIG } from "@/components/ds";
import { Bloque } from "@/components/tablero";
import { planSemanal, planMensual, conDatoPlan, claveMes, type FilaInsumoPlan } from "@/lib/planificacion";
import { proximoJueves } from "@/lib/tablero";
import type { PlanCompras } from "@/lib/types-v2";

const fDiaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const fCant = (n: number) => fNum(n, n >= 10 ? 1 : n >= 1 ? 2 : 3);

/** Input numérico chico para cargar un dato a mano; vacío = usar la sugerencia. */
function CampoNumero({
  valor,
  placeholder,
  onCambio,
  ancho = "w-20",
  sufijo,
}: {
  valor: number | null | undefined;
  placeholder: string;
  onCambio: (v: number | null) => void;
  ancho?: string;
  sufijo?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        inputMode="decimal"
        value={valor ?? ""}
        placeholder={placeholder}
        onChange={(e) => onCambio(e.target.value === "" ? null : Number(e.target.value))}
        className={`${ancho} rounded-lg border border-border bg-surface2 px-2 py-1.5 text-right text-[12.5px] text-text outline-none transition-colors placeholder:text-text3 focus:border-accent`}
      />
      {sufijo && <span className="text-[11.5px] text-text3">{sufijo}</span>}
    </span>
  );
}

const ESTADO = {
  "no alcanza": { Icono: CircleAlert, clase: "text-red", texto: "No alcanza" },
  justo: { Icono: AlertTriangle, clase: "text-orange", texto: "Justo" },
  ok: { Icono: CheckCircle2, clase: "text-green", texto: "Alcanza" },
};

function Cifra({ label, valor, tono = "text-text", nota }: { label: string; valor: string; tono?: string; nota?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] text-text3">{label}</div>
      <div className={`mt-1 text-[22px] leading-none ${NUM_BIG} ${tono}`}>{valor}</div>
      {nota && <div className="mt-1.5 text-[11.5px] text-text3">{nota}</div>}
    </div>
  );
}

function TablaInsumos({
  filas,
  modo,
  onEnCasa,
}: {
  filas: FilaInsumoPlan[];
  modo: "stock" | "en casa";
  onEnCasa?: (insumoId: string, v: number | null) => void;
}) {
  if (filas.length === 0) return <p className="py-6 text-center text-[13px] text-text3">No hace falta ningún insumo para lo planificado.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-[12.5px] [font-variant-numeric:tabular-nums]">
        <thead>
          <tr className="text-left text-[12px] text-text3">
            <th className="py-2 pr-3 font-medium">Insumo</th>
            <th className="px-2 py-2 text-right font-medium">Necesitás</th>
            <th className="px-2 py-2 text-right font-medium">{modo === "stock" ? "Tenés" : "Ya tengo en casa"}</th>
            <th className="px-2 py-2 text-right font-medium">Comprar</th>
            <th className="py-2 pl-2 text-right font-medium">Costo</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const e = ESTADO[f.estado];
            return (
              <tr key={f.insumo_id} className="border-t border-border">
                <td className="py-2.5 pr-3">
                  <span className="inline-flex items-center gap-2">
                    <e.Icono className={`h-4 w-4 shrink-0 ${e.clase}`} aria-label={e.texto} />
                    <span className="text-text">{f.nombre}</span>
                  </span>
                  <div className="pl-6 text-[11.5px] text-text3">{f.usado_en.join(", ")}</div>
                </td>
                <td className="px-2 py-2.5 text-right text-text2">
                  {fCant(f.necesario)} {f.unidad}
                </td>
                <td className="px-2 py-2.5 text-right text-text2">
                  {modo === "stock" ? (
                    <>
                      {fCant(f.stock ?? 0)} {f.unidad}
                      {f.stock_minimo ? <div className="text-[11.5px] text-text3">mínimo {fCant(f.stock_minimo)}</div> : null}
                    </>
                  ) : (
                    <CampoNumero valor={f.en_casa || null} placeholder="0" sufijo={f.unidad} onCambio={(v) => onEnCasa?.(f.insumo_id, v)} />
                  )}
                </td>
                <td className={`px-2 py-2.5 text-right font-semibold ${f.comprar > 0 ? "text-text" : "text-text3"}`}>
                  {f.comprar > 0 ? `${fCant(f.comprar)} ${f.unidad}` : "—"}
                </td>
                <td className="py-2.5 pl-2 text-right text-text2">{f.costo > 0 ? fARS(f.costo) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AvisoPlata({ diferencia, contexto }: { diferencia: number; contexto: string }) {
  if (diferencia >= 0)
    return (
      <div className="flex items-start gap-2.5 rounded-2xl bg-green-dim p-4 text-[13px] text-text">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green" />
        <span>
          Alcanza: después de {contexto} te sobran <strong>{fARS(diferencia)}</strong> del fondo de reposición.
        </span>
      </div>
    );
  return (
    <div className="flex items-start gap-2.5 rounded-2xl bg-red-dim p-4 text-[13px] text-text">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red" />
      <span>
        Faltan <strong>{fARS(-diferencia)}</strong> para {contexto}. Podés pedirlos prestados a tu sueldo o al fondo de reinversión y devolverlos a fin
        de mes; anotá el préstamo en Finanzas.
      </span>
    </div>
  );
}

// --- Semanal -------------------------------------------------------------------------------------

function PlanSemanalVista() {
  const { data, setData } = useStoreV2();
  const hoy = useMemo(() => new Date().toLocaleDateString("sv-SE"), []);
  const jueves = proximoJueves(hoy);
  const plan = useMemo(() => planSemanal(data, jueves), [data, jueves]);
  const setDato = (campo: keyof PlanCompras, clave: string, v: number | null) => setData((d) => conDatoPlan(d, campo, clave, v));
  const urgentes = plan.insumos.filter((f) => f.comprar > 0).length;

  return (
    <div className="space-y-5">
      <Bloque titulo={`Compra del jueves ${fDiaMes(jueves)}`} bajada="Cuánto vas a armar esta semana y qué insumos de masa, armado y packaging te faltan.">
        <div className="grid grid-cols-2 gap-4 rounded-2xl bg-surface2 p-4 sm:grid-cols-3">
          <Cifra label="Cajas a armar" valor={fNum(plan.total_cajas, 0)} nota="Lasaña y salsa cuentan por unidad" />
          <Cifra label="Total a comprar" valor={fARS(plan.costo_total)} nota={`${urgentes} insumo(s)`} />
          <Cifra
            label="Fondo para masa y packaging"
            valor={fARS(plan.disponible_fondo)}
            tono={plan.disponible_fondo >= plan.costo_total ? "text-green" : "text-red"}
          />
        </div>
        <div className="mt-4">
          <AvisoPlata diferencia={plan.disponible_fondo - plan.costo_total} contexto="la compra de esta semana" />
        </div>
      </Bloque>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Bloque titulo="Qué vas a armar" bajada="Sugerido: la venta promedio de las últimas 4 semanas. Si sabés algo distinto, cargalo y se recalcula todo.">
          <table className="w-full text-[12.5px] [font-variant-numeric:tabular-nums]">
            <thead>
              <tr className="text-left text-[12px] text-text3">
                <th className="py-2 pr-3 font-medium">Gusto</th>
                <th className="px-2 py-2 text-right font-medium">Promedio</th>
                <th className="px-2 py-2 text-right font-medium">Sugerido</th>
                <th className="py-2 pl-2 text-right font-medium">A armar</th>
              </tr>
            </thead>
            <tbody>
              {plan.cajas.map((c) => (
                <tr key={c.producto_id} className="border-t border-border">
                  <td className="py-2.5 pr-3 text-text">
                    {c.nombre}
                    <div className="text-[11.5px] text-text3">{c.unidad}</div>
                  </td>
                  <td className="px-2 py-2.5 text-right text-text2">{fNum(c.promedio_semanal, 1)}</td>
                  <td className="px-2 py-2.5 text-right text-text2">{c.sugerido}</td>
                  <td className="py-2.5 pl-2 text-right">
                    <CampoNumero
                      valor={c.manual}
                      placeholder={String(c.sugerido)}
                      onCambio={(v) => setDato("cajas_semana", `${jueves}:${c.producto_id}`, v)}
                      ancho="w-16"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Bloque>
        <Bloque titulo="Insumos de la semana" bajada="Con el stock que tenés cargado en la app y el mínimo de cada insumo.">
          <TablaInsumos filas={plan.insumos} modo="stock" />
        </Bloque>
      </div>
    </div>
  );
}

// --- Mensual -------------------------------------------------------------------------------------

function PlanMensualVista() {
  const { data, setData } = useStoreV2();
  const { mes, anio } = usePeriod();
  const plan = useMemo(() => planMensual(data, mes, anio), [data, mes, anio]);
  const clave = claveMes(mes, anio);
  const setDato = (campo: keyof PlanCompras, k: string, v: number | null) => setData((d) => conDatoPlan(d, campo, k, v));
  const nombreMes = MESES[mes - 1].toLowerCase();
  const encabezadosMes = useMemo(() => {
    const out: string[] = [];
    let m = mes;
    let a = anio;
    for (let i = 0; i < 3; i++) {
      m = m === 1 ? 12 : m - 1;
      a = m === 12 ? a - 1 : a;
      out.unshift(MESES[m - 1].slice(0, 3).toLowerCase());
    }
    return out;
  }, [mes, anio]);
  const conRelleno = plan.productos.filter((p) => p.usa_relleno && p.a_producir > 0);

  return (
    <div className="space-y-5">
      <Bloque titulo={`¿Alcanza la plata para las compras de ${nombreMes}?`} bajada="Compras del mes para producir lo proyectado, contra el fondo de reposición.">
        <div className="grid grid-cols-2 gap-4 rounded-2xl bg-surface2 p-4 sm:grid-cols-4">
          <Cifra label="Masa, armado y packaging" valor={fARS(plan.costo_masa)} />
          <Cifra label="Ingredientes de relleno" valor={fARS(plan.costo_relleno)} />
          <Cifra label="Total de compras" valor={fARS(plan.costo_total)} />
          <Cifra label="Fondo de reposición" valor={fARS(plan.disponible_fondo)} tono={plan.diferencia >= 0 ? "text-green" : "text-red"} />
        </div>
        <div className="mt-4">
          <AvisoPlata diferencia={plan.diferencia} contexto={`las compras de ${nombreMes}`} />
        </div>
      </Bloque>

      <Bloque
        titulo="Venta proyectada y producción"
        bajada={`Promedio ponderado de ${plan.meses_ref.join(", ") || "los meses con ventas"}: el mes pasado pesa 3, el anterior 2 y el de antes 1. Ajustá si sabés algo que los números no muestran (una cena, un cliente nuevo).`}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-[12.5px] [font-variant-numeric:tabular-nums]">
            <thead>
              <tr className="text-left text-[12px] text-text3">
                <th className="py-2 pr-3 font-medium">Gusto</th>
                {encabezadosMes.map((m) => (
                  <th key={m} className="px-2 py-2 text-right font-medium">
                    {m}
                  </th>
                ))}
                <th className="px-2 py-2 text-right font-medium">Promedio</th>
                <th className="px-2 py-2 text-right font-medium">Ajuste</th>
                <th className="px-2 py-2 text-right font-medium">Proyección</th>
                <th className="px-2 py-2 text-right font-medium">Freezer</th>
                <th className="py-2 pl-2 text-right font-medium">A producir</th>
              </tr>
            </thead>
            <tbody>
              {plan.productos.map((p) => (
                <tr key={p.producto_id} className="border-t border-border">
                  <td className="py-2.5 pr-3 text-text">
                    {p.nombre}
                    <div className="text-[11.5px] text-text3">{p.unidad}</div>
                  </td>
                  {p.vendidos.map((v, idx) => (
                    <td key={idx} className="px-2 py-2.5 text-right text-text2">
                      {v == null ? "—" : fNum(v, 1)}
                    </td>
                  ))}
                  <td className="px-2 py-2.5 text-right text-text2">{fNum(p.promedio_ponderado, 1)}</td>
                  <td className="px-2 py-2.5 text-right">
                    <CampoNumero
                      valor={p.ajuste_pct || null}
                      placeholder="0"
                      sufijo="%"
                      ancho="w-14"
                      onCambio={(v) => setDato("ajuste_pct", `${clave}:${p.producto_id}`, v)}
                    />
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <CampoNumero
                      valor={p.manual}
                      placeholder={String(p.sugerida)}
                      ancho="w-16"
                      onCambio={(v) => setDato("proyeccion_manual", `${clave}:${p.producto_id}`, v)}
                    />
                  </td>
                  <td className="px-2 py-2.5 text-right text-text2">{fNum(p.freezer, 1)}</td>
                  <td className={`py-2.5 pl-2 text-right font-semibold ${p.a_producir > 0 ? "text-text" : "text-text3"}`}>{p.a_producir}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Bloque>

      <Bloque titulo="Insumos de masa, armado y packaging del mes" bajada="Para producir lo que falta según la proyección, con el stock de la app.">
        <TablaInsumos filas={plan.insumos_masa} modo="stock" />
      </Bloque>

      <div className="space-y-5">
        <Bloque titulo="Relleno a cocinar" bajada="Lo que lleva la producción del mes, menos el relleno cocido que ya tenés.">
          {conRelleno.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-text3">Con el relleno cocido que tenés alcanza para lo proyectado.</p>
          ) : (
            <ul className="divide-y divide-border">
              {conRelleno.map((p) => (
                <li key={p.producto_id} className="flex items-baseline justify-between gap-4 py-3 text-[13px]">
                  <div>
                    <div className="text-text">{p.nombre}</div>
                    <div className="text-[11.5px] text-text3">
                      Necesitás {fNum(p.kg_relleno_necesario, 2)} kg, tenés {fNum(p.kg_relleno_disponible, 2)} kg
                    </div>
                  </div>
                  <div className={`shrink-0 font-semibold [font-variant-numeric:tabular-nums] ${p.kg_relleno_a_cocinar > 0 ? "text-text" : "text-green"}`}>
                    {p.kg_relleno_a_cocinar > 0 ? `Cocinar ${fNum(p.kg_relleno_a_cocinar, 2)} kg` : "Alcanza"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Bloque>
        <Bloque titulo="Ingredientes de relleno a comprar" bajada="Los rellenos no llevan stock en la app: cargá lo que ya tenés en casa y se descuenta.">
          <TablaInsumos
            filas={plan.insumos_relleno}
            modo="en casa"
            onEnCasa={(id, v) => setDato("relleno_en_casa", `${clave}:${id}`, v)}
          />
        </Bloque>
      </div>
    </div>
  );
}

export function PlanificacionTab() {
  const [vista, setVista] = useState<"semanal" | "mensual">("semanal");
  return (
    <div>
      <div className="mb-5 inline-flex rounded-full border border-border bg-surface2 p-1" role="tablist">
        {(
          [
            ["semanal", "Esta semana"],
            ["mensual", "El mes"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            role="tab"
            aria-selected={vista === v}
            onClick={() => setVista(v)}
            className={`min-h-[36px] rounded-full px-4 text-[13px] font-medium transition-colors ${
              vista === v ? "bg-accent text-[#0d0d1a]" : "text-text2 hover:text-text"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {vista === "semanal" ? <PlanSemanalVista /> : <PlanMensualVista />}
    </div>
  );
}
