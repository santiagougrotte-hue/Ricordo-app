// Lógica de negocio sobre el esquema V2 (lib/types-v2.ts). Reemplaza, para los datos ya
// migrados, todo lo que en lib/calc.ts dependía de la convivencia de dos fuentes de receta
// (RecetaLinea vs receta_masa_unidad/receta_relleno_unidad) — en V2 hay una sola Receta por
// producto base, heredada por sus variantes vía receta_items + ajustes_receta_variante, así que
// el costeo es una sola función en vez de costoLegacy/costoDerivado/estaMigrado.
//
// Convención load-bearing para Finanzas (ver `migrarFinanzas` en lib/migration/v2.ts): un
// movimiento financiero categorizado "Costo Fijo — …" es recurrente (aplica a cualquier mes
// mientras esté confirmado, igual que el CostoFijo viejo, que tampoco tenía mes/año propio);
// uno categorizado "Costo Indirecto — …" es puntual del (mes, año) de su fecha, igual que el
// CostoIndirecto viejo.

import type {
  RicordoDataV2,
  ProductoVariante,
  Pedido,
  PedidoItem,
  Categoria,
  EtapaReceta,
  Activo,
  Canal,
} from "./types-v2";
import { fARS, fFechaCorta, fNum, fPct, inPeriod, inYear, isAfter } from "./calc";

export { fARS, fFechaCorta, fNum, fPct, inPeriod, inYear, isAfter };

function nombreCategoria(data: RicordoDataV2, categoriaId: string | undefined): string {
  if (!categoriaId) return "";
  return data.categorias.find((c) => c.id === categoriaId)?.nombre ?? "";
}

// --- Costeo de productos -------------------------------------------------------------------------

export interface ItemRecetaEfectiva {
  insumo_id: string;
  cantidad: number;
  etapa: EtapaReceta;
}

/** Receta completa de una variante ya resuelta: hereda de la receta compartida del producto
 * base (escalada × unidades_por_paquete) o usa su propia receta standalone (si nunca se migró a
 * una familia con receta compartida), + ajustes propios (reemplaza/suma/resta) + complementos
 * (recetas de otros productos base sumadas con su propia cantidad). */
export function recetaEfectivaVariante(data: RicordoDataV2, variante: ProductoVariante): ItemRecetaEfectiva[] {
  const recetaCompartida = data.recetas.find((r) => r.producto_id === variante.producto_id);
  const recetaPropia = recetaCompartida ? undefined : data.recetas.find((r) => r.producto_id === variante.id);
  const receta = recetaCompartida ?? recetaPropia;
  if (!receta) return [];

  const factor = receta === recetaCompartida ? variante.unidades_por_paquete ?? 0 : 1;
  const items: ItemRecetaEfectiva[] = data.receta_items
    .filter((i) => i.receta_id === receta.id)
    .map((i) => ({ insumo_id: i.insumo_id, cantidad: i.cantidad * factor, etapa: i.etapa }));

  for (const ajuste of data.ajustes_receta_variante.filter((a) => a.variante_id === variante.id)) {
    const idx = items.findIndex((it) => it.insumo_id === ajuste.insumo_id && (!ajuste.etapa || it.etapa === ajuste.etapa));
    if (ajuste.operacion === "reemplazar") {
      if (idx >= 0) items[idx] = { ...items[idx], cantidad: ajuste.cantidad };
      else items.push({ insumo_id: ajuste.insumo_id, cantidad: ajuste.cantidad, etapa: ajuste.etapa ?? "masa" });
    } else if (ajuste.operacion === "sumar") {
      if (idx >= 0) items[idx] = { ...items[idx], cantidad: items[idx].cantidad + ajuste.cantidad };
      else items.push({ insumo_id: ajuste.insumo_id, cantidad: ajuste.cantidad, etapa: ajuste.etapa ?? "masa" });
    } else if (idx >= 0) {
      items[idx] = { ...items[idx], cantidad: items[idx].cantidad - ajuste.cantidad };
    }
  }

  for (const complemento of data.complementos_variante.filter((c) => c.variante_id === variante.id)) {
    const recetaComplemento = data.recetas.find((r) => r.producto_id === complemento.producto_id);
    if (!recetaComplemento) continue;
    for (const item of data.receta_items.filter((i) => i.receta_id === recetaComplemento.id)) {
      items.push({ insumo_id: item.insumo_id, cantidad: item.cantidad * complemento.cantidad, etapa: item.etapa });
    }
  }

  return items;
}

export function costoVariante(data: RicordoDataV2, varianteId: string): number {
  const variante = data.producto_variantes.find((v) => v.id === varianteId);
  if (!variante) return 0;
  const total = recetaEfectivaVariante(data, variante).reduce((acc, item) => {
    const insumo = data.insumos.find((i) => i.id === item.insumo_id);
    return acc + item.cantidad * (insumo?.precio_actual ?? 0);
  }, 0);
  return Math.round(total);
}

export function margenVariante(data: RicordoDataV2, variante: ProductoVariante): number {
  return variante.precio_venta > 0 ? ((variante.precio_venta - costoVariante(data, variante.id)) / variante.precio_venta) * 100 : 0;
}

export interface ProductoConVariantes {
  producto: RicordoDataV2["productos"][number];
  variantes: ProductoVariante[];
}

export function productosConVariantes(data: RicordoDataV2): ProductoConVariantes[] {
  return data.productos.map((producto) => ({
    producto,
    variantes: data.producto_variantes.filter((v) => v.producto_id === producto.id),
  }));
}

// --- Stock ------------------------------------------------------------------------------------

/** Stock reconstruido 100% desde el libro de movimientos: un movimiento "conteo" resetea el
 * saldo conocido a esa fecha (su `cantidad` es el valor observado, no un delta); todo lo demás
 * (compra +, producción +, consumo/venta -, ajuste con su signo) se suma desde ahí en adelante. */
export function calcularStock(
  data: RicordoDataV2,
  itemTipo: "insumo" | "producto_variante",
  itemId: string,
  hastaFecha?: string
): number {
  const movimientos = data.inventario_movimientos
    .filter((m) => m.item_tipo === itemTipo && m.item_id === itemId && (!hastaFecha || m.fecha <= hastaFecha))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  let ultimoConteoIdx = -1;
  for (let i = movimientos.length - 1; i >= 0; i--) {
    if (movimientos[i].tipo === "conteo") {
      ultimoConteoIdx = i;
      break;
    }
  }
  if (ultimoConteoIdx === -1) return movimientos.reduce((acc, m) => acc + m.cantidad, 0);
  const base = movimientos[ultimoConteoIdx].cantidad;
  const posteriores = movimientos.slice(ultimoConteoIdx + 1);
  return base + posteriores.reduce((acc, m) => acc + m.cantidad, 0);
}

export function valorStockInsumos(data: RicordoDataV2, hastaFecha?: string): number {
  return data.insumos
    .filter((i) => i.controla_stock)
    .reduce((acc, i) => acc + calcularStock(data, "insumo", i.id, hastaFecha) * i.precio_actual, 0);
}

/** Valorización ESTIMADA del inventario de productos terminados: usa el costo de receta vigente
 * (costoVariante, precios actuales), no un costo histórico congelado al momento de producir —
 * el esquema no guarda ese dato por movimiento. Ver `calcularComprasCmvInventario`, que expone
 * esta limitación explícitamente en vez de esconderla. */
export function valorStockProductos(data: RicordoDataV2, hastaFecha?: string): number {
  return data.producto_variantes.reduce((acc, v) => acc + calcularStock(data, "producto_variante", v.id, hastaFecha) * costoVariante(data, v.id), 0);
}

// --- Finanzas -----------------------------------------------------------------------------------

