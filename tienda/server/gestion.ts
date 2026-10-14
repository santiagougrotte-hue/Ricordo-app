// Pedido para la app de gestión (contrato crearPedidoDesdeWeb). Un renglón por producto, como guarda sus pedidos la app.
import type { Query } from './db';
import type { DiscountType } from '../src/lib/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export interface PedidoWebLinea {
  nombre_producto: string;
  cantidad: number;
  precio_unitario: number;
  precio_total: number;
  regalo: boolean;
}

export interface PedidoDesdeWeb {
  origen: 'web';
  id_pedido_web: string;
  numero: number;
  fecha: string;
  cliente: { nombre: string; telefono: string; email: string | null };
  entrega: { metodo: 'delivery' | 'pickup'; localidad: string | null; zona: string | null; fecha: string | null; detalle: string };
  lineas: PedidoWebLinea[];
  subtotal: number;
  costo_envio: number;
  total: number;
  metodo_pago: string;
  notas: string | null;
  /** Monto total descontado (0 si no hubo). */
  descuento: number;
  /** "Cupón VUELVE10", "Cliente frecuente (5ª compra)", "Promo Día de la Madre"… */
  motivo_descuento: string | null;
  cupon_codigo: string | null;
  tipo_descuento: DiscountType | null;
}

export function pedidoDesdeWeb(o: Row, items: Row[]): PedidoDesdeWeb {
  return {
    origen: 'web',
    id_pedido_web: o.id,
    numero: Number(o.number),
    fecha: new Date(o.created_at).toISOString(),
    cliente: { nombre: o.customer_name, telefono: o.customer_phone, email: o.customer_email ?? null },
    entrega: {
      metodo: o.delivery_method, localidad: o.locality ?? null, zona: o.zone_name ?? null,
      fecha: o.delivery_date ? String(o.delivery_date instanceof Date ? o.delivery_date.toISOString() : o.delivery_date).slice(0, 10) : null,
      detalle: o.delivery_window_label ?? '',
    },
    lineas: items.map((i) => ({ nombre_producto: i.product_name, cantidad: i.quantity, precio_unitario: i.unit_price, precio_total: i.quantity * i.unit_price, regalo: i.unit_price === 0 })),
    subtotal: o.subtotal,
    costo_envio: o.shipping_cost,
    total: o.total,
    metodo_pago: o.payment_method,
    notas: o.notes ?? null,
    descuento: o.discount ?? 0,
    motivo_descuento: o.discount > 0 ? o.discount_reason ?? null : null,
    cupon_codigo: o.discount > 0 ? o.coupon_code ?? null : null,
    tipo_descuento: o.discount > 0 ? o.discount_type ?? null : null,
  };
}

export async function loadPedidoDesdeWeb(q: Query, orderId: string): Promise<PedidoDesdeWeb | null> {
  const [o] = await q<Row>(`select * from orders where id = $1`, [orderId]);
  if (!o) return null;
  const items = await q<Row>(`select product_name, quantity, unit_price from order_items where order_id = $1 order by unit_price desc, product_name`, [orderId]);
  return pedidoDesdeWeb(o, items);
}

/** Manda el pedido a la app de gestión si GESTION_WEBHOOK_URL está configurada (con el secreto en un encabezado). */
export async function sendToGestion(
  orderId: string,
  env: { GESTION_WEBHOOK_URL?: string; GESTION_WEBHOOK_SECRET?: string },
  deps: { query: Query; fetch: typeof fetch },
): Promise<boolean> {
  if (!env.GESTION_WEBHOOK_URL) return false;
  const pedido = await loadPedidoDesdeWeb(deps.query, orderId);
  if (!pedido) return false;
  const res = await deps.fetch(env.GESTION_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(env.GESTION_WEBHOOK_SECRET ? { Authorization: `Bearer ${env.GESTION_WEBHOOK_SECRET}` } : {}) },
    body: JSON.stringify({ accion: 'crearPedidoDesdeWeb', pedido }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return true;
}
