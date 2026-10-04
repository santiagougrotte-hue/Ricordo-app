// Datos públicos de la tienda: solo lo activo. Nunca el email de aviso ni pedidos.
import type { Query } from './db';
import type { DeliveryMethod, DeliverySlot, Product, ShippingZone, StoreSettings } from '../src/lib/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export function mapProduct(r: Row): Product & { active: boolean } {
  return {
    id: r.id, slug: r.slug, name: r.name, pastaType: r.pasta_type, filling: r.filling, description: r.description,
    unitsPerBox: r.units_per_box, price: r.price, stock: r.stock, lowStockThreshold: r.low_stock_threshold,
    featured: r.featured, sortOrder: r.sort_order, active: r.active,
    media: ((r.media ?? []) as Row[])
      .map((m) => ({ id: m.id, url: String(m.url).startsWith('/') ? m.url : `/media/${m.url}`, kind: m.kind, alt: m.alt, isCover: m.is_cover, sortOrder: m.sort_order }))
      .sort((a, b) => Number(b.isCover) - Number(a.isCover) || a.sortOrder - b.sortOrder),
  };
}

export const PRODUCTS_SQL = `
  select p.*, coalesce((select json_agg(m order by m.sort_order) from product_media m where m.product_id = p.id), '[]') as media
  from products p`;

export async function getCatalog(q: Query): Promise<{ products: Product[]; zones: ShippingZone[]; settings: StoreSettings }> {
  const [products, zones, [s]] = await Promise.all([
    q(`${PRODUCTS_SQL} where p.active order by p.sort_order`),
    q(`select * from shipping_zones where active order by sort_order`),
    q(`select * from store_public_settings()`),
  ]);
  return {
    products: products.map((r) => {
      const { active: _a, ...p } = mapProduct(r);
      void _a;
      return p;
    }),
    zones: zones.map((z: Row) => ({
      id: z.id, name: z.name, postalCodes: z.postal_codes, shippingCost: z.shipping_cost, minOrder: z.min_order, freeShippingFrom: z.free_shipping_from,
    })),
    settings: {
      pickupEnabled: (s as Row).pickup_enabled, pickupMinOrder: (s as Row).pickup_min_order, pickupAddress: (s as Row).pickup_address,
      whatsappPhone: (s as Row).whatsapp_phone, transferInfo: (s as Row).transfer_info,
    },
  };
}

export async function getSlots(q: Query, method: DeliveryMethod): Promise<DeliverySlot[]> {
  const rows = await q(`select * from available_delivery_slots($1::delivery_method, 14)`, [method]);
  return rows.map((s: Row) => ({
    windowId: s.window_id,
    date: s.delivery_date instanceof Date ? s.delivery_date.toISOString().slice(0, 10) : String(s.delivery_date).slice(0, 10),
    label: s.label,
    startsAt: String(s.starts_at).slice(0, 5),
    endsAt: String(s.ends_at).slice(0, 5),
    closesAt: new Date(s.closes_at).toISOString(),
  }));
}
