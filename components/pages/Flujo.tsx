"use client";

import React, { useMemo } from "react";
import { useStore } from "@/lib/store";
import { fARS } from "@/lib/calc";
import { MESES } from "@/lib/period";
import { Card, EmptyState, PageHeader, TableWrap, Th, Td, TrHover } from "@/components/ui";

function monthsBack(n: number) {
  const out: { mes: number; anio: number }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ mes: d.getMonth() + 1, anio: d.getFullYear() });
  }
  return out;
}

export function Flujo() {
  const { data } = useStore();

  const filas = useMemo(() => {
    return monthsBack(12).map(({ mes, anio }) => {
      const movs = data.caja_movimientos.filter((m) => {
        const d = new Date(m.fecha);
        return d.getMonth() + 1 === mes && d.getFullYear() === anio;
      });
      const ingresos = movs.filter((m) => m.tipo === "ingreso").reduce((a, m) => a + m.monto, 0);
      const egresos = movs.filter((m) => m.tipo === "egreso").reduce((a, m) => a + m.monto, 0);
      return { mes, anio, ingresos, egresos, neto: ingresos - egresos };
    });
  }, [data.caja_movimientos]);

  const maxAbs = Math.max(1, ...filas.map((f) => Math.max(f.ingresos, f.egresos)));

  return (
    <div>
      <PageHeader title="Flujo" sub="Ingresos vs. egresos — últimos 12 meses" />
      <Card>
        {filas.every((f) => f.ingresos === 0 && f.egresos === 0) ? (
          <EmptyState text="Sin movimientos de caja históricos." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Mes</Th>
                  <Th>Ingresos</Th>
                  <Th>Egresos</Th>
                  <Th>Neto</Th>
                  <Th>Comparativa</Th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <TrHover key={`${f.anio}-${f.mes}`}>
                    <Td main>
                      {MESES[f.mes - 1]} {f.anio}
                    </Td>
                    <Td className="text-green">{fARS(f.ingresos)}</Td>
                    <Td className="text-red">{fARS(f.egresos)}</Td>
                    <Td className={f.neto >= 0 ? "text-green" : "text-red"}>{fARS(f.neto)}</Td>
                    <Td>
                      <div className="flex h-2 w-40 overflow-hidden rounded bg-surface3">
                        <div className="h-full bg-green" style={{ width: `${(f.ingresos / maxAbs) * 50}%` }} />
                        <div className="h-full bg-red" style={{ width: `${(f.egresos / maxAbs) * 50}%` }} />
                      </div>
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
