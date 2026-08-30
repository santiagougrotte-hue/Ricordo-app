"use client";

import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useStore } from "@/lib/store";
import { usePeriod } from "@/lib/period";
import {
  cmvPeriodo,
  totalCostoEnvio,
  totalCostosIndirectosPorTipo,
  totalCostosFijos,
  totalAmortizacionesPeriodo,
  totalGastosOperativos,
  fARS,
  fPct,
  inPeriod,
  ventasNetas,
} from "@/lib/calc";
import { Card, PageHeader, InfoRow } from "@/components/ui";
import { CHART_COLORS } from "@/lib/chart-colors";

/** Calcula el EERR completo de un mes puntual — se reutiliza para el período elegido y para
 * mes anterior / mismo mes del año anterior (sección "Análisis del EERR"). */
function eerrDeMes(data: ReturnType<typeof useStore>["data"], mes: number, anio: number) {
  const pedidos = data.pedidos.filter((p) => inPeriod(p.fecha, mes, anio) && p.estado !== "Cancelado");
  const ventas = ventasNetas(pedidos);
  const cmv = cmvPeriodo(data, pedidos);
  const costoEnvio = totalCostoEnvio(pedidos);
  const indirectosVariables = totalCostosIndirectosPorTipo(data, mes, anio, "Variable");
  const margenBruto = ventas - cmv - costoEnvio - indirectosVariables;
  const costosFijos = totalCostosFijos(data);
  const indirectosFijos = totalCostosIndirectosPorTipo(data, mes, anio, "Fijo");
  const amortizaciones = totalAmortizacionesPeriodo(data, mes, anio);
  const gastosOperativos = totalGastosOperativos(data, mes, anio);
  const resultadoOperativo = margenBruto - costosFijos - indirectosFijos - amortizaciones - gastosOperativos;
  // No hay todavía una categoría de datos separada para ingresos/egresos no operativos —
  // en vez de inventar un número, la línea queda en $0 y el resultado neto = operativo.
  const otrosIngresosEgresos = 0;
  const resultadoNeto = resultadoOperativo + otrosIngresosEgresos;
  const gastosTotal = cmv + costoEnvio + indirectosVariables + costosFijos + indirectosFijos + amortizaciones + gastosOperativos;
  return {
    ventas,
    cmv,
    costoEnvio,
    indirectosVariables,
    margenBruto,
    costosFijos,
    indirectosFijos,
    amortizaciones,
    gastosOperativos,
    resultadoOperativo,
    otrosIngresosEgresos,
    resultadoNeto,
    gastosTotal,
  };
}

function variacionPct(actual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((actual - anterior) / Math.abs(anterior)) * 100;
}

