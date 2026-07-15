"use client";

import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useStore } from "@/lib/store";
import { usePeriod } from "@/lib/period";
import { calcCosto, fPct, fARS, inPeriod } from "@/lib/calc";
import { Card, PageHeader, TableWrap, Th, Td, TrHover, EmptyState, Badge } from "@/components/ui";
import { CHART_COLORS } from "@/lib/chart-colors";

export function ROI() {
  const { data } = useStore();
  const { mes, anio } = usePeriod();

  const filas = useMemo(() => {
    const pedidos = data.pedidos.filter((p) => inPeriod(p.fecha, mes, anio) && p.estado !== "Cancelado");
    const unidades = new Map<string, number>();
    for (const p of pedidos) unidades.set(p.id_producto, (unidades.get(p.id_producto) ?? 0) + p.cantidad);

    return data.productos
      .filter((p) => unidades.has(p.id))
      .map((p) => {
        const q = unidades.get(p.id) ?? 0;
        const cv = calcCosto(data, p.id) * q;
        const ventas = p.precio_venta * q;
        const mc = ventas - cv;
        const roi = cv > 0 ? (mc / cv) * 100 : 0;
        return { p, q, cv, mc, roi };
      })
      .sort((a, b) => b.roi - a.roi);
  }, [data, mes, anio]);

  return (
    <div>
      <PageHeader title="ROI" sub="ROI = Margen de Contribución / Costo Variable × 100" />

      {filas.length > 0 && (
        <Card title="Ranking de ROI por producto" className="mb-4">
          <ResponsiveContainer width="100%" height={Math.max(180, filas.length * 34)}>
            <BarChart data={filas} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: CHART_COLORS.text3 }}
                axisLine={{ stroke: CHART_COLORS.border }}
                tickLine={false}
                tickFormatter={(v: number) => `${v}%`}
              />
              <YAxis
                type="category"
                dataKey={(f: (typeof filas)[number]) => f.p.nombre}
                width={150}
                tick={{ fontSize: 11, fill: CHART_COLORS.text2 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v) => fPct(Number(v))}
                contentStyle={{ borderRadius: 8, border: `1px solid ${CHART_COLORS.border}`, fontSize: 12 }}
              />
              <Bar dataKey="roi" name="ROI" radius={[0, 4, 4, 0]}>
                {filas.map((f) => (
                  <Cell
                    key={f.p.id}
                    fill={f.roi >= 100 ? CHART_COLORS.green : f.roi >= 50 ? CHART_COLORS.orange : CHART_COLORS.red}
                  />
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
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Producto</Th>
                  <Th>Unidades</Th>
                  <Th>Costo variable total</Th>
                  <Th>Margen contrib.</Th>
                  <Th>ROI</Th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => (
                  <TrHover key={f.p.id}>
                    <Td>{i + 1}</Td>
                    <Td main>{f.p.nombre}</Td>
                    <Td>{f.q}</Td>
                    <Td>{fARS(f.cv)}</Td>
                    <Td>{fARS(f.mc)}</Td>
                    <Td>
                      <Badge color={f.roi >= 100 ? "green" : f.roi >= 50 ? "orange" : "red"}>{fPct(f.roi)}</Badge>
                    </Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
