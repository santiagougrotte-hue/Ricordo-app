// Stock reservado para pedidos (producto terminado) — nunca se inventa un dato: sin reservas
// activas, disponible === físico.

import type { RicordoDataV2, TipoItemStock } from "./types-v2";
import { calcularStock } from "./calc-v2";

/** Suma de reservas activas de un ítem — comprometido para un pedido, pero todavía no descontado
 * del stock físico (eso pasa recién al confirmar/despachar). */
export function calcularStockReservado(data: RicordoDataV2, itemTipo: TipoItemStock, itemId: string): number {
  return data.reservas
    .filter((r) => r.estado === "activa" && r.item_tipo === itemTipo && r.item_id === itemId)
    .reduce((acc, r) => acc + r.cantidad, 0);
}

/** Lo que realmente se puede comprometer todavía: físico menos lo ya reservado por otro pedido —
 * evita reservar dos veces la misma unidad de stock. */
export function calcularStockDisponible(data: RicordoDataV2, itemTipo: TipoItemStock, itemId: string): number {
  return calcularStock(data, itemTipo, itemId) - calcularStockReservado(data, itemTipo, itemId);
}
