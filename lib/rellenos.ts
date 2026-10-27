// Rellenos cocidos por kilo + consumo de masa/packaging/armado al registrar producción.
//
// Cómo trabaja Ricordo: los rellenos se cocinan una vez por mes y se pesan; los ingredientes del
// relleno se compran para esa tanda y no llevan stock (salvo que alguno se compre en cantidad, ver
// `insumosRellenoControlados`). La masa (premezcla, goma xántica, huevos…), el packaging (bolsas
// de vacío, film…) y el armado se gastan al ARMAR, no al vender: una caja ya está hecha y
// empaquetada antes de saber a qué canal va a terminar yendo, así que el consumo se registra al
// cargar la producción con la receta de la presentación de referencia (ver `varianteDeProduccion`),
// no al confirmar el pedido. Confirmar el pedido solo mueve el producto terminado (freezer).

import type { InventarioMovimiento, Pedido, ProductoVariante, RicordoDataV2 } from "./types-v2";
import { recetaEfectivaVariante } from "./calc-v2";

export const GRAMOS_RELLENO_POR_UNIDAD_DEFAULT = 13;

/** Origen histórico de los movimientos de consumo que generaba una venta, antes de que masa,
 * packaging y armado pasaran a descontarse al registrar producción (ver `ORIGEN_CONSUMO_PRODUCCION`).
 * Se mantiene solo para poder limpiar movimientos de pedidos guardados antes de ese cambio. */
export const ORIGEN_CONSUMO_VENTA = "pedido_insumos";

/** Origen de los movimientos de consumo de insumos (masa, packaging, armado) que genera registrar
 * una producción — distinto de "produccion" (la entrada de producto terminado) para poder
 * recrearlos o revertirlos sin tocar aquella. */
export const ORIGEN_CONSUMO_PRODUCCION = "produccion_insumos";

/** Estados en los que un pedido ya descontó el producto terminado del freezer: desde que se
 * confirma. Cancelado no descuenta (y devuelve lo que se había descontado). */
export const ESTADOS_QUE_DESCUENTAN: ReadonlySet<Pedido["estado"]> = new Set<Pedido["estado"]>(["Confirmado", "Produccion", "Entregado"]);

/** Gramos de relleno cocido por unidad — por defecto el general de `configuracion`, salvo que el
 * gusto (`productoId`) tenga cargado el suyo propio (`Producto.gramos_relleno_por_unidad`),
 * porque no todos los rellenos rinden igual. */
export function gramosRellenoPorUnidad(data: RicordoDataV2, productoId?: string): number {
  if (productoId) {
    const propio = data.productos.find((p) => p.id === productoId)?.gramos_relleno_por_unidad;
    if (propio != null && propio > 0) return propio;
  }
  const g = data.configuracion.gramos_relleno_por_unidad;
  return g != null && g > 0 ? g : GRAMOS_RELLENO_POR_UNIDAD_DEFAULT;
}

/** Gustos que se producen y se cuentan en cajas de 12 (y llevan los gramos de relleno por unidad):
 * los de línea Pasta que tienen alguna presentación de más de 1 unidad. Un gusto que solo se vende
 * por unidad (lasaña, salsa, pizza) se cuenta por unidad, aunque tenga cargada la línea Pasta. Esto
 * es solo sobre el TAMAÑO de caja — para si el gusto tiene relleno cocido en tanda, ver
 * `usaRellenoCocido`. */
export function usaRellenoPorUnidad(data: RicordoDataV2, productoId: string): boolean {
  const producto = data.productos.find((p) => p.id === productoId);
  if ((producto?.linea ?? "Pasta") !== "Pasta") return false;
  const variantes = data.producto_variantes.filter((v) => v.producto_id === productoId);
  return variantes.length === 0 || variantes.some((v) => (v.unidades_por_paquete ?? 1) > 1);
}

/** El gusto se carga en Operaciones → Rellenos (tandas de relleno cocido, por kilo): toda la
 * pasta rellena (`usaRellenoPorUnidad`, cajas de 12) más cualquier otro gusto, sea cual sea la
 * línea, cuya receta activa tenga una etapa "relleno" explícita — por ejemplo el ragú de la
 * lasaña, que se cocina en tanda y se pesa igual que el relleno de un sorrentino aunque se venda
 * por unidad y no en cajas de 12. */
