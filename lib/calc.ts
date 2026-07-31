import type { RicordoData, Ingrediente, Pedido, TipoCosto, Amortizacion, CajaMovimiento, Cliente, Canal, Producto } from "./types";
import { uid } from "./id";

export function fARS(n: number | null | undefined): string {
  const v = n ?? 0;
  return v.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });
}

/** Convierte una fecha ISO ("2026-07-30" o con hora) al formato DD/MM/YYYY usado en la interfaz. */
export function fFechaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
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

export interface ComprasVsConsumoMes {
  mes: number;
  anio: number;
  compras: number;
  consumoVendido: number;
  diferencia: number;
  /** null cuando no hay consumo del período contra el cual comparar (no es 0%, es "sin base") */
  porcentaje: number | null;
  nivel: "green" | "orange" | "red";
}

/** Compara, mes a mes, cuánto se compró de materia prima contra el costo de lo que
 * efectivamente se vendió — solo señala, no juzga: una diferencia positiva puede ser
 * stock intencional. Umbrales de amber/red configurables. */
export function comprasVsConsumoUltimosMeses(
  data: RicordoData,
  hoy: Date = new Date(),
  cantidadMeses = 3
): ComprasVsConsumoMes[] {
  const umbralAmber = data.umbral_compras_consumo_amber;
  const umbralRed = data.umbral_compras_consumo_red;
  const resultado: ComprasVsConsumoMes[] = [];
  for (let i = cantidadMeses - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const mes = d.getMonth() + 1;
    const anio = d.getFullYear();
    const compras = data.compras.filter((c) => inPeriod(c.fecha, mes, anio)).reduce((acc, c) => acc + c.total, 0);
    const pedidosMes = data.pedidos.filter((p) => p.estado === "Entregado" && inPeriod(p.fecha, mes, anio));
    const consumoVendido = cmvPeriodo(data, pedidosMes);
    const diferencia = compras - consumoVendido;
    const porcentaje = consumoVendido > 0 ? (diferencia / consumoVendido) * 100 : null;
    const magnitud = porcentaje === null ? (compras > 0 ? Infinity : 0) : Math.abs(porcentaje);
    const nivel: ComprasVsConsumoMes["nivel"] = magnitud >= umbralRed ? "red" : magnitud >= umbralAmber ? "orange" : "green";
    resultado.push({ mes, anio, compras, consumoVendido, diferencia, porcentaje, nivel });
  }
  return resultado;
}

export interface RecurrenciaMayorista {
  cliente: Cliente;
  cantidadPedidos: number;
  mesesDistintos: number;
  fechaUltimoPedido: string | null;
  diasDesdeUltimo: number | null;
  ticketPromedio: number;
  estado: "Recurrente" | "Único" | "En riesgo";
}

/** Recurrencia real de clientes mayoristas: se calcula de los pedidos, nunca se carga a mano.
 * Recurrente = compró en 2+ meses distintos · Único = un solo pedido/mes ·
 * En riesgo = recurrente pero sin comprar hace más de `umbralDias`. */
