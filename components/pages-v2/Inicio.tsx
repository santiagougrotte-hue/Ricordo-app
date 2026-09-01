"use client";

import React, { useMemo } from "react";
import { useStoreV2 } from "@/lib/store-v2";
import { usePeriod, MESES } from "@/lib/period";
import {
  PageHeader,
  Card,
  StatGrid,
  KpiCard,
  TableWrap,
  Th,
  Td,
  TrHover,
  EmptyState,
  Badge,
  Alert,
} from "@/components/ui";
import { ventasNetas, cmvPeriodo, saldoCaja, calcularStock, fARS, fNum, inPeriod } from "@/lib/calc-v2";
import type { EstadoPedido } from "@/lib/types-v2";

const ESTADO_COLOR: Record<EstadoPedido, "blue" | "orange" | "green" | "red"> = {
  Confirmado: "blue",
  Produccion: "orange",
  Entregado: "green",
  Cancelado: "red",
};

export function Inicio() {
  const { data } = useStoreV2();
  const { mes, anio } = usePeriod();

  const pedidosDelMes = useMemo(() => data.pedidos.filter((p) => inPeriod(p.fecha, mes, anio)), [data.pedidos, mes, anio]);
  const ventas = useMemo(() => ventasNetas(pedidosDelMes.filter((p) => p.estado === "Entregado")), [pedidosDelMes]);
  const cmv = useMemo(() => cmvPeriodo(data, pedidosDelMes), [data, pedidosDelMes]);
  const margenBruto = ventas > 0 ? ((ventas - cmv) / ventas) * 100 : 0;
  const caja = useMemo(() => saldoCaja(data), [data]);

  const pedidosPendientes = useMemo(
    () => data.pedidos.filter((p) => p.estado === "Confirmado" || p.estado === "Produccion").sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [data.pedidos]
  );

  const comprasPendientes = useMemo(() => data.compras.filter((c) => c.estado_pago === "pendiente"), [data.compras]);
  const totalComprasPendientes = comprasPendientes.reduce((acc, c) => acc + c.total, 0);

  const alertasStock = useMemo(
    () =>
      data.insumos
        .filter((i) => i.controla_stock && i.activo)
        .map((i) => ({ insumo: i, stock: calcularStock(data, "insumo", i.id) }))
        .filter(({ insumo, stock }) => insumo.stock_minimo != null && stock < insumo.stock_minimo),
    [data]
  );

  const clienteNombre = (id: string) => data.clientes.find((c) => c.id === id)?.nombre ?? "—";

  return (
    <div>
      <PageHeader title="Inicio" sub={`Resumen de ${MESES[mes - 1]} ${anio}`} />

      <StatGrid>
        <KpiCard label="Ventas del mes" value={fARS(ventas)} color="gold" />
        <KpiCard label="CMV del mes" value={fARS(cmv)} color="orange" />
        <KpiCard label="Margen bruto" value={fNum(margenBruto, 1) + "%"} color={margenBruto >= 0 ? "green" : "red"} />
        <KpiCard label="Saldo de caja" value={fARS(caja)} color={caja >= 0 ? "green" : "red"} />
        <KpiCard label="Pedidos pendientes" value={fNum(pedidosPendientes.length, 0)} color="blue" />
        <KpiCard label="Compras sin pagar" value={fARS(totalComprasPendientes)} sub={`${comprasPendientes.length} compra(s)`} color="orange" />
      </StatGrid>

      {alertasStock.length > 0 && (
        <Alert kind="warning">
          {alertasStock.length} insumo(s) por debajo del stock mínimo: {alertasStock.map(({ insumo }) => insumo.nombre).join(", ")}.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Próximos pedidos">
          {pedidosPendientes.length === 0 ? (
            <EmptyState text="No hay pedidos confirmados o en producción." />
          ) : (
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Fecha</Th>
                    <Th>Cliente</Th>
                    <Th>Total</Th>
                    <Th>Estado</Th>
                  </tr>
                </thead>
                <tbody>
                  {pedidosPendientes.slice(0, 8).map((p) => (
                    <TrHover key={p.id}>
                      <Td>{p.fecha}</Td>
                      <Td main>{clienteNombre(p.cliente_id)}</Td>
                      <Td>{fARS(p.total)}</Td>
                      <Td>
                        <Badge color={ESTADO_COLOR[p.estado]}>{p.estado}</Badge>
                      </Td>
                    </TrHover>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>

        <Card title="Stock bajo mínimo">
          {alertasStock.length === 0 ? (
            <EmptyState text="Todos los insumos están por encima de su stock mínimo." />
          ) : (
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Insumo</Th>
                    <Th>Stock actual</Th>
                    <Th>Mínimo</Th>
                  </tr>
                </thead>
                <tbody>
                  {alertasStock.map(({ insumo, stock }) => (
                    <TrHover key={insumo.id}>
                      <Td main>{insumo.nombre}</Td>
                      <Td className="text-red">{fNum(stock, 2)}</Td>
                      <Td>{fNum(insumo.stock_minimo ?? 0, 2)}</Td>
                    </TrHover>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>
    </div>
  );
}