export function usaRellenoCocido(data: RicordoDataV2, productoId: string): boolean {
  if (usaRellenoPorUnidad(data, productoId)) return true;
  const receta = data.recetas.find((r) => r.producto_id === productoId && r.activa);
  if (!receta) return false;
  return data.receta_items.some((i) => i.receta_id === receta.id && i.etapa === "relleno");
}

/** Kilos de relleno cocido que lleva armar `cajas` de una variante. 0 si no tiene relleno. */
export function kgRellenoParaCajas(data: RicordoDataV2, variante: ProductoVariante, cajas: number): number {
  if (!usaRellenoCocido(data, variante.producto_id)) return 0;
  const unidades = cajas * (variante.unidades_por_paquete ?? 12);
  return Math.round(((unidades * gramosRellenoPorUnidad(data, variante.producto_id)) / 1000) * 1000) / 1000;
}

export interface ResumenRelleno {
  producto_id: string;
  producto: string;
  kg_cargados: number;
  kg_usados: number;
  kg_disponibles: number;
  /** Cuántas "unidades de referencia" (cajas de 12 para pasta, unidades sueltas para el resto, ver
   * `unidadesPorCajaStock`) todavía se pueden armar con el relleno disponible. */
  unidades_ref_disponibles: number;
  /** Unidades sueltas por "unidad de referencia" de este gusto (12 o 1) — para mostrar "cajas de
   * 12" o "unidades" según corresponda. */
  unidades_por_ref: number;
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
      const unidadesPorRef = unidadesPorCajaStock(data, id);
      const kgPorRef = (gramosRellenoPorUnidad(data, id) * unidadesPorRef) / 1000;
      return {
        producto_id: id,
        producto: data.productos.find((p) => p.id === id)?.nombre ?? id,
        kg_cargados: Math.round(cargados * 1000) / 1000,
        kg_usados: Math.round(usado * 1000) / 1000,
        kg_disponibles: disponibles,
        unidades_ref_disponibles: kgPorRef > 0 ? Math.floor(Math.max(0, disponibles) / kgPorRef) : 0,
        unidades_por_ref: unidadesPorRef,
        ultima_tanda: tandas.map((t) => t.fecha).sort().at(-1),
      };
    })
    .sort((a, b) => a.producto.localeCompare(b.producto));
}

export function kgRellenoDisponible(data: RicordoDataV2, productoId: string): number {
  return resumenRellenos(data).find((r) => r.producto_id === productoId)?.kg_disponibles ?? 0;
}

export interface InsumoRellenoControlado {
  insumo_id: string;
  nombre: string;
  unidad: string;
  /** Sugerencia de cuánto de este insumo lleva CADA KILO de relleno ya cocido — escala la cantidad
   * de la receta (etapa relleno, por unidad de producto) al peso cocido por unidad
   * (`gramosRellenoPorUnidad`). Es una sugerencia editable al cargar la tanda, no un valor forzado:
   * la merma real de cocción puede variar de tanda en tanda. */
  cantidad_por_kg: number;
}

/** Insumos de la etapa "relleno" con stock controlado — por ejemplo almendras u otros ingredientes
 * que, a diferencia del resto del relleno (que se compra fresco para la tanda y no lleva stock), sí
 * se compran en cantidad y se guardan. Se usan para sugerir cuánto se gastó al cargar una tanda de
 * relleno cocido, en vez de dejarlos sin descontar nunca por estar en la etapa "relleno". */
export function insumosRellenoControlados(data: RicordoDataV2, productoId: string): InsumoRellenoControlado[] {
  const receta = data.recetas.find((r) => r.producto_id === productoId && r.activa);
  if (!receta) return [];
  const kgCocidoPorUnidad = gramosRellenoPorUnidad(data, productoId) / 1000;
  if (kgCocidoPorUnidad <= 0) return [];
  const porInsumo = new Map<string, number>();
  for (const item of data.receta_items) {
    if (item.receta_id !== receta.id || item.etapa !== "relleno") continue;
    if (!data.insumos.find((i) => i.id === item.insumo_id)?.controla_stock) continue;
    porInsumo.set(item.insumo_id, (porInsumo.get(item.insumo_id) ?? 0) + item.cantidad);
  }
  return [...porInsumo.entries()].map(([insumo_id, cantidadPorUnidad]) => {
    const insumo = data.insumos.find((i) => i.id === insumo_id)!;
    return { insumo_id, nombre: insumo.nombre, unidad: insumo.unidad, cantidad_por_kg: cantidadPorUnidad / kgCocidoPorUnidad };
  });
}

export const ORIGEN_TANDA_RELLENO = "relleno_tanda";

