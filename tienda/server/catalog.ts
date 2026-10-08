// Datos públicos de la tienda: solo lo activo. Nunca el email de aviso ni pedidos.
import type { Query } from './db';
import type { Locality, Product, ShippingZone, StoreSettings } from '../src/lib/types';
import { mapBand } from './distance';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export function mapProduct(r: Row): Product & { active: boolean } {
  return {
    id: r.id, slug: r.slug, name: r.name, pastaType: r.pasta_type, filling: r.filling, description: r.description,
    unitsPerBox: r.units_per_box, price: r.price, stock: r.stock, lowStockThreshold: r.low_stock_threshold,
    featured: r.featured, countsAsBox: r.counts_as_box, sortOrder: r.sort_order, active: r.active,
    media: ((r.media ?? []) as Row[])
      .map((m) => ({ id: m.id, url: String(m.url).startsWith('/') ? m.url : `/media/${m.url}`, kind: m.kind, alt: m.alt, isCover: m.is_cover, sortOrder: m.sort_order }))
      .sort((a, b) => Number(b.isCover) - Number(a.isCover) || a.sortOrder - b.sortOrder),
  };
}

export const PRODUCTS_SQL = `
  select p.*, coalesce((select json_agg(m order by m.sort_order) from product_media m where m.product_id = p.id), '[]') as media
  from products p`;

export async function getCatalog(q: Query, opts: { distanceEnabled?: boolean } = {}): Promise<{ products: Product[]; zones: ShippingZone[]; localities: Locality[]; settings: StoreSettings }> {
  const [products, zones, localities, [s], [cfg], bands] = await Promise.all([
    q(`${PRODUCTS_SQL} where p.active order by p.sort_order`),
    q(`select * from shipping_zones where active order by sort_order`),
    q(`select l.* from localities l join shipping_zones z on z.id = l.zone_id where l.active and z.active order by l.sort_order, l.name`),
    q(`select * from store_public_settings()`),
    q(`select pricing_mode, absorb_per_box, rounding from shipping_config limit 1`),
    q(`select * from shipping_bands order by up_to_km nulls last`),
  ]);
  return {
    products: products.map((r) => {
      const { active: _a, ...p } = mapProduct(r);
      void _a;
      return p;
    }),
    zones: zones.map(mapZone),
    localities: localities.map(mapLocality),
    settings: {
      ...mapSettings(s as Row),
      distanceEnabled: !!opts.distanceEnabled,
      // La tabla de escalones es pública (se muestra en "¿Llegamos a tu casa?"); el origen no.
      shippingBands: opts.distanceEnabled && (cfg as Row | undefined)?.pricing_mode === 'bands' ? bands.map(mapBand) : [],
      // Envío por cajas: el carrito resta lo que absorbe cada caja al costo del viaje (no expone el origen).
      shippingByBoxes: (cfg as Row | undefined)?.pricing_mode === 'boxes'
        ? { absorbPerBox: (cfg as Row).absorb_per_box, rounding: (cfg as Row).rounding }
        : undefined,
    },
  };
}

export function mapZone(z: Row): ShippingZone {
  return {
    id: z.id, name: z.name, shippingCost: z.shipping_cost,
    minBoxes: z.min_boxes, freeFromBoxes: z.free_from_boxes, deliveryWeekday: z.delivery_weekday, deliveryMoment: z.delivery_moment,
    discountPerBox: z.discount_per_box, discountMax: z.discount_max,
    distancePricing: z.distance_pricing, tollRoundTrip: z.toll_round_trip, avgOrdersPerRoute: Number(z.avg_orders_per_route),
  };
}

export const mapLocality = (l: Row): Locality => ({ id: l.id, name: l.name, partido: l.partido, zoneId: l.zone_id });

export function mapSettings(s: Row): StoreSettings {
  return {
    pickupEnabled: s.pickup_enabled, pickupMinBoxes: s.pickup_min_boxes, pickupAddress: s.pickup_address,
    whatsappPhone: s.whatsapp_phone, transferInfo: s.transfer_info,
    cutoffWeekday: s.cutoff_weekday, cutoffTime: String(s.cutoff_time).slice(0, 5),
  };
}
