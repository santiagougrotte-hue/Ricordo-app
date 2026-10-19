// Rellenos cocidos por kilo + consumo de masa/packaging al confirmar el pedido.
//
// Cómo trabaja Ricordo: los rellenos se cocinan una vez por mes y se pesan; los ingredientes del
// relleno se compran para esa tanda y no llevan stock. Lo que sí se controla semana a semana es la
// masa (premezcla, goma xántica, huevos…) y el packaging (bolsas de vacío, film…), y eso se
// descuenta al confirmar el pedido (no al armar).

import type { InventarioMovimiento, Pedido, PedidoItem, ProductoVariante, RicordoDataV2 } from "./types-v2";
import { recetaEfectivaVariante } from "./calc-v2";

export const GRAMOS_RELLENO_POR_UNIDAD_DEFAULT = 13;

/** Origen de los movimientos de consumo que genera una venta — distinto de "pedido" (salida de
 * producto terminado al entregar) para poder recrearlos sin tocar aquellos. */
export const ORIGEN_CONSUMO_VENTA = "pedido_insumos";

/** Estados en los que un pedido ya descontó stock (masa, packaging y producto terminado): desde que
 * se confirma. Cancelado no descuenta (y devuelve lo que se había descontado). */
export const ESTADOS_QUE_DESCUENTAN: ReadonlySet<Pedido["estado"]> = new Set<Pedido["estado"]>(["Confirmado", "Produccion", "Entregado"]);

export function gramosRellenoPorUnidad(data: RicordoDataV2): number {
  const g = data.configuracion.gramos_relleno_por_unidad;
  return g != null && g > 0 ? g : GRAMOS_RELLENO_POR_UNIDAD_DEFAULT;
}

/** Gustos que se producen y se cuentan en cajas de 12 (y llevan los gramos de relleno por unidad):
 * los de línea Pasta que tienen alguna presentación de más de 1 unidad. Un gusto que solo se vende
 * por unidad (lasaña, salsa, pizza) se cuenta por unidad, aunque tenga cargada la línea Pasta. */
export function usaRellenoPorUnidad(data: RicordoDataV2, productoId: string): boolean {
  const producto = data.productos.find((p) => p.id === productoId);
  if ((producto?.linea ?? "Pasta") !== "Pasta") return false;
  const variantes = data.producto_variantes.filter((v) => v.producto_id === productoId);
  return variantes.length === 0 || variantes.some((v) => (v.unidades_por_paquete ?? 1) > 1);
}

/** Kilos de relleno cocido que lleva armar `cajas` de una variante. 0 si no es pasta. */
export function kgRellenoParaCajas(data: RicordoDataV2, variante: ProductoVariante, cajas: number): number {
  if (!usaRellenoPorUnidad(data, variante.producto_id)) return 0;
  const unidades = cajas * (variante.unidades_por_paquete ?? 12);
  return Math.round(((unidades * gramosRellenoPorUnidad(data)) / 1000) * 1000) / 1000;
}

export interface ResumenRelleno {
  producto_id: string;
  producto: string;
  kg_cargados: number;
  kg_usados: number;
  kg_disponibles: number;
  /** Cajas de 12 u. que todavía se pueden armar con el relleno disponible. */
  cajas_12_disponibles: number;
  ultima_tanda?: string;
}

/** Relleno disponible por producto: kilos cargados − kilos usados por las producciones. Solo
 * lista productos con alguna tanda cargada o algún uso registrado. */
export function resumenRellenos(data: RicordoDataV2): ResumenRelleno[] {
  const rellenos = data.rellenos_cocidos ?? [];
  const kgPorCaja12 = (gramosRellenoPorUnidad(data) * 12) / 1000;
  const usados = new Map<string, number>();
  for (const p of data.produccion) {
    if (!p.kg_relleno) continue;
    const productoId = p.producto_id ?? data.producto_variantes.find((x) => x.id === p.producto_variante_id)?.producto_id;
    if (!productoId) continue;
    usados.set(productoId, (usados.get(productoId) ?? 0) + p.kg_relleno);
  }
  const ids = new Set<string>([...rellenos.map((r) => r.producto_id), ...usados.keys()]);
  return [...ids]
    .map((id) => {
      const tandas = rellenos.filter((r) => r.producto_id === id);
      const cargados = tandas.reduce((acc, r) => acc + r.kg, 0);
      const usado = usados.get(id) ?? 0;
      const disponibles = Math.round((cargados - usado) * 1000) / 1000;
      return {
        producto_id: id,
        producto: data.productos.find((p) => p.id === id)?.nombre ?? id,
        kg_cargados: Math.round(cargados * 1000) / 1000,
        kg_usados: Math.round(usado * 1000) / 1000,
        kg_disponibles: disponibles,
        cajas_12_disponibles: Math.floor(Math.max(0, disponibles) / kgPorCaja12),
        ultima_tanda: tandas.map((t) => t.fecha).sort().at(-1),
      };
    })
    .sort((a, b) => a.producto.localeCompare(b.producto));
}

export function kgRellenoDisponible(data: RicordoDataV2, productoId: string): number {
  return resumenRellenos(data).find((r) => r.producto_id === productoId)?.kg_disponibles ?? 0;
}

