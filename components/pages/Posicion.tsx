"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { fARS, saldoCaja, totalCostosFijos, totalCostosIndirectos, totalAmortizacionesPeriodo } from "@/lib/calc";
import { usePeriod } from "@/lib/period";
import { PageHeader, Card, StatGrid, KpiCard, Field, Input, Button, InfoRow } from "@/components/ui";

export function Posicion() {
  const { data, setData } = useStore();
  const { mes, anio } = usePeriod();
  const { toast } = useToast();
  const [efectivo, setEfectivo] = useState(data.efectivo_en_mano);

  const saldoSistema = saldoCaja(data);
  const cf = totalCostosFijos(data);
  const ci = totalCostosIndirectos(data, mes, anio);
  const amort = totalAmortizacionesPeriodo(data, mes, anio);
  const compromisos = cf + ci + amort;
  const posicionNeta = efectivo - compromisos;

  function guardar() {
    setData((d) => ({ ...d, efectivo_en_mano: efectivo }));
    toast("Efectivo en mano actualizado");
  }

  return (
    <div>
      <PageHeader title="Posición" sub="Efectivo disponible vs. compromisos del mes" />

      <StatGrid>
        <KpiCard label="Efectivo en mano" value={fARS(efectivo)} color="gold" />
        <KpiCard label="Saldo sistema (Caja)" value={fARS(saldoSistema)} color="blue" />
        <KpiCard label="Compromisos del mes" value={fARS(compromisos)} color="orange" />
        <KpiCard label="Posición neta" value={fARS(posicionNeta)} color={posicionNeta >= 0 ? "green" : "red"} />
      </StatGrid>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Efectivo en mano (manual)">
          <div className="flex items-end gap-3">
            <Field label="Monto en efectivo">
              <Input type="number" value={efectivo} onChange={(e) => setEfectivo(Number(e.target.value))} />
            </Field>
            <Button onClick={guardar}>Guardar</Button>
          </div>
          <div className="mt-4 border-t border-border pt-3">
            <InfoRow label="Diferencia vs. sistema" value={fARS(efectivo - saldoSistema)} color={efectivo >= saldoSistema ? "green" : "red"} />
          </div>
        </Card>

        <Card title="Compromisos del mes">
          <InfoRow label="Costos fijos" value={fARS(cf)} />
          <InfoRow label="Costos indirectos" value={fARS(ci)} />
          <InfoRow label="Amortizaciones" value={fARS(amort)} />
          <InfoRow label="Total compromisos" value={fARS(compromisos)} color="orange" />
        </Card>
      </div>
    </div>
  );
}
