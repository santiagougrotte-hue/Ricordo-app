// Efectos de guardar un pedido sobre el resto del documento: reservas del freezer, gasto de
// reparto, consumo de masa y packaging, y salida de producto terminado al entregar. Todos los
// caminos que crean, editan o cambian el estado de un pedido pasan por `aplicarEfectosPedido`,
// para que ninguno se saltee un paso.

import { uid } from "./id";
import { diferenciaRepartoPedido } from "./calc-v2";
import { conConsumoInsumosVenta } from "./rellenos";
import type { Pedido, PedidoItem, Reserva, RicordoDataV2 } from "./types-v2";

/** Registrar una entrega genera, de forma idempotente (por `origen_id`), el movimiento de salida
 * de stock por cada ítem — la trazabilidad pedido→inventario que pide el esquema nuevo. Entregar
 * un pedido NO genera caja: una venta entregada y no cobrada es una cuenta por cobrar, no plata en
 * la cuenta (ver Finanzas → Cuentas pendientes para registrar el cobro real, total o parcial). */
export function conMovimientosDeEntrega(
  d: RicordoDataV2,
  pedido: Pedido,
  items: PedidoItem[]
): Pick<typeof d, "inventario_movimientos"> {
  const yaTieneMovStock = d.inventario_movimientos.some((m) => m.origen_tipo === "pedido" && m.origen_id === pedido.id);
  // El stock de productos terminados es un solo pool por sabor (ver TipoItemStock en
  // types-v2.ts): cualquier canal/presentación que se venda descuenta el mismo pool, convertido
  // a unidades sueltas vía unidades_por_paquete de la variante realmente vendida.
  const nuevosMovStock = yaTieneMovStock
    ? []
    : items
        .flatMap((i) => {
          if (!i.producto_variante_id) return [];
          const variante = d.producto_variantes.find((v) => v.id === i.producto_variante_id);
          if (!variante) return [];
          return [
            {
              id: uid("MOV"),
              fecha: pedido.fecha,
              tipo: "venta" as const,
              origen_tipo: "pedido",
              origen_id: pedido.id,
              item_tipo: "producto" as const,
              item_id: variante.producto_id,
              cantidad: -(i.cantidad * (variante.unidades_por_paquete ?? 1)),
            },
          ];
        });

  return {
    inventario_movimientos: [...d.inventario_movimientos, ...nuevosMovStock],
  };
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

/** Reservas de producto terminado del pedido — Sección 8: confirmar un pedido reserva lo que
 * vendió (sin descontarlo del stock físico todavía); despachar (Entregado) consume esa reserva al
 * mismo tiempo que el movimiento físico real ya la descuenta de verdad; cancelar la libera. Se
 * resincroniza siempre con los ítems ACTUALES del pedido (libera lo viejo, crea lo nuevo) para
 * que editar cantidades o cambiar de producto en un pedido Confirmado/En producción nunca deje
 * una reserva vieja huérfana. */
export function reservasActualizadasParaPedido(d: RicordoDataV2, pedido: Pedido, items: PedidoItem[]): Reserva[] {
  const activasPrevias = new Set(d.reservas.filter((r) => r.origen_tipo === "pedido" && r.origen_id === pedido.id && r.estado === "activa").map((r) => r.id));
  if (pedido.estado === "Entregado") {
    return d.reservas.map((r) => (activasPrevias.has(r.id) ? { ...r, estado: "consumida" } : r));
  }
  if (pedido.estado === "Cancelado") {
    return d.reservas.map((r) => (activasPrevias.has(r.id) ? { ...r, estado: "liberada" } : r));
  }
  const liberadas = d.reservas.map((r) => (activasPrevias.has(r.id) ? { ...r, estado: "liberada" as const } : r));
  const nuevas: Reserva[] = items.flatMap((i) => {
    if (!i.producto_variante_id) return [];
    const variante = d.producto_variantes.find((v) => v.id === i.producto_variante_id);
    if (!variante) return [];
    return [
      {
        id: uid("RSV"),
        item_tipo: "producto" as const,
        item_id: variante.producto_id,
        cantidad: i.cantidad * (variante.unidades_por_paquete ?? 1),
        origen_tipo: "pedido" as const,
        origen_id: pedido.id,
        estado: "activa" as const,
        fecha: pedido.fecha,
      },
    ];
  });
  return [...liberadas, ...nuevas];
}


/** Aplica, en orden y de forma idempotente, todos los efectos de un pedido ya guardado con su
 * estado actual: reservas, gasto de reparto, consumo de masa/packaging y (si está Entregado) la
 * salida de producto terminado del freezer. */
export function aplicarEfectosPedido(d: RicordoDataV2, pedido: Pedido, items: PedidoItem[]): RicordoDataV2 {
  let out: RicordoDataV2 = { ...d, reservas: reservasActualizadasParaPedido(d, pedido, items) };
  out = { ...out, ...conGastoRepartoPedido(out, pedido) };
  out = { ...out, ...conConsumoInsumosVenta(out, pedido, items) };
  if (pedido.estado === "Entregado") out = { ...out, ...conMovimientosDeEntrega(out, pedido, items) };
  return out;
}