/** Movimientos de consumo de una tanda de relleno cocido — uno por cada insumo con stock
 * controlado que el usuario confirmó al cargarla (ver `insumosRellenoControlados`). Las cantidades
 * en 0 o negativas se omiten (nada que descontar). */
export function movimientosTandaRelleno(tandaId: string, fecha: string, cantidades: { insumo_id: string; cantidad: number }[]): InventarioMovimiento[] {
  return cantidades
    .filter((c) => c.cantidad > 0)
    .map((c, idx) => ({
      id: `MOV-${tandaId}-INS-${idx + 1}`,
      fecha,
      tipo: "consumo" as const,
      origen_tipo: ORIGEN_TANDA_RELLENO,
      origen_id: tandaId,
      item_tipo: "insumo" as const,
      item_id: c.insumo_id,
      cantidad: -Math.round(c.cantidad * 100000) / 100000,
      notas: "Insumo de relleno con stock controlado, usado en esta tanda",
    }));
}

/** Limpieza de compatibilidad: masa, packaging y armado se descontaban acá, al confirmar el
 * pedido — ahora se descuentan al registrar producción (`movimientosInsumosProduccion`), porque
 * son insumos que se gastan al armar la caja, no al venderla (y no dependen de a qué canal
 * termine yendo). Esta función ya no genera consumo nuevo: solo saca los movimientos que un
 * pedido guardado antes de este cambio pueda tener, si se lo vuelve a guardar. */
export function conConsumoInsumosVenta(d: RicordoDataV2, pedidoId: string): Pick<RicordoDataV2, "inventario_movimientos"> {
  return { inventario_movimientos: d.inventario_movimientos.filter((m) => !(m.origen_tipo === ORIGEN_CONSUMO_VENTA && m.origen_id === pedidoId)) };
}

/** Insumos que registrar una tanda de producción descuenta: los de stock controlado
 * (`controla_stock`) de la receta efectiva de la presentación de referencia de ese gusto
 * (`varianteDeProduccion`), salvo la etapa relleno (se controla por kilo cocido, ver Operaciones →
 * Rellenos). Se arma siempre con esa misma presentación en planta, así que no depende de a qué
 * canal/variante termine vendiéndose cada unidad. */
export function consumoInsumosProduccion(
  data: RicordoDataV2,
  productoId: string,
  cajas: number
): { insumo_id: string; nombre: string; unidad: string; cantidad: number }[] {
  if (cajas <= 0) return [];
  const variante = varianteDeProduccion(data, productoId);
  if (!variante) return [];
  const porInsumo = new Map<string, number>();
  for (const c of recetaEfectivaVariante(data, variante)) {
    if (c.etapa === "relleno" || c.cantidad <= 0) continue;
    const insumo = data.insumos.find((i) => i.id === c.insumo_id);
    if (!insumo?.controla_stock) continue;
    porInsumo.set(c.insumo_id, (porInsumo.get(c.insumo_id) ?? 0) + c.cantidad * cajas);
  }
  return [...porInsumo.entries()].map(([insumo_id, cantidad]) => {
    const insumo = data.insumos.find((i) => i.id === insumo_id)!;
    return { insumo_id, nombre: insumo.nombre, unidad: insumo.unidad, cantidad };
  });
}

/** Movimientos de consumo de una producción — uno por cada insumo de `consumoInsumosProduccion`
 * (masa, packaging, armado con stock controlado). Las cantidades en 0 o negativas se omiten. */
