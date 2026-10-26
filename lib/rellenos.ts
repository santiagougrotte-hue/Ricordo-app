// Rellenos cocidos por kilo + consumo de masa, armado y pote al producir.
//
// Cómo trabaja Ricordo: los rellenos (de la pasta y el ragú de la lasaña) se cocinan una vez por mes
// y se pesan; los ingredientes del relleno se compran para esa tanda y no llevan stock. Al registrar
// una producción se descuentan los kilos de relleno cocido y, de la receta, la masa, el armado, la
// salsa y el pote (bolsas, film y stickers van por conteo manual). La venta, al confirmarse, solo
// descuenta el producto terminado del freezer.

import type { InventarioMovimiento, Pedido, ProductoVariante, RicordoDataV2 } from "./types-v2";
import { recetaEfectivaVariante } from "./calc-v2";

export const GRAMOS_RELLENO_POR_UNIDAD_DEFAULT = 13;

/** Origen de los movimientos de consumo de masa y packaging que generaba una venta antes de que se
 * descontaran al producir. Ya no se crean; se conserva para limpiarlos al eliminar un pedido viejo. */
export const ORIGEN_CONSUMO_VENTA = "pedido_insumos";

/** Estados en los que un pedido ya descontó stock de producto terminado: desde que
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
  /** Cajas de 12 (pasta) o unidades (lasaña) que todavía se pueden producir con el relleno disponible. */
  produccion_disponible: number;
  /** "cajas de 12" o "unidades": en qué se cuenta `produccion_disponible`. */
  unidad_produccion: string;
  ultima_tanda?: string;
}

/** Relleno disponible por producto: kilos cargados − kilos usados por las producciones. Solo
 * lista productos con alguna tanda cargada o algún uso registrado. */
export function resumenRellenos(data: RicordoDataV2): ResumenRelleno[] {
  const rellenos = data.rellenos_cocidos ?? [];
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
        produccion_disponible: produccionQueRinde(data, id, disponibles),
        unidad_produccion: unidadesPorCajaStock(data, id) > 1 ? "cajas de 12" : "unidades",
        ultima_tanda: tandas.map((t) => t.fecha).sort().at(-1),
      };
    })
    .sort((a, b) => a.producto.localeCompare(b.producto));
}

export function kgRellenoDisponible(data: RicordoDataV2, productoId: string): number {
  return resumenRellenos(data).find((r) => r.producto_id === productoId)?.kg_disponibles ?? 0;
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

/** Gramos de relleno cocido que lleva una unidad de producción de un gusto: una caja de 12 en la
 * pasta (12 × gramos por unidad de la configuración) o una unidad en el resto, si el gusto tiene
 * cargados sus gramos de relleno (ej. el ragú de la lasaña). 0 = su relleno no se controla por kilo. */
export function gramosRellenoProduccion(data: RicordoDataV2, productoId: string): number {
  if (usaRellenoPorUnidad(data, productoId)) return gramosRellenoPorUnidad(data) * 12;
  const g = data.productos.find((p) => p.id === productoId)?.gramos_relleno_por_unidad;
  return g != null && g > 0 ? g : 0;
}

/** El gusto lleva relleno en su receta (etapa relleno), aunque no sea pasta: la lasaña con su ragú. */
export function llevaRelleno(data: RicordoDataV2, productoId: string): boolean {
  if (usaRellenoPorUnidad(data, productoId)) return true;
  const recetas = new Set(data.recetas.filter((r) => r.producto_id === productoId && r.activa).map((r) => r.id));
  return data.receta_items.some((i) => recetas.has(i.receta_id) && i.etapa === "relleno" && i.cantidad > 0);
}

/** Kilos de relleno cocido para `cajas` cajas de 12 (pasta) o unidades (lasaña) de un gusto. */
export function kgRellenoParaCajasGusto(data: RicordoDataV2, productoId: string, cajas: number): number {
  return Math.round(((cajas * gramosRellenoProduccion(data, productoId)) / 1000) * 1000) / 1000;
}

/** Cuántas unidades de producción (cajas de 12 o unidades) rinden `kg` de relleno cocido. */
export function produccionQueRinde(data: RicordoDataV2, productoId: string, kg: number): number {
  const g = gramosRellenoProduccion(data, productoId);
  return g > 0 ? Math.floor((Math.max(0, kg) * 1000 + 1e-6) / g) : 0;
}

/** El único packaging que se descuenta solo es el pote (salsa de tomate y salsa de la lasaña):
 * bolsas, film y stickers se controlan con conteo manual. */
export function esPote(nombreInsumo: string): boolean {
  return /\bpote/i.test(nombreInsumo);
}

/** Insumos que descuenta producir `cajas` de un gusto: toda la receta efectiva de la presentación
 * de producción (cajas de 12 para pasta, unidad para el resto) salvo la etapa relleno (se controla
 * por kilo cocido), solo de insumos con «Controla stock», y del packaging únicamente el pote. */
export function consumoInsumosProduccion(
  d: RicordoDataV2,
  args: { produccionId: string; producto_id: string; cajas: number; fecha: string }
): InventarioMovimiento[] {
  const base = varianteDeProduccion(d, args.producto_id);
  if (!base || args.cajas <= 0) return [];
  const variante = { ...base, unidades_por_paquete: unidadesPorCajaStock(d, args.producto_id) };
  const porInsumo = new Map<string, number>();
  for (const c of recetaEfectivaVariante(d, variante)) {
    if (c.etapa === "relleno" || c.cantidad <= 0) continue;
    const insumo = d.insumos.find((i) => i.id === c.insumo_id);
    if (!insumo?.controla_stock) continue;
    if (insumo.tipo === "packaging" && !esPote(insumo.nombre)) continue;
    porInsumo.set(c.insumo_id, (porInsumo.get(c.insumo_id) ?? 0) + c.cantidad * args.cajas);
  }
  return [...porInsumo.entries()].map(([insumoId, cantidad], idx) => ({
    id: `MOV-${args.produccionId}-INS-${idx + 1}`,
    fecha: args.fecha,
    tipo: "consumo" as const,
    origen_tipo: "produccion",
    origen_id: args.produccionId,
    item_tipo: "insumo" as const,
    item_id: insumoId,
    cantidad: -Math.round(cantidad * 100000) / 100000,
    notas: "Masa, armado y pote de la producción",
  }));
}

/** Registra una tanda de armado por gusto: suma `cajas` cajas de 12 (pasta) o unidades (resto) al
 * stock de terminados de ese gusto, guarda el relleno cocido usado y descuenta la masa, el armado y
 * el pote de la receta (`consumoInsumosProduccion`). */
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
      ...consumoInsumosProduccion(d, { produccionId: args.id, producto_id: producto.id, cajas: args.cajas, fecha: args.fecha }),
    ],
  };
}