export function EERR() {
  const { data } = useStore();
  const { mes, anio } = usePeriod();

  const eerr = useMemo(() => eerrDeMes(data, mes, anio), [data, mes, anio]);
  const mesAnteriorFecha = mes === 1 ? { mes: 12, anio: anio - 1 } : { mes: mes - 1, anio };
  const eerrMesAnterior = useMemo(() => eerrDeMes(data, mesAnteriorFecha.mes, mesAnteriorFecha.anio), [data, mesAnteriorFecha.mes, mesAnteriorFecha.anio]);
  const eerrAnioAnterior = useMemo(() => eerrDeMes(data, mes, anio - 1), [data, mes, anio]);

  const pct = (v: number) => (eerr.ventas > 0 ? (v / eerr.ventas) * 100 : 0);
  const vsMesAnterior = variacionPct(eerr.resultadoNeto, eerrMesAnterior.resultadoNeto);
  const vsAnioAnterior = variacionPct(eerr.resultadoNeto, eerrAnioAnterior.resultadoNeto);

  const composicion = [
    {
      name: "Ventas Netas",
      cmv: eerr.cmv + eerr.costoEnvio + eerr.indirectosVariables,
      cf: eerr.costosFijos + eerr.indirectosFijos + eerr.amortizaciones,
      gastosOp: eerr.gastosOperativos,
      resultadoNeto: eerr.resultadoNeto,
    },
  ];

  return (
    <div>
      <PageHeader title="EERR" sub="Estado de Resultados del período" />

      {eerr.ventas > 0 && (
        <Card title="Composición de Ventas Netas" className="mb-4">
          <ResponsiveContainer width="100%" height={110}>
            <BarChart data={composicion} layout="vertical" margin={{ top: 4, right: 20, left: 20, bottom: 4 }}>
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: CHART_COLORS.text3 }}
                axisLine={{ stroke: CHART_COLORS.border }}
                tickLine={false}
                tickFormatter={(v: number) => fARS(v)}
              />
              <YAxis type="category" dataKey="name" hide />
              <Tooltip
                formatter={(v) => fARS(Number(v))}
                contentStyle={{ borderRadius: 8, border: `1px solid ${CHART_COLORS.border}`, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="cmv" name="CMV + envío + indirectos var." stackId="a" fill={CHART_COLORS.red} />
              <Bar dataKey="cf" name="Fijos + indirectos + amortiz." stackId="a" fill={CHART_COLORS.orange} />
              <Bar dataKey="gastosOp" name="Gastos operativos" stackId="a" fill={CHART_COLORS.purple} />
              <Bar dataKey="resultadoNeto" name="Resultado neto" stackId="a" fill={CHART_COLORS.green} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card className="mb-4">
        <InfoRow label="Ventas" value={<><span className="mr-3 text-text3">{fPct(100)}</span>{fARS(eerr.ventas)}</>} color="gold" />
        <InfoRow label="(-) Costo de Mercadería Vendida" value={<><span className="mr-3 text-text3">{fPct(pct(eerr.cmv))}</span>{fARS(eerr.cmv)}</>} color="red" />
        <InfoRow label="(-) Costo de envío" value={<><span className="mr-3 text-text3">{fPct(pct(eerr.costoEnvio))}</span>{fARS(eerr.costoEnvio)}</>} color="red" />
        <InfoRow
          label="(-) Costos indirectos variables"
          value={<><span className="mr-3 text-text3">{fPct(pct(eerr.indirectosVariables))}</span>{fARS(eerr.indirectosVariables)}</>}
          color="red"
        />
        <InfoRow
          label="= Margen bruto"
          value={<><span className="mr-3 text-text3">{fPct(pct(eerr.margenBruto))}</span>{fARS(eerr.margenBruto)}</>}
          color="green"
        />
        <InfoRow label="(-) Costos fijos" value={<><span className="mr-3 text-text3">{fPct(pct(eerr.costosFijos))}</span>{fARS(eerr.costosFijos)}</>} color="orange" />
        <InfoRow
          label="(-) Costos indirectos fijos"
          value={<><span className="mr-3 text-text3">{fPct(pct(eerr.indirectosFijos))}</span>{fARS(eerr.indirectosFijos)}</>}
          color="orange"
        />
        <InfoRow
          label="(-) Amortizaciones"
          value={<><span className="mr-3 text-text3">{fPct(pct(eerr.amortizaciones))}</span>{fARS(eerr.amortizaciones)}</>}
          color="orange"
        />
        <InfoRow
          label="(-) Gastos operativos"
          value={<><span className="mr-3 text-text3">{fPct(pct(eerr.gastosOperativos))}</span>{fARS(eerr.gastosOperativos)}</>}
          color="orange"
        />
        <InfoRow
          label="= Resultado operativo"
          value={<><span className="mr-3 text-text3">{fPct(pct(eerr.resultadoOperativo))}</span>{fARS(eerr.resultadoOperativo)}</>}
          color={eerr.resultadoOperativo >= 0 ? "green" : "red"}
        />
        <InfoRow
          label="(+/-) Otros ingresos / egresos"
          value={fARS(eerr.otrosIngresosEgresos)}
        />
        <InfoRow
          label="= Resultado neto"
          value={<><span className="mr-3 text-text3">{fPct(pct(eerr.resultadoNeto))}</span>{fARS(eerr.resultadoNeto)}</>}
          color={eerr.resultadoNeto >= 0 ? "green" : "red"}
        />
      </Card>

      <Card title="Análisis del período">
        <InfoRow label="Margen bruto %" value={fPct(pct(eerr.margenBruto))} color={eerr.margenBruto >= 0 ? "green" : "red"} />
        <InfoRow label="Resultado neto %" value={fPct(pct(eerr.resultadoNeto))} color={eerr.resultadoNeto >= 0 ? "green" : "red"} />
        <InfoRow
          label="Gastos totales como % de ventas"
          value={eerr.ventas > 0 ? fPct((eerr.gastosTotal / eerr.ventas) * 100) : "—"}
        />
        <InfoRow
          label="Resultado neto vs. mes anterior"
          value={vsMesAnterior !== null ? `${vsMesAnterior >= 0 ? "+" : ""}${fPct(vsMesAnterior)}` : "Sin datos del mes anterior"}
          color={vsMesAnterior === null ? undefined : vsMesAnterior >= 0 ? "green" : "red"}
        />
        <InfoRow
          label="Resultado neto vs. mismo mes año anterior"
          value={vsAnioAnterior !== null ? `${vsAnioAnterior >= 0 ? "+" : ""}${fPct(vsAnioAnterior)}` : "Sin datos del año anterior"}
          color={vsAnioAnterior === null ? undefined : vsAnioAnterior >= 0 ? "green" : "red"}
        />
      </Card>
    </div>
  );
}
