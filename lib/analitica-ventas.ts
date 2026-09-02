// Analítica de Ventas — capa de cálculo pura, sin datos manuales: todo se deriva de pedidos,
// pedido_items, productos, variantes y clientes ya cargados. Reutiliza calcularMargenPorItem
// (lib/calc-v2.ts) como única fuente de líneas de venta ya resueltas (pedido Entregado, precio y
// nombre histórico de pedido_items, descuento repartido, ventas_netas = bruto − descuento + envío
// cobrado — mismo criterio que el EERR) en vez de recalcular esa lógica de nuevo acá.
//
// "Caja" = MargenItemDetalle.tipo_unidad_venta === "caja" (ver default en types-v2.ts: sin cargar,
// se asume caja). Salsa/complementos/otros insumos vendidos sueltos nunca suman a "cajas vendidas".

import type { RicordoDataV2, Canal } from "./types-v2";
import type { Cliente } from "./types";
import { calcularMargenPorItem, calcularEerr, mesesEnRango, primerDiaMes, ultimoDiaMes } from "./calc-v2";
import type { MargenItemDetalle } from "./calc-v2";

export const MESES_ANALITICA = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** % de cambio entre dos valores — null (no un número engañoso) cuando el anterior es 0, ya que
 * ahí "creció infinito%" no dice nada útil. */
export function pctCambio(actual: number, anterior: number): number | null {
  if (anterior === 0) return actual === 0 ? 0 : null;
  return ((actual - anterior) / Math.abs(anterior)) * 100;
}

function esCaja(item: MargenItemDetalle): boolean {
  return item.tipo_unidad_venta === "caja";
}

function itemsDelPeriodo(data: RicordoDataV2, desde: string, hasta: string, canal?: Canal): MargenItemDetalle[] {
  return calcularMargenPorItem(data, desde, hasta, canal);
}

export interface MetricasVentas {
  ventas_totales: number;
  cantidad_pedidos: number;
  cajas_vendidas: number;
  ticket_promedio: number;
  cajas_promedio_por_pedido: number;
  precio_promedio_caja: number;
}

function metricasDeItems(items: MargenItemDetalle[]): MetricasVentas {
  const pedidos = new Set(items.map((i) => i.pedido_id));
  const cantidad_pedidos = pedidos.size;
  const ventas_totales = Math.round(items.reduce((acc, i) => acc + i.ventas_netas, 0));
  const itemsCaja = items.filter(esCaja);
  const cajas_vendidas = itemsCaja.reduce((acc, i) => acc + i.cantidad, 0);
  const facturacion_cajas = Math.round(itemsCaja.reduce((acc, i) => acc + i.ventas_netas, 0));
  return {
    ventas_totales,
    cantidad_pedidos,
    cajas_vendidas,
    ticket_promedio: cantidad_pedidos > 0 ? Math.round(ventas_totales / cantidad_pedidos) : 0,
    cajas_promedio_por_pedido: cantidad_pedidos > 0 ? cajas_vendidas / cantidad_pedidos : 0,
    precio_promedio_caja: cajas_vendidas > 0 ? Math.round(facturacion_cajas / cajas_vendidas) : 0,
  };
}

/** Métricas principales del período (Sección 2) — "ventas totales" es lo realmente facturado
 * después de descuentos, mismo criterio de ventas_netas que usa el EERR (incluye envío cobrado,
 * que es ingreso real, no producto vendido aparte). */
export function calcularMetricasVentas(data: RicordoDataV2, desde: string, hasta: string, canal?: Canal): MetricasVentas {
  return metricasDeItems(itemsDelPeriodo(data, desde, hasta, canal));
}

export interface VentasPorCanal extends MetricasVentas {
  canal: Canal;
  participacion_pct: number | null;
}

/** Sección 3/4: Minorista y Mayorista con las mismas métricas, más su % sobre el total del
 * período — siempre las dos filas, aunque un canal no haya vendido nada ese período. */
