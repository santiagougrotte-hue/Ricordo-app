"use client";

import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { usePeriod } from "@/lib/period";
import { fARS, fNum, inPeriod } from "@/lib/calc";
import { Card, PageHeader, TableWrap, Th, Td, TrHover, EmptyState, Select, FilterTabs } from "@/components/ui";
import type { EstadoPedido } from "@/lib/types";

const ACTIVOS: EstadoPedido[] = ["Confirmado", "Produccion", "Entregado"];

export function AnProductos() {
  const { data } = useStore();
  const { mes, anio } = usePeriod();
  const [canal, setCanal] = useState("");
  const [estado, setEstado] = useState("activos");

  const grupos = useMemo(() => {
    const pedidos = data.pedidos.filter((p) => {
      if (!inPeriod(p.fecha, mes, anio)) return false;
      if (canal && p.canal !== canal) return false;
      if (estado === "activos") return ACTIVOS.includes(p.estado);
      return p.estado === estado;
    });

    const porBase = new Map<string, { nombre: string; variantes: Map<string, { nombre: string; cantidad: number; monto: number; canales: Set<string> }> }>();
    for (const p of pedidos) {
      const prod = data.productos.find((pr) => pr.id === p.id_producto);
      const idBase = prod?.id_base ?? p.id_producto;
      const nombreBase = data.productos.find((pr) => pr.id === idBase)?.nombre ?? p.nombre_producto;
      const grupo = porBase.get(idBase) ?? { nombre: nombreBase, variantes: new Map() };
      const v = grupo.variantes.get(p.id_producto) ?? { nombre: p.nombre_producto, cantidad: 0, monto: 0, canales: new Set<string>() };
      v.cantidad += p.cantidad;
      v.monto += p.precio_neto;
      v.canales.add(p.canal);
      grupo.variantes.set(p.id_producto, v);
      porBase.set(idBase, grupo);
    }
    return Array.from(porBase.values()).sort((a, b) => {
      const totalA = Array.from(a.variantes.values()).reduce((acc, v) => acc + v.monto, 0);
      const totalB = Array.from(b.variantes.values()).reduce((acc, v) => acc + v.monto, 0);
      return totalB - totalA;
    });
  }, [data, mes, anio, canal, estado]);

  return (
    <div>
      <PageHeader title="Análisis de Productos" sub="Ventas agrupadas por producto base y variantes" />

      <FilterTabs
        value={estado}
        onChange={setEstado}
        options={[
          { value: "activos", label: "Confirmado + Producción + Entregado" },
          { value: "Confirmado", label: "Confirmados" },
          { value: "Produccion", label: "Producción" },
          { value: "Entregado", label: "Entregados" },
          { value: "Cancelado", label: "Cancelados" },
        ]}
      />

      <div className="mb-4 max-w-[200px]">
        <Select value={canal} onChange={(e) => setCanal(e.target.value)}>
          <option value="">Todos los canales</option>
          <option value="Minorista">Minorista</option>
          <option value="Mayorista">Mayorista</option>
        </Select>
      </div>

      <Card>
        {grupos.length === 0 ? (
          <EmptyState text="Sin datos para este período/filtro." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Producto / Variante</Th>
                  <Th>Cantidad</Th>
                  <Th>Monto</Th>
                  <Th>Canales</Th>
                </tr>
              </thead>
              <tbody>
                {grupos.map((g, gi) => {
                  const variantes = Array.from(g.variantes.values());
                  const totalCant = variantes.reduce((a, v) => a + v.cantidad, 0);
                  const totalMonto = variantes.reduce((a, v) => a + v.monto, 0);
                  return (
                    <React.Fragment key={gi}>
                      <TrHover className="bg-surface2/40">
                        <Td main>{g.nombre}</Td>
                        <Td main>{fNum(totalCant, 0)}</Td>
                        <Td main>{fARS(totalMonto)}</Td>
                        <Td>{" "}</Td>
                      </TrHover>
                      {variantes.length > 1 &&
                        variantes.map((v, vi) => (
                          <TrHover key={vi}>
                            <Td className="pl-6">↳ {v.nombre}</Td>
                            <Td>{fNum(v.cantidad, 0)}</Td>
                            <Td>{fARS(v.monto)}</Td>
                            <Td>{Array.from(v.canales).join(", ")}</Td>
                          </TrHover>
                        ))}
                    </React.Fragment>
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
