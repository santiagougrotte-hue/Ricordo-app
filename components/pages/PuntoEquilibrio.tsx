"use client";

import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { useStore } from "@/lib/store";
import { usePeriod } from "@/lib/period";
import { calcCosto, fARS, fNum, fPct, inPeriod, puntoEquilibrio, ventasNetas } from "@/lib/calc";
import { Card, PageHeader, StatGrid, KpiCard, TableWrap, Th, Td, TrHover, EmptyState, Badge, Semaforo } from "@/components/ui";
import { CHART_COLORS } from "@/lib/chart-colors";

export function PuntoEquilibrio() {
  const { data } = useStore();
  const { mes, anio } = usePeriod();

  const pedidosPeriodo = useMemo(
    () => data.pedidos.filter((p) => inPeriod(p.fecha, mes, anio) && p.estado !== "Cancelado"),
    [data.pedidos, mes, anio]
  );

  const { pe, margenPromedioPonderado, cfTotal, precioPromedioPonderado, costoVariableUnitarioPromedio, unidadesTotales } =
    useMemo(() => puntoEquilibrio(data, pedidosPeriodo), [data, pedidosPeriodo]);
  const ventaActual = ventasNetas(pedidosPeriodo);
  const cumplido = pe > 0 ? (ventaActual / pe) * 100 : 0;
  const peUnidades = margenPromedioPonderado > 0 ? cfTotal / margenPromedioPonderado : 0;

  const breakevenData = useMemo(() => {
    const maxU = Math.max(unidadesTotales, peUnidades, 10) * 1.3;
    const steps = 10;
    const puntos = [];
    for (let i = 0; i <= steps; i++) {
      const u = (maxU / steps) * i;
      puntos.push({
        unidades: Math.round(u),
        ingresos: precioPromedioPonderado * u,
        costosTotales: cfTotal + costoVariableUnitarioPromedio * u,
        costosFijos: cfTotal,
      });
    }
    return puntos;
  }, [unidadesTotales, peUnidades, precioPromedioPonderado, costoVariableUnitarioPromedio, cfTotal]);

  const margenPorProducto = useMemo(() => {
    const unidades = new Map<string, number>();
    for (const p of pedidosPeriodo) unidades.set(p.id_producto, (unidades.get(p.id_producto) ?? 0) + p.cantidad);
    return data.productos
      .filter((p) => unidades.has(p.id))
      .map((p) => {
        const costo = calcCosto(data, p.id);
        const mc = p.precio_venta - costo;
        return { producto: p, mc, margenPct: p.precio_venta > 0 ? (mc / p.precio_venta) * 100 : 0, unidades: unidades.get(p.id) ?? 0 };
      })
      .sort((a, b) => b.mc - a.mc);
  }, [data, pedidosPeriodo]);

  return (
    <div>
      <PageHeader title="Punto de Equilibrio" sub="PE ($) = Costos Fijos / Margen de contribución promedio ponderado" />

      <StatGrid>
        <KpiCard label="Costos fijos totales" value={fARS(cfTotal)} color="orange" />
        <KpiCard label="Margen contrib. promedio" value={fARS(margenPromedioPonderado)} color="blue" />
        <KpiCard label="Punto de equilibrio ($)" value={fARS(pe)} color="gold" />
        <KpiCard
          label="Venta actual vs. PE"
          value={fPct(cumplido)}
          sub={fARS(ventaActual)}
          color={cumplido >= 100 ? "green" : cumplido >= 70 ? "orange" : "red"}
        />
      </StatGrid>

      <Card title="Semáforo del período" className="mb-4">
        <div className="flex items-center gap-3">
          <Semaforo nivel={cumplido >= 100 ? "green" : cumplido >= 70 ? "orange" : "red"} />
          <span className="text-sm text-text2">
            {cumplido >= 100
              ? "Punto de equilibrio superado."
              : cumplido >= 70
              ? "Cerca del punto de equilibrio."
              : "Por debajo del punto de equilibrio."}
          </span>
        </div>
      </Card>

      {peUnidades > 0 && (
        <Card title="Ingresos vs. Costos por volumen" className="mb-4">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={breakevenData} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis
                dataKey="unidades"
                tick={{ fontSize: 11, fill: CHART_COLORS.text3 }}
                axisLine={{ stroke: CHART_COLORS.border }}
                tickLine={false}
                label={{ value: "Unidades vendidas", position: "insideBottom", offset: -2, fontSize: 11, fill: CHART_COLORS.text3 }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: CHART_COLORS.text3 }}
                axisLine={false}
                tickLine={false}
                width={72}
                tickFormatter={(v: number) => fARS(v)}
              />
              <Tooltip
                formatter={(v) => fARS(Number(v))}
                labelFormatter={(l) => `${fNum(Number(l), 0)} unidades`}
                contentStyle={{ borderRadius: 8, border: `1px solid ${CHART_COLORS.border}`, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine
                x={Math.round(peUnidades)}
                stroke={CHART_COLORS.accent}
                strokeDasharray="4 4"
                label={{ value: "PE", position: "top", fill: CHART_COLORS.accent, fontSize: 11 }}
              />
              <Line type="monotone" dataKey="ingresos" name="Ingresos" stroke={CHART_COLORS.green} strokeWidth={2.5} dot={false} />
              <Line
                type="monotone"
                dataKey="costosTotales"
                name="Costos totales"
                stroke={CHART_COLORS.red}
                strokeWidth={2.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="costosFijos"
                name="Costos fijos"
                stroke={CHART_COLORS.orange}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card title="Margen de contribución por producto">
        {margenPorProducto.length === 0 ? (
          <EmptyState text="Sin ventas en el período." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Producto</Th>
                  <Th>Unidades</Th>
                  <Th>Precio venta</Th>
                  <Th>Margen contrib.</Th>
                  <Th>Margen %</Th>
                </tr>
              </thead>
              <tbody>
                {margenPorProducto.map(({ producto, mc, margenPct, unidades }) => (
                  <TrHover key={producto.id}>
                    <Td main>{producto.nombre}</Td>
                    <Td>{unidades}</Td>
                    <Td>{fARS(producto.precio_venta)}</Td>
                    <Td>{fARS(mc)}</Td>
                    <Td>
                      <Badge color={margenPct >= 50 ? "green" : margenPct >= 30 ? "orange" : "red"}>{fPct(margenPct)}</Badge>
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
