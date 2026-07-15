"use client";

import React, { useMemo } from "react";
import { useStore } from "@/lib/store";
import { usePeriod } from "@/lib/period";
import {
  cmvPeriodo,
  fARS,
  fPct,
  inPeriod,
  totalCostosFijos,
  totalCostosIndirectos,
  totalGastosOperativos,
  ventasNetas,
} from "@/lib/calc";
import { Card, PageHeader, InfoRow } from "@/components/ui";

export function EERR() {
  const { data } = useStore();
  const { mes, anio } = usePeriod();

  const pedidosPeriodo = useMemo(
    () => data.pedidos.filter((p) => inPeriod(p.fecha, mes, anio) && p.estado !== "Cancelado"),
    [data.pedidos, mes, anio]
  );

  const ventas = ventasNetas(pedidosPeriodo);
  const cmv = cmvPeriodo(data, pedidosPeriodo);
  const gananciaBruta = ventas - cmv;
  const ci = totalCostosIndirectos(data, mes, anio);
  const cf = totalCostosFijos(data);
  const utilidadOperativa = gananciaBruta - ci - cf;
  const gastosOp = totalGastosOperativos(data, mes, anio);
  const utilidadNeta = utilidadOperativa - gastosOp;

  const pct = (v: number) => (ventas > 0 ? (v / ventas) * 100 : 0);

  return (
    <div>
      <PageHeader title="EERR" sub="Estado de Resultados del período" />
      <Card>
        <InfoRow label="Ventas netas" value={<><span className="mr-3 text-text3">{fPct(100)}</span>{fARS(ventas)}</>} color="gold" />
        <InfoRow label="(-) CMV" value={<><span className="mr-3 text-text3">{fPct(pct(cmv))}</span>{fARS(cmv)}</>} color="red" />
        <InfoRow label="= Ganancia bruta" value={<><span className="mr-3 text-text3">{fPct(pct(gananciaBruta))}</span>{fARS(gananciaBruta)}</>} color="green" />
        <InfoRow label="(-) Costos indirectos" value={<><span className="mr-3 text-text3">{fPct(pct(ci))}</span>{fARS(ci)}</>} color="orange" />
        <InfoRow label="(-) Costos fijos" value={<><span className="mr-3 text-text3">{fPct(pct(cf))}</span>{fARS(cf)}</>} color="orange" />
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
