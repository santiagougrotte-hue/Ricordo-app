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
  Compra,
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

/** La receta compartida se carga "por unidad individual" (ver costoUnidadProductoBase), pero eso
 * solo tiene sentido para lo que realmente escala con la cantidad de unidades de una presentación:
 * masa y relleno. Salsa/terminación/packaging, si están cargados en la receta compartida, ya
 * representan la cantidad pensada para esa presentación (por eso lo normal es cargarlos como
 * ajuste/complemento por variante, no acá) — nunca se multiplican por unidades_por_paquete. */
export const ETAPAS_POR_UNIDAD: EtapaReceta[] = ["masa", "relleno"];

/** Receta completa de una variante ya resuelta: hereda de la receta compartida del producto
 * base (masa/relleno escalados × unidades_por_paquete, el resto de las etapas tal cual están
 * cargadas) o usa su propia receta standalone (si nunca se migró a una familia con receta
 * compartida), + ajustes propios (reemplaza/suma/resta) + complementos (recetas de otros
 * productos base sumadas con su propia cantidad). */
export function recetaEfectivaVariante(data: RicordoDataV2, variante: ProductoVariante): ItemRecetaEfectiva[] {
  const recetaCompartida = data.recetas.find((r) => r.producto_id === variante.producto_id);
  const recetaPropia = recetaCompartida ? undefined : data.recetas.find((r) => r.producto_id === variante.id);
  const receta = recetaCompartida ?? recetaPropia;
  if (!receta) return [];

  const esCompartida = receta === recetaCompartida;
  const factorPorUnidad = variante.unidades_por_paquete ?? 0;
  const items: ItemRecetaEfectiva[] = data.receta_items
    .filter((i) => i.receta_id === receta.id)
    .map((i) => {
      const factor = esCompartida && ETAPAS_POR_UNIDAD.includes(i.etapa) ? factorPorUnidad : 1;
      return { insumo_id: i.insumo_id, cantidad: i.cantidad * factor, etapa: i.etapa };
    });

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

/** Costo de fabricar exactamente 1 unidad individual del producto base: solo los insumos de masa
 * y relleno de la receta compartida, nunca packaging/salsa/terminación/complementos (esos se
 * agregan aparte, a nivel de cada variante, y no forman parte de "1 unidad"). Es la base que cada
 * variante multiplica × sus propias unidades_por_paquete — no depende de ninguna variante en
 * particular ni de su unidades_por_paquete. */
export function costoUnidadProductoBase(data: RicordoDataV2, productoId: string): number {
  const receta = data.recetas.find((r) => r.producto_id === productoId);
  if (!receta) return 0;
  const total = data.receta_items
    .filter((i) => i.receta_id === receta.id && ETAPAS_POR_UNIDAD.includes(i.etapa))
    .reduce((acc, i) => {
      const insumo = data.insumos.find((ins) => ins.id === i.insumo_id);
      return acc + i.cantidad * (insumo?.precio_actual ?? 0);
    }, 0);
  return Math.round(total);
}

export function margenVariante(data: RicordoDataV2, variante: ProductoVariante): number {
  return variante.precio_venta > 0 ? ((variante.precio_venta - costoVariante(data, variante.id)) / variante.precio_venta) * 100 : 0;
}

export interface VarianteSinFactor {
  variante_id: string;
  variante_nombre: string;
}

/** Variantes activas que heredan una receta compartida (hay una Receta con su mismo producto_id)
 * pero no tienen `unidades_por_paquete` cargado — en recetaEfectivaVariante eso hace que el factor
 * de escala de masa/relleno sea 0, así que esas líneas quedan en cantidad 0 (costo $0 por esa
 * parte) hasta que se cargue el dato. Packaging/salsa/terminación de la receta compartida (si los
 * hay) no dependen de este factor y no se ven afectados. */
export function variantesSinFactorReceta(data: RicordoDataV2): VarianteSinFactor[] {
  const resultado: VarianteSinFactor[] = [];
  for (const v of data.producto_variantes.filter((variante) => variante.activo)) {
    const compartida = data.recetas.find((r) => r.producto_id === v.producto_id);
    if (compartida && v.unidades_por_paquete == null) {
      resultado.push({ variante_id: v.id, variante_nombre: v.nombre });
    }
  }
  return resultado;
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

/** Amortización acumulada de un activo hasta una fecha de corte — nunca supera su costo, y da 0
 * si la fecha de corte es anterior a la compra. Es un gasto económico (afecta EERR), nunca una
 * salida de caja — no se toca acá, solo se usa para el valor contable del Balance General. */
export function amortizacionAcumulada(a: Activo, hastaFecha: string): number {
  const inicio = new Date(`${a.fecha_compra}T00:00:00`);
  const hasta = new Date(`${hastaFecha}T00:00:00`);
  if (hasta < inicio) return 0;
  const mesesTranscurridos = (hasta.getFullYear() - inicio.getFullYear()) * 12 + (hasta.getMonth() - inicio.getMonth()) + 1;
  const meses = Math.max(0, Math.min(mesesTranscurridos, a.vida_util_meses));
  return Math.round(Math.min(meses * cuotaMensualActivo(a), a.costo));
}

export function valorContableActivo(a: Activo, hastaFecha: string): number {
  return Math.round(a.costo - amortizacionAcumulada(a, hastaFecha)) || 0;
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
export const ORIGENES_CAJA_REAL = [
  "caja_movimiento_legacy",
  "venta_pedido",
  "compra_pago",
  "compra_activo",
  "caja_manual",
  "ajuste_saldo",
  "aporte_dueno",
  "retiro_dueno",
  "prestamo_recibido",
  "devolucion_prestamo",
];

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

/** Dos indicadores DISTINTOS, nunca se confunden entre sí:
 * - `ventasEquilibrio` (pesos): cuánto hay que facturar para cubrir los costos fijos —
 *   costos fijos / ratio de contribución (margen de contribución como % de las ventas).
 * - `unidadesEquilibrio` (unidades, redondeado hacia arriba): cuántas unidades hay que vender —
 *   costos fijos / margen de contribución promedio POR UNIDAD (en pesos/unidad, no en %). Nunca
 *   se muestran pesos como si fueran unidades — son dos fórmulas distintas a propósito. */
export function puntoEquilibrio(
  data: RicordoDataV2,
  pedidosPeriodo: Pedido[],
  mes: number,
  anio: number
): {
  ventasEquilibrio: number;
  unidadesEquilibrio: number;
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
  const ventasEquilibrio = ratioContribucion > 0 ? cfTotal / ratioContribucion : 0;
  const unidadesEquilibrio = margenPromedioPonderado > 0 ? Math.ceil(cfTotal / margenPromedioPonderado) : 0;
  const precioPromedioPonderado = sumaQ > 0 ? sumaPxQ / sumaQ : 0;
  const costoVariableUnitarioPromedio = precioPromedioPonderado - margenPromedioPonderado;
  return { ventasEquilibrio, unidadesEquilibrio, margenPromedioPonderado, cfTotal, precioPromedioPonderado, costoVariableUnitarioPromedio, unidadesTotales: sumaQ };
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
// las compras. El "costo real de envío" usa `Pedido.costo_real_envio` cuando está cargado (Ventas
// lo pide al armar el pedido); para pedidos que no lo tengan (viejos, o cargados antes de que
// existiera el campo) se aproxima con el monto cobrado al cliente — mismo comportamiento que la
// versión anterior de este archivo, ahora como fallback en vez de regla fija. El envío cobrado
// siempre suma a Ventas netas; el costo real siempre resta en Costos indirectos variables — son
// dos números que pueden diferir. "Otros ingresos y gastos" e "Impuestos" quedan en cero: no hay
// ninguna fuente de datos para esas dos líneas todavía — nunca se inventa un valor.

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
  // Costo real de envío: usa el campo dedicado si está cargado (Ventas ya lo pide al armar el
  // pedido); si un pedido viejo no lo tiene, se aproxima con lo cobrado (mismo comportamiento que
  // antes de que existiera este campo). Se calcula en vivo acá, nunca como un movimiento aparte —
  // así no puede duplicarse ni desincronizarse si el pedido se edita o se anula.
  const costoEnvioReal = pedidosPeriodo.reduce((acc, p) => acc + (p.costo_real_envio ?? p.costo_envio), 0);
  const costos_indirectos_variables: EerrLinea = {
    total: Math.round(costoEnvioReal + movsIndirectosVariables.reduce((acc, m) => acc + m.monto, 0)),
    registros: [
      ...pedidosPeriodo
        .filter((p) => (p.costo_real_envio ?? p.costo_envio) > 0)
        .map((p) => ({ fecha: p.fecha, concepto: `Costo real de envío — pedido ${p.id}`, monto: p.costo_real_envio ?? p.costo_envio })),
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

/** El envío cobrado (ingreso) y el costo real de envío (egreso, `Pedido.costo_real_envio` o
 * `costo_envio` como aproximación si no está cargado) son dos montos que pueden diferir — ver el
 * comentario de `calcularEerr`. Si un pedido tiene varias líneas, cada uno de esos dos montos (por
 * separado) se reparte entre ellas según `criterioEnvio` (proporcional a ventas netas de cada
 * línea, o a sus unidades) — un solo criterio, documentado acá, no dos números distintos según
 * quién mire. Los descuentos generales del pedido (no los de línea) se reparten siempre
 * proporcional a ventas, para no descontar el mismo importe en cada producto. */
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
      // Envío cobrado (ingreso, forma parte de ventas netas) y costo real de envío (egreso, resta
      // en el margen de contribución) son dos números que pueden diferir — ver Pedido.costo_real_envio.
      const envioCobrado = Math.round(pedido.costo_envio * share);
      const costoEnvioReal = Math.round((pedido.costo_real_envio ?? pedido.costo_envio) * share);
      const variante = item.producto_variante_id ? data.producto_variantes.find((v) => v.id === item.producto_variante_id) : undefined;
      const producto = variante ? data.productos.find((p) => p.id === variante.producto_id) : undefined;
      const cmv = costoPedidoItem(data, item);
      const ventasNetas = Math.round(bruto - descuento + envioCobrado);
      const margenContribucion = Math.round(ventasNetas - cmv - costoEnvioReal);

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
        costo_envio: costoEnvioReal,
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
  for (const sinFactor of variantesSinFactorReceta(data)) {
    alertas.push({
      severidad: "media",
      mensaje: `"${sinFactor.variante_nombre}" no tiene "unidades por paquete" cargado — su receta hereda un factor de conversión de 0, el costo de esta presentación va a dar mal.`,
    });
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

type BucketFlujo =
  | "cobros_clientes"
  | "otros_ingresos"
  | "pagos_compras"
  | "gastos_pagados"
  | "inversiones"
  | "prestamos_recibidos"
  | "devolucion_prestamos"
  | "aportes_dueno"
  | "retiros_dueno"
  | "ajustes_saldo"
  | "transferencias";

export const BUCKET_LABEL: Record<BucketFlujo, string> = {
  cobros_clientes: "Cobros de clientes",
  otros_ingresos: "Otros ingresos",
  pagos_compras: "Pagos a proveedores",
  gastos_pagados: "Gastos pagados",
  inversiones: "Inversiones",
  prestamos_recibidos: "Préstamos recibidos",
  devolucion_prestamos: "Devolución de préstamos",
  aportes_dueno: "Aportes del dueño",
  retiros_dueno: "Retiros del dueño",
  ajustes_saldo: "Ajustes de saldo",
  transferencias: "Transferencias",
};

function clasificarMovimientoCaja(m: RicordoDataV2["movimientos_financieros"][number]): BucketFlujo {
  if (m.tipo === "transferencia") return "transferencias";
  if (m.origen_tipo === "venta_pedido") return "cobros_clientes";
  if (m.origen_tipo === "compra_pago") return "pagos_compras";
  if (m.origen_tipo === "compra_activo") return "inversiones";
  if (m.origen_tipo === "prestamo_recibido") return "prestamos_recibidos";
  if (m.origen_tipo === "devolucion_prestamo") return "devolucion_prestamos";
  if (m.origen_tipo === "aporte_dueno") return "aportes_dueno";
  if (m.origen_tipo === "retiro_dueno") return "retiros_dueno";
  if (m.origen_tipo === "ajuste_saldo") return "ajustes_saldo";
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
  flujo_operativo: number;
  inversiones: EerrLinea;
  flujo_inversion: number;
  prestamos_recibidos: EerrLinea;
  devolucion_prestamos: EerrLinea;
  aportes_dueno: EerrLinea;
  retiros_dueno: EerrLinea;
  flujo_financiacion: number;
  /** A diferencia de las demás líneas, `total` acá es un NETO con signo (puede ser ingreso o
   * egreso según el ajuste), no una magnitud sin signo — un ajuste de saldo puede ir en cualquier
   * sentido, así que no hay una única dirección implícita en la etiqueta como en el resto de los
   * buckets. */
  ajustes_saldo: EerrLinea;
  /** Informativo (se muestra en la UI para que el movimiento no "desaparezca" del historial), pero
   * nunca suma a variacion_caja: mover plata entre cuentas propias no genera ni consume caja real. */
  transferencias: EerrLinea;
  variacion_caja: number;
  saldo_final: number;
  por_cuenta: FlujoCajaCuenta[];
  evolucion_diaria: { fecha: string; saldo: number }[];
  evolucion_mensual: { label: string; entradas: number; salidas: number; saldo_final: number }[];
  por_categoria: { categoria: string; monto: number }[];
}

export function calcularFlujoCaja(data: RicordoDataV2, desde: string, hasta: string): FlujoCaja {
  const movs = data.movimientos_financieros.filter((m) => esMovimientoCajaReal(m) && m.fecha >= desde && m.fecha <= hasta);
  const grupos: Record<BucketFlujo, RicordoDataV2["movimientos_financieros"]> = {
    cobros_clientes: [],
    otros_ingresos: [],
    pagos_compras: [],
    gastos_pagados: [],
    inversiones: [],
    prestamos_recibidos: [],
    devolucion_prestamos: [],
    aportes_dueno: [],
    retiros_dueno: [],
    ajustes_saldo: [],
    transferencias: [],
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
  const prestamos_recibidos = aLinea(grupos.prestamos_recibidos);
  const devolucion_prestamos = aLinea(grupos.devolucion_prestamos);
  const aportes_dueno = aLinea(grupos.aportes_dueno);
  const retiros_dueno = aLinea(grupos.retiros_dueno);
  // Neto con signo — ver comentario en la interfaz FlujoCaja.
  const ajustes_saldo: EerrLinea = {
    total: Math.round(grupos.ajustes_saldo.reduce((acc, m) => acc + (m.tipo === "egreso" ? -m.monto : m.monto), 0)) || 0,
    registros: grupos.ajustes_saldo.map((m) => ({ fecha: m.fecha, concepto: m.concepto, monto: m.tipo === "egreso" ? -m.monto : m.monto })),
  };
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

  const flujo_operativo = Math.round(cobros_clientes.total + otros_ingresos.total - pagos_compras.total - gastos_pagados.total) || 0;
  const flujo_inversion = Math.round(-inversiones.total) || 0;
  // Aportes/retiros del dueño y préstamos son movimientos de financiación, no de operación — se
  // suman acá una sola vez (el pedido original los mencionaba también como si fueran parte del
  // flujo operativo, pero contablemente un aporte de capital nunca es un ingreso operativo).
  const flujo_financiacion =
    Math.round(prestamos_recibidos.total - devolucion_prestamos.total + aportes_dueno.total - retiros_dueno.total) || 0;
  // Transferencias entre cuentas propias quedan afuera a propósito: no generan ni consumen caja.
  const variacion_caja = Math.round(flujo_operativo + flujo_inversion + flujo_financiacion + ajustes_saldo.total) || 0;

  return {
    saldo_inicial,
    cobros_clientes,
    otros_ingresos,
    pagos_compras,
    gastos_pagados,
    flujo_operativo,
    inversiones,
    flujo_inversion,
    prestamos_recibidos,
    devolucion_prestamos,
    aportes_dueno,
    retiros_dueno,
    flujo_financiacion,
    ajustes_saldo,
    transferencias,
    variacion_caja,
    saldo_final,
    por_cuenta,
    evolucion_diaria,
    evolucion_mensual,
    por_categoria,
  };
}

/** Saldos de los fondos internos (Reinversión/Seguridad, ver ReinversionTab): plata ya asignada
 * pero que sigue físicamente en las mismas cuentas — no es un movimiento de caja, es una reserva
 * contable. `saldo = % del total aportado − usos registrados de ese fondo`. */
export interface FondosInternos {
  saldo_reinversion: number;
  saldo_seguridad: number;
  saldo_total: number;
}

export function calcularFondosInternos(data: RicordoDataV2): FondosInternos {
  const ci = data.configuracion.caja_inteligente;
  const totalAportado = ci.asignaciones.reduce((acc, a) => acc + a.monto, 0);
  const usosReinversion = ci.usos_reinversion.reduce((acc, u) => acc + u.monto, 0);
  const usosSeguridad = ci.usos_seguridad.reduce((acc, u) => acc + u.monto, 0);
  const saldo_reinversion = Math.round((totalAportado * ci.porcentaje_reinversion) / 100 - usosReinversion) || 0;
  const saldo_seguridad = Math.round((totalAportado * ci.porcentaje_seguridad) / 100 - usosSeguridad) || 0;
  return { saldo_reinversion, saldo_seguridad, saldo_total: saldo_reinversion + saldo_seguridad };
}

/** Fondo de reposición de maquinaria: separado por completo de la amortización contable — nadie
 * "hereda" plata acá automáticamente por la cuota de amortización de un activo, es una reserva
 * 100% manual (aporte/uso), igual que Reinversión/Margen de seguridad. */
export function calcularFondoReposicion(data: RicordoDataV2): number {
  const f = data.configuracion.fondo_reposicion;
  const aportes = f.aportes.reduce((acc, a) => acc + a.monto, 0);
  const usos = f.usos.reduce((acc, u) => acc + u.monto, 0);
  return Math.round(aportes - usos) || 0;
}

/** Dinero libre/disponible: lo que realmente se puede usar sin comprometer pagos ya previsibles ni
 * plata ya reservada en los fondos internos. No incluye "compromisos próximos" (gastos con
 * vencimiento futuro) — eso vive en `calcularProyeccionCaja`, para no duplicar esa lógica acá. */
export interface DineroLibre {
  dinero_en_cuentas: number;
  cuentas_por_pagar: number;
  fondos_reservados: number;
  dinero_libre: number;
}

export function calcularDineroLibre(data: RicordoDataV2, hoy: string): DineroLibre {
  const dinero_en_cuentas = Math.round(saldoCajaAlFecha(data, hoy));
  const cuentas_por_pagar = Math.round(
    data.compras.reduce((acc, c) => acc + Math.max(0, c.total - totalPagadoCompra(data, c.id)), 0)
  );
  const fondos_reservados = calcularFondosInternos(data).saldo_total + calcularFondoReposicion(data);
  const dinero_libre = Math.round(dinero_en_cuentas - cuentas_por_pagar - fondos_reservados) || 0;
  return { dinero_en_cuentas, cuentas_por_pagar, fondos_reservados, dinero_libre };
}

// --- Normalización de canal (Productos) ------------------------------------------------------
// La agrupación real de variantes YA es por id (producto_id), nunca por texto — esto es solo una
// alerta de calidad de datos: detecta cuando el nombre de una variante dice "mayorista"/"minorista"
// pero su campo `canal` (que sí es estructurado y es el que usa el resto de la app) dice lo
// contrario. Nunca se corrige solo — se lista para que la revise una persona.

export interface AlertaCanalInconsistente {
  variante_id: string;
  variante_nombre: string;
  canal_actual: Canal | undefined;
  canal_sugerido: Canal;
}

export function detectarCanalInconsistente(data: RicordoDataV2): AlertaCanalInconsistente[] {
  const alertas: AlertaCanalInconsistente[] = [];
  for (const v of data.producto_variantes) {
    const nombre = v.nombre.toLowerCase();
    const diceMinorista = /\bminorista\b/.test(nombre);
    // "mayo" cubre el patrón real visto en los datos de ejemplo ("Calabaza al vacio mayo") — una
    // abreviatura de "mayorista", no el mes.
    const diceMayorista = /\bmayorista\b|\bmayo\b/.test(nombre);
    // Una variante sin ningún sufijo de canal en el nombre y que ES la propia base de su familia
    // (id === producto_id, el mismo caso que gustosActivos() ya trataba como "la base también
    // cuenta como variante") sigue la convención implícita del negocio: la presentación sin
    // sufijo es minorista.
    const esBaseSinSufijo = !diceMinorista && !diceMayorista && v.producto_id === v.id;
    const sugerido: Canal | null = diceMinorista && !diceMayorista ? "Minorista" : diceMayorista && !diceMinorista ? "Mayorista" : esBaseSinSufijo ? "Minorista" : null;
    if (sugerido && v.canal !== sugerido) {
      alertas.push({ variante_id: v.id, variante_nombre: v.nombre, canal_actual: v.canal, canal_sugerido: sugerido });
    }
  }
  return alertas;
}

// --- Estado de cobro de un pedido -----------------------------------------------------------
// Se calcula en vivo a partir de los movimientos_financieros ya registrados con
// origen_tipo "venta_pedido" y origen_id = pedido.id — nunca se guarda como campo propio del
// pedido (evita que quede desincronizado si se registra o se anula un cobro). Entregar un pedido
// ya NO genera caja por sí solo (ver Ventas.tsx) — por eso un pedido recién entregado empieza
// "Pendiente" hasta que se registre el cobro real, total o parcial, en Cuentas pendientes.

export type EstadoCobro = "Pendiente" | "Parcial" | "Cobrado";

export function totalCobradoPedido(data: RicordoDataV2, pedidoId: string): number {
  return data.movimientos_financieros
    .filter((m) => m.origen_tipo === "venta_pedido" && m.origen_id === pedidoId && m.tipo === "ingreso")
    .reduce((acc, m) => acc + m.monto, 0);
}

export function estadoCobroPedido(data: RicordoDataV2, pedido: Pedido): EstadoCobro {
  const cobrado = totalCobradoPedido(data, pedido.id);
  if (cobrado <= 0) return "Pendiente";
  if (cobrado >= pedido.total) return "Cobrado";
  return "Parcial";
}

/** Vencido: tiene fecha_vencimiento cargada, ya pasó, y todavía no se cobró/pagó del todo. Se
 * calcula contra la fecha de hoy del navegador — no se guarda como estado propio, evita quedar
 * desactualizado. */
export type EstadoCuenta = EstadoCobro | "Vencido";

export function estadoCuentaPorCobrar(data: RicordoDataV2, pedido: Pedido, hoy: string): EstadoCuenta {
  const base = estadoCobroPedido(data, pedido);
  if (base !== "Cobrado" && pedido.fecha_vencimiento && pedido.fecha_vencimiento < hoy) return "Vencido";
  return base;
}

// --- Estado de pago de una compra -------------------------------------------------------------
// Misma idea que el cobro de un pedido: COMPRA ≠ PAGO. `Compra.estado_pago` es el valor que ya
// carga la pantalla de Compras al confirmar (pagado/pendiente); acá se calcula en vivo desde los
// movimientos reales para soportar pagos PARCIALES sin necesitar un tercer estado guardado.

export function totalPagadoCompra(data: RicordoDataV2, compraId: string): number {
  return data.movimientos_financieros
    .filter((m) => m.origen_tipo === "compra_pago" && m.origen_id === compraId && m.tipo === "egreso")
    .reduce((acc, m) => acc + m.monto, 0);
}

export type EstadoPagoCalculado = "Pendiente" | "Parcial" | "Pagado";

export function estadoPagoCompraCalculado(data: RicordoDataV2, compra: Compra): EstadoPagoCalculado {
  const pagado = totalPagadoCompra(data, compra.id);
  if (pagado <= 0) return "Pendiente";
  if (pagado >= compra.total) return "Pagado";
  return "Parcial";
}

export function estadoCuentaPorPagar(data: RicordoDataV2, compra: Compra, hoy: string): EstadoPagoCalculado | "Vencido" {
  const base = estadoPagoCompraCalculado(data, compra);
  if (base !== "Pagado" && compra.fecha_vencimiento && compra.fecha_vencimiento < hoy) return "Vencido";
  return base;
}

// --- Cuentas por cobrar / por pagar (listas para la UI) -------------------------------------
// Solo pedidos Entregados generan cuenta por cobrar (recién ahí se reconoce la venta — un pedido
// Confirmado/En producción todavía no es una venta). Se excluyen los ya cobrados del todo: una
// cuenta por cobrar es, por definición, un saldo abierto.

export interface CuentaPorCobrar {
  pedido_id: string;
  cliente_id: string;
  fecha: string;
  total: number;
  cobrado: number;
  saldo: number;
  fecha_vencimiento?: string;
  estado: EstadoCuenta;
}

export function calcularCuentasPorCobrar(data: RicordoDataV2, hoy: string): CuentaPorCobrar[] {
  return data.pedidos
    .filter((p) => p.estado === "Entregado")
    .map((p) => {
      const cobrado = totalCobradoPedido(data, p.id);
      return {
        pedido_id: p.id,
        cliente_id: p.cliente_id,
        fecha: p.fecha,
        total: Math.round(p.total),
        cobrado: Math.round(cobrado),
        saldo: Math.round(p.total - cobrado),
        fecha_vencimiento: p.fecha_vencimiento,
        estado: estadoCuentaPorCobrar(data, p, hoy),
      };
    })
    .filter((c) => c.saldo > 0)
    .sort((a, b) => (a.fecha_vencimiento || a.fecha).localeCompare(b.fecha_vencimiento || b.fecha));
}

export interface CuentaPorPagar {
  compra_id: string;
  proveedor_id: string;
  fecha: string;
  total: number;
  pagado: number;
  saldo: number;
  fecha_vencimiento?: string;
  estado: EstadoPagoCalculado | "Vencido";
}

export function calcularCuentasPorPagar(data: RicordoDataV2, hoy: string): CuentaPorPagar[] {
  return data.compras
    .map((c) => {
      const pagado = totalPagadoCompra(data, c.id);
      return {
        compra_id: c.id,
        proveedor_id: c.proveedor_id,
        fecha: c.fecha,
        total: Math.round(c.total),
        pagado: Math.round(pagado),
        saldo: Math.round(c.total - pagado),
        fecha_vencimiento: c.fecha_vencimiento,
        estado: estadoCuentaPorPagar(data, c, hoy),
      };
    })
    .filter((c) => c.saldo > 0)
    .sort((a, b) => (a.fecha_vencimiento || a.fecha).localeCompare(b.fecha_vencimiento || b.fecha));
}

// --- Proyección de caja -----------------------------------------------------------------------
// A diferencia de la proyección naive que tenía calcularFlujoCaja (extrapolar el promedio diario
// del período), esto NO extrapola nada: suma compromisos reales ya cargados (cobros/pagos
// pendientes con fecha esperada). Gastos/costos fijos/sueldos/impuestos/inversiones "próximos" no
// tienen hoy una fecha de vencimiento propia en el esquema (no son un compromiso con vencimiento,
// son un movimiento que se carga cuando ocurre) — se dejan en $0 en vez de inventar un valor,
// mismo criterio que "Impuestos" en el EERR.

export interface ProyeccionCajaPunto {
  dias: number;
  fecha: string;
  cobros_pendientes: number;
  pagos_pendientes: number;
  caja_proyectada: number;
}

export interface ProyeccionCaja {
  caja_actual: number;
  puntos: ProyeccionCajaPunto[];
  alerta_negativa: boolean;
}

export function calcularProyeccionCaja(data: RicordoDataV2, hoy: string): ProyeccionCaja {
  const caja_actual = Math.round(saldoCajaAlFecha(data, hoy));
  const cuentasPorCobrar = calcularCuentasPorCobrar(data, hoy);
  const cuentasPorPagar = calcularCuentasPorPagar(data, hoy);

  const puntos = [0, 7, 15, 30].map((dias) => {
    const fechaLimite = sumarDias(hoy, dias);
    const cobros_pendientes =
      dias === 0
        ? 0
        : Math.round(cuentasPorCobrar.reduce((acc, c) => acc + (c.fecha_vencimiento && c.fecha_vencimiento <= fechaLimite ? c.saldo : 0), 0));
    const pagos_pendientes =
      dias === 0
        ? 0
        : Math.round(cuentasPorPagar.reduce((acc, c) => acc + (c.fecha_vencimiento && c.fecha_vencimiento <= fechaLimite ? c.saldo : 0), 0));
    const caja_proyectada = Math.round(caja_actual + cobros_pendientes - pagos_pendientes) || 0;
    return { dias, fecha: fechaLimite, cobros_pendientes, pagos_pendientes, caja_proyectada };
  });

  return { caja_actual, puntos, alerta_negativa: puntos.some((p) => p.caja_proyectada < 0) };
}

// --- Balance General / Estado de Situación Patrimonial ----------------------------------------
// "A fecha" `hasta`: usa cuentas por cobrar/pagar ya ABIERTAS hoy pero originadas hasta esa
// fecha (el esquema no guarda un histórico de saldos día a día, así que no se reconstruye con
// precisión absoluta un balance de una fecha pasada con cobros/pagos posteriores a esa fecha ya
// registrados — se documenta la limitación en vez de fingir precisión que el dato no tiene).
// Cualquier rubro sin una fuente de datos propia en el esquema (Gastos por pagar, Impuestos por
// pagar, Deudas de corto plazo, Otras deudas, Capital aportado como algo distinto de los aportes
// del dueño) se deja en $0 — mismo criterio que "Impuestos" en el EERR: nunca se inventa un valor.

export interface BalanceGeneral {
  activo_corriente: { caja_bancos: number; cuentas_por_cobrar: number; inventario: number; otros_activos_corrientes: number; total: number };
  activo_no_corriente: { valor_activos_costo: number; amortizacion_acumulada: number; valor_neto: number; total: number };
  total_activo: number;
  pasivo_corriente: { proveedores_por_pagar: number; gastos_por_pagar: number; impuestos_por_pagar: number; deudas_corto_plazo: number; total: number };
  pasivo_no_corriente: { prestamos: number; otras_deudas: number; total: number };
  total_pasivo: number;
  patrimonio_neto: {
    capital_aportado: number;
    aportes_dueno: number;
    resultados_acumulados: number;
    resultado_periodo: number;
    retiros_dueno: number;
    total: number;
  };
  total_pasivo_mas_patrimonio: number;
  diferencia: number;
  cuadra: boolean;
}

export function calcularBalanceGeneral(data: RicordoDataV2, hasta: string, inicioPeriodoActual: string): BalanceGeneral {
  const caja_bancos = Math.round(saldoCajaAlFecha(data, hasta));
  const cuentas_por_cobrar = Math.round(
    calcularCuentasPorCobrar(data, hasta)
      .filter((c) => c.fecha <= hasta)
      .reduce((acc, c) => acc + c.saldo, 0)
  );
  const inventario = Math.round(valorStockInsumos(data, hasta) + valorStockProductos(data, hasta));
  const otros_activos_corrientes = 0;
  const totalCorriente = caja_bancos + cuentas_por_cobrar + inventario + otros_activos_corrientes;

  const activosVigentes = data.activos.filter((a) => a.activo && a.fecha_compra <= hasta);
  const valor_activos_costo = Math.round(activosVigentes.reduce((acc, a) => acc + a.costo, 0));
  const amortizacion_acumulada = Math.round(activosVigentes.reduce((acc, a) => acc + amortizacionAcumulada(a, hasta), 0));
  const valor_neto = Math.round(valor_activos_costo - amortizacion_acumulada) || 0;

  const activo_corriente = { caja_bancos, cuentas_por_cobrar, inventario, otros_activos_corrientes, total: Math.round(totalCorriente) };
  const activo_no_corriente = { valor_activos_costo, amortizacion_acumulada, valor_neto, total: valor_neto };
  const total_activo = activo_corriente.total + activo_no_corriente.total;

  const proveedores_por_pagar = Math.round(
    calcularCuentasPorPagar(data, hasta)
      .filter((c) => c.fecha <= hasta)
      .reduce((acc, c) => acc + c.saldo, 0)
  );
  const pasivo_corriente = { proveedores_por_pagar, gastos_por_pagar: 0, impuestos_por_pagar: 0, deudas_corto_plazo: 0, total: proveedores_por_pagar };

  const movsPrestamo = data.movimientos_financieros.filter((m) => m.fecha <= hasta);
  const prestamosRecibidos = movsPrestamo.filter((m) => m.origen_tipo === "prestamo_recibido").reduce((acc, m) => acc + m.monto, 0);
  const devolucionPrestamos = movsPrestamo.filter((m) => m.origen_tipo === "devolucion_prestamo").reduce((acc, m) => acc + m.monto, 0);
  const prestamos = Math.round(prestamosRecibidos - devolucionPrestamos) || 0;
  const pasivo_no_corriente = { prestamos, otras_deudas: 0, total: prestamos };
  const total_pasivo = pasivo_corriente.total + pasivo_no_corriente.total;

  const aportesDueno = movsPrestamo.filter((m) => m.origen_tipo === "aporte_dueno").reduce((acc, m) => acc + m.monto, 0);
  const retirosDueno = movsPrestamo.filter((m) => m.origen_tipo === "retiro_dueno").reduce((acc, m) => acc + m.monto, 0);
  // Resultado del período (desde que arranca el período actual hasta la fecha de corte) separado
  // del resultado acumulado de todos los períodos anteriores — así se ven distinto sin duplicarse.
  const resultado_periodo = Math.round(calcularEerr(data, inicioPeriodoActual, hasta).resultado_neto);
  const diaAntesPeriodo = sumarDias(inicioPeriodoActual, -1);
  const resultados_acumulados = Math.round(calcularEerr(data, "0000-01-01", diaAntesPeriodo).resultado_neto);

  const capital_aportado = 0;
  const totalPatrimonio =
    capital_aportado + Math.round(aportesDueno) + resultados_acumulados + resultado_periodo - Math.round(retirosDueno);
  const patrimonio_neto = {
    capital_aportado,
    aportes_dueno: Math.round(aportesDueno),
    resultados_acumulados,
    resultado_periodo,
    retiros_dueno: Math.round(retirosDueno),
    total: Math.round(totalPatrimonio) || 0,
  };

  const total_pasivo_mas_patrimonio = total_pasivo + patrimonio_neto.total;
  const diferencia = Math.round(total_activo - total_pasivo_mas_patrimonio) || 0;

  return {
    activo_corriente,
    activo_no_corriente,
    total_activo,
    pasivo_corriente,
    pasivo_no_corriente,
    total_pasivo,
    patrimonio_neto,
    total_pasivo_mas_patrimonio,
    diferencia,
    // Tolerancia de redondeo: cada rubro se redondea a peso entero por separado, así que un
    // desvío de uno o dos pesos entre rubros es acumulación de redondeo, no un balance descuadrado.
    cuadra: Math.abs(diferencia) <= 2,
  };
}
