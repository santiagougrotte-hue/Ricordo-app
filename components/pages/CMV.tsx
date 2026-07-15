"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { usePeriod } from "@/lib/period";
import { cmvAcumulado, cmvPeriodo, comprasAcumuladas, fARS, inPeriod } from "@/lib/calc";
import { Card, PageHeader, StatGrid, KpiCard, Field, Input, Button, InfoRow } from "@/components/ui";

export function CMV() {
  const { data, setData } = useStore();
  const { mes, anio } = usePeriod();
  const { toast } = useToast();

  const [cmvInicial, setCmvInicial] = useState(data.saldo_cmv_anterior);
  const [comprasInicial, setComprasInicial] = useState(data.saldo_compras_anterior);
  const [fechaCorte, setFechaCorte] = useState(data.fecha_corte_cmv ?? "");

  const cmvAcum = cmvAcumulado(data);
  const comprasAcum = comprasAcumuladas(data);
  const diferencia = comprasAcum - cmvAcum;

  const pedidosMes = data.pedidos.filter((p) => p.estado === "Entregado" && inPeriod(p.fecha, mes, anio));
  const cmvMes = cmvPeriodo(data, pedidosMes);
  const comprasMes = data.compras.filter((c) => inPeriod(c.fecha, mes, anio)).reduce((a, c) => a + c.total, 0);

  function guardar() {
    setData((d) => ({
      ...d,
      saldo_cmv_anterior: cmvInicial,
      saldo_compras_anterior: comprasInicial,
      fecha_corte_cmv: fechaCorte || null,
      fecha_corte_compras: fechaCorte || null,
    }));
    toast("Saldos de arrastre guardados");
  }

  return (
    <div>
      <PageHeader title="CMV" sub="Costo de mercadería vendida acumulado y del período" />

      <StatGrid>
        <KpiCard label="CMV acumulado" value={fARS(cmvAcum)} color="red" />
        <KpiCard label="Compras acumuladas" value={fARS(comprasAcum)} color="blue" />
        <KpiCard label="Diferencia (Compras − CMV)" value={fARS(diferencia)} color={diferencia >= 0 ? "green" : "red"} />
        <KpiCard label="CMV del mes" value={fARS(cmvMes)} color="orange" />
        <KpiCard label="Compras del mes" value={fARS(comprasMes)} color="purple" />
      </StatGrid>

      <Card title="Saldos de arrastre">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          <Field label="CMV inicial">
            <Input type="number" value={cmvInicial} onChange={(e) => setCmvInicial(Number(e.target.value))} />
          </Field>
          <Field label="Compras iniciales">
            <Input type="number" value={comprasInicial} onChange={(e) => setComprasInicial(Number(e.target.value))} />
          </Field>
          <Field label="Fecha de corte">
            <Input type="date" value={fechaCorte} onChange={(e) => setFechaCorte(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={guardar}>Guardar Saldos</Button>
        </div>
        <div className="mt-4 border-t border-border pt-3">
          <InfoRow label="Fecha de corte actual" value={data.fecha_corte_cmv ?? "Sin definir"} />
        </div>
      </Card>
    </div>
  );
}
