"use client";

import React, { useMemo, useState } from "react";
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
  FilterTabs,
  Select,
} from "@/components/ui";
import { GraficoLinea, IndicadorCrecimiento } from "@/components/charts";
import { cmvPeriodo, saldoCaja, calcularStock, fARS, fNum, inPeriod, primerDiaMes, ultimoDiaMes, mesAnterior } from "@/lib/calc-v2";
import {
  pctCambio,
  calcularMetricasVentas,
  calcularVentasPorCanal,
  calcularVentasPorGusto,
  calcularEvolucionMensual,
  calcularVentasPendientes,
} from "@/lib/analitica-ventas";
import type { EstadoPedido, Canal } from "@/lib/types-v2";

const ESTADO_COLOR: Record<EstadoPedido, "blue" | "orange" | "green" | "red"> = {
  Confirmado: "blue",
  Produccion: "orange",
  Entregado: "green",
  Cancelado: "red",
};

type MetricaEvolucion = "facturacion" | "cajas" | "pedidos";
const METRICA_LABEL: Record<MetricaEvolucion, string> = { facturacion: "Facturación", cajas: "Cajas", pedidos: "Pedidos" };

export function Inicio() {
  const { data } = useStoreV2();
  const { mes, anio } = usePeriod();
  const [canalFiltro, setCanalFiltro] = useState<Canal | "todos">("todos");
  const [metricaEvolucion, setMetricaEvolucion] = useState<MetricaEvolucion>("facturacion");

  const desde = primerDiaMes(mes, anio);
  const hasta = ultimoDiaMes(mes, anio);
  const anterior = mesAnterior(mes, anio);
  const desdeAnt = primerDiaMes(anterior.mes, anterior.anio);
  const hastaAnt = ultimoDiaMes(anterior.mes, anterior.anio);
  const canalParaMetricas = canalFiltro === "todos" ? undefined : canalFiltro;

  const metricas = useMemo(
    () => calcularMetricasVentas(data, desde, hasta, canalParaMetricas),
    [data, desde, hasta, canalParaMetricas]
  );
  const metricasAnt = useMemo(
    () => calcularMetricasVentas(data, desdeAnt, hastaAnt, canalParaMetricas),
    [data, desdeAnt, hastaAnt, canalParaMetricas]
  );
  const facturacionPendiente = useMemo(() => calcularVentasPendientes(data, desde, hasta), [data, desde, hasta]);
  const porCanal = useMemo(() => calcularVentasPorCanal(data, desde, hasta), [data, desde, hasta]);
  const topGustos = useMemo(() => calcularVentasPorGusto(data, desde, hasta, canalParaMetricas).slice(0, 5), [data, desde, hasta, canalParaMetricas]);
  const evolucion = useMemo(() => calcularEvolucionMensual(data, anio, canalParaMetricas), [data, anio, canalParaMetricas]);

  const pedidosDelMes = useMemo(() => data.pedidos.filter((p) => inPeriod(p.fecha, mes, anio)), [data.pedidos, mes, anio]);
  const cmv = useMemo(() => cmvPeriodo(data, pedidosDelMes), [data, pedidosDelMes]);
  const margenBruto = metricas.ventas_totales > 0 ? ((metricas.ventas_totales - cmv) / metricas.ventas_totales) * 100 : 0;
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
  const valorEvolucion = (e: (typeof evolucion)[number]) => (metricaEvolucion === "facturacion" ? e.facturacion : metricaEvolucion === "cajas" ? e.cajas : e.pedidos);
  const formatoEvolucion = (v: number) => (metricaEvolucion === "facturacion" ? fARS(v) : fNum(v, 0));

  return (
    <div>
      <PageHeader title="Inicio" sub={`Resumen de ${MESES[mes - 1]} ${anio}`} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">Canal</span>
        <FilterTabs
          value={canalFiltro}
          onChange={(v) => setCanalFiltro(v as Canal | "todos")}
          options={[
            { value: "todos", label: "Todos" },
            { value: "Minorista", label: "Minorista" },
            { value: "Mayorista", label: "Mayorista" },
          ]}
        />
      </div>

      <StatGrid>
        <KpiCard label="Facturación del mes" value={fARS(metricas.ventas_totales)} color="gold" />
        <KpiCard label="Pedidos entregados" value={fNum(metricas.cantidad_pedidos, 0)} color="blue" />
        <KpiCard label="Cajas vendidas" value={fNum(metricas.cajas_vendidas, 0)} color="blue" />
        <KpiCard label="Ticket promedio" value={fARS(metricas.ticket_promedio)} color="gold" />
        <KpiCard label="Margen bruto" value={fNum(margenBruto, 1) + "%"} color={margenBruto >= 0 ? "green" : "red"} />
        <KpiCard label="Saldo de caja" value={fARS(caja)} color={caja >= 0 ? "green" : "red"} />
        <KpiCard
          label="Pedidos pendientes"
          value={fNum(pedidosPendientes.length, 0)}
          sub={`Facturación comprometida: ${fARS(facturacionPendiente)}`}
          color="orange"
        />
        <KpiCard label="Compras sin pagar" value={fARS(totalComprasPendientes)} sub={`${comprasPendientes.length} compra(s)`} color="orange" />
      </StatGrid>

      {alertasStock.length > 0 && (
        <Alert kind="warning">
          {alertasStock.length} insumo(s) por debajo del stock mínimo: {alertasStock.map(({ insumo }) => insumo.nombre).join(", ")}.
        </Alert>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Crecimiento vs. mes anterior">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <IndicadorCrecimiento label="Facturación" valor={pctCambio(metricas.ventas_totales, metricasAnt.ventas_totales)} />
            <IndicadorCrecimiento label="Pedidos" valor={pctCambio(metricas.cantidad_pedidos, metricasAnt.cantidad_pedidos)} />
            <IndicadorCrecimiento label="Cajas" valor={pctCambio(metricas.cajas_vendidas, metricasAnt.cajas_vendidas)} />
            <IndicadorCrecimiento label="Ticket promedio" valor={pctCambio(metricas.ticket_promedio, metricasAnt.ticket_promedio)} />
          </div>
        </Card>

        <Card title="Mayorista vs. Minorista">
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Canal</Th>
                  <Th>Facturación</Th>
                  <Th>Cajas</Th>
                  <Th>Ticket prom.</Th>
                  <Th>Participación</Th>
                </tr>
              </thead>
              <tbody>
                {porCanal.map((c) => (
                  <TrHover key={c.canal}>
                    <Td main>{c.canal}</Td>
                    <Td>{fARS(c.ventas_totales)}</Td>
                    <Td>{fNum(c.cajas_vendidas, 0)}</Td>
                    <Td>{fARS(c.ticket_promedio)}</Td>
                    <Td>{c.participacion_pct === null ? "—" : fNum(c.participacion_pct, 1) + "%"}</Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      </div>

      <Card
        title="Evolución de ventas"
        className="mb-4"
        right={
          <Select value={metricaEvolucion} onChange={(e) => setMetricaEvolucion(e.target.value as MetricaEvolucion)} style={{ width: 130 }}>
            {(Object.keys(METRICA_LABEL) as MetricaEvolucion[]).map((m) => (
              <option key={m} value={m}>
                {METRICA_LABEL[m]}
              </option>
            ))}
          </Select>
        }
      >
        <p className="mb-2 text-[12.5px] text-text3">
          {METRICA_LABEL[metricaEvolucion]} mes a mes durante {anio}. Para comparar contra {anio - 1} o un rango
          personalizado, ver Ventas → Analítica.
        </p>
        <GraficoLinea puntos={evolucion.map((e) => ({ label: e.label, valor: valorEvolucion(e) }))} />
        <div className="mt-1 text-right text-[11px] text-text3">Este mes: {formatoEvolucion(valorEvolucion(evolucion[mes - 1]))}</div>
      </Card>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Cajas vendidas por gusto">
          {topGustos.length === 0 ? (
            <EmptyState text="Sin ventas registradas en el período." />
          ) : (
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Producto</Th>
                    <Th>Cajas</Th>
                    <Th>Facturación</Th>
                    <Th>% de cajas</Th>
                  </tr>
                </thead>
                <tbody>
                  {topGustos.map((g) => (
                    <TrHover key={g.producto_id}>
                      <Td main>{g.producto_nombre}</Td>
                      <Td>{fNum(g.cajas, 0)}</Td>
                      <Td>{fARS(g.facturacion)}</Td>
                      <Td>{g.pct_cajas === null ? "—" : fNum(g.pct_cajas, 1) + "%"}</Td>
                    </TrHover>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>

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
      </div>

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
  );
}