function movimientosPorPrefijoCategoria(data: RicordoDataV2, prefijo: string) {
  return data.movimientos_financieros.filter((m) => nombreCategoria(data, m.categoria_id).startsWith(prefijo));
}

/** Recurrentes: no tienen mes/año propio (igual que CostoFijo en el esquema viejo) — aplican a
 * cualquier período mientras estén confirmados. */
export function totalCostosFijosRecurrentes(data: RicordoDataV2): number {
  return movimientosPorPrefijoCategoria(data, "Costo Fijo — ")
    .filter((m) => m.estado === "confirmado")
    .reduce((acc, m) => acc + m.monto, 0);
}

export function totalCostosIndirectosPorTipo(data: RicordoDataV2, mes: number, anio: number, tipo: "Fijo" | "Variable"): number {
  return movimientosPorPrefijoCategoria(data, `Costo Indirecto — ${tipo}`)
    .filter((m) => inPeriod(m.fecha, mes, anio))
    .reduce((acc, m) => acc + m.monto, 0);
}

export function totalGastosOperativos(data: RicordoDataV2, mes: number, anio: number): number {
  return movimientosPorPrefijoCategoria(data, "Gasto Operativo — ")
    .filter((m) => inPeriod(m.fecha, mes, anio))
    .reduce((acc, m) => acc + m.monto, 0);
}

