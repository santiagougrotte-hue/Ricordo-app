// Producción de preparaciones intermedias (rellenos, masas, salsas base) independiente de la
// elaboración de cajas — Sección 5/6 del pedido de mejoras. Vive aparte de calc-v2.ts porque es
// un subsistema nuevo (reservas, lotes, tablero de producción) que no toca el costeo de venta
// existente salvo en el único punto explícito donde una variante declara que usa una preparación
// (`ProductoVariante.preparacion_relleno_id`) — sin ese campo, nada de este archivo cambia el
// comportamiento de ningún cálculo ya existente.
//
// Regla general de todo el archivo: nunca se inventa un dato. Sin receta de preparación cargada,
// sin rendimiento de referencia, sin lotes, o sin el link preparación↔variante, las funciones
// devuelven null/0/[] explícitos en vez de asumir un valor — el llamador decide cómo mostrar esa
// ausencia (nunca como si fuera un cálculo real).

import type { RicordoDataV2, ProductoVariante, TipoItemStock, Reserva, LotePreparacion, InventarioMovimiento, OrdenProduccion } from "./types-v2";
import { calcularStock, recetaEfectivaVariante, aGramos } from "./calc-v2";
import { uid } from "./id";

export { aGramos, deGramos, stockRestanteLote, lotesConStockOrdenados, costoPromedioPorKgPreparacion } from "./calc-v2";
export type { LoteConStock } from "./calc-v2";

// --- Stock físico / reservado / disponible -------------------------------------------------------

/** Suma de reservas activas de un ítem — comprometido para una orden de producción o un pedido,
 * pero todavía no descontado del stock físico (eso pasa recién al confirmar/despachar). */
export function calcularStockReservado(data: RicordoDataV2, itemTipo: TipoItemStock, itemId: string): number {
  return data.reservas
    .filter((r) => r.estado === "activa" && r.item_tipo === itemTipo && r.item_id === itemId)
    .reduce((acc, r) => acc + r.cantidad, 0);
}

/** Lo que realmente se puede comprometer todavía: físico menos lo ya reservado por otra orden o
 * pedido — evita reservar (o planificar producir) dos veces la misma unidad de stock. */
export function calcularStockDisponible(data: RicordoDataV2, itemTipo: TipoItemStock, itemId: string): number {
  return calcularStock(data, itemTipo, itemId) - calcularStockReservado(data, itemTipo, itemId);
}

// --- Receta de una preparación (relleno) ----------------------------------------------------------

export interface NecesidadInsumoPreparacion {
  insumo_id: string;
  nombre: string;
  unidad: string;
  cantidad_necesaria: number;
  disponible: number;
  faltante: number;
}

export interface NecesidadPreparacion {
  preparacion_id: string;
  cantidad_objetivo: number;
  factor_escala: number;
  insumos: NecesidadInsumoPreparacion[];
}

/** Ingredientes necesarios para obtener `cantidadObjetivo` (en Preparacion.unidad) de una
 * preparación, escalando la receta de referencia proporcionalmente. null si la preparación no
 * tiene receta cargada o no tiene rendimiento de referencia (> 0) — nunca se asume una receta. */
export function necesidadPreparacion(data: RicordoDataV2, preparacionId: string, cantidadObjetivo: number): NecesidadPreparacion | null {
  const receta = data.preparacion_recetas.find((r) => r.preparacion_id === preparacionId);
  if (!receta || !receta.rendimiento_referencia || receta.rendimiento_referencia <= 0) return null;
  const items = data.preparacion_receta_items.filter((i) => i.preparacion_id === preparacionId);
  if (items.length === 0) return null;

  const factor = cantidadObjetivo / receta.rendimiento_referencia;
  const insumos: NecesidadInsumoPreparacion[] = items.map((item) => {
    const insumo = data.insumos.find((i) => i.id === item.insumo_id);
    const cantidad_necesaria = item.cantidad * factor;
    const disponible = insumo ? calcularStockDisponible(data, "insumo", insumo.id) : 0;
    return {
      insumo_id: item.insumo_id,
      nombre: insumo?.nombre ?? "(insumo eliminado)",
      unidad: insumo?.unidad ?? item.unidad ?? "",
      cantidad_necesaria,
      disponible,
      faltante: Math.max(0, cantidad_necesaria - disponible),
    };
  });
  return { preparacion_id: preparacionId, cantidad_objetivo: cantidadObjetivo, factor_escala: factor, insumos };
}

