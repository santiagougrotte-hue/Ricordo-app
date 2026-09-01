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

export function valorStockInsumos(data: RicordoDataV2): number {
  return data.insumos
    .filter((i) => i.controla_stock)
    .reduce((acc, i) => acc + calcularStock(data, "insumo", i.id) * i.precio_actual, 0);
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
 * un cobro/pago real (Ventas → marcar entregado, Operaciones → marcar compra pagada, Finanzas →
 * movimiento manual de caja) debe etiquetar `origen_tipo` con uno de estos valores para que
 * `saldoCaja` lo cuente. */
export const ORIGENES_CAJA_REAL = ["caja_movimiento_legacy", "venta_pedido", "compra_pago", "caja_manual"];

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
function mesesEnRango(desde: string, hasta: string): { mes: number; anio: number }[] {
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
