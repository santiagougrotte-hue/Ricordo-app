"use client";

// Piezas del tablero de Inicio. Misma estructura que las planillas que reemplaza
// (SEGUIMIENTO_SEMANAL, PLAN_MASA_SEMANAL, SALDOS/FONDOS, MARGENES) pero pensadas para decidir
// rápido: una pregunta por bloque, el número que la responde grande y el detalle debajo.

import React, { useMemo, useState } from "react";
import { Area, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { AlertTriangle, CheckCircle2, CircleAlert } from "lucide-react";
import { CHART_COLORS, CHART_FONT } from "@/lib/chart-colors";
import { fARS, fNum } from "@/lib/calc-v2";
import { Bar, NUM_BIG } from "@/components/ds";
import { Select, Input } from "@/components/ui";
import type { RicordoDataV2 } from "@/lib/types-v2";
import type { EquilibrioMes, PuntoRitmo, SemanaSeguimiento, CompraSemanal, RankingProducto, CambiosSimulacion } from "@/lib/tablero";
import { simularCambios, vendidasPorMes } from "@/lib/tablero";

const fK = (n: number) => (Math.abs(n) >= 1000 ? `$${fNum(n / 1000, 0)}k` : `$${fNum(n, 0)}`);
const fDiaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const signo = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "");
const fARSFirmado = (n: number) => `${signo(n)}${fARS(Math.abs(n))}`;