/** Costo de una lista de consumos reales de insumos (precio ACTUAL al momento de confirmar la
 * elaboración) — se usa una sola vez, al confirmar, y el resultado queda congelado en el lote. */
export function costoConsumoInsumos(data: RicordoDataV2, consumos: { insumo_id: string; cantidad: number }[]): number {
  return Math.round(
    consumos.reduce((acc, c) => {
      const insumo = data.insumos.find((i) => i.id === c.insumo_id);
      return acc + c.cantidad * (insumo?.precio_actual ?? 0);
    }, 0)
  );
}

// --- Consumo de relleno al elaborar cajas ---------------------------------------------------------

/** Consumo de relleno por caja, en gramos, tal como está cargado en la variante — nunca inventado
 * (el valor sale de la receta/ficha del producto, Sección 6). null si no está cargado. */
export function consumoRellenoPorCajaG(variante: ProductoVariante): number | null {
  return variante.gramos_relleno_por_caja ?? null;
}

export interface NecesidadCajas {
  variante_id: string;
  cantidad_cajas: number;
  /** null si la variante no tiene preparación de relleno vinculada (no aplica, no es un faltante). */
  relleno: { preparacion_id: string; necesario_g: number; disponible_g: number; faltante_g: number } | null;
  /** Insumos de masa/packaging/terminación (y relleno SOLO si no hay preparación vinculada, para
   * no duplicar el costo/consumo del relleno que ya se resolvió aparte). */
  insumos: NecesidadInsumoPreparacion[];
  /** Cuántas cajas se pueden elaborar en este momento considerando TODO lo que tiene restricción
   * conocida (relleno + insumos) — el mínimo de cada límite individual. null si no hay ninguna
   * restricción calculable (sin receta ni relleno vinculado). */
  cajas_posibles: number | null;
}

/** Cuánto relleno, masa, packaging y terminación hacen falta para elaborar `cantidadCajas` de una
 * variante — y cuántas de esas cajas ya se podrían hacer con lo disponible ahora. Reutiliza
 * `recetaEfectivaVariante` (ya probada) para masa/packaging/terminación; el relleno se resuelve
 * aparte desde el stock de la preparación vinculada, si la hay. */
export function necesidadCajas(data: RicordoDataV2, variante: ProductoVariante, cantidadCajas: number): NecesidadCajas {
  const tieneRelleno = !!variante.preparacion_relleno_id;
  const itemsReceta = recetaEfectivaVariante(data, variante).filter((i) => !tieneRelleno || i.etapa !== "relleno");

  const insumos: NecesidadInsumoPreparacion[] = itemsReceta.map((item) => {
    const insumo = data.insumos.find((i) => i.id === item.insumo_id);
    const cantidad_necesaria = item.cantidad * cantidadCajas;
    const disponible = insumo ? calcularStockDisponible(data, "insumo", insumo.id) : 0;
    return {
      insumo_id: item.insumo_id,
      nombre: insumo?.nombre ?? "(insumo eliminado)",
      unidad: insumo?.unidad ?? "",
      cantidad_necesaria,
      disponible,
      faltante: Math.max(0, cantidad_necesaria - disponible),
    };
  });

  let relleno: NecesidadCajas["relleno"] = null;
  const limites: number[] = [];
  if (tieneRelleno && variante.preparacion_relleno_id) {
    const gramosPorCaja = consumoRellenoPorCajaG(variante);
    const preparacion = data.preparaciones.find((p) => p.id === variante.preparacion_relleno_id);
    // El stock de la preparación está en su propia unidad (g o kg) — se convierte a gramos para
    // compararlo con gramos_relleno_por_caja; sin una unidad g/kg cargada, no hay forma verificable
    // de comparar, así que el relleno queda sin resolver en vez de asumir una equivalencia.
    const disponibleEnUnidadPropia = preparacion ? calcularStockDisponible(data, "preparacion", preparacion.id) : null;
    const disponible_g = preparacion && disponibleEnUnidadPropia !== null ? aGramos(disponibleEnUnidadPropia, preparacion.unidad) : null;
    if (gramosPorCaja && gramosPorCaja > 0 && disponible_g !== null) {
      const necesario_g = gramosPorCaja * cantidadCajas;
      relleno = { preparacion_id: variante.preparacion_relleno_id, necesario_g, disponible_g, faltante_g: Math.max(0, necesario_g - disponible_g) };
      limites.push(Math.floor(disponible_g / gramosPorCaja));
    }
  }
  for (const item of itemsReceta) {
    if (item.cantidad <= 0) continue;
    const insumo = data.insumos.find((i) => i.id === item.insumo_id);
    const disponible = insumo ? calcularStockDisponible(data, "insumo", insumo.id) : 0;
    limites.push(Math.floor(disponible / item.cantidad));
  }

  return {
    variante_id: variante.id,
    cantidad_cajas: cantidadCajas,
    relleno,
    insumos,
    cajas_posibles: limites.length > 0 ? Math.max(0, Math.min(...limites)) : null,
  };
}

