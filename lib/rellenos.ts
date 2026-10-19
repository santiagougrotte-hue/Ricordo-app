// Rellenos cocidos por kilo + consumo de masa/packaging al vender.
//
// Cómo trabaja Ricordo: los rellenos se cocinan una vez por mes y se pesan; los ingredientes del
// relleno se compran para esa tanda y no llevan stock. Lo que sí se controla semana a semana es la
// masa (premezcla, goma xántica, huevos…) y el packaging (bolsas de vacío, film…), y eso se
// descuenta al cargar la venta (no al armar).

import type { InventarioMovimiento, Pedido, PedidoItem, ProductoVariante, RicordoDataV2 } from "./types-v2";
import { recetaEfectivaVariante } from "./calc-v2";

export const GRAMOS_RELLENO_POR_UNIDAD_DEFAULT = 13;

/** Origen de los movimientos de consumo que genera una venta — distinto de "pedido" (salida de
 * producto terminado al entregar) para poder recrearlos sin tocar aquellos. */
export const ORIGEN_CONSUMO_VENTA = "pedido_insumos";

export function gramosRellenoPorUnidad(data: RicordoDataV2): number {
  const g = data.configuracion.gramos_relleno_por_unidad;
  return g != null && g > 0 ? g : GRAMOS_RELLENO_POR_UNIDAD_DEFAULT;
}

/** Solo la línea Pasta usa los gramos de relleno por unidad (lasaña, salsa y pizza no). */
export function usaRellenoPorUnidad(data: RicordoDataV2, productoId: string): boolean {
  const producto = data.productos.find((p) => p.id === productoId);
  return (producto?.linea ?? "Pasta") === "Pasta";
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
    const v = data.producto_variantes.find((x) => x.id === p.producto_variante_id);
    if (!v) continue;
    usados.set(v.producto_id, (usados.get(v.producto_id) ?? 0) + p.kg_relleno);
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
  if (pedido.estado === "Cancelado") return [];
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
 * generado antes y lo vuelve a crear con los ítems actuales. Un pedido cancelado queda sin consumo. */
export function conConsumoInsumosVenta(
  d: RicordoDataV2,
  pedido: Pedido,
  items: PedidoItem[]
): Pick<RicordoDataV2, "inventario_movimientos"> {
  const sinPrevios = d.inventario_movimientos.filter((m) => !(m.origen_tipo === ORIGEN_CONSUMO_VENTA && m.origen_id === pedido.id));
  return { inventario_movimientos: [...sinPrevios, ...consumoInsumosVenta(d, pedido, items)] };
}
