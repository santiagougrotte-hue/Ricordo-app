"use client";

import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useStore } from "@/lib/store";
import { usePeriod } from "@/lib/period";
import {
  costosFijosTotales,
  costosVariablesTotales,
  fARS,
  fPct,
  inPeriod,
  totalGastosOperativos,
  ventasNetas,
} from "@/lib/calc";
import { Card, PageHeader, InfoRow } from "@/components/ui";
import { CHART_COLORS } from "@/lib/chart-colors";

export function EERR() {
  const { data } = useStore();
  const { mes, anio } = usePeriod();

  const pedidosPeriodo = useMemo(
    () => data.pedidos.filter((p) => inPeriod(p.fecha, mes, anio) && p.estado !== "Cancelado"),
    [data.pedidos, mes, anio]
  );

  const ventas = ventasNetas(pedidosPeriodo);
  const cv = costosVariablesTotales(data, pedidosPeriodo, mes, anio);
  const contribucionMarginal = ventas - cv;
  const cf = costosFijosTotales(data, mes, anio);
  const utilidadOperativa = contribucionMarginal - cf;
  const gastosOp = totalGastosOperativos(data, mes, anio);
  const utilidadNeta = utilidadOperativa - gastosOp;

  const pct = (v: number) => (ventas > 0 ? (v / ventas) * 100 : 0);

  const composicion = [{ name: "Ventas Netas", cv, cf, gastosOp, utilidadNeta }];

  return (
    <div>
      <PageHeader title="EERR" sub="Estado de Resultados del período — formato de contribución marginal" />

      {ventas > 0 && (
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
              <Bar dataKey="cv" name="Costos variables" stackId="a" fill={CHART_COLORS.red} />
              <Bar dataKey="cf" name="Costos fijos" stackId="a" fill={CHART_COLORS.orange} />
              <Bar dataKey="gastosOp" name="Gastos operativos" stackId="a" fill={CHART_COLORS.purple} />
              <Bar dataKey="utilidadNeta" name="Utilidad neta" stackId="a" fill={CHART_COLORS.green} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card>
        <InfoRow label="Ventas netas" value={<><span className="mr-3 text-text3">{fPct(100)}</span>{fARS(ventas)}</>} color="gold" />
        <InfoRow label="(-) Costos variables totales" value={<><span className="mr-3 text-text3">{fPct(pct(cv))}</span>{fARS(cv)}</>} color="red" />
        <InfoRow
          label="= Contribución marginal"
          value={<><span className="mr-3 text-text3">{fPct(pct(contribucionMarginal))}</span>{fARS(contribucionMarginal)}</>}
          color="green"
        />
        <InfoRow label="(-) Costos fijos totales" value={<><span className="mr-3 text-text3">{fPct(pct(cf))}</span>{fARS(cf)}</>} color="orange" />
        <InfoRow
          label="= Utilidad operativa"
          value={<><span className="mr-3 text-text3">{fPct(pct(utilidadOperativa))}</span>{fARS(utilidadOperativa)}</>}
          color={utilidadOperativa >= 0 ? "green" : "red"}
        />
        <InfoRow label="(-) Gastos operativos" value={<><span className="mr-3 text-text3">{fPct(pct(gastosOp))}</span>{fARS(gastosOp)}</>} color="orange" />
        <InfoRow
          label="= Utilidad neta"
          value={<><span className="mr-3 text-text3">{fPct(pct(utilidadNeta))}</span>{fARS(utilidadNeta)}</>}
          color={utilidadNeta >= 0 ? "green" : "red"}
        />
      </Card>
    </div>
  );
}
