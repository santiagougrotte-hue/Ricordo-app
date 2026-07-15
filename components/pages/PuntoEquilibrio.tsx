"use client";

import React, { useMemo } from "react";
import { useStore } from "@/lib/store";
import { usePeriod } from "@/lib/period";
import { calcCosto, fARS, fPct, inPeriod, puntoEquilibrio, ventasNetas } from "@/lib/calc";
import { Card, PageHeader, StatGrid, KpiCard, TableWrap, Th, Td, TrHover, EmptyState, Badge } from "@/components/ui";

export function PuntoEquilibrio() {
  const { data } = useStore();
  const { mes, anio } = usePeriod();

  const pedidosPeriodo = useMemo(
    () => data.pedidos.filter((p) => inPeriod(p.fecha, mes, anio) && p.estado !== "Cancelado"),
    [data.pedidos, mes, anio]
  );

  const { pe, margenPromedioPonderado, cfTotal } = useMemo(
    () => puntoEquilibrio(data, pedidosPeriodo),
    [data, pedidosPeriodo]
  );
  const ventaActual = ventasNetas(pedidosPeriodo);
  const cumplido = pe > 0 ? (ventaActual / pe) * 100 : 0;

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
          <span className="text-2xl">{cumplido >= 100 ? "🟢" : cumplido >= 70 ? "🟡" : "🔴"}</span>
          <span className="text-sm text-text2">
            {cumplido >= 100
              ? "Punto de equilibrio superado."
              : cumplido >= 70
              ? "Cerca del punto de equilibrio."
              : "Por debajo del punto de equilibrio."}
          </span>
        </div>
      </Card>

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
