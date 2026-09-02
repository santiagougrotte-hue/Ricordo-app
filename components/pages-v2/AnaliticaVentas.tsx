"use client";

import React, { useMemo, useState } from "react";
import { useStoreV2 } from "@/lib/store-v2";
import { fARS, fNum, primerDiaMes, ultimoDiaMes, mesAnterior } from "@/lib/calc-v2";
import {
  MESES_ANALITICA,
  pctCambio,
  calcularMetricasVentas,
  calcularVentasPorCanal,
  calcularVentasPorGusto,
  calcularDetalleGusto,
  calcularEvolucionMensual,
  calcularEvolucionGustoMensual,
  calcularEvolucionCanalMensual,
  calcularClientesPeriodo,
  calcularDescuentosPeriodo,
  calcularVentasPendientes,
} from "@/lib/analitica-ventas";
import type { VentasPorCanal, VentasPorGusto } from "@/lib/analitica-ventas";
import { Card, Button, FilterTabs, StatGrid, KpiCard, TableWrap, Th, Td, TrHover, EmptyState, Select } from "@/components/ui";

function mesSiguiente(mes: number, anio: number): { mes: number; anio: number } {
  return mes === 12 ? { mes: 1, anio: anio + 1 } : { mes: mes + 1, anio };
}

function fPctFirmado(n: number | null): string {
  if (n === null) return "—";
  const signo = n > 0 ? "+" : "";
  return `${signo}${fNum(n, 1)}%`;
}

function IndicadorCrecimiento({ label, valor }: { label: string; valor: number | null }) {
  const color = valor === null ? "text-text3" : valor > 0 ? "text-green" : valor < 0 ? "text-red" : "text-text2";
  const flecha = valor === null ? "" : valor > 0 ? "↑ " : valor < 0 ? "↓ " : "";
  return (
    <div className="rounded-[var(--radius-card)] border border-border p-3">
      <div className="text-[11px] text-text3">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>
        {flecha}
        {fPctFirmado(valor)}
      </div>
    </div>
  );
}

/** Barras verticales genéricas — reutilizado para Distribución por canal (2 barras) y para
 * cualquier comparación simple de N categorías con un solo valor cada una. */
