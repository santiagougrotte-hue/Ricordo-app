"use client";

import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { usePeriod } from "@/lib/period";
import { fARS, movimientosDelMes } from "@/lib/calc";
import { MESES } from "@/lib/date";
import { Badge, EmptyState, PageHeader, Select, Td, Th, TrHover, TableWrap } from "@/components/ui";

export function Historial() {
  const { data } = useStore();
  const { mes, anio } = usePeriod();
  const [categoria, setCategoria] = useState("todas");

  const movimientos = useMemo(() => movimientosDelMes(data, mes, anio), [data, mes, anio]);
  const categorias = useMemo(
    () => Array.from(new Set(movimientos.map((m) => m.categoria))).sort((a, b) => a.localeCompare(b, "es")),
    [movimientos]
  );
  const filtrados = useMemo(
    () => (categoria === "todas" ? movimientos : movimientos.filter((m) => m.categoria === categoria)),
    [movimientos, categoria]
  );

  const totalIngresos = filtrados.filter((m) => m.tipo === "ingreso").reduce((acc, m) => acc + m.monto, 0);
  const totalEgresos = filtrados.filter((m) => m.tipo === "egreso").reduce((acc, m) => acc + m.monto, 0);

  return (
    <div>
      <PageHeader
        title="Historial"
        sub={`${MESES[mes - 1]} ${anio} — usá el mes/año de arriba para cambiar de período`}
        right={
          <Select value={categoria} onChange={(e) => setCategoria(e.target.value)} style={{ width: 180 }}>
            <option value="todas">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        }
      />

      {filtrados.length === 0 ? (
        <EmptyState icon="🧾" text="No hay movimientos para este filtro." />
      ) : (
        <TableWrap>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Descripción</Th>
                <Th>Categoría</Th>
                <Th>Tipo</Th>
                <Th>Monto</Th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((m) => (
                <TrHover key={m.id}>
                  <Td>{m.fecha}</Td>
                  <Td main>{m.descripcion}</Td>
                  <Td>{m.categoria}</Td>
                  <Td>
                    <Badge color={m.tipo === "ingreso" ? "green" : "red"}>
                      {m.tipo === "ingreso" ? "Ingreso" : "Egreso"}
                    </Badge>
                  </Td>
                  <Td className={m.tipo === "ingreso" ? "text-green" : "text-red"}>
                    {m.tipo === "ingreso" ? "+" : "-"}
                    {fARS(m.monto)}
                  </Td>
                </TrHover>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="border-b border-border/50 px-3 py-2.5 font-semibold text-text">
                  Total del período
                </td>
                <Td className="font-semibold text-text">{fARS(totalIngresos - totalEgresos)}</Td>
              </tr>
            </tfoot>
          </table>
        </TableWrap>
      )}
    </div>
  );
}