// --- Reservas: altas/liberación/consumo --------------------------------------------------------

/** Reservas activas de un origen (orden de producción o pedido) — usado para no duplicar altas si
 * ya existen, y para liberarlas/consumirlas todas juntas. */
export function reservasDeOrigen(data: RicordoDataV2, origenTipo: Reserva["origen_tipo"], origenId: string): Reserva[] {
  return data.reservas.filter((r) => r.origen_tipo === origenTipo && r.origen_id === origenId && r.estado === "activa");
}

/** Construye las reservas de insumos (y de relleno, si corresponde) para planificar una orden de
 * producción — reserva como máximo lo que hay disponible en este momento, nunca más (lo que falta
 * queda afuera de la reserva, visible como faltante en `NecesidadPreparacion`/`NecesidadCajas`).
 * Pura: no escribe nada, el llamador decide cuándo agregar el resultado a `data.reservas`. */
export function construirReservasInsumos(
  insumos: NecesidadInsumoPreparacion[],
  origenTipo: Reserva["origen_tipo"],
  origenId: string,
  fecha: string
): Reserva[] {
  return insumos
    .filter((i) => i.disponible > 0)
    .map((i) => ({
      id: uid("RSV"),
      item_tipo: "insumo" as const,
      item_id: i.insumo_id,
      cantidad: Math.min(i.cantidad_necesaria, i.disponible),
      origen_tipo: origenTipo,
      origen_id: origenId,
      estado: "activa" as const,
      fecha,
    }));
}

export function construirReservaRelleno(
  relleno: NecesidadCajas["relleno"],
  origenTipo: Reserva["origen_tipo"],
  origenId: string,
  fecha: string
): Reserva | null {
  if (!relleno || relleno.disponible_g <= 0) return null;
  return {
    id: uid("RSV"),
    item_tipo: "preparacion",
    item_id: relleno.preparacion_id,
    cantidad: Math.min(relleno.necesario_g, relleno.disponible_g),
    origen_tipo: origenTipo,
    origen_id: origenId,
    estado: "activa",
    fecha,
  };
}

/** Libera (estado -> "liberada") todas las reservas activas de un origen — cancelar una
 * planificación nunca borra el registro, solo deja de contarlo como comprometido. */
export function liberarReservasDeOrigen(data: RicordoDataV2, origenTipo: Reserva["origen_tipo"], origenId: string): Reserva[] {
  return data.reservas.map((r) => (r.origen_tipo === origenTipo && r.origen_id === origenId && r.estado === "activa" ? { ...r, estado: "liberada" } : r));
}

/** Marca consumidas (ya no cuentan como reservadas NI se vuelven a usar) las reservas activas de
 * un origen, al mismo tiempo que se registra el movimiento real — evita que una reserva consumida
 * se siga restando del disponible además del movimiento físico ya aplicado. */
function marcarReservasConsumidas(data: RicordoDataV2, origenTipo: Reserva["origen_tipo"], origenId: string): Reserva[] {
  return data.reservas.map((r) => (r.origen_tipo === origenTipo && r.origen_id === origenId && r.estado === "activa" ? { ...r, estado: "consumida" } : r));
}

export interface ResultadoConfirmarPreparacion {
  movimientos_nuevos: InventarioMovimiento[];
  lote: LotePreparacion;
  reservas_actualizadas: Reserva[];
  orden_actualizada: OrdenProduccion;
}

/** Confirma la elaboración de un lote de una preparación: registra el consumo REAL de insumos
 * (puede diferir de lo planificado), genera el lote con el peso REAL obtenido y su costo real, y
 * libera (consume) las reservas de la orden. Un único momento de registro — movimientos, lote y
 * cambio de estado de la orden viajan juntos en el mismo resultado, para que quien lo persista lo
 * haga en una sola escritura (nunca una confirmación a medias). */
