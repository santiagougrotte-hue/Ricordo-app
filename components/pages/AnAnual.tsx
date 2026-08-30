"use client";

import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { usePeriod } from "@/lib/period";
import { cmvPeriodo, fARS, fPct, fNum, gustosActivos, inPeriod } from "@/lib/calc";
import { Card, PageHeader, TableWrap, Th, Td, TrHover, Select, InfoRow } from "@/components/ui";
import { MESES } from "@/lib/period";

export function AnAnual() {
  const { data } = useStore();
  const { anio } = usePeriod();
  const gustos = useMemo(() => [...gustosActivos(data)].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")), [data]);
  const [idBase, setIdBase] = useState("");

  const idsProductosDelGusto = useMemo(() => {
    if (!idBase) return null; // null = todos los gustos
    return new Set(gustos.find((g) => g.id_base === idBase)?.variantes.map((v) => v.id) ?? []);
  }, [gustos, idBase]);

  const filas = useMemo(() => {
    return MESES.map((nombre, idx) => {
      const mes = idx + 1;
      const pedidos = data.pedidos.filter(
        (p) =>
          inPeriod(p.fecha, mes, anio) &&
          p.estado !== "Cancelado" &&
          (idsProductosDelGusto === null || idsProductosDelGusto.has(p.id_producto))
      );
      const ventas = pedidos.reduce((a, p) => a + p.precio_neto, 0);
      const unidades = pedidos.reduce((a, p) => a + p.cantidad, 0);
      const costos = cmvPeriodo(data, pedidos);
      const ganancia = ventas - costos;
      return { mes, nombre, ventas, unidades, costos, ganancia };
    });
  }, [data, anio, idsProductosDelGusto]);

  const maxVentas = Math.max(1, ...filas.map((f) => f.ventas));
  const totalVentas = filas.reduce((a, f) => a + f.ventas, 0);
  const totalCostos = filas.reduce((a, f) => a + f.costos, 0);
  const totalGanancia = filas.reduce((a, f) => a + f.ganancia, 0);
  const totalUnidades = filas.reduce((a, f) => a + f.unidades, 0);

  const mesesConVentas = filas.filter((f) => f.ventas > 0);
  const promedioMensual = mesesConVentas.length > 0 ? totalVentas / mesesConVentas.length : 0;
  const mejorMes = mesesConVentas.length > 0 ? mesesConVentas.reduce((a, b) => (b.ventas > a.ventas ? b : a)) : null;
  const peorMes = mesesConVentas.length > 0 ? mesesConVentas.reduce((a, b) => (b.ventas < a.ventas ? b : a)) : null;

  const ventaAnioAnterior = useMemo(() => {
    return data.pedidos
      .filter(
        (p) =>
          p.estado !== "Cancelado" &&
          new Date(p.fecha).getFullYear() === anio - 1 &&
          (idsProductosDelGusto === null || idsProductosDelGusto.has(p.id_producto))
      )
      .reduce((a, p) => a + p.precio_neto, 0);
  }, [data, anio, idsProductosDelGusto]);
  const crecimientoInteranual = ventaAnioAnterior > 0 ? ((totalVentas - ventaAnioAnterior) / ventaAnioAnterior) * 100 : null;

  const nombreGusto = idBase ? gustos.find((g) => g.id_base === idBase)?.nombre ?? "" : "Todos los gustos";

  return (
    <div>
      <PageHeader title="Análisis Anual" sub={`${nombreGusto} — vista mes a mes de ${anio}`} />

      <div className="mb-4 max-w-xs">
        <Select value={idBase} onChange={(e) => setIdBase(e.target.value)}>
          <option value="">Todos los gustos</option>
          {gustos.map((g) => (
            <option key={g.id_base} value={g.id_base}>
              {g.nombre}
            </option>
          ))}
        </Select>
      </div>

      <Card title={`${nombreGusto} — ${anio}`} className="mb-4">
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
          <InfoRow label="Total anual" value={fARS(totalVentas)} color="gold" />
          <InfoRow label="Promedio mensual" value={fARS(promedioMensual)} />
          <InfoRow label="Mejor mes" value={mejorMes ? `${mejorMes.nombre} (${fARS(mejorMes.ventas)})` : "—"} color="green" />
          <InfoRow label="Peor mes" value={peorMes ? `${peorMes.nombre} (${fARS(peorMes.ventas)})` : "—"} color="red" />
        </div>
        {crecimientoInteranual !== null && (
          <div className="mt-3 border-t border-border pt-3">
            <InfoRow
              label={`Crecimiento interanual (vs ${anio - 1})`}
              value={`${crecimientoInteranual >= 0 ? "+" : ""}${fPct(crecimientoInteranual)}`}
              color={crecimientoInteranual >= 0 ? "green" : "red"}
            />
          </div>
        )}
      </Card>

      <Card title="Tendencia de ventas" className="mb-4">
        <div className="flex items-end gap-2" style={{ height: 140 }}>
          {filas.map((f) => (
            <div key={f.mes} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-accent transition-all duration-500"
                style={{ height: `${(f.ventas / maxVentas) * 110}px` }}
                title={fARS(f.ventas)}
              />
              <span className="text-[9px] text-text3">{f.nombre.slice(0, 3)}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <Th>Mes</Th>
                <Th>Unidades</Th>
                <Th>Ventas</Th>
                <Th>Costos (CMV)</Th>
                <Th>Ganancia</Th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <TrHover key={f.mes}>
                  <Td main>{f.nombre}</Td>
                  <Td>{fNum(f.unidades, 0)}</Td>
                  <Td className="text-green">{fARS(f.ventas)}</Td>
                  <Td className="text-red">{fARS(f.costos)}</Td>
                  <Td className={f.ganancia >= 0 ? "text-green" : "text-red"}>{fARS(f.ganancia)}</Td>
                </TrHover>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-medium text-text">
                <Td main>Total</Td>
                <Td main>{fNum(totalUnidades, 0)}</Td>
                <Td main>{fARS(totalVentas)}</Td>
                <Td>{fARS(totalCostos)}</Td>
                <Td className={totalGanancia >= 0 ? "text-green" : "text-red"}>{fARS(totalGanancia)}</Td>
              </tr>
            </tfoot>
          </table>
        </TableWrap>
      </Card>
    </div>
  );
}
