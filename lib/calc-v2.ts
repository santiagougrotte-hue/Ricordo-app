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