export function cuotaMensualActivo(a: Activo): number {
  return a.amortizacion_mensual;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function activoActivoEnPeriodo(a: Activo, mes: number, anio: number): boolean {
  const inicio = new Date(a.fecha_compra);
  const inicioMes = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
  const fin = addMonths(inicio, a.vida_util_meses);
  const targetStart = new Date(anio, mes - 1, 1);
  return targetStart >= inicioMes && targetStart < new Date(fin.getFullYear(), fin.getMonth(), 1);
}

export function totalAmortizacionesPeriodo(data: RicordoDataV2, mes: number, anio: number): number {
  return data.activos
    .filter((a) => a.activo && activoActivoEnPeriodo(a, mes, anio))
    .reduce((acc, a) => acc + cuotaMensualActivo(a), 0);
}

export function costosFijosTotales(data: RicordoDataV2, mes: number, anio: number): number {
  return totalCostosFijosRecurrentes(data) + totalCostosIndirectosPorTipo(data, mes, anio, "Fijo") + totalAmortizacionesPeriodo(data, mes, anio);
}

export function totalCostoEnvio(pedidos: Pedido[]): number {
  return pedidos.reduce((acc, p) => acc + (p.costo_envio || 0), 0);
}

// --- Ventas / CMV / EERR --------------------------------------------------------------------------

export const ESTADOS_CMV: Pedido["estado"][] = ["Entregado"];

export function costoPedidoItem(data: RicordoDataV2, item: PedidoItem): number {
  if (!item.producto_variante_id) return 0;
  return costoVariante(data, item.producto_variante_id) * item.cantidad;
}

export function cmvPeriodo(data: RicordoDataV2, pedidos: Pedido[]): number {
  const idsPedidos = new Set(pedidos.filter((p) => p.estado === "Entregado").map((p) => p.id));
  return data.pedido_items.filter((i) => idsPedidos.has(i.pedido_id)).reduce((acc, i) => acc + costoPedidoItem(data, i), 0);
}

export function ventasNetas(pedidos: Pedido[]): number {
  return pedidos.reduce((acc, p) => acc + p.total, 0);
}

export function costosVariablesTotales(data: RicordoDataV2, pedidos: Pedido[], mes: number, anio: number): number {
  return cmvPeriodo(data, pedidos) + totalCostoEnvio(pedidos) + totalCostosIndirectosPorTipo(data, mes, anio, "Variable");
}

export function cmvAcumulado(data: RicordoDataV2): number {
  const post = data.pedidos.filter((p) => p.estado === "Entregado" && isAfter(p.fecha, data.configuracion.fecha_corte_cmv));
  return (data.configuracion.saldo_inicial_cmv ?? 0) + cmvPeriodo(data, post);
}

export function comprasAcumuladas(data: RicordoDataV2): number {
  const post = data.compras.filter((c) => isAfter(c.fecha, data.configuracion.fecha_corte_compras));
  return (data.configuracion.saldo_inicial_compras ?? 0) + post.reduce((acc, c) => acc + c.total, 0);
}

/** Orígenes que representan un movimiento real de efectivo/banco (a diferencia de un registro
 * puramente contable como "Costo Fijo"/"Costo Indirecto"/"Gasto Operativo", que nunca tocaba
 * `caja_movimientos` en el esquema viejo tampoco). Load-bearing: toda pantalla nueva que registre
 * un cobro/pago/inversión real (Operaciones → marcar compra pagada, Finanzas → movimiento manual
 * de caja o alta de un activo) debe etiquetar `origen_tipo` con uno de estos valores para que
 * `saldoCaja` y `calcularFlujoCaja` lo cuenten. Importante: entregar un pedido NO genera caja por
 * sí solo — "venta_pedido" recién se usa cuando se registra el cobro real (Finanzas → Cuentas
 * pendientes), nunca automáticamente al marcar Entregado (una venta entregada y no cobrada sigue
 * siendo una cuenta por cobrar, no plata en la cuenta). */
export const ORIGENES_CAJA_REAL = ["caja_movimiento_legacy", "venta_pedido", "compra_pago", "compra_activo", "caja_manual"];

/** "Caja" es el movimiento real de efectivo/banco — no toda `movimientos_financieros` afecta
 * caja: un "Costo Fijo"/"Costo Indirecto"/"Gasto Operativo" es un registro contable para EERR,
 * no necesariamente un pago ya hecho. Solo cuentan acá los movimientos con un origen de caja real
 * (ver `ORIGENES_CAJA_REAL`) o una transferencia entre cuentas propias. */
export function saldoCaja(data: RicordoDataV2): number {
  const movs = data.movimientos_financieros
    .filter((m) => (m.origen_tipo && ORIGENES_CAJA_REAL.includes(m.origen_tipo)) || m.tipo === "transferencia")
    .reduce((acc, m) => {
      if (m.tipo === "ingreso") return acc + m.monto;
      if (m.tipo === "egreso") return acc - m.monto;
      return acc; // transferencia: neutra para el total agregado (entra a una cuenta propia y sale de otra)
    }, 0);
  return (data.configuracion.saldo_inicial_caja ?? 0) + movs;
}

// --- Punto de equilibrio ---------------------------------------------------------------------------

export function margenContribucionUnitario(data: RicordoDataV2, varianteId: string, precioVenta: number): number {
  return precioVenta - costoVariante(data, varianteId);
}

export function puntoEquilibrio(
  data: RicordoDataV2,
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
  const idsPedidos = new Set(pedidosPeriodo.map((p) => p.id));
  const itemsPeriodo = data.pedido_items.filter((i) => idsPedidos.has(i.pedido_id));
  const unidadesPorVariante = new Map<string, number>();
  for (const item of itemsPeriodo) {
    if (!item.producto_variante_id) continue;
    unidadesPorVariante.set(item.producto_variante_id, (unidadesPorVariante.get(item.producto_variante_id) ?? 0) + item.cantidad);
  }
  let sumaMcxQ = 0;
  let sumaQ = 0;
  let sumaPxQ = 0;
  for (const [varianteId, q] of unidadesPorVariante.entries()) {
    const variante = data.producto_variantes.find((v) => v.id === varianteId);
    if (!variante) continue;
    const mc = margenContribucionUnitario(data, varianteId, variante.precio_venta);
    sumaMcxQ += mc * q;
    sumaQ += q;
    sumaPxQ += variante.precio_venta * q;
  }
  const margenPromedioPonderado = sumaQ > 0 ? sumaMcxQ / sumaQ : 0;
  const ratioContribucion = sumaPxQ > 0 ? sumaMcxQ / sumaPxQ : 0;
  const pe = ratioContribucion > 0 ? cfTotal / ratioContribucion : 0;
  const precioPromedioPonderado = sumaQ > 0 ? sumaPxQ / sumaQ : 0;
  const costoVariableUnitarioPromedio = precioPromedioPonderado - margenPromedioPonderado;
  return { pe, margenPromedioPonderado, cfTotal, precioPromedioPonderado, costoVariableUnitarioPromedio, unidadesTotales: sumaQ };
}

// --- Categorías ------------------------------------------------------------------------------------

export function categoriasPorAmbito(data: RicordoDataV2, ambito: Categoria["ambito"]): Categoria[] {
  return data.categorias.filter((c) => c.ambito === ambito && c.activo);
}

// --- Recurrencia / discrepancias --------------------------------------------------------------------

export interface DiscrepanciaCaja {
  pedido: Pedido;
  movimiento: RicordoDataV2["movimientos_financieros"][number] | null;
}

/** Pedidos entregados cuyo ingreso de caja no existe o no coincide con el total del pedido,
 * excluyendo los ya confirmados como intencionalmente sin cobrar. */
export function discrepanciasCaja(data: RicordoDataV2): DiscrepanciaCaja[] {
  const ignorados = new Set(data.configuracion.conciliacion_ignorados ?? []);
  return data.pedidos
    .filter((p) => p.estado === "Entregado" && !ignorados.has(p.id))
    .map((p) => ({ pedido: p, movimiento: data.movimientos_financieros.find((m) => m.origen_id === p.id) ?? null }))
    .filter(({ pedido, movimiento }) => !movimiento || movimiento.monto !== pedido.total);
}

export function unidadesEntregadas(data: RicordoDataV2, pedidos: Pedido[]): number {
  const idsEntregados = new Set(pedidos.filter((p) => p.estado === "Entregado").map((p) => p.id));
  return data.pedido_items.filter((i) => idsEntregados.has(i.pedido_id)).reduce((acc, i) => acc + i.cantidad, 0);
}

// --- EERR (Estado de Resultados) -----------------------------------------------------------------
// Vista devengada, nunca de caja: la venta se reconoce solo cuando el pedido está Entregado (mismo
// criterio que ya usa cmvPeriodo/ESTADOS_CMV en toda la app, así ingreso y costo del mismo pedido
// caen siempre en el mismo período) y el CMV sale de la receta efectiva de cada variante, nunca de
// las compras. Decisión de negocio confirmada con el usuario: el "costo real de envío" se muestra
// igual al monto cobrado al cliente (no hay dato de km/combustible por pedido en el esquema, no se
// migró del viejo) — por eso el envío suma a Ventas netas y resta el mismo importe en Costos
// indirectos variables, dejando margen $0 en el envío hasta que exista un costo real distinto.
// "Otros ingresos y gastos" e "Impuestos" quedan en cero: no hay ninguna fuente de datos para esas
// dos líneas todavía (también confirmado con el usuario) — nunca se inventa un valor.

export interface EerrRegistro {
  fecha: string;
  concepto: string;
  monto: number;
}

export interface EerrLinea {
  total: number;
  registros: EerrRegistro[];
}

export interface Eerr {
  ventas_brutas: EerrLinea;
  descuentos: EerrLinea;
  envios_cobrados: EerrLinea;
  ventas_netas: number;
  cmv: EerrLinea;
  resultado_bruto: number;
  margen_bruto_pct: number | null;
  costos_indirectos_variables: EerrLinea;
  gastos_operativos: EerrLinea;
  costos_fijos: EerrLinea;
  amortizaciones: EerrLinea;
  resultado_operativo: number;
  margen_operativo_pct: number | null;
  otros_ingresos_gastos: EerrLinea;
  impuestos: EerrLinea;
  resultado_neto: number;
  margen_neto_pct: number | null;
}

/** Meses (mes/año) que un rango de fechas toca, aunque sea parcialmente — un costo fijo recurrente
 * o una amortización se cuentan una vez por cada mes que el rango pisa, sin prorratear por día
 * (el esquema no guarda desde/hasta exacto de un costo fijo, ver migrarFinanzas). */
export function mesesEnRango(desde: string, hasta: string): { mes: number; anio: number }[] {
  const inicio = new Date(`${desde}T00:00:00`);
  const fin = new Date(`${hasta}T00:00:00`);
  const meses: { mes: number; anio: number }[] = [];
  let cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
  const limite = new Date(fin.getFullYear(), fin.getMonth(), 1);
  while (cursor <= limite) {
    meses.push({ mes: cursor.getMonth() + 1, anio: cursor.getFullYear() });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return meses;
}

// --- Utilidades de fecha compartidas por las vistas de Finanzas basadas en rango ------------------

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
export function primerDiaMes(mes: number, anio: number): string {
  return `${anio}-${pad2(mes)}-01`;
}
export function ultimoDiaMes(mes: number, anio: number): string {
  return `${anio}-${pad2(mes)}-${pad2(new Date(anio, mes, 0).getDate())}`;
}
export function mesAnterior(mes: number, anio: number): { mes: number; anio: number } {
  return mes === 1 ? { mes: 12, anio: anio - 1 } : { mes: mes - 1, anio };
}
export function sumarDias(fechaIso: string, dias: number): string {
  const d = new Date(`${fechaIso}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** null en vez de 0 cuando no hay ventas netas — evita mostrar un margen que parece un dato real
 * cuando en realidad no hay nada para calcularlo (pedido explícito de no ser "engañoso"). */
function margenSeguro(resultado: number, ventasNetas: number): number | null {
  return ventasNetas > 0 ? (resultado / ventasNetas) * 100 : null;
}

export function calcularEerr(data: RicordoDataV2, desde: string, hasta: string, canal?: Canal): Eerr {
  const pedidosPeriodo = data.pedidos.filter(
    (p) => p.estado === "Entregado" && p.fecha >= desde && p.fecha <= hasta && (!canal || p.canal === canal)
  );
  const idsPedidos = new Set(pedidosPeriodo.map((p) => p.id));
  const itemsPeriodo = data.pedido_items.filter((i) => idsPedidos.has(i.pedido_id));
  const fechaDePedido = (pedidoId: string) => pedidosPeriodo.find((p) => p.id === pedidoId)?.fecha ?? "";

  const ventas_brutas: EerrLinea = {
    total: Math.round(itemsPeriodo.reduce((acc, i) => acc + i.precio_unitario * i.cantidad, 0)),
    registros: itemsPeriodo.map((i) => ({ fecha: fechaDePedido(i.pedido_id), concepto: i.nombre_historico, monto: Math.round(i.precio_unitario * i.cantidad) })),
  };

  const descuentos: EerrLinea = {
    total: Math.round(itemsPeriodo.reduce((acc, i) => acc + i.descuento, 0) + pedidosPeriodo.reduce((acc, p) => acc + p.descuento, 0)),
    registros: [
      ...itemsPeriodo.filter((i) => i.descuento > 0).map((i) => ({ fecha: fechaDePedido(i.pedido_id), concepto: `Descuento en ${i.nombre_historico}`, monto: i.descuento })),
      ...pedidosPeriodo.filter((p) => p.descuento > 0).map((p) => ({ fecha: p.fecha, concepto: `Descuento del pedido ${p.id}`, monto: p.descuento })),
    ],
  };

  const envios_cobrados: EerrLinea = {
    total: Math.round(pedidosPeriodo.reduce((acc, p) => acc + p.costo_envio, 0)),
    registros: pedidosPeriodo.filter((p) => p.costo_envio > 0).map((p) => ({ fecha: p.fecha, concepto: `Envío cobrado — pedido ${p.id}`, monto: p.costo_envio })),
  };

  const ventas_netas = ventas_brutas.total - descuentos.total + envios_cobrados.total;

  const cmv: EerrLinea = {
    total: Math.round(itemsPeriodo.reduce((acc, i) => acc + costoPedidoItem(data, i), 0)),
    registros: itemsPeriodo
      .filter((i) => i.producto_variante_id)
      .map((i) => ({ fecha: fechaDePedido(i.pedido_id), concepto: `CMV — ${i.nombre_historico}`, monto: costoPedidoItem(data, i) })),
  };
  const resultado_bruto = ventas_netas - cmv.total;
  const margen_bruto_pct = margenSeguro(resultado_bruto, ventas_netas);

  const movsIndirectosVariables = data.movimientos_financieros.filter(
    (m) => nombreCategoria(data, m.categoria_id).startsWith("Costo Indirecto — Variable") && m.fecha >= desde && m.fecha <= hasta
  );
  const costos_indirectos_variables: EerrLinea = {
    // Costo real de envío = mismo monto cobrado al cliente (decisión confirmada, ver comentario de arriba).
    total: Math.round(envios_cobrados.total + movsIndirectosVariables.reduce((acc, m) => acc + m.monto, 0)),
    registros: [
      ...envios_cobrados.registros.map((r) => ({ ...r, concepto: `Costo real de envío (= cobrado) — ${r.concepto.replace("Envío cobrado — ", "")}` })),
      ...movsIndirectosVariables.map((m) => ({ fecha: m.fecha, concepto: m.concepto, monto: m.monto })),
    ],
  };

  const movsGastosOperativos = data.movimientos_financieros.filter(
    (m) => nombreCategoria(data, m.categoria_id).startsWith("Gasto Operativo — ") && m.fecha >= desde && m.fecha <= hasta
  );
  const gastos_operativos: EerrLinea = {
    total: Math.round(movsGastosOperativos.reduce((acc, m) => acc + m.monto, 0)),
    registros: movsGastosOperativos.map((m) => ({ fecha: m.fecha, concepto: m.concepto, monto: m.monto })),
  };

  const meses = mesesEnRango(desde, hasta);
  const movsCostosFijos = data.movimientos_financieros.filter((m) => nombreCategoria(data, m.categoria_id).startsWith("Costo Fijo — ") && m.estado === "confirmado");
  const costos_fijos: EerrLinea = {
    total: Math.round(totalCostosFijosRecurrentes(data) * meses.length),
    registros: meses.flatMap((per) =>
      movsCostosFijos.map((m) => ({ fecha: `${per.anio}-${String(per.mes).padStart(2, "0")}`, concepto: `${m.concepto} (recurrente)`, monto: m.monto }))
    ),
  };

  const amortizaciones: EerrLinea = {
    total: Math.round(meses.reduce((acc, per) => acc + totalAmortizacionesPeriodo(data, per.mes, per.anio), 0)),
    registros: meses.flatMap((per) =>
      data.activos
        .filter((a) => a.activo && activoActivoEnPeriodo(a, per.mes, per.anio))
        .map((a) => ({ fecha: `${per.anio}-${String(per.mes).padStart(2, "0")}`, concepto: a.nombre, monto: a.amortizacion_mensual }))
    ),
  };

  const resultado_operativo = resultado_bruto - costos_indirectos_variables.total - gastos_operativos.total - costos_fijos.total - amortizaciones.total;
  const margen_operativo_pct = margenSeguro(resultado_operativo, ventas_netas);

  // Sin fuente de datos todavía — nunca se inventa un valor, quedan en cero hasta que exista un
  // origen real (ver comentario de arriba, decisión confirmada con el usuario).
  const otros_ingresos_gastos: EerrLinea = { total: 0, registros: [] };
  const impuestos: EerrLinea = { total: 0, registros: [] };
  const resultado_neto = resultado_operativo + otros_ingresos_gastos.total - impuestos.total;
  const margen_neto_pct = margenSeguro(resultado_neto, ventas_netas);

  return {
    ventas_brutas,
    descuentos,
    envios_cobrados,
    ventas_netas,
    cmv,
    resultado_bruto,
    margen_bruto_pct,
    costos_indirectos_variables,
    gastos_operativos,
    costos_fijos,
    amortizaciones,
    resultado_operativo,
    margen_operativo_pct,
    otros_ingresos_gastos,
    impuestos,
    resultado_neto,
    margen_neto_pct,
  };
}

// --- Compras, CMV e Inventario (conciliación) -----------------------------------------------------
// Explica la diferencia entre "cuánto se compró" y "cuánto costaron los productos vendidos" a
// través del libro único de inventario — una compra nunca se toma directamente como CMV (alimenta
// el stock; el CMV sale de lo efectivamente vendido, igual que en calcularEerr). La valorización
// de inventario de productos terminados usa el costo de receta VIGENTE (costoVariante con precios
// actuales), no un costo histórico congelado al momento de producir — el esquema no guarda ese
// dato por movimiento — por eso se marca "estimado" en toda esta sección, tal como se acordó.

export interface AlertaInventario {
  severidad: "alta" | "media";
  mensaje: string;
}

export interface ComprasCmvInventario {
  compras: EerrLinea;
  consumo: EerrLinea;
  cmv: EerrLinea;
  produccion: EerrLinea;
  inventario_insumos_inicial: number;
  inventario_insumos_final: number;
  variacion_inventario_insumos: number;
  inventario_productos_inicial: number;
  inventario_productos_final: number;
  variacion_inventario_productos: number;
  ajustes_conteo: EerrLinea;
  mermas: EerrLinea;
  consumo_teorico: number;
  diferencia_no_explicada: number;
  cmv_conciliado_estimado: number;
  alertas: AlertaInventario[];
  dias_desde_ultimo_conteo: number | null;
}

/** Cuánto difería el stock calculado (con todo lo anterior a esa fecha, sin este conteo) del
 * valor realmente contado. Simplificación: compara contra el día anterior — el esquema no guarda
 * hora, solo fecha, así que dos movimientos el mismo día no se pueden ordenar entre sí. */
function diferenciaConteo(data: RicordoDataV2, movimiento: RicordoDataV2["inventario_movimientos"][number]): number {
  const stockAntes = calcularStock(data, movimiento.item_tipo, movimiento.item_id, sumarDias(movimiento.fecha, -1));
  return movimiento.cantidad - stockAntes;
}

function valorMovimiento(data: RicordoDataV2, m: RicordoDataV2["inventario_movimientos"][number]): number {
  if (m.item_tipo === "insumo") {
    const insumo = data.insumos.find((i) => i.id === m.item_id);
    return Math.abs(m.cantidad) * (insumo?.precio_actual ?? 0);
  }
  return Math.abs(m.cantidad) * costoVariante(data, m.item_id);
}

function nombreItemMovimiento(data: RicordoDataV2, m: RicordoDataV2["inventario_movimientos"][number]): string {
  if (m.item_tipo === "insumo") return data.insumos.find((i) => i.id === m.item_id)?.nombre ?? "(insumo eliminado)";
  return data.producto_variantes.find((v) => v.id === m.item_id)?.nombre ?? "(producto eliminado)";
}

export function calcularComprasCmvInventario(data: RicordoDataV2, desde: string, hasta: string): ComprasCmvInventario {
  const diaAnterior = sumarDias(desde, -1);

  const comprasPeriodo = data.compras.filter((c) => c.fecha >= desde && c.fecha <= hasta);
  const idsComprasPeriodo = new Set(comprasPeriodo.map((c) => c.id));
  const itemsComprasPeriodo = data.compra_items.filter((i) => idsComprasPeriodo.has(i.compra_id));
  const compras: EerrLinea = {
    total: Math.round(itemsComprasPeriodo.reduce((acc, i) => acc + i.subtotal, 0)),
    registros: itemsComprasPeriodo.map((i) => {
      const compra = comprasPeriodo.find((c) => c.id === i.compra_id);
      const insumo = data.insumos.find((ins) => ins.id === i.insumo_id);
      return { fecha: compra?.fecha ?? "", concepto: `Compra — ${insumo?.nombre ?? "(insumo eliminado)"}`, monto: i.subtotal };
    }),
  };

  const movsConsumo = data.inventario_movimientos.filter((m) => m.tipo === "consumo" && m.item_tipo === "insumo" && m.fecha >= desde && m.fecha <= hasta);
  const consumo: EerrLinea = {
    total: Math.round(movsConsumo.reduce((acc, m) => acc + valorMovimiento(data, m), 0)),
    registros: movsConsumo.map((m) => ({ fecha: m.fecha, concepto: `Consumo — ${nombreItemMovimiento(data, m)}`, monto: valorMovimiento(data, m) })),
  };

  // Mismo cálculo que calcularEerr — una sola fuente de verdad para el CMV, nunca se duplica.
  const cmv = calcularEerr(data, desde, hasta).cmv;

  const produccionPeriodo = data.produccion.filter((p) => p.fecha >= desde && p.fecha <= hasta);
  const produccion: EerrLinea = {
    total: Math.round(produccionPeriodo.reduce((acc, p) => acc + costoVariante(data, p.producto_variante_id) * p.cantidad, 0)),
    registros: produccionPeriodo.map((p) => ({
      fecha: p.fecha,
      concepto: `Producción — ${data.producto_variantes.find((v) => v.id === p.producto_variante_id)?.nombre ?? "(producto eliminado)"}`,
      monto: costoVariante(data, p.producto_variante_id) * p.cantidad,
    })),
  };

  const inventario_insumos_inicial = Math.round(valorStockInsumos(data, diaAnterior));
  const inventario_insumos_final = Math.round(valorStockInsumos(data, hasta));
  const inventario_productos_inicial = Math.round(valorStockProductos(data, diaAnterior));
  const inventario_productos_final = Math.round(valorStockProductos(data, hasta));
  const variacion_inventario_insumos = inventario_insumos_final - inventario_insumos_inicial;
  const variacion_inventario_productos = inventario_productos_final - inventario_productos_inicial;

  const movsConteo = data.inventario_movimientos.filter((m) => m.tipo === "conteo" && m.fecha >= desde && m.fecha <= hasta);
  const ajustes_conteo: EerrLinea = {
    total: Math.round(
      movsConteo.reduce((acc, m) => {
        const diff = diferenciaConteo(data, m);
        const precio = m.item_tipo === "insumo" ? (data.insumos.find((i) => i.id === m.item_id)?.precio_actual ?? 0) : costoVariante(data, m.item_id);
        return acc + diff * precio;
      }, 0)
    ),
    registros: movsConteo.map((m) => {
      const diff = diferenciaConteo(data, m);
      const precio = m.item_tipo === "insumo" ? (data.insumos.find((i) => i.id === m.item_id)?.precio_actual ?? 0) : costoVariante(data, m.item_id);
      return {
        fecha: m.fecha,
        concepto: `Conteo — ${nombreItemMovimiento(data, m)} (contado ${m.cantidad}, diferencia ${diff >= 0 ? "+" : ""}${diff.toFixed(2)})`,
        monto: diff * precio,
      };
    }),
  };

  const movsMerma = data.inventario_movimientos.filter((m) => m.tipo === "merma" && m.fecha >= desde && m.fecha <= hasta);
  const mermas: EerrLinea = {
    total: Math.round(movsMerma.reduce((acc, m) => acc + valorMovimiento(data, m), 0)),
    registros: movsMerma.map((m) => ({ fecha: m.fecha, concepto: `Merma — ${nombreItemMovimiento(data, m)}`, monto: valorMovimiento(data, m) })),
  };

  // Conciliación de insumos: inicial + compras − final = consumo teórico del período. El consumo
  // teórico debería explicarse por lo vendido (CMV) + lo que quedó en stock de productos
  // (variación) + mermas + ajustes de conteo; lo que sobra queda como diferencia sin explicar.
  const consumo_teorico = Math.round(inventario_insumos_inicial + compras.total - inventario_insumos_final);
  const mermasInsumos = Math.round(movsMerma.filter((m) => m.item_tipo === "insumo").reduce((acc, m) => acc + valorMovimiento(data, m), 0));
  const diferencia_no_explicada = Math.round(consumo_teorico - cmv.total - variacion_inventario_productos - mermasInsumos - ajustes_conteo.total);

  // Conciliación del CMV: inicial de productos + costo de producción − final de productos = CMV
  // (estimado, ver comentario de arriba sobre la valorización con costo vigente).
  const cmv_conciliado_estimado = Math.round(inventario_productos_inicial + produccion.total - inventario_productos_final);

  const alertas: AlertaInventario[] = [];
  if (cmv.total > 0 && compras.total > cmv.total * 2) {
    alertas.push({
      severidad: "media",
      mensaje: `Las compras del período (${compras.total}) más que duplican al CMV (${cmv.total}) — puede ser acumulación de inventario, compra anticipada o un cambio de precios, no necesariamente un error.`,
    });
  }
  if (compras.total > 0 && cmv.total > compras.total * 1.5) {
    alertas.push({
      severidad: "media",
      mensaje: `El CMV del período (${cmv.total}) supera ampliamente a las compras (${compras.total}) — puede estar consumiéndose stock acumulado de períodos anteriores.`,
    });
  }
  for (const i of data.insumos) {
    if (i.activo && i.precio_actual <= 0) alertas.push({ severidad: "alta", mensaje: `El insumo "${i.nombre}" no tiene precio cargado.` });
  }
  for (const p of data.productos.filter((prod) => prod.activo)) {
    if (!data.recetas.some((r) => r.producto_id === p.id)) {
      alertas.push({ severidad: "alta", mensaje: `El producto "${p.nombre}" no tiene ninguna receta cargada.` });
    }
  }
  for (const v of data.producto_variantes.filter((variante) => variante.activo)) {
    if (recetaEfectivaVariante(data, v).length === 0) {
      alertas.push({ severidad: "media", mensaje: `La variante "${v.nombre}" no resuelve ninguna receta (ni propia ni heredada del producto base).` });
    }
  }
  for (const i of data.insumos.filter((ins) => ins.controla_stock)) {
    if (calcularStock(data, "insumo", i.id, hasta) < 0) alertas.push({ severidad: "alta", mensaje: `Stock negativo en el insumo "${i.nombre}".` });
  }
  for (const v of data.producto_variantes) {
    if (calcularStock(data, "producto_variante", v.id, hasta) < 0) alertas.push({ severidad: "alta", mensaje: `Stock negativo en "${v.nombre}".` });
  }
  for (const ci of itemsComprasPeriodo) {
    const insumo = data.insumos.find((i) => i.id === ci.insumo_id);
    if (ci.unidad && insumo && ci.unidad !== insumo.unidad) {
      alertas.push({
        severidad: "media",
        mensaje: `Una compra de "${insumo.nombre}" usa la unidad "${ci.unidad}" pero el insumo está cargado en "${insumo.unidad}".`,
      });
    }
  }
  for (const m of movsConteo) {
    const diff = diferenciaConteo(data, m);
    const stockAntes = calcularStock(data, m.item_tipo, m.item_id, sumarDias(m.fecha, -1));
    if (stockAntes !== 0 && Math.abs(diff) / Math.abs(stockAntes) > 0.2) {
      alertas.push({
        severidad: "media",
        mensaje: `Diferencia grande en el conteo de "${nombreItemMovimiento(data, m)}" del ${m.fecha}: contado ${m.cantidad}, calculado ${stockAntes.toFixed(2)} — puede ser merma, consumo no registrado o un error de conteo.`,
      });
    }
  }
  if (Math.abs(diferencia_no_explicada) > Math.max(1000, Math.abs(consumo_teorico) * 0.1)) {
    alertas.push({ severidad: "media", mensaje: `Queda una diferencia sin explicar de ${diferencia_no_explicada} en la conciliación de insumos del período.` });
  }

  const ultimoConteo = [...data.inventario_movimientos].filter((m) => m.tipo === "conteo").sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  const dias_desde_ultimo_conteo = ultimoConteo
    ? Math.round((new Date(`${hasta}T00:00:00`).getTime() - new Date(`${ultimoConteo.fecha}T00:00:00`).getTime()) / 86400000)
    : null;
  if (dias_desde_ultimo_conteo != null && dias_desde_ultimo_conteo > 7) {
    alertas.push({ severidad: "media", mensaje: `Pasaron ${dias_desde_ultimo_conteo} días desde el último conteo registrado (${ultimoConteo!.fecha}).` });
  }

  return {
    compras,
    consumo,
    cmv,
    produccion,
    inventario_insumos_inicial,
    inventario_insumos_final,
    variacion_inventario_insumos,
    inventario_productos_inicial,
    inventario_productos_final,
    variacion_inventario_productos,
    ajustes_conteo,
    mermas,
    consumo_teorico,
    diferencia_no_explicada,
    cmv_conciliado_estimado,
    alertas,
    dias_desde_ultimo_conteo,
  };
}

// --- Margen por sabor y canal ---------------------------------------------------------------------
// Identifica qué sabores/canales/presentaciones dejan más ganancia, no solo cuáles venden más.
// Agrupa siempre por producto_id (relación real por id — nunca por texto del nombre). El margen de
// contribución de acá NUNCA resta costos fijos ni amortización (eso se muestra en el EERR) — es
// puramente ventas netas − CMV − costo real de envío − comisiones − otros costos variables.
// "Comisiones del medio de pago" y "otros costos variables" no tienen ninguna fuente de datos en el
// esquema todavía: quedan siempre en $0, igual que Otros ingresos/gastos e Impuestos en el EERR —
// nunca se inventa un valor.

export type CriterioEnvioPedido = "ventas" | "unidades";

export interface MargenItemDetalle {
  pedido_id: string;
  item_id: string;
  fecha: string;
  producto_id: string | null;
  producto_nombre: string;
  variante_id: string | null;
  variante_nombre: string;
  canal: Canal;
  presentacion: string;
  cantidad: number;
  ventas_brutas: number;
  descuento: number;
  costo_envio: number;
  comisiones: number;
  cmv: number;
  ventas_netas: number;
  margen_contribucion: number;
  margen_pct: number | null;
}

/** Costo real de envío = mismo monto cobrado al cliente (misma convención que calcularEerr). Si un
 * pedido tiene varias líneas, ese único monto se reparte entre ellas según `criterioEnvio`
 * (proporcional a ventas netas de cada línea, o a sus unidades) — un solo criterio, documentado
 * acá, no dos números distintos según quién mire. Los descuentos generales del pedido (no los de
 * línea) se reparten siempre proporcional a ventas, para no descontar el mismo importe en cada
 * producto. */
export function calcularMargenPorItem(data: RicordoDataV2, desde: string, hasta: string, canal?: Canal, criterioEnvio: CriterioEnvioPedido = "ventas"): MargenItemDetalle[] {
  const pedidosPeriodo = data.pedidos.filter((p) => p.estado === "Entregado" && p.fecha >= desde && p.fecha <= hasta && (!canal || p.canal === canal));
  const resultado: MargenItemDetalle[] = [];

  for (const pedido of pedidosPeriodo) {
    const items = data.pedido_items.filter((i) => i.pedido_id === pedido.id);
    if (items.length === 0) continue;
    const totalBruto = items.reduce((acc, i) => acc + i.precio_unitario * i.cantidad, 0);
    const totalUnidades = items.reduce((acc, i) => acc + i.cantidad, 0);

    for (const item of items) {
      const bruto = item.precio_unitario * item.cantidad;
      const shareVentas = totalBruto > 0 ? bruto / totalBruto : 1 / items.length;
      const shareUnidades = totalUnidades > 0 ? item.cantidad / totalUnidades : 1 / items.length;
      const share = criterioEnvio === "ventas" ? shareVentas : shareUnidades;
      const descuento = Math.round(item.descuento + pedido.descuento * shareVentas);
      const costoEnvio = Math.round(pedido.costo_envio * share);
      const variante = item.producto_variante_id ? data.producto_variantes.find((v) => v.id === item.producto_variante_id) : undefined;
      const producto = variante ? data.productos.find((p) => p.id === variante.producto_id) : undefined;
      const cmv = costoPedidoItem(data, item);
      const ventasNetas = Math.round(bruto - descuento + costoEnvio);
      // Costo real de envío = mismo monto cobrado (política ya definida en calcularEerr) — entra
      // como ingreso arriba y sale acá como costo, dejando margen $0 en el envío por defecto.
      const margenContribucion = Math.round(ventasNetas - cmv - costoEnvio);

      resultado.push({
        pedido_id: pedido.id,
        item_id: item.id,
        fecha: pedido.fecha,
        producto_id: variante?.producto_id ?? null,
        producto_nombre: producto?.nombre ?? item.nombre_historico,
        variante_id: item.producto_variante_id,
        variante_nombre: variante?.nombre ?? item.nombre_historico,
        canal: pedido.canal,
        presentacion: variante?.presentacion || variante?.nombre || item.nombre_historico,
        cantidad: item.cantidad,
        ventas_brutas: Math.round(bruto),
        descuento,
        costo_envio: costoEnvio,
        comisiones: 0,
        cmv: Math.round(cmv),
        ventas_netas: ventasNetas,
        margen_contribucion: margenContribucion,
        margen_pct: ventasNetas > 0 ? (margenContribucion / ventasNetas) * 100 : null,
      });
    }
  }
  return resultado;
}

export type VistaMargen = "sabor" | "canal" | "presentacion" | "pedido";

export interface MargenAgrupado {
  clave: string;
  etiqueta: string;
  unidades: number;
  ventas_brutas: number;
  descuentos: number;
  ventas_netas: number;
  cmv: number;
  costo_envio: number;
  comisiones: number;
  margen_contribucion: number;
  margen_pct: number | null;
  items: MargenItemDetalle[];
}

export function agruparMargen(items: MargenItemDetalle[], vista: VistaMargen): MargenAgrupado[] {
  const grupos = new Map<string, MargenItemDetalle[]>();
  for (const it of items) {
    const clave = vista === "sabor" ? (it.producto_id ?? "sin-producto") : vista === "canal" ? it.canal : vista === "presentacion" ? it.presentacion : it.pedido_id;
    const lista = grupos.get(clave) ?? [];
    lista.push(it);
    grupos.set(clave, lista);
  }
  return [...grupos.entries()]
    .map(([clave, its]) => {
      const etiqueta = vista === "sabor" ? its[0].producto_nombre : vista === "pedido" ? `Pedido ${clave} — ${its[0].fecha}` : clave;
      const ventas_netas = its.reduce((acc, i) => acc + i.ventas_netas, 0);
      const margen_contribucion = its.reduce((acc, i) => acc + i.margen_contribucion, 0);
      return {
        clave,
        etiqueta,
        unidades: its.reduce((acc, i) => acc + i.cantidad, 0),
        ventas_brutas: its.reduce((acc, i) => acc + i.ventas_brutas, 0),
        descuentos: its.reduce((acc, i) => acc + i.descuento, 0),
        ventas_netas,
        cmv: its.reduce((acc, i) => acc + i.cmv, 0),
        costo_envio: its.reduce((acc, i) => acc + i.costo_envio, 0),
        comisiones: 0,
        margen_contribucion,
        margen_pct: ventas_netas > 0 ? (margen_contribucion / ventas_netas) * 100 : null,
        items: its,
      };
    })
    .sort((a, b) => b.margen_contribucion - a.margen_contribucion);
}

export interface ComparacionCanalSabor {
  producto_id: string;
  producto_nombre: string;
  margen_minorista: number;
  margen_mayorista: number;
  diferencia: number;
  margen_pct_minorista: number | null;
  margen_pct_mayorista: number | null;
}

export function compararCanalesPorSabor(items: MargenItemDetalle[]): ComparacionCanalSabor[] {
  const porProducto = new Map<string, MargenItemDetalle[]>();
  for (const it of items) {
    const key = it.producto_id ?? "sin-producto";
    const lista = porProducto.get(key) ?? [];
    lista.push(it);
    porProducto.set(key, lista);
  }
  return [...porProducto.entries()].map(([key, its]) => {
    const minorista = its.filter((i) => i.canal === "Minorista");
    const mayorista = its.filter((i) => i.canal === "Mayorista");
    const sum = (arr: MargenItemDetalle[], campo: "margen_contribucion" | "ventas_netas") => arr.reduce((acc, i) => acc + i[campo], 0);
    const margenMinorista = sum(minorista, "margen_contribucion");
    const margenMayorista = sum(mayorista, "margen_contribucion");
    const ventasMinorista = sum(minorista, "ventas_netas");
    const ventasMayorista = sum(mayorista, "ventas_netas");
    return {
      producto_id: key,
      producto_nombre: its[0].producto_nombre,
      margen_minorista: margenMinorista,
      margen_mayorista: margenMayorista,
      diferencia: margenMayorista - margenMinorista,
      margen_pct_minorista: ventasMinorista > 0 ? (margenMinorista / ventasMinorista) * 100 : null,
      margen_pct_mayorista: ventasMayorista > 0 ? (margenMayorista / ventasMayorista) * 100 : null,
    };
  });
}

export interface AlertaMargen {
  severidad: "alta" | "media";
  mensaje: string;
}

/** margenMinimoPct: umbral configurable (lo trae la pantalla) para la alerta de "margen inferior
 * al mínimo" — no hay un valor de negocio único correcto, queda a criterio de quien lo mira. */
export function alertasMargen(data: RicordoDataV2, items: MargenItemDetalle[], margenMinimoPct: number): AlertaMargen[] {
  const alertas: AlertaMargen[] = [];
  const porPedido = agruparMargen(items, "pedido");
  const porSabor = agruparMargen(items, "sabor");

  for (const p of porPedido) {
    if (p.margen_contribucion < 0) {
      alertas.push({ severidad: "alta", mensaje: `${p.etiqueta} tiene margen de contribución negativo (${p.margen_contribucion}).` });
    }
    // Bajo la política de costo real de envío = mismo monto cobrado, el envío entra como ingreso y
    // sale como costo por el mismo importe: nunca puede "eliminar" una ganancia (se cancela solo,
    // margen $0 en el envío). Lo que sí se puede detectar es que el envío represente una porción
    // muy grande de la venta bruta del pedido — una señal de riesgo real para cuando exista un
    // costo de envío distinto al cobrado.
    if (p.ventas_brutas > 0 && p.costo_envio / p.ventas_brutas > 0.3) {
      alertas.push({
        severidad: "media",
        mensaje: `${p.etiqueta}: el envío (${p.costo_envio}) representa más del 30% de la venta bruta (${p.ventas_brutas}) — revisar si conviene cobrarlo aparte o ajustar el precio.`,
      });
    }
  }
  for (const s of porSabor) {
    if (s.margen_pct != null && s.margen_pct < margenMinimoPct) {
      alertas.push({ severidad: "media", mensaje: `"${s.etiqueta}" tiene margen de ${s.margen_pct.toFixed(1)}%, por debajo del mínimo configurado (${margenMinimoPct}%).` });
    }
  }

  for (const i of data.insumos) {
    if (i.activo && i.precio_actual <= 0) alertas.push({ severidad: "alta", mensaje: `El insumo "${i.nombre}" no tiene precio cargado.` });
  }
  for (const p of data.productos.filter((prod) => prod.activo)) {
    if (!data.recetas.some((r) => r.producto_id === p.id)) alertas.push({ severidad: "alta", mensaje: `El producto "${p.nombre}" no tiene ninguna receta cargada.` });
  }
  for (const v of data.producto_variantes.filter((variante) => variante.activo)) {
    const compartida = data.recetas.find((r) => r.producto_id === v.producto_id);
    if (compartida && v.unidades_por_paquete == null) {
      alertas.push({
        severidad: "media",
        mensaje: `"${v.nombre}" no tiene "unidades por paquete" cargado — su receta hereda un factor de conversión de 0, el costo de esta presentación va a dar mal.`,
      });
    }
  }

  // Precio mayorista igual o demasiado cercano al minorista (comparando precio POR UNIDAD, no el
  // precio del paquete completo) — sin una justificación visible en los datos.
  for (const producto of data.productos) {
    const variantes = data.producto_variantes.filter((v) => v.producto_id === producto.id && v.activo);
    const minoristas = variantes.filter((v) => v.canal === "Minorista");
    const mayoristas = variantes.filter((v) => v.canal === "Mayorista");
    for (const min of minoristas) {
      const precioUnitMin = min.precio_venta / (min.unidades_por_paquete ?? 1);
      for (const may of mayoristas) {
        const precioUnitMay = may.precio_venta / (may.unidades_por_paquete ?? 1);
        if (precioUnitMin > 0 && precioUnitMay >= precioUnitMin * 0.9) {
          alertas.push({
            severidad: "media",
            mensaje: `En "${producto.nombre}": el precio mayorista por unidad (${precioUnitMay.toFixed(0)}) no es significativamente más barato que el minorista (${precioUnitMin.toFixed(0)}).`,
          });
        }
      }
    }
  }

  return alertas;
}

// --- Flujo de caja ---------------------------------------------------------------------------
// Explica cómo cambió la plata disponible — nunca se confunde con el resultado económico (EERR):
// acá solo entran movimientos con un origen de caja REAL (ver ORIGENES_CAJA_REAL) o transferencias.
// Una venta entregada no cobrada no aparece acá (no hay caja hasta que se registra el cobro real,
// en Cuentas pendientes); una compra confirmada no pagada tampoco. La compra de un activo entra
// como "Inversión" (ver ActivosTab, que ahora genera ese movimiento al crear un activo nuevo) sin
// afectar el EERR más que por su amortización mensual.

function esMovimientoCajaReal(m: RicordoDataV2["movimientos_financieros"][number]): boolean {
  return (!!m.origen_tipo && ORIGENES_CAJA_REAL.includes(m.origen_tipo)) || m.tipo === "transferencia";
}

function clasificarMovimientoCaja(m: RicordoDataV2["movimientos_financieros"][number]): "cobros_clientes" | "pagos_compras" | "inversiones" | "transferencias" | "otros_ingresos" | "gastos_pagados" {
  if (m.tipo === "transferencia") return "transferencias";
  if (m.origen_tipo === "venta_pedido") return "cobros_clientes";
  if (m.origen_tipo === "compra_pago") return "pagos_compras";
  if (m.origen_tipo === "compra_activo") return "inversiones";
  return m.tipo === "ingreso" ? "otros_ingresos" : "gastos_pagados";
}

/** Saldo de caja real hasta una fecha (inclusive) — mismo criterio que saldoCaja pero con corte de
 * fecha, para poder calcular saldo inicial/final de un período. */
function saldoCajaAlFecha(data: RicordoDataV2, hastaFecha?: string): number {
  const movs = data.movimientos_financieros
    .filter((m) => esMovimientoCajaReal(m) && (!hastaFecha || m.fecha <= hastaFecha))
    .reduce((acc, m) => (m.tipo === "ingreso" ? acc + m.monto : m.tipo === "egreso" ? acc - m.monto : acc), 0);
  // `|| 0` normaliza un posible -0 (ej. 0 - 0 acumulado en el reduce) a 0 — mismo valor numérico,
  // pero assert.equal en modo estricto los distingue y no tiene sentido mostrarlo distinto en la UI.
  return (data.configuracion.saldo_inicial_caja ?? 0) + movs || 0;
}

export interface FlujoCajaCuenta {
  cuenta: string;
  saldo_inicial: number;
  entradas: number;
  salidas: number;
  saldo_final: number;
}

export interface FlujoCaja {
  saldo_inicial: number;
  cobros_clientes: EerrLinea;
  otros_ingresos: EerrLinea;
  pagos_compras: EerrLinea;
  gastos_pagados: EerrLinea;
  inversiones: EerrLinea;
  transferencias: EerrLinea;
  saldo_final: number;
  por_cuenta: FlujoCajaCuenta[];
  flujo_operativo: number;
  flujo_inversion: number;
  flujo_financiacion: number;
  evolucion_diaria: { fecha: string; saldo: number }[];
  evolucion_mensual: { label: string; entradas: number; salidas: number; saldo_final: number }[];
  por_categoria: { categoria: string; monto: number }[];
  proyeccion_30_dias: number;
}

export function calcularFlujoCaja(data: RicordoDataV2, desde: string, hasta: string): FlujoCaja {
  const movs = data.movimientos_financieros.filter((m) => esMovimientoCajaReal(m) && m.fecha >= desde && m.fecha <= hasta);
  const grupos: Record<string, RicordoDataV2["movimientos_financieros"]> = {
    cobros_clientes: [],
    pagos_compras: [],
    inversiones: [],
    transferencias: [],
    otros_ingresos: [],
    gastos_pagados: [],
  };
  for (const m of movs) grupos[clasificarMovimientoCaja(m)].push(m);

  const aLinea = (lista: RicordoDataV2["movimientos_financieros"]): EerrLinea => ({
    total: Math.round(lista.reduce((acc, m) => acc + m.monto, 0)),
    registros: lista.map((m) => ({ fecha: m.fecha, concepto: m.concepto, monto: m.tipo === "egreso" ? -m.monto : m.monto })),
  });

  const cobros_clientes = aLinea(grupos.cobros_clientes);
  const otros_ingresos = aLinea(grupos.otros_ingresos);
  const pagos_compras = aLinea(grupos.pagos_compras);
  const gastos_pagados = aLinea(grupos.gastos_pagados);
  const inversiones = aLinea(grupos.inversiones);
  const transferencias: EerrLinea = {
    total: Math.round(grupos.transferencias.reduce((acc, m) => acc + m.monto, 0)),
    registros: grupos.transferencias.map((m) => ({ fecha: m.fecha, concepto: m.concepto, monto: m.monto })),
  };

  const diaAnterior = sumarDias(desde, -1);
  const saldo_inicial = Math.round(saldoCajaAlFecha(data, diaAnterior));
  const saldo_final = Math.round(saldoCajaAlFecha(data, hasta));

  const porCuentaMap = new Map<string, RicordoDataV2["movimientos_financieros"]>();
  for (const m of movs) {
    if (m.tipo === "transferencia") continue; // las transferencias no tienen un único metodo_pago — se muestran aparte
    const cuenta = m.metodo_pago?.trim() || "Sin especificar";
    const lista = porCuentaMap.get(cuenta) ?? [];
    lista.push(m);
    porCuentaMap.set(cuenta, lista);
  }
  const por_cuenta: FlujoCajaCuenta[] = [...porCuentaMap.entries()].map(([cuenta, lista]) => {
    const entradas = Math.round(lista.filter((m) => m.tipo === "ingreso").reduce((acc, m) => acc + m.monto, 0));
    const salidas = Math.round(lista.filter((m) => m.tipo === "egreso").reduce((acc, m) => acc + m.monto, 0));
    // Saldo inicial/final de la cuenta: mismo criterio, pero solo con movimientos de ese método de pago.
    const historicoCuenta = data.movimientos_financieros.filter((m) => esMovimientoCajaReal(m) && m.tipo !== "transferencia" && (m.metodo_pago?.trim() || "Sin especificar") === cuenta);
    const antes = historicoCuenta.filter((m) => m.fecha <= diaAnterior).reduce((acc, m) => (m.tipo === "ingreso" ? acc + m.monto : acc - m.monto), 0);
    const final = historicoCuenta.filter((m) => m.fecha <= hasta).reduce((acc, m) => (m.tipo === "ingreso" ? acc + m.monto : acc - m.monto), 0);
    return { cuenta, saldo_inicial: Math.round(antes), entradas, salidas, saldo_final: Math.round(final) };
  });

  const fechasConMovimiento = [...new Set(movs.map((m) => m.fecha))].sort();
  const evolucion_diaria = fechasConMovimiento.map((fecha) => ({ fecha, saldo: Math.round(saldoCajaAlFecha(data, fecha)) }));

  const meses = mesesEnRango(desde, hasta);
  const evolucion_mensual = meses.map((per) => {
    const d0 = primerDiaMes(per.mes, per.anio);
    const d1 = ultimoDiaMes(per.mes, per.anio);
    const movsMes = data.movimientos_financieros.filter((m) => esMovimientoCajaReal(m) && m.fecha >= d0 && m.fecha <= d1);
    return {
      label: `${d0.slice(0, 7)}`,
      entradas: Math.round(movsMes.filter((m) => m.tipo === "ingreso").reduce((acc, m) => acc + m.monto, 0)),
      salidas: Math.round(movsMes.filter((m) => m.tipo === "egreso").reduce((acc, m) => acc + m.monto, 0)),
      saldo_final: Math.round(saldoCajaAlFecha(data, d1)),
    };
  });

  const categoriaMap = new Map<string, number>();
  for (const m of movs) {
    const cat = nombreCategoria(data, m.categoria_id) || "Sin categoría";
    categoriaMap.set(cat, (categoriaMap.get(cat) ?? 0) + (m.tipo === "egreso" ? -m.monto : m.monto));
  }
  const por_categoria = [...categoriaMap.entries()].map(([categoria, monto]) => ({ categoria, monto: Math.round(monto) })).sort((a, b) => b.monto - a.monto);

  const flujo_operativo = cobros_clientes.total + otros_ingresos.total - pagos_compras.total - gastos_pagados.total;
  const flujo_inversion = -inversiones.total || 0;
  const flujo_financiacion = transferencias.total;

  // Proyección naive: promedio de flujo neto diario real del período, proyectado 30 días — no es
  // un modelo predictivo, es una extrapolación lineal de lo reciente, y se documenta como tal en
  // la UI.
  const dias = Math.max(1, Math.round((new Date(`${hasta}T00:00:00`).getTime() - new Date(`${desde}T00:00:00`).getTime()) / 86400000) + 1);
  const flujoNetoPeriodo = cobros_clientes.total + otros_ingresos.total - pagos_compras.total - gastos_pagados.total - inversiones.total;
  const promedioDiario = flujoNetoPeriodo / dias;
  const proyeccion_30_dias = Math.round(saldo_final + promedioDiario * 30);

  return {
    saldo_inicial,
    cobros_clientes,
    otros_ingresos,
    pagos_compras,
    gastos_pagados,
    inversiones,
    transferencias,
    saldo_final,
    por_cuenta,
    flujo_operativo: Math.round(flujo_operativo),
    flujo_inversion: Math.round(flujo_inversion),
    flujo_financiacion: Math.round(flujo_financiacion),
    evolucion_diaria,
    evolucion_mensual,
    por_categoria,
    proyeccion_30_dias,
  };
}