/** Insumos que una venta descuenta: los de stock controlado (`controla_stock`) de la receta
 * efectiva de la variante, salvo la etapa relleno (el relleno se controla por kilo cocido). */
export function consumoInsumosVenta(data: RicordoDataV2, pedido: Pedido, items: PedidoItem[]): InventarioMovimiento[] {
  if (!ESTADOS_QUE_DESCUENTAN.has(pedido.estado)) return [];
  const porInsumo = new Map<string, number>();
  for (const item of items) {
    if (!item.producto_variante_id) continue;
    const variante = data.producto_variantes.find((v) => v.id === item.producto_variante_id);
    if (!variante) continue;
    for (const c of recetaEfectivaVariante(data, variante)) {
      if (c.etapa === "relleno" || c.cantidad <= 0) continue;
      const insumo = data.insumos.find((i) => i.id === c.insumo_id);
      if (!insumo?.controla_stock) continue;
      porInsumo.set(c.insumo_id, (porInsumo.get(c.insumo_id) ?? 0) + c.cantidad * item.cantidad);
    }
  }
  return [...porInsumo.entries()].map(([insumoId, cantidad], idx) => ({
    id: `MOV-${pedido.id}-INS-${idx + 1}`,
    fecha: pedido.fecha,
    tipo: "consumo" as const,
    origen_tipo: ORIGEN_CONSUMO_VENTA,
    origen_id: pedido.id,
    item_tipo: "insumo" as const,
    item_id: insumoId,
    cantidad: -Math.round(cantidad * 100000) / 100000,
    notas: "Masa y packaging de la venta",
  }));
}

/** Resincroniza (idempotente) el consumo de masa y packaging de un pedido: borra lo que había
 * generado antes y lo vuelve a crear con los ítems actuales. Solo descuenta desde que el pedido está
 * confirmado; un pedido cancelado queda sin consumo. */
export function conConsumoInsumosVenta(
  d: RicordoDataV2,
  pedido: Pedido,
  items: PedidoItem[]
): Pick<RicordoDataV2, "inventario_movimientos"> {
  const sinPrevios = d.inventario_movimientos.filter((m) => !(m.origen_tipo === ORIGEN_CONSUMO_VENTA && m.origen_id === pedido.id));
  return { inventario_movimientos: [...sinPrevios, ...consumoInsumosVenta(d, pedido, items)] };
}

/** Unidades por caja del stock de terminados: la pasta se produce y se cuenta siempre en cajas de
 * 12; el resto de las líneas (lasaña, salsa, pizza) por unidad. */
export function unidadesPorCajaStock(data: RicordoDataV2, productoId: string): number {
  return usaRellenoPorUnidad(data, productoId) ? 12 : 1;
}

/** Presentación que representa la producción de un gusto (la de 12 u., minorista si hay varias). */
export function varianteDeProduccion(data: RicordoDataV2, productoId: string): ProductoVariante | undefined {
  const uds = unidadesPorCajaStock(data, productoId);
  const activas = data.producto_variantes.filter((v) => v.producto_id === productoId && v.activo);
  return (
    activas.find((v) => (v.unidades_por_paquete ?? 1) === uds && v.canal === "Minorista") ??
    activas.find((v) => (v.unidades_por_paquete ?? 1) === uds) ??
    activas[0]
  );
}

/** Kilos de relleno cocido para `cajas` cajas de 12 de un gusto (0 si no es pasta). */
export function kgRellenoParaCajasGusto(data: RicordoDataV2, productoId: string, cajas: number): number {
  if (!usaRellenoPorUnidad(data, productoId)) return 0;
  return Math.round(((cajas * 12 * gramosRellenoPorUnidad(data)) / 1000) * 1000) / 1000;
}

/** Registra una tanda de armado por gusto: suma `cajas` cajas de 12 (pasta) o unidades (resto) al
 * stock de terminados de ese gusto y guarda el relleno cocido usado. No descuenta insumos: masa y
 * packaging se descuentan al confirmar el pedido. */
export function registrarProduccion(
  d: RicordoDataV2,
  args: { id: string; movId: string; producto_id: string; cajas: number; fecha: string; notas?: string }
): RicordoDataV2 {
  const producto = d.productos.find((p) => p.id === args.producto_id);
  if (!producto || args.cajas <= 0) return d;
  const variante = varianteDeProduccion(d, producto.id);
  const kgRelleno = kgRellenoParaCajasGusto(d, producto.id, args.cajas);
  return {
    ...d,
    produccion: [
      ...d.produccion,
      {
        id: args.id,
        producto_id: producto.id,
        producto_variante_id: variante?.id ?? producto.id,
        cantidad: args.cajas,
        fecha: args.fecha,
        notas: args.notas || undefined,
        kg_relleno: kgRelleno > 0 ? kgRelleno : undefined,
      },
    ],
    inventario_movimientos: [
      ...d.inventario_movimientos,
      {
        id: args.movId,
        fecha: args.fecha,
        tipo: "produccion",
        origen_tipo: "produccion",
        origen_id: args.id,
        item_tipo: "producto",
        item_id: producto.id,
        cantidad: args.cajas * unidadesPorCajaStock(d, producto.id),
      },
    ],
  };
}
