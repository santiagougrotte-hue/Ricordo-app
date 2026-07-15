"use client";

import React, { useMemo } from "react";
import { useStore } from "@/lib/store";
import { usePeriod } from "@/lib/period";
import { calcCosto, fARS, fPct, inPeriod } from "@/lib/calc";
import { Card, PageHeader, TableWrap, Th, Td, TrHover, EmptyState, Badge } from "@/components/ui";

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
