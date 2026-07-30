import type { RicordoData, Ingrediente, Pedido, TipoCosto, Amortizacion, CajaMovimiento } from "./types";
import { uid } from "./id";

export function fARS(n: number | null | undefined): string {
  const v = n ?? 0;
  return v.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });
}

export function fNum(n: number | null | undefined, decimals = 2): string {
  const v = n ?? 0;
  return v.toLocaleString("es-AR", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  });
}

export function fPct(n: number | null | undefined, decimals = 1): string {
  const v = n ?? 0;
  return `${v.toLocaleString("es-AR", { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}%`;
}

/** precio_vigente ?? precio_ref */
export function pvr(ing: Ingrediente | undefined | null): number {
  if (!ing) return 0;
  return ing.precio_vigente ?? ing.precio_ref ?? 0;
}

/** Costo de un producto = Σ receta × precio vigente (ingredientes y packaging); costos fijos de receta se suman en $ directo */
export function calcCosto(data: RicordoData, idProducto: string): number {
  const lineas = data.recetas.filter((r) => r.id_producto === idProducto);
  let total = 0;
  for (const linea of lineas) {
    if (linea.tipo === "Ingrediente") {
      const ing = data.ingredientes.find((i) => i.id === linea.concepto);
      total += linea.cantidad * pvr(ing);
    } else if (linea.tipo === "Packaging") {
      const pkg = data.packaging.find((p) => p.id === linea.concepto);
      total += linea.cantidad * (pkg?.precio ?? 0);
    } else if (linea.tipo === "CostoFijo") {
      const cf = data.costos_fijos.find((c) => c.id === linea.concepto);
      total += linea.cantidad * (cf?.monto ?? 0);
    }
  }
  return total;
}

export function inPeriod(fecha: string | undefined | null, mes: number, anio: number): boolean {
  if (!fecha) return false;
  const d = new Date(fecha + (fecha.length <= 10 ? "T00:00:00" : ""));
  if (isNaN(d.getTime())) return false;
  return d.getMonth() + 1 === mes && d.getFullYear() === anio;
}

export function inYear(fecha: string | undefined | null, anio: number): boolean {
  if (!fecha) return false;
  const d = new Date(fecha + (fecha.length <= 10 ? "T00:00:00" : ""));
  if (isNaN(d.getTime())) return false;
  return d.getFullYear() === anio;
}

export function isAfter(fecha: string, cutoff: string | null): boolean {
  if (!cutoff) return true;
  return new Date(fecha) > new Date(cutoff);
}

/** Stock estimado de un ingrediente con seguimiento activo:
 * último conteo + compras posteriores al conteo − uso en producción posterior al conteo */
export function calcStockIngrediente(data: RicordoData, idIngrediente: string): number {
  const conteos = data.conteos_ingredientes
    .filter((c) => c.id_ingrediente === idIngrediente)
    .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
  const ultimo = conteos[conteos.length - 1];
  const base = ultimo?.cantidad ?? 0;
  const fechaBase = ultimo?.fecha ?? null;

  let compradoPost = 0;
  for (const compra of data.compras) {
    if (fechaBase && new Date(compra.fecha) <= new Date(fechaBase)) continue;
    for (const linea of compra.lineas) {
      if (linea.id_ingrediente === idIngrediente) compradoPost += linea.cantidad;
    }
  }

  let usadoPost = 0;
  for (const prod of data.produccion) {
    if (fechaBase && new Date(prod.fecha) <= new Date(fechaBase)) continue;
    const recetaLineas = data.recetas.filter(
      (r) => r.id_producto === prod.id_producto && r.tipo === "Ingrediente" && r.concepto === idIngrediente
    );
    for (const rl of recetaLineas) {
      usadoPost += rl.cantidad * prod.cantidad;
    }
  }

  return base + compradoPost - usadoPost;
}

export const ESTADOS_CMV: Pedido["estado"][] = ["Entregado"];

export function cmvDePedido(data: RicordoData, p: Pedido): number {
  const costoUnit = calcCosto(data, p.id_producto);
  return costoUnit * p.cantidad;
}

export function cmvPeriodo(data: RicordoData, pedidos: Pedido[]): number {
  return pedidos
    .filter((p) => p.estado === "Entregado")
    .reduce((acc, p) => acc + cmvDePedido(data, p), 0);
}

export function ventasNetas(pedidos: Pedido[]): number {
  return pedidos.reduce((acc, p) => acc + p.precio_neto, 0);
}

export function totalCostosFijos(data: RicordoData): number {
  return data.costos_fijos.filter((c) => c.activo).reduce((acc, c) => acc + c.monto, 0);
}

export function totalCostosIndirectos(data: RicordoData, mes: number, anio: number): number {
  return data.costos_indirectos
    .filter((c) => c.mes === mes && c.anio === anio)
    .reduce((acc, c) => acc + c.monto, 0);
}

