"use client";

// Productos → Márgenes (contra el margen objetivo), Matriz BCG y Producto nuevo (costeo) — antes
// MARGENES, MATRIZ_BCG y COSTEO_NUEVOS de la planilla de Productos y compras.

import React, { useMemo, useState } from "react";
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, LabelList } from "recharts";
import { CheckCircle2, CircleAlert, Plus, Trash2 } from "lucide-react";
import { useStoreV2 } from "@/lib/store-v2";
import { uid } from "@/lib/id";
import { calcularMargenPorItem, costoVariante, fARS, fNum, sumarDias } from "@/lib/calc-v2";
import { CHART_COLORS, CHART_FONT } from "@/lib/chart-colors";
import { NUM_BIG } from "@/components/ds";
import { Input, Select } from "@/components/ui";
import { Bloque } from "@/components/tablero";
import { configNegocio, conNegocio } from "@/lib/negocio";
import { vendidasPorMes } from "@/lib/tablero";
import { unidadesPorCajaStock } from "@/lib/rellenos";
import type { FichaCosteo } from "@/lib/types-v2";

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

// --- Márgenes contra el objetivo -----------------------------------------------------------------

export function MargenesObjetivoTab() {
  const { data } = useStoreV2();
  const n = configNegocio(data);
  const hoy = hoyIso();
  const filas = useMemo(() => {
    const vendidas = vendidasPorMes(data, hoy);
    return data.producto_variantes
      .filter((v) => v.activo && v.precio_venta > 0)
      .map((v) => {
        const costo = costoVariante(data, v.id);
        const margen = v.precio_venta - costo;
        const pct = (margen / v.precio_venta) * 100;
        const objetivo = v.canal === "Mayorista" ? n.margen_objetivo_mayorista : n.margen_objetivo_minorista;
        const sugerido = objetivo < 100 ? Math.ceil(costo / (1 - objetivo / 100) / 10) * 10 : 0;
        return {
          v,
          producto: data.productos.find((p) => p.id === v.producto_id)?.nombre.trim() ?? "—",
          costo,
          margen,
          pct,
          objetivo,
          ok: pct >= objetivo,
          sugerido,
          aumento: v.precio_venta > 0 ? ((sugerido - v.precio_venta) / v.precio_venta) * 100 : 0,
          vendidas: vendidas.get(v.id) ?? 0,
        };
      })
      .sort((a, b) => Number(a.ok) - Number(b.ok) || b.vendidas - a.vendidas);
  }, [data, hoy, n.margen_objetivo_mayorista, n.margen_objetivo_minorista]);
  const revisar = filas.filter((f) => !f.ok);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
          <Cifra label="Para revisar precio" valor={String(revisar.length)} tono={revisar.length ? "text-red" : "text-green"} nota={`de ${filas.length} presentaciones`} />
        </div>
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
          <Cifra label="Objetivo minorista" valor={`${n.margen_objetivo_minorista}%`} nota="Se cambia en Configuración" />
        </div>
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
          <Cifra label="Objetivo mayorista" valor={`${n.margen_objetivo_mayorista}%`} />
        </div>
      </div>
      <Bloque titulo="Márgenes por presentación" bajada="Margen final: precio menos masa, relleno, packaging y tu mano de obra, con la receta y los precios de hoy.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[12.5px] [font-variant-numeric:tabular-nums]">
            <thead>
              <tr className="text-left text-[12px] text-text3">
                <th className="py-2 pr-3 font-medium">Presentación</th>
                <th className="px-2 py-2 text-right font-medium">Precio</th>
                <th className="px-2 py-2 text-right font-medium">Costo</th>
                <th className="px-2 py-2 text-right font-medium">Gana</th>
                <th className="px-2 py-2 text-right font-medium">Margen</th>
                <th className="px-2 py-2 text-right font-medium">Objetivo</th>
                <th className="py-2 pl-2 text-right font-medium">Precio sugerido</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.v.id} className="border-t border-border">
                  <td className="py-2.5 pr-3">
                    <span className="flex items-center gap-2">
                      {f.ok ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-green" aria-label="Margen OK" />
                      ) : (
                        <CircleAlert className="h-4 w-4 shrink-0 text-red" aria-label="Revisar precio" />
                      )}
                      <span className="text-text">{f.v.nombre.trim()}</span>
                    </span>
                    <div className="pl-6 text-[11.5px] text-text3">
                      {f.v.canal ?? "Minorista"}
                      {f.vendidas > 0 ? `, ${fNum(f.vendidas, 1)} por mes` : ""}
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right text-text2">{fARS(f.v.precio_venta)}</td>
                  <td className="px-2 py-2.5 text-right text-text2">{fARS(f.costo)}</td>
                  <td className="px-2 py-2.5 text-right font-medium text-text">{fARS(f.margen)}</td>
                  <td className={`px-2 py-2.5 text-right font-semibold ${f.ok ? "text-green" : "text-red"}`}>{fNum(f.pct, 1)}%</td>
                  <td className="px-2 py-2.5 text-right text-text3">{f.objetivo}%</td>
                  <td className="py-2.5 pl-2 text-right">
                    {f.ok ? (
                      <span className="text-text3">Margen OK</span>
                    ) : (
                      <>
                        <div className="font-semibold text-text">{fARS(f.sugerido)}</div>
                        <div className="text-[11.5px] text-orange">+{fNum(f.aumento, 1)}%</div>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Bloque>
    </div>
  );
}

