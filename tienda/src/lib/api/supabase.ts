import { PostgrestClient } from '@supabase/postgrest-js';
import type { StoreApi } from './types';
import type { DeliverySlot, OrderResult, Product, ShippingZone, StoreSettings } from '../types';

interface ProductRow {
  id: string; slug: string; name: string; pasta_type: Product['pastaType']; filling: string; description: string;
  units_per_box: number; price: number; stock: number; low_stock_threshold: number; featured: boolean; sort_order: number;
  product_media: { id: string; url: string; kind: 'photo' | 'video'; alt: string; is_cover: boolean; sort_order: number }[];
}

export function createSupabaseApi(url: string, anonKey: string): StoreApi {
  // Solo el cliente de consultas: la tienda no necesita auth ni realtime (eso va en el panel).
  const sb = new PostgrestClient(`${url}/rest/v1`, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } });
  const mediaUrl = (path: string) =>
    /^https?:\/\//.test(path) ? path : `${url}/storage/v1/object/public/product-media/${path.replace(/^\/+/, '')}`;

  return {
    mode: 'supabase',
    async listProducts() {
      const { data, error } = await sb
        .from('products')
        .select('id,slug,name,pasta_type,filling,description,units_per_box,price,stock,low_stock_threshold,featured,sort_order,product_media(id,url,kind,alt,is_cover,sort_order)')
        .order('sort_order');
      if (error) throw error;
      return (data as ProductRow[]).map((r) => ({
        id: r.id, slug: r.slug, name: r.name, pastaType: r.pasta_type, filling: r.filling, description: r.description,
        unitsPerBox: r.units_per_box, price: r.price, stock: r.stock, lowStockThreshold: r.low_stock_threshold,
        featured: r.featured, sortOrder: r.sort_order,
        media: r.product_media
          .map((m) => ({ id: m.id, url: mediaUrl(m.url), kind: m.kind, alt: m.alt, isCover: m.is_cover, sortOrder: m.sort_order }))
          .sort((a, b) => Number(b.isCover) - Number(a.isCover) || a.sortOrder - b.sortOrder),
      }));
    },
    async listZones() {
      const { data, error } = await sb.from('shipping_zones').select('id,name,postal_codes,shipping_cost,min_order,free_shipping_from').order('sort_order');
      if (error) throw error;
      return data.map((z): ShippingZone => ({
        id: z.id, name: z.name, postalCodes: z.postal_codes, shippingCost: z.shipping_cost, minOrder: z.min_order, freeShippingFrom: z.free_shipping_from,
      }));
    },
    async getSettings() {
      const { data, error } = await sb.rpc('store_public_settings').single();
      if (error) throw error;
      const s = data as Record<string, unknown>;
      return {
        pickupEnabled: Boolean(s.pickup_enabled), pickupMinOrder: Number(s.pickup_min_order),
        pickupAddress: String(s.pickup_address ?? ''), whatsappPhone: String(s.whatsapp_phone ?? ''), transferInfo: String(s.transfer_info ?? ''),
      } satisfies StoreSettings;
    },
    async listSlots(method) {
      const { data, error } = await sb.rpc('available_delivery_slots', { p_method: method, p_days: 14 });
      if (error) throw error;
      return (data as Record<string, string>[]).map((s): DeliverySlot => ({
        windowId: s.window_id, date: s.delivery_date, label: s.label, startsAt: s.starts_at.slice(0, 5), endsAt: s.ends_at.slice(0, 5), closesAt: s.closes_at,
      }));
    },
    async createOrder(input): Promise<OrderResult> {
      // El pedido lo crea la función de Netlify (valida Turnstile y llama a create_order con la service key).
      try {
        const res = await fetch('/api/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        return (await res.json()) as OrderResult;
      } catch {
        return { ok: false, error: { code: 'NETWORK', message: 'No pudimos conectarnos. Revisá tu conexión y probá de nuevo.' } };
      }
    },
  };
}