export function totalCostosIndirectosPorTipo(
  data: RicordoData,
  mes: number,
  anio: number,
  tipo: TipoCosto
): number {
  return data.costos_indirectos
    .filter((c) => c.mes === mes && c.anio === anio && (c.tipo_costo ?? "Fijo") === tipo)
    .reduce((acc, c) => acc + c.monto, 0);
}

export function totalCostoEnvio(pedidos: Pedido[]): number {
  return pedidos.reduce((acc, p) => acc + (p.costo_envio || 0), 0);
}

/** CMV + envío + costos indirectos clasificados como Variable en el período */
export function costosVariablesTotales(data: RicordoData, pedidos: Pedido[], mes: number, anio: number): number {
  return cmvPeriodo(data, pedidos) + totalCostoEnvio(pedidos) + totalCostosIndirectosPorTipo(data, mes, anio, "Variable");
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function cuotaMensualAmortizacion(a: Amortizacion): number {
  return a.meses_totales > 0 ? a.precio_total / a.meses_totales : 0;
}

/** Fecha en la que termina de amortizarse (primer día en que ya no corre cuota) */
export function fechaFinAmortizacion(a: Amortizacion): Date {
  return addMonths(new Date(a.fecha_inicio), a.meses_totales);
}

/** Meses ya transcurridos (cuotas "pagadas"), calculado a partir de la fecha — nunca manual */
export function mesesTranscurridosAmortizacion(a: Amortizacion, hoy: Date = new Date()): number {
  const inicio = new Date(a.fecha_inicio);
  let diff = (hoy.getFullYear() - inicio.getFullYear()) * 12 + (hoy.getMonth() - inicio.getMonth());
  if (hoy.getDate() < inicio.getDate()) diff -= 1;
  return Math.max(0, Math.min(a.meses_totales, diff));
}

export function amortizacionActiva(a: Amortizacion, hoy: Date = new Date()): boolean {
  return mesesTranscurridosAmortizacion(a, hoy) < a.meses_totales;
}

export function montoAmortizado(a: Amortizacion, hoy: Date = new Date()): number {
  return cuotaMensualAmortizacion(a) * mesesTranscurridosAmortizacion(a, hoy);
}

export function montoRestanteAmortizacion(a: Amortizacion, hoy: Date = new Date()): number {
  return a.precio_total - montoAmortizado(a, hoy);
}

export function mesesRestantesAmortizacion(a: Amortizacion, hoy: Date = new Date()): number {
  return a.meses_totales - mesesTranscurridosAmortizacion(a, hoy);
}

/** Cuota que corresponde a un (mes, año) puntual — 0 si todavía no arrancó o ya terminó */
export function cuotaAmortizacionEnPeriodo(a: Amortizacion, mes: number, anio: number): number {
  const inicio = new Date(a.fecha_inicio);
  const inicioMes = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
  const fin = fechaFinAmortizacion(a);
  const targetStart = new Date(anio, mes - 1, 1);
  if (targetStart < inicioMes) return 0;
  if (targetStart >= new Date(fin.getFullYear(), fin.getMonth(), 1)) return 0;
  return cuotaMensualAmortizacion(a);
}

export function totalAmortizacionesPeriodo(data: RicordoData, mes: number, anio: number): number {
  return data.amortizaciones.reduce((acc, a) => acc + cuotaAmortizacionEnPeriodo(a, mes, anio), 0);
}

export function totalAmortizacionMensualActiva(data: RicordoData, hoy: Date = new Date()): number {
  return data.amortizaciones
    .filter((a) => amortizacionActiva(a, hoy))
    .reduce((acc, a) => acc + cuotaMensualAmortizacion(a), 0);
}

/** Costos fijos + costos indirectos clasificados como Fijo + cuota de amortizaciones activas en el período */
export function costosFijosTotales(data: RicordoData, mes: number, anio: number): number {
  return (
    totalCostosFijos(data) +
    totalCostosIndirectosPorTipo(data, mes, anio, "Fijo") +
    totalAmortizacionesPeriodo(data, mes, anio)
  );
}

export function totalGastosOperativos(data: RicordoData, mes: number, anio: number): number {
  return data.gastos_operativos
    .filter((g) => inPeriod(g.fecha, mes, anio))
    .reduce((acc, g) => acc + g.monto, 0);
}

export function margenContribucionUnitario(data: RicordoData, idProducto: string, precioVenta: number): number {
  return precioVenta - calcCosto(data, idProducto);
}

/** Punto de equilibrio $ = CF total / margen contribución promedio ponderado (ponderado por unidades vendidas en el período)
 * CF total usa la misma fórmula que el EERR (costosFijosTotales): costos fijos + indirectos "Fijo" + amortizaciones activas del período. */
export function puntoEquilibrio(
  data: RicordoData,
  pedidosPeriodo: Pedido[],
  mes: number,
  anio: number
): {
  pe: number;
  margenPromedioPonderado: number;
  cfTotal: number;
  precioPromedioPonderado: number;
  costoVariableUnitarioPromedio: number;
  unidadesTotales: number;
} {
  const cfTotal = costosFijosTotales(data, mes, anio);
  const unidadesPorProducto = new Map<string, number>();
  for (const p of pedidosPeriodo) {
    unidadesPorProducto.set(p.id_producto, (unidadesPorProducto.get(p.id_producto) ?? 0) + p.cantidad);
  }
  let sumaMcxQ = 0;
  let sumaQ = 0;
  let sumaPxQ = 0;
  for (const [idProd, q] of unidadesPorProducto.entries()) {
    const prod = data.productos.find((pr) => pr.id === idProd);
    if (!prod) continue;
    const mc = margenContribucionUnitario(data, idProd, prod.precio_venta);
    sumaMcxQ += mc * q;
    sumaQ += q;
    sumaPxQ += prod.precio_venta * q;
  }
  const margenPromedioPonderado = sumaPxQ > 0 ? sumaMcxQ / sumaQ : 0;
  const ratioContribucion = sumaPxQ > 0 ? sumaMcxQ / sumaPxQ : 0;
  const pe = ratioContribucion > 0 ? cfTotal / ratioContribucion : 0;
  const precioPromedioPonderado = sumaQ > 0 ? sumaPxQ / sumaQ : 0;
  const costoVariableUnitarioPromedio = precioPromedioPonderado - margenPromedioPonderado;
  return { pe, margenPromedioPonderado, cfTotal, precioPromedioPonderado, costoVariableUnitarioPromedio, unidadesTotales: sumaQ };
}

export function saldoCaja(data: RicordoData): number {
  const movs = data.caja_movimientos.reduce(
    (acc, m) => acc + (m.tipo === "ingreso" ? m.monto : -m.monto),
    0
  );
  return (data.saldo_anterior_caja?.valor ?? 0) + movs;
}

/** Movimiento de ingreso que corresponde a una línea de pedido entregada — un movimiento por línea,
 * referenciado por id_detalle para poder detectar si ya existe (idempotente). */
export function crearMovimientoCajaDesdePedido(pedido: Pedido): CajaMovimiento {
  return {
    id: uid("CAJ"),
    fecha: pedido.fecha,
    tipo: "ingreso",
    concepto: `Pedido ${pedido.id_pedido} — ${pedido.nombre_producto}`,
    monto: pedido.precio_neto,
    metodo: pedido.metodo_pago || "Efectivo",
    ref: pedido.id_detalle,
  };
}

export interface DiscrepanciaCaja {
  pedido: Pedido;
  movimiento: CajaMovimiento | null;
}

/** Pedidos entregados cuyo ingreso de caja no existe o no coincide con precio_neto,
 * excluyendo los que ya se revisaron y se confirmaron como intencionalmente sin cobrar. */
export function discrepanciasCaja(data: RicordoData): DiscrepanciaCaja[] {
  const ignorados = new Set(data.conciliacion_ignorados ?? []);
  return data.pedidos
    .filter((p) => p.estado === "Entregado" && !ignorados.has(p.id_detalle))
    .map((p) => ({ pedido: p, movimiento: data.caja_movimientos.find((m) => m.ref === p.id_detalle) ?? null }))
    .filter(({ pedido, movimiento }) => !movimiento || movimiento.monto !== pedido.precio_neto);
}

export function cmvAcumulado(data: RicordoData): number {
  const post = data.pedidos.filter(
    (p) => p.estado === "Entregado" && isAfter(p.fecha, data.fecha_corte_cmv)
  );
  return (data.saldo_cmv_anterior ?? 0) + cmvPeriodo(data, post);
}

export function comprasAcumuladas(data: RicordoData): number {
  const post = data.compras.filter((c) => isAfter(c.fecha, data.fecha_corte_compras));
  return (data.saldo_compras_anterior ?? 0) + post.reduce((acc, c) => acc + c.total, 0);
}

export function valorStockIngredientes(data: RicordoData): number {
  return data.ingredientes
    .filter((i) => i.seguimiento_stock)
    .reduce((acc, i) => acc + calcStockIngrediente(data, i.id) * pvr(i), 0);
}

export function calcCVProducto(data: RicordoData, idProducto: string): number {
  return calcCosto(data, idProducto);
}

export function unidadesEntregadas(pedidos: Pedido[]): number {
  return pedidos.filter((p) => p.estado === "Entregado").reduce((acc, p) => acc + p.cantidad, 0);
}