/** Bloque del tablero: una pregunta como título (sentence case, sin etiquetas en mayúsculas). */
export function Bloque({
  titulo,
  bajada,
  derecha,
  children,
  className = "",
}: {
  titulo: string;
  bajada?: string;
  derecha?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[var(--radius-card)] border border-border bg-surface p-5 sm:p-6 ${className}`}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[17px] font-semibold tracking-[-0.2px] text-text">{titulo}</h3>
          {bajada && <p className="mt-1 text-[12.5px] text-text3">{bajada}</p>}
        </div>
        {derecha}
      </header>
      {children}
    </section>
  );
}

// --- Seguimiento del mes ------------------------------------------------------------------------

function Dato({ label, valor, tono = "text-text", nota }: { label: string; valor: string; tono?: string; nota?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] text-text3">{label}</div>
      <div className={`mt-1 text-[22px] leading-none ${NUM_BIG} ${tono}`}>{valor}</div>
      {nota && <div className="mt-1.5 text-[11.5px] text-text3">{nota}</div>}
    </div>
  );
}

function titularEquilibrio(eq: EquilibrioMes): string {
  if (eq.punto_equilibrio == null) return "Todavía no hay ventas suficientes para calcular tu punto de equilibrio";
  const pct = Math.round(eq.pct_alcanzado ?? 0);
  if (pct >= 100) return `Ya cubriste el equilibrio del mes: vas ${pct}%`;
  if (eq.dias_restantes === 0) return `El mes cerró en ${pct}% del equilibrio`;
  return `Vas ${pct}% del equilibrio y quedan ${eq.dias_restantes} días`;
}

export function SeguimientoMes({
  eq,
  ritmo,
  semanas,
  resultadoNeto,
  nombreMes,
}: {
  eq: EquilibrioMes;
  ritmo: PuntoRitmo[];
  semanas: SemanaSeguimiento[];
  resultadoNeto: number;
  nombreMes: string;
}) {
  const pct = eq.pct_alcanzado ?? 0;
  const superado = pct >= 100;
  return (
    <section className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
      <div className="p-5 sm:p-7">
        <p className="text-[13px] text-text3">Seguimiento de {nombreMes.toLowerCase()}</p>
        <h2 className={`mt-2 max-w-[22ch] text-[28px] leading-[1.1] text-text sm:text-[34px] ${NUM_BIG}`}>{titularEquilibrio(eq)}</h2>

        {eq.punto_equilibrio != null && (
          <div className="mt-5 max-w-[640px]">
            <Bar pct={Math.min(100, pct)} color={superado ? "green" : pct >= 70 ? "accent" : "orange"} height={10} />
            <div className="mt-2 flex justify-between text-[12px] text-text3">
              <span>{fARS(eq.vendido)} vendido</span>
              <span>Equilibrio {fARS(eq.punto_equilibrio)}</span>
            </div>
          </div>
        )}

        <div className="mt-7 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <Dato label="Falta vender" valor={eq.falta != null ? fARS(eq.falta) : "—"} tono={eq.falta === 0 ? "text-green" : "text-text"} />
          <Dato
            label="Por semana necesitás"
            valor={eq.falta === 0 ? "Cubierto" : eq.venta_necesaria_por_semana != null ? fARS(eq.venta_necesaria_por_semana) : "—"}
            tono={eq.falta === 0 ? "text-green" : "text-text"}
            nota={eq.cajas_por_semana_necesarias ? `≈ ${eq.cajas_por_semana_necesarias} cajas a ${fARS(eq.precio_promedio_caja)}` : undefined}
          />
          <Dato
            label="Margen de contribución"
            valor={eq.margen_contribucion_pct != null ? `${fNum(eq.margen_contribucion_pct, 0)}%` : "—"}
            nota={eq.meses_referencia.length ? `Promedio de ${eq.meses_referencia.join(", ")}` : undefined}
          />
          <Dato
            label="Resultado del mes hasta hoy"
            valor={fARSFirmado(resultadoNeto)}
            tono={resultadoNeto >= 0 ? "text-green" : "text-red"}
            nota={`Costos fijos ${fARS(eq.costos_fijos)}`}
          />
        </div>
      </div>

      <div className="border-t border-border px-2 pb-3 pt-4 sm:px-4">
        <div className="mb-1 flex flex-wrap items-center gap-4 px-3 text-[12px] text-text2">
          <span className="inline-flex items-center gap-2">
            <span className="h-[3px] w-4 rounded-full" style={{ background: CHART_COLORS.accent }} /> Vendido acumulado
          </span>
          {eq.punto_equilibrio != null && (
            <span className="inline-flex items-center gap-2">
              <span className="w-4 border-t-2 border-dashed" style={{ borderColor: CHART_COLORS.text2 }} /> Ritmo para llegar al equilibrio
            </span>
          )}
        </div>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={ritmo} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis
                dataKey="dia"
                ticks={[1, 8, 15, 22, 29]}
                tickFormatter={(d: number) => `Día ${d}`}
                tick={{ fill: CHART_COLORS.text3, fontSize: 11, fontFamily: CHART_FONT }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={fK}
                width={52}
                tick={{ fill: CHART_COLORS.text3, fontSize: 11, fontFamily: CHART_FONT }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ stroke: CHART_COLORS.text3, strokeWidth: 1 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as PuntoRitmo;
                  return (
                    <div className="rounded-xl border border-border2 bg-surface2 px-3 py-2 text-[12px] shadow-[var(--shadow-modal)]">
                      <div className="mb-1 font-medium text-text">Día {label}</div>
                      {p.vendido != null && <div className="text-text2">Vendido: <span className="text-text">{fARS(p.vendido)}</span></div>}
                      {p.meta != null && <div className="text-text2">Ritmo de equilibrio: <span className="text-text">{fARS(p.meta)}</span></div>}
                    </div>
                  );
                }}
              />
              {eq.punto_equilibrio != null && (
                <ReferenceLine y={eq.punto_equilibrio} stroke={CHART_COLORS.text3} strokeDasharray="2 4" />
              )}
              <Area
                type="monotone"
                dataKey="vendido"
                stroke={CHART_COLORS.accent}
                strokeWidth={2.5}
                fill={CHART_COLORS.accent}
                fillOpacity={0.12}
                connectNulls={false}
                activeDot={{ r: 5, stroke: CHART_COLORS.surface, strokeWidth: 2 }}
                isAnimationActive={false}
              />
              <Line type="linear" dataKey="meta" stroke={CHART_COLORS.text2} strokeWidth={1.5} strokeDasharray="5 5" dot={false} activeDot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="overflow-x-auto border-t border-border">
        <table className="w-full min-w-[640px] text-[12.5px] [font-variant-numeric:tabular-nums]">
          <thead>
            <tr className="text-left text-[12px] text-text3">
              <th className="py-3 pl-5 pr-3 font-medium sm:pl-7">Semana</th>
              <th className="px-3 py-3 text-right font-medium">Meta</th>
              <th className="px-3 py-3 text-right font-medium">Vendido</th>
              <th className="px-3 py-3 text-right font-medium">Diferencia</th>
              <th className="px-3 py-3 text-right font-medium">Acumulado</th>
              <th className="px-3 py-3 text-right font-medium">Cajas</th>
              <th className="px-3 py-3 text-right font-medium">Pedidos</th>
              <th className="py-3 pl-3 pr-5 text-right font-medium sm:pr-7">Ticket prom.</th>
            </tr>
          </thead>
          <tbody>
            {semanas.map((s) => (
              <tr
                key={s.semana}
                className={`border-t border-border ${s.estado === "en curso" ? "bg-accent-dim" : ""} ${s.estado === "futura" ? "text-text3" : "text-text"}`}
              >
                <td className="whitespace-nowrap py-3 pl-5 pr-3 sm:pl-7">
                  <span className="font-medium">Semana {s.semana}</span>
                  <span className="ml-2 text-text3">
                    {fDiaMes(s.desde)}–{fDiaMes(s.hasta)}
                  </span>
                  {s.estado === "en curso" && <span className="ml-2 text-[11px] font-semibold text-accent">esta semana</span>}
                </td>
                <td className="px-3 py-3 text-right text-text2">{s.meta != null ? fARS(s.meta) : "—"}</td>
                <td className="px-3 py-3 text-right font-medium">{s.estado === "futura" ? "—" : fARS(s.vendido)}</td>
                <td
                  className={`px-3 py-3 text-right font-medium ${
                    s.diferencia == null ? "text-text3" : s.diferencia >= 0 ? "text-green" : "text-red"
                  }`}
                >
                  {s.diferencia == null ? "—" : fARSFirmado(s.diferencia)}
                </td>
                <td className="px-3 py-3 text-right text-text2">{s.estado === "futura" ? "—" : fARS(s.vendido_acumulado)}</td>
                <td className="px-3 py-3 text-right">{s.estado === "futura" ? "—" : fNum(s.cajas, 0)}</td>
                <td className="px-3 py-3 text-right">{s.estado === "futura" ? "—" : s.pedidos}</td>
                <td className="py-3 pl-3 pr-5 text-right sm:pr-7">{s.ticket_promedio != null ? fARS(s.ticket_promedio) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// --- Compra del jueves ---------------------------------------------------------------------------

const ESTADO_COBERTURA = {
  critica: { color: "red" as const, texto: "text-red", Icono: CircleAlert, label: "Falta para pedidos" },
  importante: { color: "orange" as const, texto: "text-orange", Icono: AlertTriangle, label: "Menos de 1 semana" },
  informativa: { color: "green" as const, texto: "text-green", Icono: CheckCircle2, label: "Alcanza" },
};

export function CompraJueves({
  compra,
  jueves,
  disponibleMasaPackaging,
}: {
  compra: CompraSemanal;
  jueves: string;
  disponibleMasaPackaging: number;
}) {
  const [verTodo, setVerTodo] = useState(false);
  const urgentes = compra.filas.filter((f) => f.severidad !== "informativa");
  const visibles = verTodo ? compra.filas : urgentes.length > 0 ? urgentes : compra.filas.slice(0, 5);
  const alcanzaPlata = disponibleMasaPackaging >= compra.costo_total_sugerido;
  return (
    <Bloque titulo={`Compra del jueves ${fDiaMes(jueves)}`} bajada="Masa y packaging, al ritmo de consumo de los últimos 30 días.">
      <div className="mb-5 grid grid-cols-2 gap-4 rounded-2xl bg-surface2 p-4">
        <Dato label="Compra sugerida" valor={fARS(compra.costo_total_sugerido)} nota={`${urgentes.length} insumo(s) para reponer`} />
        <Dato
          label="CMV disponible para reponer"
          valor={fARS(disponibleMasaPackaging)}
          tono={alcanzaPlata ? "text-green" : "text-red"}
          nota={alcanzaPlata ? "Alcanza para la compra" : "No alcanza: compraste más de lo que vendiste"}
        />
      </div>
      {compra.filas.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-text3">Marcá “controla stock” en los insumos de masa y packaging para verlos acá.</p>
      ) : (
        <ul className="divide-y divide-border">
          {visibles.map((f) => {
            const e = ESTADO_COBERTURA[f.severidad];
            const dias = f.dias_cobertura;
            return (
              <li key={f.insumo_id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <e.Icono className={`h-4 w-4 shrink-0 ${e.texto}`} aria-label={e.label} />
                    <span className="truncate text-[13.5px] font-medium text-text">{f.insumo_nombre}</span>
                    <span className="shrink-0 text-[12px] text-text3">
                      {fNum(f.stock_actual, 2)} {f.unidad.trim()}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 pl-6">
                    <div className="w-full max-w-[220px]">
                      <Bar pct={dias == null ? 100 : (dias / 14) * 100} color={e.color} height={5} />
                    </div>
                    <span className={`shrink-0 text-[12px] ${e.texto}`}>
                      {dias == null ? "sin consumo reciente" : dias >= 60 ? "+2 meses" : `${fNum(Math.floor(dias), 0)} días`}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  {f.cantidad_sugerida_compra > 0 ? (
                    <>
                      <div className="text-[13.5px] font-semibold text-text">
                        Comprar {fNum(f.cantidad_sugerida_compra, 2)} {f.unidad.trim()}
                      </div>
                      <div className="text-[12px] text-text3">{fARS(f.costo_sugerido)}</div>
                    </>
                  ) : (
                    <span className="text-[12px] text-text3">No hace falta</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {compra.filas.length > visibles.length || verTodo ? (
        <button
          onClick={() => setVerTodo((v) => !v)}
          className="mt-3 min-h-[36px] text-[12.5px] font-medium text-accent hover:text-accent2"
        >
          {verTodo ? "Ver solo lo urgente" : `Ver los ${compra.filas.length} insumos`}
        </button>
      ) : null}
    </Bloque>
  );
}

// --- La plata ------------------------------------------------------------------------------------

export function PlataPanel({
  caja,
  disponibleMasaPackaging,
  disponibleRelleno,
  comprasSinPagar,
  porCobrar,
}: {
  caja: number;
  disponibleMasaPackaging: number;
  disponibleRelleno: number;
  comprasSinPagar: number;
  porCobrar: number;
}) {
  const filas: { label: string; valor: number; nota: string }[] = [
    { label: "Fondo para masa y packaging", valor: disponibleMasaPackaging, nota: "Lo que las ventas devolvieron para recomprar, menos lo ya comprado" },
    { label: "Fondo para rellenos", valor: disponibleRelleno, nota: "Para la compra mensual de rellenos" },
    { label: "Pedidos por entregar", valor: porCobrar, nota: "Confirmados o en producción, todavía sin cobrar" },
    { label: "Compras sin pagar", valor: -comprasSinPagar, nota: "A pagar a proveedores" },
  ];
  return (
    <Bloque titulo="La plata" bajada="Saldo real de caja y cómo se reparte.">
      <div className={`text-[34px] leading-none ${NUM_BIG} ${caja >= 0 ? "text-text" : "text-red"}`}>{fARS(caja)}</div>
      <div className="mt-1.5 text-[12px] text-text3">Saldo de caja</div>
      <ul className="mt-5 divide-y divide-border">
        {filas.map((f) => (
          <li key={f.label} className="flex items-baseline justify-between gap-4 py-3">
            <div className="min-w-0">
              <div className="text-[13px] text-text">{f.label}</div>
              <div className="text-[11.5px] text-text3">{f.nota}</div>
            </div>
            <div className={`shrink-0 text-[14px] font-semibold [font-variant-numeric:tabular-nums] ${f.valor < 0 ? "text-red" : "text-text"}`}>
              {f.valor < 0 ? fARSFirmado(f.valor) : fARS(Math.abs(f.valor))}
            </div>
          </li>
        ))}
      </ul>
    </Bloque>
  );
}

// --- Márgenes por producto -----------------------------------------------------------------------

export function MargenesPanel({ ranking }: { ranking: RankingProducto[] }) {
  const max = Math.max(1, ...ranking.map((r) => r.margen_contribucion));
  const top = ranking[0];
  const mejorPct = [...ranking].filter((r) => r.cantidad >= 10).sort((a, b) => (b.margen_pct ?? 0) - (a.margen_pct ?? 0))[0];
  return (
    <Bloque
      titulo="Qué producto empujar"
      bajada="Plata que dejó cada gusto en los últimos 90 días, después de pagar insumos, mano de obra y envío."
    >
      {ranking.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-text3">Cuando entregues pedidos, acá vas a ver qué gusto deja más.</p>
      ) : (
        <>
          {top && mejorPct && (
            <p className="mb-5 max-w-[60ch] text-[14px] leading-relaxed text-text2">
              <span className="font-semibold text-text">{top.nombre}</span> es el que más plata dejó ({fARS(top.margen_contribucion)}).
              {mejorPct.producto_id !== top.producto_id && (
                <>
                  {" "}
                  Por caja, el más rentable es <span className="font-semibold text-text">{mejorPct.nombre}</span> ({fNum(mejorPct.margen_pct, 0)}%).
                </>
              )}
            </p>
          )}
          <ul className="space-y-3.5">
            {ranking.map((r) => (
              <li key={r.producto_id}>
                <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px]">
                  <span className="text-text">{r.nombre}</span>
                  <span className="[font-variant-numeric:tabular-nums]">
                    <span className="font-semibold text-text">{fARS(r.margen_contribucion)}</span>
                    <span className="ml-2 text-text3">
                      {r.margen_pct != null ? `${fNum(r.margen_pct, 0)}% margen` : "—"}, {fNum(r.cantidad, 0)} vendidas
                    </span>
                  </span>
                </div>
                <Bar pct={(r.margen_contribucion / max) * 100} color="accent" height={8} />
              </li>
            ))}
          </ul>
        </>
      )}
    </Bloque>
  );
}

// --- Simulador -----------------------------------------------------------------------------------

type ModoSim = "precio" | "insumo";

export function Simulador({ data, mes, anio, hoy }: { data: RicordoDataV2; mes: number; anio: number; hoy: string }) {
  const [modo, setModo] = useState<ModoSim>("precio");
  const variantes = useMemo(
    () => data.producto_variantes.filter((v) => v.activo && v.precio_venta > 0).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [data.producto_variantes]
  );
  const insumos = useMemo(
    () => data.insumos.filter((i) => i.activo && i.precio_actual > 0).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [data.insumos]
  );
  const masVendida = useMemo(() => {
    const vendidas = vendidasPorMes(data, hoy);
    return [...variantes].sort((a, b) => (vendidas.get(b.id) ?? 0) - (vendidas.get(a.id) ?? 0))[0];
  }, [data, hoy, variantes]);
  const [varianteId, setVarianteId] = useState(masVendida?.id ?? "");
  const [insumoId, setInsumoId] = useState(insumos.find((i) => i.nombre.trim().toLowerCase() === "premezcla")?.id ?? insumos[0]?.id ?? "");
  const [precioNuevo, setPrecioNuevo] = useState<Record<string, number>>({});

  const variante = variantes.find((v) => v.id === varianteId);
  const insumo = insumos.find((i) => i.id === insumoId);
  const valorActual = modo === "precio" ? variante?.precio_venta ?? 0 : insumo?.precio_actual ?? 0;
  const clave = modo === "precio" ? varianteId : insumoId;
  const valorNuevo = precioNuevo[`${modo}:${clave}`] ?? valorActual;
  const setValor = (v: number) => setPrecioNuevo((p) => ({ ...p, [`${modo}:${clave}`]: v }));

  const cambios: CambiosSimulacion = modo === "precio" ? { precios: { [varianteId]: valorNuevo } } : { insumos: { [insumoId]: valorNuevo } };
  const res = useMemo(() => simularCambios(data, cambios, mes, anio, hoy), [data, modo, clave, valorNuevo, mes, anio, hoy]); // eslint-disable-line react-hooks/exhaustive-deps
  const varPct = valorActual > 0 ? ((valorNuevo - valorActual) / valorActual) * 100 : 0;
  const pasos = [-10, -5, 5, 10, 20];

  return (
    <Bloque
      titulo="¿Y si cambio un precio?"
      bajada="Simulación con tus recetas y lo que vendiste en los últimos 90 días. No modifica nada."
      derecha={
        <div className="inline-flex rounded-full border border-border bg-surface2 p-1" role="tablist">
          {(
            [
              ["precio", "Precio de venta"],
              ["insumo", "Materia prima"],
            ] as [ModoSim, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              role="tab"
              aria-selected={modo === m}
              onClick={() => setModo(m)}
              className={`min-h-[34px] rounded-full px-3.5 text-[12.5px] font-medium transition-colors ${
                modo === m ? "bg-accent text-[#0d0d1a]" : "text-text2 hover:text-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] text-text2">{modo === "precio" ? "Producto" : "Materia prima"}</span>
            {modo === "precio" ? (
              <Select value={varianteId} onChange={(e) => setVarianteId(e.target.value)}>
                {variantes.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nombre.trim()}
                    {v.canal ? ` (${v.canal})` : ""}
                  </option>
                ))}
              </Select>
            ) : (
              <Select value={insumoId} onChange={(e) => setInsumoId(e.target.value)}>
                {insumos.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nombre.trim()} (por {i.unidad.trim()})
                  </option>
                ))}
              </Select>
            )}
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] text-text2">
              Precio nuevo (hoy {fARS(valorActual)}
              {modo === "insumo" && insumo ? ` por ${insumo.unidad.trim()}` : ""})
            </span>
            <Input type="number" min={0} value={valorNuevo} onChange={(e) => setValor(Number(e.target.value))} />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {pasos.map((p) => (
              <button
                key={p}
                onClick={() => setValor(Math.round(valorActual * (1 + p / 100)))}
                className="min-h-[32px] rounded-full border border-border px-3 text-[12px] text-text2 hover:border-accent hover:text-text"
              >
                {p > 0 ? "+" : ""}
                {p}%
              </button>
            ))}
            <button onClick={() => setValor(valorActual)} className="min-h-[32px] rounded-full px-3 text-[12px] text-text3 hover:text-text">
              Volver al actual
            </button>
          </div>
          {varPct !== 0 && (
            <p className="text-[12.5px] text-text3">
              Cambio de {varPct > 0 ? "+" : ""}
              {fNum(varPct, 1)}% sobre el precio actual.
            </p>
          )}
        </div>

        <div>
          <div className="grid grid-cols-2 gap-4 rounded-2xl bg-surface2 p-4">
            <Dato
              label="Impacto por mes"
              valor={fARSFirmado(res.impacto_mensual_total)}
              tono={res.impacto_mensual_total > 0 ? "text-green" : res.impacto_mensual_total < 0 ? "text-red" : "text-text"}
              nota="Según lo que venís vendiendo"
            />
            <Dato
              label="Punto de equilibrio"
              valor={res.punto_equilibrio_nuevo != null ? fARS(res.punto_equilibrio_nuevo) : "—"}
              nota={res.punto_equilibrio_actual != null ? `Hoy ${fARS(res.punto_equilibrio_actual)}` : undefined}
            />
          </div>
          {res.filas.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-text3">Ningún producto activo usa esta materia prima.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-[12.5px] [font-variant-numeric:tabular-nums]">
                <thead>
                  <tr className="text-left text-[12px] text-text3">
                    <th className="py-2 pr-3 font-medium">Presentación</th>
                    <th className="px-2 py-2 text-right font-medium">{modo === "precio" ? "Precio" : "Costo"}</th>
                    <th className="px-2 py-2 text-right font-medium">Gana por unidad</th>
                    <th className="py-2 pl-2 text-right font-medium">Margen</th>
                  </tr>
                </thead>
                <tbody>
                  {res.filas.slice(0, 8).map((f) => {
                    const antes = modo === "precio" ? f.precio_actual : f.costo_actual;
                    const despues = modo === "precio" ? f.precio_nuevo : f.costo_nuevo;
                    const mejora = f.margen_nuevo - f.margen_actual;
                    return (
                      <tr key={f.variante_id} className="border-t border-border">
                        <td className="py-2.5 pr-3 text-text">
                          {f.nombre}
                          <div className="text-[11.5px] text-text3">{fNum(f.vendidas_por_mes, 1)} por mes</div>
                        </td>
                        <td className="px-2 py-2.5 text-right text-text2">
                          {fARS(antes)}
                          {antes !== despues && <div className="font-medium text-text">{fARS(despues)}</div>}
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          <div className="font-medium text-text">{fARS(f.margen_nuevo)}</div>
                          {mejora !== 0 && <div className={`text-[11.5px] ${mejora > 0 ? "text-green" : "text-red"}`}>{fARSFirmado(mejora)}</div>}
                        </td>
                        <td className="py-2.5 pl-2 text-right text-text2">
                          {f.margen_pct_nuevo != null ? `${fNum(f.margen_pct_nuevo, 0)}%` : "—"}
                          {f.margen_pct_actual != null && f.margen_pct_nuevo != null && Math.round(f.margen_pct_actual) !== Math.round(f.margen_pct_nuevo) && (
                            <div className="whitespace-nowrap text-[11.5px] text-text3">antes {fNum(f.margen_pct_actual, 0)}%</div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {res.filas.length > 8 && <p className="mt-2 text-[12px] text-text3">Y {res.filas.length - 8} presentaciones más.</p>}
            </div>
          )}
        </div>
      </div>
    </Bloque>
  );
}
