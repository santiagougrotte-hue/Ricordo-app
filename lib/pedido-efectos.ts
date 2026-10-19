// Efectos de guardar un pedido sobre el resto del documento: gasto de reparto, consumo de masa y
// packaging, y salida de producto terminado del freezer por gusto, todo al confirmar el pedido. Todos los
// caminos que crean, editan o cambian el estado de un pedido pasan por `aplicarEfectosPedido`,
// para que ninguno se saltee un paso.

import { uid } from "./id";
import { diferenciaRepartoPedido } from "./calc-v2";
import { conConsumoInsumosVenta, ESTADOS_QUE_DESCUENTAN } from "./rellenos";
import type { Pedido, PedidoItem, Reserva, RicordoDataV2 } from "./types-v2";

/** Salida de producto terminado del freezer al confirmar el pedido — un solo stock por gusto
 * (`Producto.id`, en unidades sueltas), sin importar la presentación o el canal vendido: cada
 * ítem descuenta cantidad × unidades_por_paquete de su variante. Se resincroniza en cada guardado
 * (borra lo que había generado antes y lo vuelve a crear con los ítems actuales), así que editar
 * cantidades lo corrige y cancelar el pedido devuelve las cajas al freezer. */
export function conSalidaFreezerPedido(
  d: RicordoDataV2,
  pedido: Pedido,
  items: PedidoItem[]
): Pick<RicordoDataV2, "inventario_movimientos"> {
  const sinPrevios = d.inventario_movimientos.filter((m) => !(m.origen_tipo === "pedido" && m.origen_id === pedido.id));
  if (!ESTADOS_QUE_DESCUENTAN.has(pedido.estado)) return { inventario_movimientos: sinPrevios };
  const porGusto = new Map<string, number>();
  for (const i of items) {
    if (!i.producto_variante_id) continue;
    const variante = d.producto_variantes.find((v) => v.id === i.producto_variante_id);
    if (!variante) continue;
    porGusto.set(variante.producto_id, (porGusto.get(variante.producto_id) ?? 0) + i.cantidad * (variante.unidades_por_paquete ?? 1));
  }
  const nuevos = [...porGusto.entries()].map(([productoId, unidades], idx) => ({
    id: `MOV-${pedido.id}-PT-${idx + 1}`,
    fecha: pedido.fecha,
    tipo: "venta" as const,
    origen_tipo: "pedido",
    origen_id: pedido.id,
    item_tipo: "producto" as const,
    item_id: productoId,
    cantidad: -unidades,
  }));
  return { inventario_movimientos: [...sinPrevios, ...nuevos] };
}

const CATEGORIA_REPARTO = "Costo Indirecto — Reparto";

/** Si el pedido entregado costó de envío más de lo que se cobró, genera (o actualiza, si se vuelve
 * a guardar después con otros números) un gasto por la diferencia en "Costo Indirecto — Reparto" —
 * idempotente por pedido_id vía `origen_tipo`/`origen_id` (nunca duplica ni deja un monto viejo
 * dando vueltas). Si el pedido deja de estar Entregado o la diferencia vuelve a 0, el gasto
 * generado antes se saca. */
export function conGastoRepartoPedido(
  d: RicordoDataV2,
  pedido: Pedido
): Pick<typeof d, "categorias" | "movimientos_financieros"> {
  const sinReparto = d.movimientos_financieros.filter((m) => !(m.origen_tipo === "diferencia_envio" && m.origen_id === pedido.id));
  const diferencia = diferenciaRepartoPedido(pedido);
  if (pedido.estado !== "Entregado" || diferencia <= 0) {
    return { categorias: d.categorias, movimientos_financieros: sinReparto };
  }
  let categorias = d.categorias;
  let categoria = categorias.find((c) => c.ambito === "financiero" && c.nombre === CATEGORIA_REPARTO);
  if (!categoria) {
    categoria = { id: uid("CAT"), nombre: CATEGORIA_REPARTO, ambito: "financiero", activo: true };
    categorias = [...categorias, categoria];
  }
  return {
    categorias,
    movimientos_financieros: [
      ...sinReparto,
      {
        id: uid("MOVF"),
        fecha: pedido.fecha,
        tipo: "egreso",
        categoria_id: categoria.id,
        concepto: `Diferencia de envío — pedido ${pedido.id}${pedido.zona ? ` (${pedido.zona})` : ""}`,
        monto: diferencia,
        origen_tipo: "diferencia_envio",
        origen_id: pedido.id,
        estado: "confirmado",
      },
    ],
  };
}

/** Las reservas quedaron sin uso: el producto sale del freezer al confirmar el pedido, no al
 * entregar ni en una reserva aparte. Al guardar un pedido se cierran las reservas activas que tuviera de antes (consumidas
 * si sigue vigente, liberadas si se canceló) y no se crean nuevas — así no se descuenta dos veces
 * el stock disponible. */
export function reservasActualizadasParaPedido(d: RicordoDataV2, pedido: Pedido): Reserva[] {
  const estado = pedido.estado === "Cancelado" ? ("liberada" as const) : ("consumida" as const);
  return d.reservas.map((r) => (r.origen_tipo === "pedido" && r.origen_id === pedido.id && r.estado === "activa" ? { ...r, estado } : r));
}


/** Aplica, en orden y de forma idempotente, todos los efectos de un pedido ya guardado con su
 * estado actual: cierra reservas viejas, gasto de reparto, consumo de masa/packaging y salida de
 * producto terminado del freezer (por gusto). Cancelado = sin consumo ni salida. */
export function aplicarEfectosPedido(d: RicordoDataV2, pedido: Pedido, items: PedidoItem[]): RicordoDataV2 {
  let out: RicordoDataV2 = { ...d, reservas: reservasActualizadasParaPedido(d, pedido) };
  out = { ...out, ...conGastoRepartoPedido(out, pedido) };
  out = { ...out, ...conConsumoInsumosVenta(out, pedido, items) };
  out = { ...out, ...conSalidaFreezerPedido(out, pedido, items) };
  return out;
}
