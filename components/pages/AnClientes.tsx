"use client";

import React, { useMemo } from "react";
import { useStore } from "@/lib/store";
import { usePeriod } from "@/lib/period";
import { fARS, inPeriod } from "@/lib/calc";
import { Card, PageHeader, TableWrap, Th, Td, TrHover, EmptyState, Badge } from "@/components/ui";

export function AnClientes() {
  const { data } = useStore();
  const { mes, anio } = usePeriod();

  const ranking = useMemo(() => {
    const pedidos = data.pedidos.filter((p) => inPeriod(p.fecha, mes, anio) && p.estado !== "Cancelado");
    const map = new Map<string, { monto: number; pedidos: Set<string> }>();
    for (const p of pedidos) {
      const cur = map.get(p.id_cliente) ?? { monto: 0, pedidos: new Set<string>() };
      cur.monto += p.precio_neto;
      cur.pedidos.add(p.id_pedido);
      map.set(p.id_cliente, cur);
    }
    return Array.from(map.entries())
      .map(([id, v]) => {
        const cliente = data.clientes.find((c) => c.id === id);
        return {
          id,
          nombre: cliente?.nombre ?? "—",
          canal: cliente?.canal ?? "Minorista",
          monto: v.monto,
          pedidos: v.pedidos.size,
          ticket: v.pedidos.size > 0 ? v.monto / v.pedidos.size : 0,
        };
      })
      .sort((a, b) => b.monto - a.monto);
  }, [data, mes, anio]);

  return (
    <div>
      <PageHeader title="Análisis de Clientes" sub="Ranking por volumen de compra en el período" />
      <Card>
        {ranking.length === 0 ? (
          <EmptyState text="Sin ventas en el período." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Cliente</Th>
                  <Th>Canal</Th>
                  <Th>Pedidos</Th>
                  <Th>Monto total</Th>
                  <Th>Ticket promedio</Th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r, i) => (
                  <TrHover key={r.id}>
                    <Td>{i + 1}</Td>
                    <Td main>{r.nombre}</Td>
                    <Td>
                      <Badge color={r.canal === "Mayorista" ? "purple" : "blue"}>{r.canal}</Badge>
                    </Td>
                    <Td>{r.pedidos}</Td>
                    <Td main>{fARS(r.monto)}</Td>
                    <Td>{fARS(r.ticket)}</Td>
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