// --- Matriz BCG ----------------------------------------------------------------------------------

const CUADRANTES = {
  Estrella: { que: "Vende mucho y deja buen margen", hacer: "Protegerlo: priorizar su stock, no descontarlo, usarlo como producto insignia." },
  "Vaca lechera": { que: "Vende mucho pero deja poco por caja", hacer: "Subir el precio o bajar el costo del relleno; revisar descuentos mayoristas." },
  Oportunidad: { que: "Deja buen margen pero vende poco", hacer: "Empujar ventas: redes, degustaciones, restaurantes o combos." },
  "Bajo margen": { que: "Vende poco y deja poco", hacer: "Revisar receta y precio; si en 2 meses no mejora, evaluar sacarlo." },
} as const;
type Cuadrante = keyof typeof CUADRANTES;

const mediana = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function MatrizBcgTab() {
  const { data } = useStoreV2();
  const hoy = hoyIso();
  const [dias, setDias] = useState(90);
  const puntos = useMemo(() => {
    const por = new Map<string, { nombre: string; cajas: number; ventas: number; margen: number }>();
    for (const i of calcularMargenPorItem(data, sumarDias(hoy, -dias), hoy)) {
      if (!i.producto_id) continue;
      const v = data.producto_variantes.find((x) => x.id === i.variante_id);
      const cajas = (i.cantidad * (v?.unidades_por_paquete ?? 1)) / unidadesPorCajaStock(data, i.producto_id);
      const p = por.get(i.producto_id) ?? { nombre: i.producto_nombre.trim(), cajas: 0, ventas: 0, margen: 0 };
      p.cajas += cajas;
      p.ventas += i.ventas_netas;
      p.margen += i.ventas_netas - i.cmv;
      por.set(i.producto_id, p);
    }
    return [...por.values()].filter((p) => p.cajas > 0).map((p) => ({ ...p, porCaja: p.margen / p.cajas }));
  }, [data, hoy, dias]);
  const corteVol = mediana(puntos.map((p) => p.cajas));
  const corteMar = mediana(puntos.map((p) => p.porCaja));
  const totalMargen = puntos.reduce((a, p) => a + p.margen, 0);
  const conCuadrante = puntos
    .map((p) => ({
      ...p,
      cuadrante: (p.cajas >= corteVol ? (p.porCaja >= corteMar ? "Estrella" : "Vaca lechera") : p.porCaja >= corteMar ? "Oportunidad" : "Bajo margen") as Cuadrante,
    }))
    .sort((a, b) => b.margen - a.margen);

  return (
    <div className="space-y-5">
      <Bloque
        titulo="Matriz BCG"
        bajada={`Volumen contra margen por caja (antes de tu mano de obra). Los cortes son la mediana: ${fNum(corteVol, 1)} cajas y ${fARS(corteMar)} por caja.`}
        derecha={
          <Select value={dias} onChange={(e) => setDias(Number(e.target.value))} style={{ width: 170 }}>
            <option value={30}>Últimos 30 días</option>
            <option value={90}>Últimos 90 días</option>
            <option value={180}>Últimos 6 meses</option>
          </Select>
        }
      >
        {puntos.length < 2 ? (
          <p className="py-8 text-center text-[13px] text-text3">Hacen falta ventas de al menos dos gustos en el período.</p>
        ) : (
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
                <CartesianGrid stroke={CHART_COLORS.grid} />
                <XAxis
                  type="number"
                  dataKey="cajas"
                  name="Cajas"
                  domain={[0, (max: number) => Math.ceil(max * 1.25)]}
                  tick={{ fill: CHART_COLORS.text3, fontSize: 11, fontFamily: CHART_FONT }}
                  label={{ value: "Cajas vendidas →", position: "insideBottomRight", offset: -8, fill: CHART_COLORS.text3, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="number"
                  dataKey="porCaja"
                  name="Margen por caja"
                  tickFormatter={(v: number) => `$${fNum(v / 1000, 0)}k`}
                  tick={{ fill: CHART_COLORS.text3, fontSize: 11, fontFamily: CHART_FONT }}
                  width={52}
                  domain={[0, (max: number) => Math.ceil((max * 1.15) / 1000) * 1000]}
                  axisLine={false}
                  tickLine={false}
                />
                <ReferenceLine x={corteVol} stroke={CHART_COLORS.text3} strokeDasharray="4 4" />
                <ReferenceLine y={corteMar} stroke={CHART_COLORS.text3} strokeDasharray="4 4" />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3", stroke: CHART_COLORS.text3 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as (typeof conCuadrante)[number];
                    return (
                      <div className="rounded-xl border border-border2 bg-surface2 px-3 py-2 text-[12px] shadow-[var(--shadow-modal)]">
                        <div className="mb-1 font-medium text-text">{p.nombre}</div>
                        <div className="text-text2">{fNum(p.cajas, 1)} cajas, {fARS(p.porCaja)} por caja</div>
                        <div className="text-text2">{p.cuadrante}</div>
                      </div>
                    );
                  }}
                />
                <Scatter data={conCuadrante} fill={CHART_COLORS.accent} stroke={CHART_COLORS.surface} strokeWidth={2} isAnimationActive={false}>
                  <LabelList
                    dataKey="nombre"
                    content={(props) => {
                      const { x, y, value } = props as { x?: number; y?: number; value?: string };
                      if (x == null || y == null) return null;
                      return (
                        <text x={Number(x) + 10} y={Number(y) + 4} fill={CHART_COLORS.text2} fontSize={11} fontFamily={CHART_FONT}>
                          {value}
                        </text>
                      );
                    }}
                  />
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="mt-2 grid grid-cols-2 gap-2 text-[11.5px] text-text3 sm:grid-cols-4">
          <span>Arriba a la derecha: Estrella</span>
          <span>Abajo a la derecha: Vaca lechera</span>
          <span>Arriba a la izquierda: Oportunidad</span>
          <span>Abajo a la izquierda: Bajo margen</span>
        </div>
      </Bloque>

      <Bloque titulo="Qué hacer con cada gusto">
        <ul className="divide-y divide-border">
          {conCuadrante.map((p) => (
            <li key={p.nombre} className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] sm:gap-4">
              <div>
                <div className="text-[13.5px] font-medium text-text">{p.nombre}</div>
                <div className="text-[12px] text-text3">
                  {p.cuadrante}, {fNum(p.cajas, 1)} cajas, {fARS(p.porCaja)} por caja, {totalMargen > 0 ? fNum((p.margen / totalMargen) * 100, 0) : 0}% del margen
                </div>
              </div>
              <div className="text-[13px] text-text2">
                <span className="text-text">{CUADRANTES[p.cuadrante].que}.</span> {CUADRANTES[p.cuadrante].hacer}
              </div>
            </li>
          ))}
        </ul>
      </Bloque>
    </div>
  );
}

// --- Costeo de un producto nuevo -----------------------------------------------------------------

const TIPOS: FichaCosteo["lineas"][number]["tipo"][] = ["Masa", "Relleno", "Armado", "Packaging"];

function fichaVacia(): FichaCosteo {
  return { id: uid("COS"), nombre: "Producto nuevo", rinde: 12, minutos_mano_obra: 60, energia: 0, lineas: [] };
}

export function CosteoNuevoTab() {
  const { data, setData } = useStoreV2();
  const n = configNegocio(data);
  const fichas = n.costeos;
  const [fichaId, setFichaId] = useState<string>(fichas[0]?.id ?? "");
  const ficha = fichas.find((f) => f.id === fichaId);
  const guardar = (f: FichaCosteo) =>
    setData((d) => conNegocio(d, (x) => ({ ...x, costeos: x.costeos.some((c) => c.id === f.id) ? x.costeos.map((c) => (c.id === f.id ? f : c)) : [...x.costeos, f] })));
  const insumos = useMemo(() => data.insumos.filter((i) => i.activo).sort((a, b) => a.nombre.localeCompare(b.nombre)), [data.insumos]);

  const nueva = () => {
    const f = fichaVacia();
    guardar(f);
    setFichaId(f.id);
  };

  if (!ficha) {
    return (
      <Bloque titulo="Costeo de un producto nuevo" bajada="Simulá el costo y el precio mínimo de un producto antes de producirlo.">
        <button onClick={nueva} className="inline-flex min-h-[40px] items-center gap-2 rounded-full bg-accent px-4 text-[13px] font-semibold text-[#0d0d1a] hover:bg-accent2">
          <Plus className="h-4 w-4" /> Empezar una ficha
        </button>
      </Bloque>
    );
  }

  const set = (campos: Partial<FichaCosteo>) => guardar({ ...ficha, ...campos });
  const porTipo = TIPOS.map((t) => ({ tipo: t, total: ficha.lineas.filter((l) => l.tipo === t).reduce((a, l) => a + l.cantidad * l.precio, 0) }));
  const totalInsumos = porTipo.reduce((a, t) => a + t.total, 0);
  const rinde = Math.max(1, ficha.rinde);
  const insumosUnidad = totalInsumos / rinde;
  const moUnidad = (ficha.minutos_mano_obra / 60) * data.configuracion.costo_mano_obra_hora / rinde;
  const energiaUnidad = ficha.energia / rinde;
  const costoUnidad = insumosUnidad + moUnidad + energiaUnidad;
  const precioMin = (obj: number) => (obj < 100 ? Math.ceil(costoUnidad / (1 - obj / 100) / 10) * 10 : 0);
  const pMin = precioMin(n.margen_objetivo_minorista);
  const pMay = precioMin(n.margen_objetivo_mayorista);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={fichaId} onChange={(e) => setFichaId(e.target.value)} style={{ width: 240 }}>
          {fichas.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nombre}
            </option>
          ))}
        </Select>
        <button onClick={nueva} className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-border px-3.5 text-[12.5px] text-text2 hover:border-accent hover:text-text">
          <Plus className="h-4 w-4" /> Otra ficha
        </button>
        <button
          onClick={() => {
            if (!window.confirm(`¿Borrar la ficha "${ficha.nombre}"?`)) return;
            setData((d) => conNegocio(d, (x) => ({ ...x, costeos: x.costeos.filter((c) => c.id !== ficha.id) })));
            setFichaId(fichas.find((f) => f.id !== ficha.id)?.id ?? "");
          }}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-3 text-[12.5px] text-text3 hover:text-red"
        >
          <Trash2 className="h-4 w-4" /> Borrar ficha
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Bloque titulo="La tanda" bajada="Cargá los insumos de una tanda. Si elegís un insumo de la app, trae su precio de hoy.">
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="col-span-2">
              <span className="mb-1.5 block text-[12px] text-text2">Producto</span>
              <Input value={ficha.nombre} onChange={(e) => set({ nombre: e.target.value })} />
            </label>
            <label>
              <span className="mb-1.5 block text-[12px] text-text2">Unidades que rinde</span>
              <Input type="number" min={1} value={ficha.rinde} onChange={(e) => set({ rinde: Number(e.target.value) })} />
            </label>
            <label>
              <span className="mb-1.5 block text-[12px] text-text2">Minutos de trabajo</span>
              <Input type="number" min={0} value={ficha.minutos_mano_obra} onChange={(e) => set({ minutos_mano_obra: Number(e.target.value) })} />
            </label>
            <label>
              <span className="mb-1.5 block text-[12px] text-text2">Energía de la tanda ($)</span>
              <Input type="number" min={0} value={ficha.energia} onChange={(e) => set({ energia: Number(e.target.value) })} />
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[12.5px] [font-variant-numeric:tabular-nums]">
              <thead>
                <tr className="text-left text-[12px] text-text3">
                  <th className="py-2 pr-2 font-medium">Insumo</th>
                  <th className="px-2 py-2 font-medium">Etapa</th>
                  <th className="px-2 py-2 text-right font-medium">Cantidad</th>
                  <th className="px-2 py-2 text-right font-medium">Precio</th>
                  <th className="px-2 py-2 text-right font-medium">Subtotal</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ficha.lineas.map((l) => {
                  const setL = (c: Partial<typeof l>) => set({ lineas: ficha.lineas.map((x) => (x.id === l.id ? { ...x, ...c } : x)) });
                  return (
                    <tr key={l.id} className="border-t border-border">
                      <td className="py-2 pr-2">
                        <input
                          list="insumos-app"
                          value={l.insumo}
                          onChange={(e) => {
                            const ins = insumos.find((i) => i.nombre.trim() === e.target.value);
                            setL(ins ? { insumo: e.target.value, precio: ins.precio_actual, unidad: ins.unidad.trim() } : { insumo: e.target.value });
                          }}
                          className="w-full min-w-[150px] rounded-lg border border-border bg-surface2 px-2 py-1.5 text-[12.5px] text-text outline-none focus:border-accent"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Select value={l.tipo} onChange={(e) => setL({ tipo: e.target.value as typeof l.tipo })} style={{ width: 112 }}>
                          {TIPOS.map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <span className="inline-flex items-center gap-1">
                          <Input type="number" min={0} step="any" value={l.cantidad} onChange={(e) => setL({ cantidad: Number(e.target.value) })} style={{ width: 84 }} />
                          <span className="text-[11.5px] text-text3">{l.unidad}</span>
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Input type="number" min={0} value={l.precio} onChange={(e) => setL({ precio: Number(e.target.value) })} style={{ width: 96 }} />
                      </td>
                      <td className="px-2 py-2 text-right font-medium text-text">{fARS(l.cantidad * l.precio)}</td>
                      <td className="py-2 pl-1">
                        <button
                          aria-label={`Quitar ${l.insumo}`}
                          onClick={() => set({ lineas: ficha.lineas.filter((x) => x.id !== l.id) })}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-text3 hover:bg-surface2 hover:text-red"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <datalist id="insumos-app">
              {insumos.map((i) => (
                <option key={i.id} value={i.nombre.trim()} />
              ))}
            </datalist>
          </div>
          <button
            onClick={() => set({ lineas: [...ficha.lineas, { id: uid("L"), insumo: "", cantidad: 0, unidad: "kg", precio: 0, tipo: "Relleno" }] })}
            className="mt-3 inline-flex min-h-[36px] items-center gap-1.5 text-[12.5px] font-medium text-accent hover:text-accent2"
          >
            <Plus className="h-4 w-4" /> Agregar insumo
          </button>
        </Bloque>

        <div className="space-y-5">
          <Bloque titulo="Por unidad">
            <div className="grid grid-cols-2 gap-4">
              <Cifra label="Costo total" valor={fARS(costoUnidad)} />
              <Cifra label="Insumos" valor={fARS(insumosUnidad)} nota={`Mano de obra ${fARS(moUnidad)}, energía ${fARS(energiaUnidad)}`} />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4 rounded-2xl bg-surface2 p-4">
              <Cifra label={`Precio mínimo minorista (${n.margen_objetivo_minorista}%)`} valor={fARS(pMin)} nota={`Ganás ${fARS(pMin - costoUnidad)} por unidad`} tono="text-green" />
              <Cifra label={`Precio mínimo mayorista (${n.margen_objetivo_mayorista}%)`} valor={fARS(pMay)} nota={`Ganás ${fARS(pMay - costoUnidad)} por unidad`} />
            </div>
          </Bloque>
          <Bloque titulo="Costo de la tanda por etapa">
            <ul className="divide-y divide-border text-[13px]">
              {porTipo.map((t) => (
                <li key={t.tipo} className="flex justify-between py-2.5">
                  <span className="text-text2">{t.tipo}</span>
                  <span className="font-medium text-text [font-variant-numeric:tabular-nums]">{fARS(t.total)}</span>
                </li>
              ))}
              <li className="flex justify-between py-2.5 font-semibold">
                <span className="text-text">Total insumos</span>
                <span className="text-text">{fARS(totalInsumos)}</span>
              </li>
            </ul>
          </Bloque>
        </div>
      </div>
    </div>
  );
}
