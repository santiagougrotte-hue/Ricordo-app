"use client";

import React, { useMemo } from "react";
import { useStore } from "@/lib/store";
import { usePeriod } from "@/lib/period";
import { PageHeader, StatGrid, KpiCard, Card, BarRow, TableWrap, Th, Td, TrHover, EmptyState, Badge } from "@/components/ui";
import { calcCosto, calcStockIngrediente, fARS, fNum, inPeriod } from "@/lib/calc";

export function Dashboard() {
  const { data } = useStore();
  const { mes, anio } = usePeriod();

  const pedidosPeriodo = useMemo(
    () => data.pedidos.filter((p) => inPeriod(p.fecha, mes, anio)),
    [data.pedidos, mes, anio]
  );
  const activos = useMemo(() => pedidosPeriodo.filter((p) => p.estado !== "Cancelado"), [pedidosPeriodo]);

  const ventasMes = activos.reduce((acc, p) => acc + p.precio_neto, 0);
  const pedidosUnicos = new Set(activos.map((p) => p.id_pedido)).size;
  const ticketPromedio = pedidosUnicos > 0 ? ventasMes / pedidosUnicos : 0;
  const cajasVendidas = activos.reduce((acc, p) => acc + p.cantidad, 0);
  const entregados = activos.filter((p) => p.estado === "Entregado");
  const cmv = entregados.reduce((acc, p) => acc + calcCosto(data, p.id_producto) * p.cantidad, 0);
  const ventasEntregadas = entregados.reduce((acc, p) => acc + p.precio_neto, 0);
  const gananciaEstimada = ventasEntregadas - cmv;
  const pedidosPendientes = data.pedidos.filter(
    (p) => p.estado === "Confirmado" || p.estado === "Produccion"
  ).length;

  const porCanal = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of activos) map.set(p.canal, (map.get(p.canal) ?? 0) + p.precio_neto);
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [activos]);
  const maxCanal = Math.max(1, ...porCanal.map(([, v]) => v));

  const porGusto = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of activos) {
      const gusto = (data.gustos[p.id_producto]?.[0]) || p.gusto || p.nombre_producto;
      map.set(gusto, (map.get(gusto) ?? 0) + p.cantidad);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [activos, data.gustos]);
  const maxGusto = Math.max(1, ...porGusto.map(([, v]) => v));

  const topProductos = useMemo(() => {
    const map = new Map<string, { nombre: string; cant: number; monto: number }>();
    for (const p of activos) {
      const cur = map.get(p.id_producto) ?? { nombre: p.nombre_producto, cant: 0, monto: 0 };
      cur.cant += p.cantidad;
      cur.monto += p.precio_neto;
      map.set(p.id_producto, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.monto - a.monto).slice(0, 6);
  }, [activos]);
  const maxTopProd = Math.max(1, ...topProductos.map((p) => p.monto));

  const semanaAtras = new Date();
  semanaAtras.setDate(semanaAtras.getDate() - 7);
  const produccionSemana = data.produccion
    .filter((p) => new Date(p.fecha) >= semanaAtras)
    .reduce((acc, p) => acc + p.cantidad, 0);

  const stockCritico = useMemo(() => {
    return data.ingredientes
      .filter((i) => i.seguimiento_stock)
      .map((i) => ({ ...i, stock: calcStockIngrediente(data, i.id) }))
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 6);
  }, [data]);

  return (
    <div>
      <PageHeader title="Dashboard" sub="Resumen del negocio" />

      <StatGrid>
        <KpiCard label="Ventas del mes" value={fARS(ventasMes)} color="gold" />
        <KpiCard label="Ticket promedio" value={fARS(ticketPromedio)} color="blue" />
        <KpiCard label="Cajas vendidas" value={fNum(cajasVendidas, 0)} sub="unidades" color="purple" />
        <KpiCard label="Ganancia estimada" value={fARS(gananciaEstimada)} color="green" sub="pedidos entregados" />
        <KpiCard label="Pedidos pendientes" value={pedidosPendientes} color="orange" />
      </StatGrid>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Ventas por Canal">
          {porCanal.length === 0 ? (
            <EmptyState text="Sin ventas en el período." />
          ) : (
            <div className="flex flex-col gap-2">
              {porCanal.map(([canal, monto]) => (
                <BarRow key={canal} label={canal} value={fARS(monto)} pct={(monto / maxCanal) * 100} color="gold" />
              ))}
            </div>
          )}
        </Card>
        <Card title="Ventas por Gusto (unidades)">
          {porGusto.length === 0 ? (
            <EmptyState text="Sin ventas en el período." />
          ) : (
            <div className="flex flex-col gap-2">
              {porGusto.map(([gusto, cant]) => (
                <BarRow key={gusto} label={gusto} value={fNum(cant, 0)} pct={(cant / maxGusto) * 100} color="blue" />
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Top Productos">
          {topProductos.length === 0 ? (
            <EmptyState text="Sin datos." />
          ) : (
            <div className="flex flex-col gap-2">
              {topProductos.map((p) => (
                <BarRow key={p.nombre} label={p.nombre} value={fARS(p.monto)} pct={(p.monto / maxTopProd) * 100} color="green" />
              ))}
            </div>
          )}
        </Card>
        <Card title="Producción de la Semana" right={<span className="text-xs text-text3">últimos 7 días</span>}>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-semibold text-accent">{fNum(produccionSemana, 0)}</div>
            <div className="text-xs text-text3">unidades producidas</div>
          </div>
        </Card>
      </div>

      <Card title="Stock Crítico" className="mb-4">
        {stockCritico.length === 0 ? (
          <EmptyState text="No hay ingredientes con seguimiento de stock activo." />
        ) : (
          <TableWrap>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr>
                  <Th>Ingrediente</Th>
                  <Th>Unidad</Th>
                  <Th>Stock estimado</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {stockCritico.map((i) => (
                  <TrHover key={i.id}>
                    <Td main>{i.nombre}</Td>
                    <Td>{i.unidad}</Td>
                    <Td>{fNum(i.stock)}</Td>
                    <Td>
                      {i.stock <= 0 ? (
                        <Badge color="red">Crítico</Badge>
                      ) : i.stock < 10 ? (
                        <Badge color="orange">Bajo</Badge>
                      ) : (
                        <Badge color="green">OK</Badge>
                      )}
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