function GraficoBarras({ datos, color = "#4a90d9" }: { datos: { label: string; valor: number }[]; color?: string }) {
  if (datos.length === 0) return null;
  const max = Math.max(1, ...datos.map((d) => d.valor));
  const alto = 110;
  const anchoBarra = 40;
  const gap = 24;
  const anchoGrupo = anchoBarra + gap;
  const anchoTotal = datos.length * anchoGrupo;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${anchoTotal} ${alto + 26}`} className="text-text2" style={{ height: 150, minWidth: Math.min(anchoTotal, 420) }}>
        {datos.map((d, i) => {
          const x0 = i * anchoGrupo + gap / 2;
          const h = (d.valor / max) * alto;
          return (
            <g key={i}>
              <rect x={x0} y={alto - h} width={anchoBarra} height={h} fill={color} rx={3} />
              <text x={x0 + anchoBarra / 2} y={alto + 14} fontSize="10" textAnchor="middle" fill="currentColor">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Línea de evolución mensual (12 puntos) — usado por evolución de ventas, de un gusto o de un canal. */
function GraficoLinea({ puntos, color = "#4a90d9" }: { puntos: { label: string; valor: number }[]; color?: string }) {
  if (puntos.length === 0) return null;
  const max = Math.max(1, ...puntos.map((p) => p.valor));
  const alto = 110;
  const ancho = 700;
  const paso = ancho / Math.max(1, puntos.length - 1);
  const coords = puntos.map((p, i) => ({ x: i * paso, y: alto - (p.valor / max) * alto }));
  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`).join(" ");
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${ancho} ${alto + 26}`} className="text-text2" style={{ height: 150, minWidth: 500 }}>
        <path d={path} fill="none" stroke={color} strokeWidth={2} />
        {coords.map((c, i) => (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r={3} fill={color} />
            <text x={c.x} y={alto + 14} fontSize="9" textAnchor="middle" fill="currentColor">
              {puntos[i].label.slice(0, 3)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

type MetricaGrafico = "facturacion" | "cajas" | "pedidos";
const METRICA_LABEL: Record<MetricaGrafico, string> = { facturacion: "Facturación", cajas: "Cajas", pedidos: "Pedidos" };

function TablaDistribucionCanal({ canales }: { canales: VentasPorCanal[] }) {
  const [metrica, setMetrica] = useState<MetricaGrafico>("facturacion");
  const valorMetrica = (c: VentasPorCanal) => (metrica === "facturacion" ? c.ventas_totales : metrica === "cajas" ? c.cajas_vendidas : c.cantidad_pedidos);
  return (
    <Card title="Distribución por canal">
      <TableWrap>
        <table className="w-full">
          <thead>
            <tr>
              <Th>Canal</Th>
              <Th>Ventas</Th>
              <Th>Pedidos</Th>
              <Th>Cajas</Th>
              <Th>Ticket promedio</Th>
              <Th>% facturación</Th>
            </tr>
          </thead>
          <tbody>
            {canales.map((c) => (
              <TrHover key={c.canal}>
                <Td main>{c.canal}</Td>
                <Td>{fARS(c.ventas_totales)}</Td>
                <Td>{fNum(c.cantidad_pedidos, 0)}</Td>
                <Td>{fNum(c.cajas_vendidas, 0)}</Td>
                <Td>{fARS(c.ticket_promedio)}</Td>
                <Td>{c.participacion_pct === null ? "—" : `${fNum(c.participacion_pct, 1)}%`}</Td>
              </TrHover>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <div className="mt-4">
        <FilterTabs value={metrica} onChange={(v) => setMetrica(v as MetricaGrafico)} options={(["facturacion", "cajas", "pedidos"] as MetricaGrafico[]).map((m) => ({ value: m, label: METRICA_LABEL[m] }))} />
        <div className="mt-2">
          <GraficoBarras datos={canales.map((c) => ({ label: c.canal, valor: valorMetrica(c) }))} />
        </div>
      </div>
    </Card>
  );
}

function TarjetaCanal({ canal, m }: { canal: "Minorista" | "Mayorista"; m: VentasPorCanal }) {
  return (
    <Card title={canal}>
      <StatGrid>
        <KpiCard label="Ventas" value={fARS(m.ventas_totales)} color="blue" />
        <KpiCard label="Pedidos" value={fNum(m.cantidad_pedidos, 0)} color="gold" />
        <KpiCard label="Cajas" value={fNum(m.cajas_vendidas, 0)} color="green" />
        <KpiCard label="Ticket promedio" value={fARS(m.ticket_promedio)} color="purple" />
      </StatGrid>
      <p className="mt-2 text-[12.5px] text-text3">Participación: {m.participacion_pct === null ? "—" : `${fNum(m.participacion_pct, 1)}%`} sobre ventas totales</p>
    </Card>
  );
}

function TablaVentasPorGusto({ gustos, seleccionado, onSeleccionar }: { gustos: VentasPorGusto[]; seleccionado: string | null; onSeleccionar: (id: string) => void }) {
  return (
    <Card title="Ventas por gusto">
      {gustos.length === 0 ? (
        <EmptyState text="Sin ventas en el período." />
      ) : (
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <Th>Producto</Th>
                <Th>Cajas vendidas</Th>
                <Th>Facturación</Th>
                <Th>% cajas</Th>
                <Th>% facturación</Th>
              </tr>
            </thead>
            <tbody>
              {gustos.map((g) => (
                <TrHover key={g.producto_id} className={seleccionado === g.producto_id ? "bg-accent/10" : "cursor-pointer"} onClick={() => onSeleccionar(g.producto_id)}>
                  <Td main>{g.producto_nombre}</Td>
                  <Td>{fNum(g.cajas, 0)}</Td>
                  <Td>{fARS(g.facturacion)}</Td>
                  <Td>{g.pct_cajas === null ? "—" : `${fNum(g.pct_cajas, 1)}%`}</Td>
                  <Td>{g.pct_facturacion === null ? "—" : `${fNum(g.pct_facturacion, 1)}%`}</Td>
                </TrHover>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <p className="mt-2 text-[11.5px] text-text3">Hacé clic en un producto para ver el detalle por canal y presentación.</p>
    </Card>
  );
}

function DetalleGustoCard({ data, desde, hasta, productoId }: { data: ReturnType<typeof useStoreV2>["data"]; desde: string; hasta: string; productoId: string }) {
  const detalle = useMemo(() => calcularDetalleGusto(data, desde, hasta, productoId), [data, desde, hasta, productoId]);
  if (!detalle) return null;
  return (
    <Card title={detalle.producto_nombre} className="border-accent/40">
      <StatGrid>
        <KpiCard label="Total cajas" value={fNum(detalle.total_cajas, 0)} color="green" />
        <KpiCard label="Facturación" value={fARS(detalle.facturacion)} color="blue" />
        <KpiCard label="Participación" value={detalle.participacion_pct === null ? "—" : `${fNum(detalle.participacion_pct, 1)}%`} color="gold" />
      </StatGrid>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-[12.5px] text-text3">Minorista: {fNum(detalle.cajas_minorista, 0)} cajas — Mayorista: {fNum(detalle.cajas_mayorista, 0)} cajas</p>
        </div>
        <div>
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Presentación</Th>
                  <Th>Cajas</Th>
                </tr>
              </thead>
              <tbody>
                {detalle.por_presentacion.map((p) => (
                  <TrHover key={p.variante_id}>
                    <Td main>{p.nombre}</Td>
                    <Td>{fNum(p.cajas, 0)}</Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </div>
      </div>
    </Card>
  );
}

function TablaClientes({ clientes }: { clientes: ReturnType<typeof calcularClientesPeriodo> }) {
  return (
    <Card title="Clientes">
      <StatGrid>
        <KpiCard label="Clientes del período" value={fNum(clientes.total, 0)} color="blue" />
        <KpiCard label="Minoristas" value={fNum(clientes.minoristas, 0)} color="green" />
        <KpiCard label="Mayoristas" value={fNum(clientes.mayoristas, 0)} color="gold" />
        <KpiCard label="Nuevos" value={fNum(clientes.nuevos, 0)} color="purple" />
        <KpiCard label="Recurrentes" value={fNum(clientes.recurrentes, 0)} color="blue" />
      </StatGrid>
      <p className="mt-3 mb-2 text-[13px] font-medium text-text">Principales clientes</p>
      {clientes.principales.length === 0 ? (
        <EmptyState text="Sin clientes en el período." />
      ) : (
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th>Canal</Th>
                <Th>Pedidos</Th>
                <Th>Cajas</Th>
                <Th>Total comprado</Th>
              </tr>
            </thead>
            <tbody>
              {clientes.principales.slice(0, 15).map((c) => (
                <TrHover key={c.cliente_id}>
                  <Td main>{c.nombre}</Td>
                  <Td>{c.canal}</Td>
                  <Td>{fNum(c.pedidos, 0)}</Td>
                  <Td>{fNum(c.cajas, 0)}</Td>
                  <Td>{fARS(c.total)}</Td>
                </TrHover>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Card>
  );
}

function TablaDescuentos({ desc }: { desc: ReturnType<typeof calcularDescuentosPeriodo> }) {
  return (
    <Card title="Descuentos">
      <StatGrid>
        <KpiCard label="Descuentos otorgados" value={fARS(desc.descuentos)} color="orange" />
        <KpiCard label="% sobre venta bruta" value={desc.pct_sobre_bruta === null ? "—" : `${fNum(desc.pct_sobre_bruta, 1)}%`} color="orange" />
        <KpiCard label="Ventas antes de descuento" value={fARS(desc.ventas_brutas)} color="blue" />
        <KpiCard label="Ventas netas" value={fARS(desc.ventas_netas)} color="green" />
      </StatGrid>
    </Card>
  );
}

function TableroMensual({ mes, anio, comparar }: { mes: number; anio: number; comparar: boolean }) {
  const { data } = useStoreV2();
  const desde = primerDiaMes(mes, anio);
  const hasta = ultimoDiaMes(mes, anio);
  const [productoSeleccionado, setProductoSeleccionado] = useState<string | null>(null);

  const metricas = useMemo(() => calcularMetricasVentas(data, desde, hasta), [data, desde, hasta]);
  const canales = useMemo(() => calcularVentasPorCanal(data, desde, hasta), [data, desde, hasta]);
  const gustos = useMemo(() => calcularVentasPorGusto(data, desde, hasta), [data, desde, hasta]);
  const clientes = useMemo(() => calcularClientesPeriodo(data, desde, hasta), [data, desde, hasta]);
  const descuentos = useMemo(() => calcularDescuentosPeriodo(data, desde, hasta), [data, desde, hasta]);
  const ventasPendientes = useMemo(() => calcularVentasPendientes(data, desde, hasta), [data, desde, hasta]);

  const ant = mesAnterior(mes, anio);
  const desdeAnt = primerDiaMes(ant.mes, ant.anio);
  const hastaAnt = ultimoDiaMes(ant.mes, ant.anio);
  const metricasAnt = useMemo(() => (comparar ? calcularMetricasVentas(data, desdeAnt, hastaAnt) : null), [comparar, data, desdeAnt, hastaAnt]);
  const canalesAnt = useMemo(() => (comparar ? calcularVentasPorCanal(data, desdeAnt, hastaAnt) : null), [comparar, data, desdeAnt, hastaAnt]);

  const minorista = canales.find((c) => c.canal === "Minorista")!;
  const mayorista = canales.find((c) => c.canal === "Mayorista")!;

  return (
    <div>
      <StatGrid>
        <KpiCard label="Ventas totales" value={fARS(metricas.ventas_totales)} color="blue" />
        <KpiCard label="Pedidos" value={fNum(metricas.cantidad_pedidos, 0)} color="gold" />
        <KpiCard label="Cajas vendidas" value={fNum(metricas.cajas_vendidas, 0)} color="green" />
        <KpiCard label="Ticket promedio" value={fARS(metricas.ticket_promedio)} color="purple" />
      </StatGrid>
      {ventasPendientes > 0 && (
        <p className="mb-4 text-[12.5px] text-text3">
          Ventas pendientes (pedidos confirmados/en producción, todavía no entregados): <span className="font-medium text-orange">{fARS(ventasPendientes)}</span>
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TarjetaCanal canal="Minorista" m={minorista} />
        <TarjetaCanal canal="Mayorista" m={mayorista} />
      </div>

      <TablaDistribucionCanal canales={canales} />
      <TablaVentasPorGusto gustos={gustos} seleccionado={productoSeleccionado} onSeleccionar={(id) => setProductoSeleccionado(id === productoSeleccionado ? null : id)} />
      {productoSeleccionado && <DetalleGustoCard data={data} desde={desde} hasta={hasta} productoId={productoSeleccionado} />}
      <TablaClientes clientes={clientes} />
      <TablaDescuentos desc={descuentos} />

      {comparar && metricasAnt && canalesAnt && (
        <Card title={`Crecimiento vs ${MESES_ANALITICA[ant.mes - 1]} ${ant.anio}`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <IndicadorCrecimiento label="Ventas" valor={pctCambio(metricas.ventas_totales, metricasAnt.ventas_totales)} />
            <IndicadorCrecimiento label="Pedidos" valor={pctCambio(metricas.cantidad_pedidos, metricasAnt.cantidad_pedidos)} />
            <IndicadorCrecimiento label="Cajas" valor={pctCambio(metricas.cajas_vendidas, metricasAnt.cajas_vendidas)} />
            <IndicadorCrecimiento label="Ticket promedio" valor={pctCambio(metricas.ticket_promedio, metricasAnt.ticket_promedio)} />
            <IndicadorCrecimiento label="Minorista" valor={pctCambio(minorista.ventas_totales, canalesAnt.find((c) => c.canal === "Minorista")!.ventas_totales)} />
            <IndicadorCrecimiento label="Mayorista" valor={pctCambio(mayorista.ventas_totales, canalesAnt.find((c) => c.canal === "Mayorista")!.ventas_totales)} />
          </div>
        </Card>
      )}
    </div>
  );
}

function TableroAnual({ anio, comparar }: { anio: number; comparar: boolean }) {
  const { data } = useStoreV2();
  const desde = `${anio}-01-01`;
  const hasta = `${anio}-12-31`;
  const [productoSeleccionado, setProductoSeleccionado] = useState<string | null>(null);
  const [metricaEvolucion, setMetricaEvolucion] = useState<MetricaGrafico>("facturacion");

  const metricas = useMemo(() => calcularMetricasVentas(data, desde, hasta), [data, desde, hasta]);
  const canales = useMemo(() => calcularVentasPorCanal(data, desde, hasta), [data, desde, hasta]);
  const gustos = useMemo(() => calcularVentasPorGusto(data, desde, hasta), [data, desde, hasta]);
  const clientes = useMemo(() => calcularClientesPeriodo(data, desde, hasta), [data, desde, hasta]);
  const descuentos = useMemo(() => calcularDescuentosPeriodo(data, desde, hasta), [data, desde, hasta]);
  const evolucion = useMemo(() => calcularEvolucionMensual(data, anio), [data, anio]);
  const evolucionCanal = useMemo(() => calcularEvolucionCanalMensual(data, anio), [data, anio]);
  const evolucionGusto = useMemo(() => (productoSeleccionado ? calcularEvolucionGustoMensual(data, anio, productoSeleccionado) : null), [data, anio, productoSeleccionado]);

  const metricasAnt = useMemo(() => (comparar ? calcularMetricasVentas(data, `${anio - 1}-01-01`, `${anio - 1}-12-31`) : null), [comparar, data, anio]);
  const canalesAnt = useMemo(() => (comparar ? calcularVentasPorCanal(data, `${anio - 1}-01-01`, `${anio - 1}-12-31`) : null), [comparar, data, anio]);

  const minorista = canales.find((c) => c.canal === "Minorista")!;
  const mayorista = canales.find((c) => c.canal === "Mayorista")!;
  const valorEvolucion = (e: (typeof evolucion)[number]) => (metricaEvolucion === "facturacion" ? e.facturacion : metricaEvolucion === "cajas" ? e.cajas : e.pedidos);

  return (
    <div>
      <StatGrid>
        <KpiCard label="Facturación anual" value={fARS(metricas.ventas_totales)} color="blue" />
        <KpiCard label="Pedidos anuales" value={fNum(metricas.cantidad_pedidos, 0)} color="gold" />
        <KpiCard label="Cajas vendidas" value={fNum(metricas.cajas_vendidas, 0)} color="green" />
        <KpiCard label="Ticket promedio" value={fARS(metricas.ticket_promedio)} color="purple" />
        <KpiCard label="Clientes" value={fNum(clientes.total, 0)} color="blue" />
      </StatGrid>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TarjetaCanal canal="Minorista" m={minorista} />
        <TarjetaCanal canal="Mayorista" m={mayorista} />
      </div>

      <TablaDistribucionCanal canales={canales} />
      <TablaVentasPorGusto gustos={gustos} seleccionado={productoSeleccionado} onSeleccionar={(id) => setProductoSeleccionado(id === productoSeleccionado ? null : id)} />
      {productoSeleccionado && <DetalleGustoCard data={data} desde={desde} hasta={hasta} productoId={productoSeleccionado} />}

      <Card title="Evolución de ventas — Enero a Diciembre">
        <FilterTabs value={metricaEvolucion} onChange={(v) => setMetricaEvolucion(v as MetricaGrafico)} options={(["facturacion", "cajas", "pedidos"] as MetricaGrafico[]).map((m) => ({ value: m, label: METRICA_LABEL[m] }))} />
        <div className="mt-3">
          <GraficoLinea puntos={evolucion.map((e) => ({ label: e.label, valor: valorEvolucion(e) }))} />
        </div>
        <TableWrap>
          <table className="mt-2 w-full">
            <thead>
              <tr>
                <Th>Mes</Th>
                <Th>Facturación</Th>
                <Th>Pedidos</Th>
                <Th>Cajas</Th>
              </tr>
            </thead>
            <tbody>
              {evolucion.map((e) => (
                <TrHover key={e.mes}>
                  <Td main>{e.label}</Td>
                  <Td>{fARS(e.facturacion)}</Td>
                  <Td>{fNum(e.pedidos, 0)}</Td>
                  <Td>{fNum(e.cajas, 0)}</Td>
                </TrHover>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <Card title="Evolución por gusto">
        <div className="mb-3 max-w-xs">
          <Select value={productoSeleccionado ?? ""} onChange={(e) => setProductoSeleccionado(e.target.value || null)}>
            <option value="">Elegí un producto…</option>
            {gustos.map((g) => (
              <option key={g.producto_id} value={g.producto_id}>
                {g.producto_nombre}
              </option>
            ))}
          </Select>
        </div>
        {evolucionGusto ? (
          <>
            <GraficoLinea puntos={evolucionGusto.map((e) => ({ label: e.label, valor: e.cajas }))} color="#2dbe6c" />
            <TableWrap>
              <table className="mt-2 w-full">
                <thead>
                  <tr>
                    <Th>Mes</Th>
                    <Th>Cajas</Th>
                  </tr>
                </thead>
                <tbody>
                  {evolucionGusto.map((e) => (
                    <TrHover key={e.mes}>
                      <Td main>{e.label}</Td>
                      <Td>{fNum(e.cajas, 0)}</Td>
                    </TrHover>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </>
        ) : (
          <EmptyState text="Elegí un producto para ver su evolución mensual." />
        )}
      </Card>

      <Card title="Mayorista vs Minorista por mes">
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <Th>Mes</Th>
                <Th>Cajas minorista</Th>
                <Th>Cajas mayorista</Th>
              </tr>
            </thead>
            <tbody>
              {evolucionCanal.map((e) => (
                <TrHover key={e.mes}>
                  <Td main>{e.label}</Td>
                  <Td>{fNum(e.minorista.cajas, 0)}</Td>
                  <Td>{fNum(e.mayorista.cajas, 0)}</Td>
                </TrHover>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <TablaClientes clientes={clientes} />
      <TablaDescuentos desc={descuentos} />

      {comparar && metricasAnt && canalesAnt && (
        <Card title={`Crecimiento vs ${anio - 1}`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <IndicadorCrecimiento label="Ventas" valor={pctCambio(metricas.ventas_totales, metricasAnt.ventas_totales)} />
            <IndicadorCrecimiento label="Pedidos" valor={pctCambio(metricas.cantidad_pedidos, metricasAnt.cantidad_pedidos)} />
            <IndicadorCrecimiento label="Cajas" valor={pctCambio(metricas.cajas_vendidas, metricasAnt.cajas_vendidas)} />
            <IndicadorCrecimiento label="Ticket promedio" valor={pctCambio(metricas.ticket_promedio, metricasAnt.ticket_promedio)} />
            <IndicadorCrecimiento label="Minorista" valor={pctCambio(minorista.ventas_totales, canalesAnt.find((c) => c.canal === "Minorista")!.ventas_totales)} />
            <IndicadorCrecimiento label="Mayorista" valor={pctCambio(mayorista.ventas_totales, canalesAnt.find((c) => c.canal === "Mayorista")!.ventas_totales)} />
          </div>
        </Card>
      )}
    </div>
  );
}

export function AnaliticaVentasTab() {
  const hoy = new Date();
  const [tipoPeriodo, setTipoPeriodo] = useState<"mensual" | "anual">("mensual");
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [comparar, setComparar] = useState(false);

  function anterior() {
    if (tipoPeriodo === "mensual") {
      const a = mesAnterior(mes, anio);
      setMes(a.mes);
      setAnio(a.anio);
    } else {
      setAnio(anio - 1);
    }
  }
  function siguiente() {
    if (tipoPeriodo === "mensual") {
      const s = mesSiguiente(mes, anio);
      setMes(s.mes);
      setAnio(s.anio);
    } else {
      setAnio(anio + 1);
    }
  }

  return (
    <div>
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterTabs
            value={tipoPeriodo}
            onChange={(v) => setTipoPeriodo(v as "mensual" | "anual")}
            options={[
              { value: "mensual", label: "Mensual" },
              { value: "anual", label: "Anual" },
            ]}
          />
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={anterior}>
              {"< Período anterior"}
            </Button>
            {tipoPeriodo === "mensual" ? (
              <span className="text-[13.5px] font-semibold text-text">
                {MESES_ANALITICA[mes - 1]} {anio}
              </span>
            ) : (
              <span className="text-[13.5px] font-semibold text-text">{anio}</span>
            )}
            <Button variant="ghost" onClick={siguiente}>
              {"Período siguiente >"}
            </Button>
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-[12.5px] text-text2">
          <input type="checkbox" checked={comparar} onChange={(e) => setComparar(e.target.checked)} />
          Comparar con período anterior
        </label>
      </Card>

      {tipoPeriodo === "mensual" ? <TableroMensual mes={mes} anio={anio} comparar={comparar} /> : <TableroAnual anio={anio} comparar={comparar} />}
    </div>
  );
}
