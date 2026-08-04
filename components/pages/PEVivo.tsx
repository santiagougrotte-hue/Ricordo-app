"use client";

import React, { useMemo } from "react";
import { useStore } from "@/lib/store";
import { usePeriod } from "@/lib/period";
import { costosFijosTotales, fARS, fPct, inPeriod, unidadesEntregadas } from "@/lib/calc";
import { Card, PageHeader, StatGrid, KpiCard, InfoRow } from "@/components/ui";

export function PEVivo() {
  const { data } = useStore();
  const { mes, anio } = usePeriod();

  const cfTotal = costosFijosTotales(data, mes, anio);

  const mesAnterior = mes === 1 ? 12 : mes - 1;
  const anioMesAnterior = mes === 1 ? anio - 1 : anio;

  const unidadesActual = useMemo(
    () => unidadesEntregadas(data.pedidos.filter((p) => inPeriod(p.fecha, mes, anio))),
    [data.pedidos, mes, anio]
  );
  const unidadesAnterior = useMemo(
    () => unidadesEntregadas(data.pedidos.filter((p) => inPeriod(p.fecha, mesAnterior, anioMesAnterior))),
    [data.pedidos, mesAnterior, anioMesAnterior]
  );

  const cfuActual = unidadesActual > 0 ? cfTotal / unidadesActual : 0;
  const cfuAnterior = unidadesAnterior > 0 ? cfTotal / unidadesAnterior : 0;
  const tendencia = cfuAnterior > 0 ? ((cfuActual - cfuAnterior) / cfuAnterior) * 100 : 0;

  return (
    <div>
      <PageHeader title="PE Vivo" sub="Costo fijo unitario en tiempo real" />

      <StatGrid>
        <KpiCard label="Costos fijos totales" value={fARS(cfTotal)} color="orange" />
        <KpiCard label="Unidades entregadas (período)" value={unidadesActual} color="blue" />
        <KpiCard label="CFU actual" value={fARS(cfuActual)} color="gold" />
        <KpiCard
          label="Tendencia vs. mes anterior"
          value={fPct(tendencia)}
          sub={tendencia <= 0 ? "Mejorando (menos CF por unidad)" : "Empeorando"}
          color={tendencia <= 0 ? "green" : "red"}
        />
      </StatGrid>

      <Card title="Detalle">
        <InfoRow label="CFU mes anterior" value={fARS(cfuAnterior)} />
        <InfoRow label="Unidades mes anterior" value={unidadesAnterior} />
        <InfoRow label="CFU actual" value={fARS(cfuActual)} color="gold" />
        <InfoRow label="Unidades actuales" value={unidadesActual} />
        <InfoRow label="Variación absoluta" value={fARS(cfuActual - cfuAnterior)} color={cfuActual <= cfuAnterior ? "green" : "red"} />
      </Card>
    </div>
  );
}