export function calcularVentasPorCanal(data: RicordoDataV2, desde: string, hasta: string): VentasPorCanal[] {
  const items = itemsDelPeriodo(data, desde, hasta);
  const totalVentas = items.reduce((acc, i) => acc + i.ventas_netas, 0);
  const canales: Canal[] = ["Minorista", "Mayorista"];
  return canales.map((canal) => {
    const m = metricasDeItems(items.filter((i) => i.canal === canal));
    return { ...m, canal, participacion_pct: totalVentas > 0 ? (m.ventas_totales / totalVentas) * 100 : null };
  });
}

export interface VentasPorGusto {
  producto_id: string;
  producto_nombre: string;
  cajas: number;
  facturacion: number;
  pct_cajas: number | null;
  pct_facturacion: number | null;
}

/** Sección 5/7/8: agrupa SIEMPRE por producto_id (nunca por variante ni por texto del nombre) —
 * "Calabaza minorista", "Calabaza mayorista" y "Calabaza al vacío" son la misma fila. Ordenado de
 * mayor a menor cajas por default (el caller puede invertir para "menos vendidos"). */
export function calcularVentasPorGusto(data: RicordoDataV2, desde: string, hasta: string, canal?: Canal): VentasPorGusto[] {
  const items = itemsDelPeriodo(data, desde, hasta, canal);
  const porProducto = new Map<string, MargenItemDetalle[]>();
  for (const it of items) {
    const key = it.producto_id ?? "sin-producto";
    const lista = porProducto.get(key) ?? [];
    lista.push(it);
    porProducto.set(key, lista);
  }
  const totalCajas = items.filter(esCaja).reduce((acc, i) => acc + i.cantidad, 0);
  const totalFacturacion = items.reduce((acc, i) => acc + i.ventas_netas, 0);

  return [...porProducto.entries()]
    .map(([producto_id, its]) => {
      const cajas = its.filter(esCaja).reduce((acc, i) => acc + i.cantidad, 0);
      const facturacion = Math.round(its.reduce((acc, i) => acc + i.ventas_netas, 0));
      return {
        producto_id,
        producto_nombre: its[0].producto_nombre,
        cajas,
        facturacion,
        pct_cajas: totalCajas > 0 ? (cajas / totalCajas) * 100 : null,
        pct_facturacion: totalFacturacion > 0 ? (facturacion / totalFacturacion) * 100 : null,
      };
    })
    .sort((a, b) => b.cajas - a.cajas);
}

export interface DetalleGustoPresentacion {
  variante_id: string;
  nombre: string;
  cajas: number;
}

export interface DetalleGusto {
  producto_id: string;
  producto_nombre: string;
  total_cajas: number;
  facturacion: number;
  participacion_pct: number | null;
  cajas_minorista: number;
  cajas_mayorista: number;
  por_presentacion: DetalleGustoPresentacion[];
}

/** Sección 6: desglose de un gusto por canal y por presentación (variante) — para saber no solo
 * qué gusto vende, sino en qué formato. */
export function calcularDetalleGusto(data: RicordoDataV2, desde: string, hasta: string, productoId: string): DetalleGusto | null {
  const items = itemsDelPeriodo(data, desde, hasta).filter((i) => (i.producto_id ?? "sin-producto") === productoId);
  if (items.length === 0) return null;

  const totalCajasPeriodo = itemsDelPeriodo(data, desde, hasta)
    .filter(esCaja)
    .reduce((acc, i) => acc + i.cantidad, 0);
  const itemsCaja = items.filter(esCaja);
  const total_cajas = itemsCaja.reduce((acc, i) => acc + i.cantidad, 0);
  const facturacion = Math.round(items.reduce((acc, i) => acc + i.ventas_netas, 0));

  const porPresentacion = new Map<string, DetalleGustoPresentacion>();
  for (const it of itemsCaja) {
    const key = it.variante_id ?? it.variante_nombre;
    const existente = porPresentacion.get(key);
    if (existente) existente.cajas += it.cantidad;
    else porPresentacion.set(key, { variante_id: key, nombre: it.presentacion || it.variante_nombre, cajas: it.cantidad });
  }

  return {
    producto_id: productoId,
    producto_nombre: items[0].producto_nombre,
    total_cajas,
    facturacion,
    participacion_pct: totalCajasPeriodo > 0 ? (total_cajas / totalCajasPeriodo) * 100 : null,
    cajas_minorista: itemsCaja.filter((i) => i.canal === "Minorista").reduce((acc, i) => acc + i.cantidad, 0),
    cajas_mayorista: itemsCaja.filter((i) => i.canal === "Mayorista").reduce((acc, i) => acc + i.cantidad, 0),
    por_presentacion: [...porPresentacion.values()].sort((a, b) => b.cajas - a.cajas),
  };
}

