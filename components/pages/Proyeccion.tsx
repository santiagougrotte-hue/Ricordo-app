"use client";

import React, { useMemo } from "react";
import { useStore } from "@/lib/store";
import { fARS, proyeccionCaja30Dias } from "@/lib/calc";
import { MESES } from "@/lib/period";
import { Card, EmptyState, PageHeader, TableWrap, Th, Td, TrHover, StatGrid, KpiCard, InfoRow } from "@/components/ui";

export function Proyeccion() {
  const { data } = useStore();
  const p30 = useMemo(() => proyeccionCaja30Dias(data), [data]);

  const ultimos3 = useMemo(() => {
    const now = new Date();
    const meses: { mes: number; anio: number }[] = [];
    for (let i = 2; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      meses.push({ mes: d.getMonth() + 1, anio: d.getFullYear() });
    }
    return meses.map(({ mes, anio }) => {
      const ventas = data.pedidos
        .filter((p) => {
          const d = new Date(p.fecha);
          return d.getMonth() + 1 === mes && d.getFullYear() === anio && p.estado !== "Cancelado";
        })
        .reduce((a, p) => a + p.precio_neto, 0);
      const egresos = data.caja_movimientos
        .filter((m) => {
          const d = new Date(m.fecha);
          return d.getMonth() + 1 === mes && d.getFullYear() === anio && m.tipo === "egreso";
        })
        .reduce((a, m) => a + m.monto, 0);
      return { mes, anio, ventas, egresos };
    });
  }, [data]);

  const promVentas = ultimos3.reduce((a, m) => a + m.ventas, 0) / 3;
  const promEgresos = ultimos3.reduce((a, m) => a + m.egresos, 0) / 3;
  const promNeto = promVentas - promEgresos;

  const proyeccion = useMemo(() => {
    const now = new Date();
    const meses = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      meses.push({ mes: d.getMonth() + 1, anio: d.getFullYear() });
    }
    return meses;
  }, []);

  return (
    <div>
      <PageHeader title="Proyección" sub="Próximos 30 días con datos reales, y tendencia a 3 meses por promedio" />

      <Card title="Próximos 30 días" className="mb-4" color="green">
        <StatGrid>
          <KpiCard label="Caja actual" value={fARS(p30.cajaActual)} />
          <KpiCard label="+ Por cobrar" value={fARS(p30.porCobrar)} color="blue" />
          <KpiCard label="+ Pedidos a entregar" value={fARS(p30.pedidosPendientesDeEntregar)} color="blue" />
          <KpiCard label="− Costos fijos previstos" value={fARS(p30.costosRecurrentesPrevistos)} color="red" />
          <KpiCard
            label="Caja proyectada (30 días)"
            value={fARS(p30.proyeccion30Dias)}
            color={p30.proyeccion30Dias >= 0 ? "green" : "red"}
          />
        </StatGrid>
        <div className="mt-2 border-t border-border pt-3">
          <InfoRow
            label="No incluye"
            value="Compras previstas — no hay ninguna compra planificada cargada en el sistema para proyectar"
          />
        </div>
      </Card>

      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text3">Tendencia a 3 meses (promedio histórico)</div>
      <StatGrid>
        <KpiCard label="Ventas promedio (3m)" value={fARS(promVentas)} color="gold" />
        <KpiCard label="Egresos promedio (3m)" value={fARS(promEgresos)} color="red" />
        <KpiCard label="Resultado neto proyectado" value={fARS(promNeto)} color={promNeto >= 0 ? "green" : "red"} />
      </StatGrid>

      <Card title="Base histórica (últimos 3 meses)" className="mb-4">
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <Th>Mes</Th>
                <Th>Ventas</Th>
                <Th>Egresos</Th>
                <Th>Neto</Th>
              </tr>
            </thead>
            <tbody>
              {ultimos3.map((m) => (
                <TrHover key={`${m.anio}-${m.mes}`}>
                  <Td main>
                    {MESES[m.mes - 1]} {m.anio}
                  </Td>
                  <Td className="text-green">{fARS(m.ventas)}</Td>
                  <Td className="text-red">{fARS(m.egresos)}</Td>
                  <Td>{fARS(m.ventas - m.egresos)}</Td>
                </TrHover>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <Card title="Proyección próximos 3 meses">
        {proyeccion.every(() => promVentas === 0) ? (
          <EmptyState text="Sin datos históricos suficientes para proyectar." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Mes</Th>
                  <Th>Ventas estimadas</Th>
                  <Th>Egresos estimados</Th>
                  <Th>Neto estimado</Th>
                </tr>
              </thead>
              <tbody>
                {proyeccion.map((m) => (
                  <TrHover key={`${m.anio}-${m.mes}`}>
                    <Td main>
                      {MESES[m.mes - 1]} {m.anio}
                    </Td>
                    <Td className="text-green">{fARS(promVentas)}</Td>
                    <Td className="text-red">{fARS(promEgresos)}</Td>
                    <Td className={promNeto >= 0 ? "text-green" : "text-red"}>{fARS(promNeto)}</Td>
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