export function recurrenciaMayorista(data: RicordoData, umbralDias: number, hoy: Date = new Date()): RecurrenciaMayorista[] {
  return data.clientes
    .filter((c) => c.canal === "Mayorista")
    .map((cliente) => {
      const pedidos = data.pedidos.filter((p) => p.id_cliente === cliente.id && p.estado !== "Cancelado");
      const idsUnicos = new Set(pedidos.map((p) => p.id_pedido));
      const meses = new Set(pedidos.map((p) => p.fecha.slice(0, 7)));
      const fechas = pedidos.map((p) => p.fecha).sort();
      const fechaUltimoPedido = fechas.length > 0 ? fechas[fechas.length - 1] : null;
      const diasDesdeUltimo = fechaUltimoPedido
        ? Math.floor((hoy.getTime() - new Date(fechaUltimoPedido).getTime()) / (1000 * 60 * 60 * 24))
        : null;
      const total = pedidos.reduce((acc, p) => acc + p.precio_neto, 0);
      const ticketPromedio = idsUnicos.size > 0 ? total / idsUnicos.size : 0;
      const esRecurrente = meses.size >= 2;
      const estado: RecurrenciaMayorista["estado"] =
        esRecurrente && diasDesdeUltimo !== null && diasDesdeUltimo > umbralDias
          ? "En riesgo"
          : esRecurrente
          ? "Recurrente"
          : "Único";
      return {
        cliente,
        cantidadPedidos: idsUnicos.size,
        mesesDistintos: meses.size,
        fechaUltimoPedido,
        diasDesdeUltimo,
        ticketPromedio,
        estado,
      };
    })
    .sort((a, b) => (b.diasDesdeUltimo ?? -1) - (a.diasDesdeUltimo ?? -1));
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

// --- Agrupación por producto base (gusto) --------------------------------------------------
// Un mismo gusto (ej. "Calabaza") se vende bajo varias fichas de Producto — minorista,
// mayorista, sellado al vacío, sin salsa — cada una con su propia receta, pero comparten un
// solo lote físico de producción y un solo stock. Producto.id_base ya identifica esa relación
// (se carga bien desde el import); estas funciones son el punto único donde se agrupa por ahí,
// para que Stock, Dashboard y Planificación no dupliquen la lógica.

export interface GustoBase {
  id_base: string;
  nombre: string;
  variantes: Producto[];
}

/** Un gusto por cada id_base distinto entre los productos activos. El nombre mostrado es el
 * del producto base si sigue activo; si no, el de la primera variante activa que encuentre. */
export function gustosActivos(data: RicordoData): GustoBase[] {
  const activos = data.productos.filter((p) => p.activo);
  const idsBase = [...new Set(activos.map((p) => p.id_base))];
  return idsBase.map((idBase) => {
    const variantes = activos.filter((p) => p.id_base === idBase);
    const base = data.productos.find((p) => p.id === idBase) ?? variantes[0];
    return { id_base: idBase, nombre: base?.nombre ?? idBase, variantes };
  });
}

export interface MovimientoStockGusto {
  fecha: string;
  tipo: "produccion" | "venta";
  cantidad: number; // positivo = producción, negativo = venta — para sumar directo
  detalle: string;
}

/** Historial de movimientos de stock de un gusto: cada lote de producción suma, cada pedido
 * Entregado de cualquiera de sus variantes resta. Ordenado del más viejo al más nuevo. */
export function movimientosStockGusto(data: RicordoData, idsVariantes: string[]): MovimientoStockGusto[] {
  const variantesSet = new Set(idsVariantes);
  const movimientos: MovimientoStockGusto[] = [];
  for (const lote of data.produccion) {
    if (!variantesSet.has(lote.id_producto)) continue;
    movimientos.push({ fecha: lote.fecha, tipo: "produccion", cantidad: lote.cantidad, detalle: lote.nombre_producto });
  }
  for (const pedido of data.pedidos) {
    if (pedido.estado !== "Entregado" || !variantesSet.has(pedido.id_producto)) continue;
    movimientos.push({ fecha: pedido.fecha, tipo: "venta", cantidad: -pedido.cantidad, detalle: pedido.nombre_producto });
  }
  return movimientos.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
}

export function stockCalculadoGusto(movimientos: MovimientoStockGusto[]): number {
  return movimientos.reduce((acc, m) => acc + m.cantidad, 0);
}

/** El número "oficial" de stock de un gusto: si hay un conteo manual cargado, parte de ahí y
 * resta las ventas Entregado posteriores a esa fecha; si no hay conteo, usa el calculado por la
 * app (todo el historial de producción menos ventas). Mismo criterio en Stock y en Dashboard. */
export function stockRealGusto(data: RicordoData, gusto: GustoBase): number {
  const idsVariantes = gusto.variantes.map((v) => v.id);
  const movimientos = movimientosStockGusto(data, idsVariantes);
  const ultimoConteo = data.conteos_stock
    .filter((c) => c.id_producto === gusto.id_base)
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())[0];
  if (!ultimoConteo) return stockCalculadoGusto(movimientos);
  const ventasPostConteo = movimientos
    .filter((m) => m.tipo === "venta" && m.fecha >= ultimoConteo.fecha)
    .reduce((acc, m) => acc + m.cantidad, 0);
  return ultimoConteo.cantidad + ventasPostConteo;
}

export interface VentaMesCanalPulso {
  mes: number;
  anio: number;
  canal: Canal;
  total: number;
  unidades: number;
}

export interface ProductoResumenPulso {
  id: string;
  nombre: string;
  margenPct: number;
  unidadesVendidasMesActual: number;
  stock: number;
}

export interface ResumenPulso {
  ventasPorMesCanal: VentaMesCanalPulso[];
  productos: ProductoResumenPulso[];
  diferenciaCajaVentas: number;
  comprasVsConsumo: ComprasVsConsumoMes[];
  pendientesEntrega: number;
}

/** Arma el resumen agregado que se manda a la IA para el pulso semanal — nunca los registros
 * crudos, solo estos totales ya calculados con la misma lógica que usa el resto de la app. */
export function construirResumenPulso(data: RicordoData, hoy: Date = new Date()): ResumenPulso {
  const canales: Canal[] = ["Minorista", "Mayorista"];
  const ventasPorMesCanal: VentaMesCanalPulso[] = [];
  for (let i = 2; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const mes = d.getMonth() + 1;
    const anio = d.getFullYear();
    for (const canal of canales) {
      const pedidosCanal = data.pedidos.filter(
        (p) => inPeriod(p.fecha, mes, anio) && p.estado !== "Cancelado" && p.canal === canal
      );
      ventasPorMesCanal.push({
        mes,
        anio,
        canal,
        total: pedidosCanal.reduce((acc, p) => acc + p.precio_neto, 0),
        unidades: pedidosCanal.reduce((acc, p) => acc + p.cantidad, 0),
      });
    }
  }

  const mesActual = hoy.getMonth() + 1;
  const anioActual = hoy.getFullYear();
  const productos: ProductoResumenPulso[] = data.productos
    .filter((p) => p.activo)
    .map((p) => {
      const costo = calcCosto(data, p.id);
      const margenPct = p.precio_venta > 0 ? ((p.precio_venta - costo) / p.precio_venta) * 100 : 0;
      const unidadesVendidasMesActual = data.pedidos
        .filter((pe) => pe.id_producto === p.id && pe.estado !== "Cancelado" && inPeriod(pe.fecha, mesActual, anioActual))
        .reduce((acc, pe) => acc + pe.cantidad, 0);
      return { id: p.id, nombre: p.nombre, margenPct, unidadesVendidasMesActual, stock: data.stock_manual[p.id] ?? 0 };
    });

  const diferenciaCajaVentas = discrepanciasCaja(data).reduce(
    (acc, { pedido, movimiento }) => acc + (pedido.precio_neto - (movimiento?.monto ?? 0)),
    0
  );

  const pendientesEntrega = data.pedidos.filter((p) => p.estado === "Confirmado" || p.estado === "Produccion").length;

  return {
    ventasPorMesCanal,
    productos,
    diferenciaCajaVentas,
    comprasVsConsumo: comprasVsConsumoUltimosMeses(data, hoy),
    pendientesEntrega,
  };
}