export function movimientosInsumosProduccion(
  produccionId: string,
  fecha: string,
  consumo: { insumo_id: string; cantidad: number }[]
): InventarioMovimiento[] {
  return consumo
    .filter((c) => c.cantidad > 0)
    .map((c, idx) => ({
      id: `MOV-${produccionId}-INS-${idx + 1}`,
      fecha,
      tipo: "consumo" as const,
      origen_tipo: ORIGEN_CONSUMO_PRODUCCION,
      origen_id: produccionId,
      item_tipo: "insumo" as const,
      item_id: c.insumo_id,
      cantidad: -Math.round(c.cantidad * 100000) / 100000,
      notas: "Masa, packaging y armado al registrar producción",
    }));
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

/** Kilos de relleno cocido para `cajas` unidades de referencia de un gusto (cajas de 12 para
 * pasta, unidades sueltas para el resto — ver `unidadesPorCajaStock`). 0 si el gusto no tiene
 * relleno. */
export function kgRellenoParaCajasGusto(data: RicordoDataV2, productoId: string, cajas: number): number {
  if (!usaRellenoCocido(data, productoId)) return 0;
  const unidades = cajas * unidadesPorCajaStock(data, productoId);
  return Math.round(((unidades * gramosRellenoPorUnidad(data, productoId)) / 1000) * 1000) / 1000;
}

export interface ItemProduccionPendiente {
  nombre: string;
  cantidad: number;
  pedidos: number;
}

/** Pedidos marcados "En producción" (Ventas → Pedidos), agrupados por sabor (producto) — no por
 * presentación/canal: el freezer por gusto (ver `conSalidaFreezerPedido`) ya es un solo pool
 * compartido entre todas las variantes del mismo producto. Cada ítem se lleva primero a unidades
 * sueltas (cantidad × unidades_por_paquete de su variante) para poder sumar presentaciones de
 * distinto tamaño sin mezclar unidades, y el total se expresa en "cajas de 12" para pasta o en
 * unidades para el resto (ver `unidadesPorCajaStock`). */
export function produccionPendientePorSabor(data: RicordoDataV2, pedidos: Pedido[]): ItemProduccionPendiente[] {
  const idsPedidos = new Set(pedidos.map((p) => p.id));
  const items = data.pedido_items.filter((i) => idsPedidos.has(i.pedido_id));
  const porProducto = new Map<string, { productoId: string | null; nombre: string; unidades: number; pedidos: Set<string> }>();
  for (const item of items) {
    const variante = item.producto_variante_id ? data.producto_variantes.find((v) => v.id === item.producto_variante_id) : undefined;
    const producto = variante ? data.productos.find((p) => p.id === variante.producto_id) : undefined;
    const clave = producto?.id ?? item.producto_variante_id ?? item.id;
    const unidadesItem = item.cantidad * (variante?.unidades_por_paquete ?? 1);
    const actual = porProducto.get(clave) ?? { productoId: producto?.id ?? null, nombre: producto?.nombre ?? item.nombre_historico, unidades: 0, pedidos: new Set<string>() };
    actual.unidades += unidadesItem;
    actual.pedidos.add(item.pedido_id);
    porProducto.set(clave, actual);
  }
  return Array.from(porProducto.values())
    .map((v) => {
      const ref = v.productoId ? unidadesPorCajaStock(data, v.productoId) : 1;
      return { nombre: v.nombre, cantidad: Math.round((v.unidades / ref) * 100) / 100, pedidos: v.pedidos.size };
    })
    .sort((a, b) => b.cantidad - a.cantidad);
}

/** Registra una tanda de armado por gusto: suma `cajas` cajas de 12 (pasta) o unidades (resto) al
 * stock de terminados de ese gusto, guarda el relleno cocido usado y descuenta los insumos de
 * masa, packaging y armado con stock controlado (ver `consumoInsumosProduccion`). Confirmar el
 * pedido ya no vuelve a tocar esos insumos — solo mueve el producto terminado. */
export function registrarProduccion(
  d: RicordoDataV2,
  args: { id: string; movId: string; producto_id: string; cajas: number; fecha: string; notas?: string }
): RicordoDataV2 {
  const producto = d.productos.find((p) => p.id === args.producto_id);
  if (!producto || args.cajas <= 0) return d;
  const variante = varianteDeProduccion(d, producto.id);
  const kgRelleno = kgRellenoParaCajasGusto(d, producto.id, args.cajas);
  const consumo = consumoInsumosProduccion(d, producto.id, args.cajas);
  const movsInsumos = movimientosInsumosProduccion(args.id, args.fecha, consumo);
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
      ...movsInsumos,
    ],
  };
}

/** Elimina una producción ya registrada y revierte todo lo que generó: la salida de producto
 * terminado, el consumo de insumos de masa/packaging/armado, y (al sacar el registro de
 * `produccion`) los kilos de relleno cocido que había usado, ya que `resumenRellenos` los resta en
 * vivo a partir de `Produccion.kg_relleno`. */
export function quitarProduccion(d: RicordoDataV2, produccionId: string): RicordoDataV2 {
  return {
    ...d,
    produccion: d.produccion.filter((p) => p.id !== produccionId),
    inventario_movimientos: d.inventario_movimientos.filter(
      (m) => !((m.origen_tipo === "produccion" || m.origen_tipo === ORIGEN_CONSUMO_PRODUCCION) && m.origen_id === produccionId)
    ),
  };
}