export function confirmarProduccionPreparacion(
  data: RicordoDataV2,
  orden: OrdenProduccion,
  consumoReal: { insumo_id: string; cantidad: number }[],
  cantidadRealObtenida: number,
  fecha: string,
  datosLote?: { ubicacion?: string; vencimiento?: string; notas?: string }
): ResultadoConfirmarPreparacion {
  const loteId = uid("LOTE");
  const movimientosConsumo: InventarioMovimiento[] = consumoReal
    .filter((c) => c.cantidad > 0)
    .map((c) => ({
      id: uid("MOV"),
      fecha,
      tipo: "consumo",
      origen_tipo: "orden_produccion",
      origen_id: orden.id,
      item_tipo: "insumo",
      item_id: c.insumo_id,
      cantidad: -c.cantidad,
    }));
  const movimientoIngreso: InventarioMovimiento = {
    id: uid("MOV"),
    fecha,
    tipo: "produccion",
    origen_tipo: "orden_produccion",
    origen_id: orden.id,
    item_tipo: "preparacion",
    item_id: orden.item_id,
    cantidad: cantidadRealObtenida,
    lote_id: loteId,
  };
  const lote: LotePreparacion = {
    id: loteId,
    preparacion_id: orden.item_id,
    fecha_elaboracion: fecha,
    cantidad_obtenida: cantidadRealObtenida,
    costo_total: costoConsumoInsumos(data, consumoReal),
    orden_produccion_id: orden.id,
    ...datosLote,
  };
  return {
    movimientos_nuevos: [...movimientosConsumo, movimientoIngreso],
    lote,
    reservas_actualizadas: marcarReservasConsumidas(data, "orden_produccion", orden.id),
    orden_actualizada: { ...orden, estado: "terminado", cantidad_real: cantidadRealObtenida, fecha_confirmacion: fecha, lote_generado_id: loteId },
  };
}

export interface ResultadoConfirmarCajas {
  movimientos_nuevos: InventarioMovimiento[];
  reservas_actualizadas: Reserva[];
  orden_actualizada: OrdenProduccion;
}

/** Confirma la elaboración de cajas de una variante: descuenta el consumo REAL de relleno (del
 * stock de la preparación vinculada, con los lotes elegidos) y de masa/packaging/terminación, e
 * ingresa las cajas realmente obtenidas al stock de producto terminado. Nunca vuelve a descontar
 * los insumos originales del relleno (esos ya se consumieron al elaborar el lote) — el costo de
 * esas cajas sigue saliendo de `costoVariante`, que ya sabe (vía `preparacion_relleno_id`) tomar
 * el costo del relleno desde el lote en vez de recalcularlo desde insumos crudos. */
export function confirmarElaboracionCajas(
  data: RicordoDataV2,
  orden: OrdenProduccion,
  cajasReales: number,
  fecha: string,
  consumoRelleno: { lote_id: string; cantidad: number }[],
  consumoInsumosReal: { insumo_id: string; cantidad: number }[]
): ResultadoConfirmarCajas {
  const movimientosRelleno: InventarioMovimiento[] = consumoRelleno
    .filter((c) => c.cantidad > 0)
    .map((c) => ({
      id: uid("MOV"),
      fecha,
      tipo: "consumo",
      origen_tipo: "orden_produccion",
      origen_id: orden.id,
      item_tipo: "preparacion",
      item_id: data.lotes_preparacion.find((l) => l.id === c.lote_id)?.preparacion_id ?? "",
      cantidad: -c.cantidad,
      lote_id: c.lote_id,
    }));
  const movimientosInsumos: InventarioMovimiento[] = consumoInsumosReal
    .filter((c) => c.cantidad > 0)
    .map((c) => ({
      id: uid("MOV"),
      fecha,
      tipo: "consumo",
      origen_tipo: "orden_produccion",
      origen_id: orden.id,
      item_tipo: "insumo",
      item_id: c.insumo_id,
      cantidad: -c.cantidad,
    }));
  const movimientoCajas: InventarioMovimiento = {
    id: uid("MOV"),
    fecha,
    tipo: "produccion",
    origen_tipo: "orden_produccion",
    origen_id: orden.id,
    item_tipo: "producto_variante",
    item_id: orden.item_id,
    cantidad: cajasReales,
  };
  return {
    movimientos_nuevos: [...movimientosRelleno, ...movimientosInsumos, movimientoCajas],
    reservas_actualizadas: marcarReservasConsumidas(data, "orden_produccion", orden.id),
    orden_actualizada: {
      ...orden,
      estado: "terminado",
      cantidad_real: cajasReales,
      fecha_confirmacion: fecha,
      lotes_relleno_consumidos: consumoRelleno.map((c) => ({ lote_id: c.lote_id, cantidad: c.cantidad })),
    },
  };
}
