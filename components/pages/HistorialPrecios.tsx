"use client";

import React, { useMemo } from "react";
import { useStore } from "@/lib/store";
import { fARS, fPct } from "@/lib/calc";
import { Card, PageHeader, TableWrap, Th, Td, TrHover, EmptyState, Badge } from "@/components/ui";

export function HistorialPrecios() {
  const { data } = useStore();

  const historial = useMemo(
    () => [...data.historial_precios].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()),
    [data.historial_precios]
  );

  return (
    <div>
      <PageHeader title="Historial de Precios" sub="Cambios de precio de insumos" />
      <Card>
        {historial.length === 0 ? (
          <EmptyState text="Sin cambios de precio registrados." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Insumo</Th>
                  <Th>Precio anterior</Th>
                  <Th>Precio nuevo</Th>
                  <Th>Variación</Th>
                </tr>
              </thead>
              <tbody>
                {historial.map((h) => {
                  const variacion = h.precio_anterior > 0 ? ((h.precio_nuevo - h.precio_anterior) / h.precio_anterior) * 100 : 0;
                  return (
                    <TrHover key={h.id}>
                      <Td>{h.fecha}</Td>
                      <Td main>{h.insumo}</Td>
                      <Td>{fARS(h.precio_anterior)}</Td>
                      <Td>{fARS(h.precio_nuevo)}</Td>
                      <Td>
                        <Badge color={variacion > 0 ? "red" : variacion < 0 ? "green" : "blue"}>
                          {variacion > 0 ? "+" : ""}
                          {fPct(variacion)}
                        </Badge>
                      </Td>
                    </TrHover>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
