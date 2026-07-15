"use client";

import React, { useMemo } from "react";
import { useStore } from "@/lib/store";
import { usePeriod } from "@/lib/period";
import { cmvPeriodo, fARS, inPeriod } from "@/lib/calc";
import { Card, PageHeader, TableWrap, Th, Td, TrHover } from "@/components/ui";
import { MESES } from "@/lib/period";

export function AnAnual() {
  const { data } = useStore();
  const { anio } = usePeriod();

  const filas = useMemo(() => {
    return MESES.map((nombre, idx) => {
      const mes = idx + 1;
      const pedidos = data.pedidos.filter((p) => inPeriod(p.fecha, mes, anio) && p.estado !== "Cancelado");
      const ventas = pedidos.reduce((a, p) => a + p.precio_neto, 0);
      const costos = cmvPeriodo(data, pedidos);
      const ganancia = ventas - costos;
      return { mes, nombre, ventas, costos, ganancia };
    });
  }, [data, anio]);

  const maxVentas = Math.max(1, ...filas.map((f) => f.ventas));
  const totalVentas = filas.reduce((a, f) => a + f.ventas, 0);
  const totalCostos = filas.reduce((a, f) => a + f.costos, 0);
  const totalGanancia = filas.reduce((a, f) => a + f.ganancia, 0);

  return (
    <div>
      <PageHeader title="Análisis Anual" sub={`Vista mes a mes — ${anio}`} />

      <Card title="Tendencia de ventas" className="mb-4">
        <div className="flex items-end gap-2" style={{ height: 140 }}>
          {filas.map((f) => (
            <div key={f.mes} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-accent transition-all duration-500"
                style={{ height: `${(f.ventas / maxVentas) * 110}px` }}
                title={fARS(f.ventas)}
              />
              <span className="text-[9px] text-text3">{f.nombre.slice(0, 3)}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <Th>Mes</Th>
                <Th>Ventas</Th>
                <Th>Costos (CMV)</Th>
                <Th>Ganancia</Th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <TrHover key={f.mes}>
                  <Td main>{f.nombre}</Td>
                  <Td className="text-green">{fARS(f.ventas)}</Td>
                  <Td className="text-red">{fARS(f.costos)}</Td>
                  <Td className={f.ganancia >= 0 ? "text-green" : "text-red"}>{fARS(f.ganancia)}</Td>
                </TrHover>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-medium text-text">
                <Td main>Total</Td>
                <Td main>{fARS(totalVentas)}</Td>
                <Td>{fARS(totalCostos)}</Td>
                <Td className={totalGanancia >= 0 ? "text-green" : "text-red"}>{fARS(totalGanancia)}</Td>
              </tr>
            </tfoot>
          </table>
        </TableWrap>
      </Card>
    </div>
  );
}
