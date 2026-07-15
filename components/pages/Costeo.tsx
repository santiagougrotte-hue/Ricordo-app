"use client";

import React, { useMemo } from "react";
import { useStore } from "@/lib/store";
import { usePeriod } from "@/lib/period";
import { calcCosto, fARS, fPct, inPeriod, totalCostosFijos, unidadesEntregadas } from "@/lib/calc";
import { Card, PageHeader, TableWrap, Th, Td, TrHover, EmptyState } from "@/components/ui";

export function Costeo() {
  const { data } = useStore();
  const { mes, anio } = usePeriod();

  const cfTotal = totalCostosFijos(data);
  const unidadesPeriodo = useMemo(
    () => unidadesEntregadas(data.pedidos.filter((p) => inPeriod(p.fecha, mes, anio))),
    [data.pedidos, mes, anio]
  );
  const cfu = unidadesPeriodo > 0 ? cfTotal / unidadesPeriodo : 0;

  const filas = data.productos.map((p) => {
    const cv = calcCosto(data, p.id);
    const costoAbsorcion = cv + cfu;
    const margenVariable = p.precio_venta > 0 ? ((p.precio_venta - cv) / p.precio_venta) * 100 : 0;
    const margenAbsorcion = p.precio_venta > 0 ? ((p.precio_venta - costoAbsorcion) / p.precio_venta) * 100 : 0;
    return { p, cv, costoAbsorcion, margenVariable, margenAbsorcion };
  });

  return (
    <div>
      <PageHeader title="Costeo" sub="Costo variable vs. costo de absorción (incluye CFU del período)" />
      <Card>
        {filas.length === 0 ? (
          <EmptyState text="Sin productos." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Producto</Th>
                  <Th title="Costo variable = solo receta (ingredientes + packaging)">Costo Variable</Th>
                  <Th title="Costo absorción = Costo Variable + CFU (Costos Fijos / unidades entregadas)">Costo Absorción</Th>
                  <Th title="(Precio - Costo Variable) / Precio">Margen Variable</Th>
                  <Th title="(Precio - Costo Absorción) / Precio">Margen Absorción</Th>
                </tr>
              </thead>
              <tbody>
                {filas.map(({ p, cv, costoAbsorcion, margenVariable, margenAbsorcion }) => (
                  <TrHover key={p.id}>
                    <Td main>{p.nombre}</Td>
                    <Td>{fARS(cv)}</Td>
                    <Td>{fARS(costoAbsorcion)}</Td>
                    <Td className={margenVariable >= 30 ? "text-green" : "text-red"}>{fPct(margenVariable)}</Td>
                    <Td className={margenAbsorcion >= 30 ? "text-green" : "text-red"}>{fPct(margenAbsorcion)}</Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <div className="mt-3 text-[11px] text-text3">CFU del período: {fARS(cfu)} (pasá el mouse sobre los encabezados para ver las fórmulas)</div>
      </Card>
    </div>
  );
}