export interface EvolucionMensual {
  mes: number;
  anio: number;
  label: string;
  facturacion: number;
  pedidos: number;
  cajas: number;
}

/** Sección 9/11: los 12 meses de un año — siempre los 12, con 0 en los que no hay datos (nunca se
 * saltea un mes, para que el gráfico no quede con huecos engañosos). */
export function calcularEvolucionMensual(data: RicordoDataV2, anio: number, canal?: Canal): EvolucionMensual[] {
  return Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const m = calcularMetricasVentas(data, primerDiaMes(mes, anio), ultimoDiaMes(mes, anio), canal);
    return { mes, anio, label: MESES_ANALITICA[i], facturacion: m.ventas_totales, pedidos: m.cantidad_pedidos, cajas: m.cajas_vendidas };
  });
}

export interface EvolucionGustoMensual {
  mes: number;
  anio: number;
  label: string;
  cajas: number;
}

/** Sección 10: evolución mensual de cajas de UN gusto puntual — crecimiento, caída, estacionalidad. */
export function calcularEvolucionGustoMensual(data: RicordoDataV2, anio: number, productoId: string): EvolucionGustoMensual[] {
  return Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const desde = primerDiaMes(mes, anio);
    const hasta = ultimoDiaMes(mes, anio);
    const cajas = itemsDelPeriodo(data, desde, hasta)
      .filter((it) => (it.producto_id ?? "sin-producto") === productoId && esCaja(it))
      .reduce((acc, i) => acc + i.cantidad, 0);
    return { mes, anio, label: MESES_ANALITICA[i], cajas };
  });
}

export interface EvolucionCanalMensual {
  mes: number;
  anio: number;
  label: string;
  minorista: { cajas: number; ventas: number; pedidos: number };
  mayorista: { cajas: number; ventas: number; pedidos: number };
}

/** Sección 11: Minorista vs Mayorista mes a mes en un año. */
export function calcularEvolucionCanalMensual(data: RicordoDataV2, anio: number): EvolucionCanalMensual[] {
  return Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const desde = primerDiaMes(mes, anio);
    const hasta = ultimoDiaMes(mes, anio);
    const minorista = calcularMetricasVentas(data, desde, hasta, "Minorista");
    const mayorista = calcularMetricasVentas(data, desde, hasta, "Mayorista");
    return {
      mes,
      anio,
      label: MESES_ANALITICA[i],
      minorista: { cajas: minorista.cajas_vendidas, ventas: minorista.ventas_totales, pedidos: minorista.cantidad_pedidos },
      mayorista: { cajas: mayorista.cajas_vendidas, ventas: mayorista.ventas_totales, pedidos: mayorista.cantidad_pedidos },
    };
  });
}

export interface ClienteResumenFila {
  cliente_id: string;
  nombre: string;
  canal: Canal;
  pedidos: number;
  cajas: number;
  total: number;
}

export interface ClientesPeriodo {
  total: number;
  minoristas: number;
  mayoristas: number;
  nuevos: number;
  recurrentes: number;
  principales: ClienteResumenFila[];
}

