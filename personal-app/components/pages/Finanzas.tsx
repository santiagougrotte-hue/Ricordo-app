"use client";

import React from "react";
import { useStore } from "@/lib/store";
import { usePeriod } from "@/lib/period";
import {
  balanceMes,
  fARS,
  gastosPorCategoria,
  proyeccionCuotasMesSiguiente,
  totalEgresosMes,
  totalIngresosMes,
} from "@/lib/calc";
import { MESES } from "@/lib/date";
import { BarRow, Card, EmptyState, KpiCard, PageHeader, StatGrid } from "@/components/ui";

export function Finanzas() {
  const { data } = useStore();
  const { mes, anio } = usePeriod();

  const ingresos = totalIngresosMes(data, mes, anio);
  const egresos = totalEgresosMes(data, mes, anio);
  const balance = balanceMes(data, mes, anio);
  const proyeccion = proyeccionCuotasMesSiguiente(data, mes, anio);
  const mesSiguiente = MESES[mes === 12 ? 0 : mes];

  const porCategoria = gastosPorCategoria(data, mes, anio);
  const maxCategoria = Math.max(1, ...porCategoria.map((c) => c.monto));

  return (
    <div>
      <PageHeader title="Resumen financiero" sub={`${MESES[mes - 1]} ${anio}`} />

      <StatGrid>
        <KpiCard label="Balance del mes" value={fARS(balance)} color={balance >= 0 ? "green" : "red"} />
        <KpiCard label="Ingresos" value={fARS(ingresos)} color="blue" />
        <KpiCard label="Egresos" value={fARS(egresos)} color="orange" />
        <KpiCard
          label={`Proyección ${mesSiguiente}`}
          value={fARS(proyeccion)}
          color="purple"
          sub="cuotas activas el mes que viene"
        />
      </StatGrid>

      <Card title="Gastos por categoría">
        {porCategoria.length === 0 ? (
          <EmptyState text="Sin egresos en este período." />
        ) : (
          <div className="flex flex-col gap-2">
            {porCategoria.map((c) => (
              <BarRow
                key={c.categoria}
                label={c.categoria}
                value={fARS(c.monto)}
                pct={(c.monto / maxCategoria) * 100}
                color="orange"
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
