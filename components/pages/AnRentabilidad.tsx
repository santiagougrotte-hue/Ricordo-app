"use client";

import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useStore } from "@/lib/store";
import { usePeriod } from "@/lib/period";
import { calcCosto, fARS, fNum, fPct, inPeriod } from "@/lib/calc";
import { Card, PageHeader, TableWrap, Th, Td, TrHover, EmptyState } from "@/components/ui";
import { CHART_COLORS } from "@/lib/chart-colors";

export function AnRentabilidad() {
  const { data } = useStore();
  const { mes, anio } = usePeriod();

  const filas = useMemo(() => {
    const pedidos = data.pedidos.filter((p) => inPeriod(p.fecha, mes, anio) && p.estado !== "Cancelado");
    const map = new Map<string, { nombre: string; unidades: number; venta: number }>();
    for (const p of pedidos) {
      const cur = map.get(p.id_producto) ?? { nombre: p.nombre_producto, unidades: 0, venta: 0 };
      cur.unidades += p.cantidad;
      cur.venta += p.precio_neto;
      map.set(p.id_producto, cur);
    }
    return Array.from(map.entries())
      .map(([id, v]) => {
        const costoUnit = calcCosto(data, id);
        const costoTotal = costoUnit * v.unidades;
        const ganancia = v.venta - costoTotal;
        return {
          id,
          nombre: v.nombre,
          unidades: v.unidades,
          venta: v.venta,
          costo: costoTotal,
          ganancia,
          margen: v.venta > 0 ? (ganancia / v.venta) * 100 : 0,
        };
      })
      .sort((a, b) => b.ganancia - a.ganancia);
  }, [data, mes, anio]);

  const totalVenta = filas.reduce((a, f) => a + f.venta, 0);
  const totalCosto = filas.reduce((a, f) => a + f.costo, 0);
  const totalGanancia = filas.reduce((a, f) => a + f.ganancia, 0);

  return (
    <div>
      <PageHeader title="Rentabilidad" sub="Análisis de ganancia por producto en el período" />

      {filas.length > 0 && (
        <Card title="Margen de contribución por producto" className="mb-4">
          <ResponsiveContainer width="100%" height={Math.max(180, filas.length * 34)}>
            <BarChart data={filas} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: CHART_COLORS.text3 }}
                axisLine={{ stroke: CHART_COLORS.border }}
                tickLine={false}
                tickFormatter={(v: number) => fARS(v)}
              />
              <YAxis
                type="category"
                dataKey="nombre"
                width={150}
                tick={{ fontSize: 11, fill: CHART_COLORS.text2 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v) => fARS(Number(v))}
                contentStyle={{ borderRadius: 8, border: `1px solid ${CHART_COLORS.border}`, fontSize: 12 }}
              />
              <Bar dataKey="ganancia" name="Ganancia" radius={[0, 4, 4, 0]}>
                {filas.map((f) => (
                  <Cell key={f.id} fill={f.ganancia >= 0 ? CHART_COLORS.green : CHART_COLORS.red} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card>
        {filas.length === 0 ? (
          <EmptyState text="Sin ventas en el período." />
        ) : (
          <>
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Producto</Th>
                    <Th>Unidades</Th>
                    <Th>Venta total</Th>
                    <Th>Costo insumos</Th>
                    <Th>Ganancia</Th>
                    <Th>Margen %</Th>
                    <Th>Participación</Th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <TrHover key={f.id}>
                      <Td main>{f.nombre}</Td>
                      <Td>{fNum(f.unidades, 0)}</Td>
                      <Td>{fARS(f.venta)}</Td>
                      <Td>{fARS(f.costo)}</Td>
                      <Td className={f.ganancia >= 0 ? "text-green" : "text-red"}>{fARS(f.ganancia)}</Td>
                      <Td>{fPct(f.margen)}</Td>
                      <Td className="min-w-[160px]">
                        <div className="h-[7px] overflow-hidden rounded bg-surface3">
                          <div
                            className="h-full rounded bg-accent transition-all duration-500"
                            style={{ width: `${totalVenta > 0 ? Math.min(100, (f.venta / totalVenta) * 100) : 0}%` }}
                          />
                        </div>
                      </Td>
                    </TrHover>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-medium text-text">
                    <Td main>Total</Td>
                    <Td>{fNum(filas.reduce((a, f) => a + f.unidades, 0), 0)}</Td>
                    <Td main>{fARS(totalVenta)}</Td>
                    <Td>{fARS(totalCosto)}</Td>
                    <Td className={totalGanancia >= 0 ? "text-green" : "text-red"}>{fARS(totalGanancia)}</Td>
                    <Td>{fPct(totalVenta > 0 ? (totalGanancia / totalVenta) * 100 : 0)}</Td>
                    <Td />
                  </tr>
                </tfoot>
              </table>
            </TableWrap>
          </>
        )}
      </Card>
    </div>
  );
}