/** Sección 16: "nuevo" = su primer pedido Entregado de TODA la historia cae dentro del período;
 * "recurrente" = ya tenía al menos un pedido Entregado antes del período Y también compró dentro
 * de él. Nunca se basa en una fecha de alta manual del cliente — se deriva 100% de sus pedidos. */
export function calcularClientesPeriodo(data: RicordoDataV2, desde: string, hasta: string): ClientesPeriodo {
  const entregados = data.pedidos.filter((p) => p.estado === "Entregado");
  const primerPedidoPorCliente = new Map<string, string>();
  for (const p of entregados) {
    const actual = primerPedidoPorCliente.get(p.cliente_id);
    if (!actual || p.fecha < actual) primerPedidoPorCliente.set(p.cliente_id, p.fecha);
  }

  const items = itemsDelPeriodo(data, desde, hasta);
  const porCliente = new Map<string, { pedidos: Set<string>; cajas: number; total: number }>();
  for (const it of items) {
    const pedido = data.pedidos.find((p) => p.id === it.pedido_id);
    if (!pedido) continue;
    const acc = porCliente.get(pedido.cliente_id) ?? { pedidos: new Set<string>(), cajas: 0, total: 0 };
    acc.pedidos.add(pedido.id);
    if (esCaja(it)) acc.cajas += it.cantidad;
    acc.total += it.ventas_netas;
    porCliente.set(pedido.cliente_id, acc);
  }

  const clientesMap = new Map<string, Cliente>(data.clientes.map((c) => [c.id, c]));
  let minoristas = 0;
  let mayoristas = 0;
  let nuevos = 0;
  let recurrentes = 0;
  const principales: ClienteResumenFila[] = [];

  for (const [clienteId, acc] of porCliente.entries()) {
    const cliente = clientesMap.get(clienteId);
    if (!cliente) continue;
    if (cliente.canal === "Minorista") minoristas++;
    else mayoristas++;
    const primerPedido = primerPedidoPorCliente.get(clienteId);
    if (primerPedido && primerPedido >= desde && primerPedido <= hasta) nuevos++;
    else if (primerPedido && primerPedido < desde) recurrentes++;
    principales.push({ cliente_id: clienteId, nombre: cliente.nombre, canal: cliente.canal, pedidos: acc.pedidos.size, cajas: acc.cajas, total: Math.round(acc.total) });
  }

  principales.sort((a, b) => b.total - a.total);
  return { total: porCliente.size, minoristas, mayoristas, nuevos, recurrentes, principales };
}

export interface DescuentosPeriodo {
  descuentos: number;
  pct_sobre_bruta: number | null;
  ventas_brutas: number;
  ventas_netas: number;
}

/** Sección 18 — reutiliza el EERR (mismos ventas_brutas/descuentos/ventas_netas ya probados) en
 * vez de recalcular el reparto de descuentos de nuevo. */
export function calcularDescuentosPeriodo(data: RicordoDataV2, desde: string, hasta: string, canal?: Canal): DescuentosPeriodo {
  const eerr = calcularEerr(data, desde, hasta, canal);
  return {
    descuentos: eerr.descuentos.total,
    pct_sobre_bruta: eerr.ventas_brutas.total > 0 ? (eerr.descuentos.total / eerr.ventas_brutas.total) * 100 : null,
    ventas_brutas: eerr.ventas_brutas.total,
    ventas_netas: eerr.ventas_netas,
  };
}

/** Sección 17: pedidos Confirmados/En producción (no Entregados, no Cancelados) del período —
 * nunca se mezclan con las ventas realizadas. */
export function calcularVentasPendientes(data: RicordoDataV2, desde: string, hasta: string): number {
  return Math.round(
    data.pedidos
      .filter((p) => (p.estado === "Confirmado" || p.estado === "Produccion") && p.fecha >= desde && p.fecha <= hasta)
      .reduce((acc, p) => acc + p.total, 0)
  );
}

// mesesEnRango se re-exporta por comodidad para quien arme un selector de rango en la UI.
export { mesesEnRango };
