import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AdminApi, AdminOrder, AdminProduct, AdminSettings, OrderStatus, PaymentStatus } from './adminTypes';
import type { PastaType } from '../types';
import type { DeliveryWindow } from '../slots';

type Row = Record<string, any>;

const ORDER_SELECT =
  'id,number,created_at,customer_name,customer_phone,customer_email,delivery_method,address,postal_code,zone_name,delivery_date,delivery_window_label,notes,subtotal,shipping_cost,total,payment_method,payment_status,status,order_items(product_id,product_name,quantity,unit_price)';

function mapOrder(r: Row): AdminOrder {
  return {
    id: r.id, number: Number(r.number), createdAt: r.created_at, customerName: r.customer_name, customerPhone: r.customer_phone,
    customerEmail: r.customer_email, deliveryMethod: r.delivery_method, address: r.address, postalCode: r.postal_code, zoneName: r.zone_name,
    deliveryDate: r.delivery_date, windowLabel: r.delivery_window_label, notes: r.notes, subtotal: r.subtotal, shippingCost: r.shipping_cost,
    total: r.total, paymentMethod: r.payment_method, paymentStatus: r.payment_status as PaymentStatus, status: r.status as OrderStatus,
    items: (r.order_items ?? []).map((i: Row) => ({ productId: i.product_id, productName: i.product_name, quantity: i.quantity, unitPrice: i.unit_price })),
  };
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export function createAdminSupabase(url: string, anonKey: string): AdminApi {
  const sb: SupabaseClient = createClient(url, anonKey, { auth: { persistSession: true, storageKey: 'ricordo-admin' } });
  const publicUrl = (path: string) => (/^https?:\/\//.test(path) ? path : sb.storage.from('product-media').getPublicUrl(path).data.publicUrl);

  async function getOrder(id: string) {
    return mapOrder(check(await sb.from('orders').select(ORDER_SELECT).eq('id', id).single()) as Row);
  }
  async function mediaOf(productId: string) {
    return check(await sb.from('product_media').select('id,url,sort_order,is_cover').eq('product_id', productId).order('sort_order')) as Row[];
  }

  return {
    mode: 'supabase',
    async getSession() {
      const { data } = await sb.auth.getSession();
      return data.session?.user.email ? { email: data.session.user.email } : null;
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return 'Email o contraseña incorrectos.';
      // Logueado no alcanza: tiene que estar en la tabla admins (RLS hace el resto).
      const { data } = await sb.from('admins').select('user_id').maybeSingle();
      if (!data) {
        await sb.auth.signOut();
        return 'Esta cuenta no tiene acceso al panel.';
      }
      return null;
    },
    async signOut() {
      await sb.auth.signOut();
    },

    async listOrders(sinceIso) {
      const rows = check(await sb.from('orders').select(ORDER_SELECT).gte('created_at', sinceIso).order('created_at', { ascending: false }).limit(2000));
      return (rows as Row[]).map(mapOrder);
    },
    subscribeOrders(fn) {
      const ch = sb
        .channel('admin-orders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async (payload) => {
          const id = (payload.new as Row)?.id;
          if (!id) return;
          // Los items se insertan en la misma transacción; se trae el pedido completo.
          const order = await getOrder(id).catch(() => null);
          if (order) fn({ type: payload.eventType === 'INSERT' ? 'insert' : 'update', order });
        })
        .subscribe();
      return () => {
        void sb.removeChannel(ch);
      };
    },
    async setOrderStatus(id, status) {
      check(await sb.rpc('set_order_status', { p_order_id: id, p_status: status }));
    },
    async setPaymentStatus(id, status) {
      check(await sb.from('orders').update({ payment_status: status }).eq('id', id));
    },

    async listProducts() {
      const rows = check(
        await sb.from('products').select('*,product_media(id,url,kind,alt,is_cover,sort_order)').order('sort_order'),
      ) as Row[];
      return rows.map((r): AdminProduct => ({
        id: r.id, slug: r.slug, name: r.name, pastaType: r.pasta_type as PastaType, filling: r.filling, description: r.description,
        unitsPerBox: r.units_per_box, price: r.price, stock: r.stock, lowStockThreshold: r.low_stock_threshold, featured: r.featured,
        sortOrder: r.sort_order, active: r.active,
        media: (r.product_media as Row[])
          .map((m) => ({ id: m.id, url: publicUrl(m.url), kind: m.kind, alt: m.alt, isCover: m.is_cover, sortOrder: m.sort_order }))
          .sort((a, b) => a.sortOrder - b.sortOrder),
      }));
    },
    async saveProduct(d) {
      const row = {
        slug: d.slug, name: d.name, pasta_type: d.pastaType, filling: d.filling, description: d.description, price: d.price,
        stock: d.stock, low_stock_threshold: d.lowStockThreshold, featured: d.featured, active: d.active, sort_order: d.sortOrder,
      };
      if (d.id) {
        check(await sb.from('products').update(row).eq('id', d.id));
        return d.id;
      }
      const created = check(await sb.from('products').insert(row).select('id').single()) as Row;
      return created.id;
    },
    async updateStock(id, patch) {
      const row: Row = {};
      if (patch.stock !== undefined) row.stock = patch.stock;
      if (patch.lowStockThreshold !== undefined) row.low_stock_threshold = patch.lowStockThreshold;
      if (patch.active !== undefined) row.active = patch.active;
      check(await sb.from('products').update(row).eq('id', id));
    },
    async uploadMedia(productId, file, kind, alt) {
      const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1] || 'bin';
      const path = `${productId}/${crypto.randomUUID()}.${ext}`;
      const up = await sb.storage.from('product-media').upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false });
      if (up.error) throw new Error(up.error.message);
      const existing = await mediaOf(productId);
      check(
        await sb.from('product_media').insert({
          product_id: productId, url: path, kind, alt, sort_order: existing.length, is_cover: kind === 'photo' && !existing.some((m) => m.is_cover),
        }),
      );
    },
    async deleteMedia(productId, mediaId) {
      const list = await mediaOf(productId);
      const m = list.find((x) => x.id === mediaId);
      if (!m) return;
      check(await sb.from('product_media').delete().eq('id', mediaId));
      if (!/^https?:/.test(m.url)) await sb.storage.from('product-media').remove([m.url]);
      if (m.is_cover) {
        const next = list.find((x) => x.id !== mediaId);
        if (next) check(await sb.from('product_media').update({ is_cover: true }).eq('id', next.id));
      }
    },
    async setCover(productId, mediaId) {
      // Primero se saca la portada actual (índice único de una portada por producto).
      check(await sb.from('product_media').update({ is_cover: false }).eq('product_id', productId).eq('is_cover', true));
      check(await sb.from('product_media').update({ is_cover: true }).eq('id', mediaId));
    },
    async moveMedia(productId, mediaId, dir) {
      const list = await mediaOf(productId);
      const i = list.findIndex((m) => m.id === mediaId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      await Promise.all(list.map((m, k) => (m.sort_order === k ? null : sb.from('product_media').update({ sort_order: k }).eq('id', m.id))));
    },

    async listZones() {
      const rows = check(await sb.from('shipping_zones').select('*').order('sort_order')) as Row[];
      return rows.map((z) => ({
        id: z.id, name: z.name, postalCodes: z.postal_codes, shippingCost: z.shipping_cost, minOrder: z.min_order,
        freeShippingFrom: z.free_shipping_from, active: z.active,
      }));
    },
    async saveZone(z) {
      const row = {
        name: z.name, postal_codes: z.postalCodes, shipping_cost: z.shippingCost, min_order: z.minOrder,
        free_shipping_from: z.freeShippingFrom, active: z.active,
      };
      if (z.id) check(await sb.from('shipping_zones').update(row).eq('id', z.id));
      else check(await sb.from('shipping_zones').insert(row));
    },
    async deleteZone(id) {
      check(await sb.from('shipping_zones').delete().eq('id', id));
    },

    async getSettings() {
      const s = check(await sb.from('store_settings').select('*').single()) as Row;
      return {
        pickupEnabled: s.pickup_enabled, pickupMinOrder: s.pickup_min_order, pickupAddress: s.pickup_address,
        whatsappPhone: s.whatsapp_phone, transferInfo: s.transfer_info, notifyEmail: s.notify_email ?? '',
      } satisfies AdminSettings;
    },
    async saveSettings(s) {
      check(
        await sb.from('store_settings').update({
          pickup_enabled: s.pickupEnabled, pickup_min_order: s.pickupMinOrder, pickup_address: s.pickupAddress,
          whatsapp_phone: s.whatsappPhone, transfer_info: s.transferInfo, notify_email: s.notifyEmail || null,
        }).eq('id', true),
      );
    },
    async listWindows() {
      const rows = check(await sb.from('delivery_windows').select('*').order('sort_order')) as Row[];
      return rows.map((w): DeliveryWindow => ({
        id: w.id, label: w.label, weekday: w.weekday, startsAt: String(w.starts_at).slice(0, 5), endsAt: String(w.ends_at).slice(0, 5),
        cutoffHours: w.cutoff_hours, forDelivery: w.for_delivery, forPickup: w.for_pickup, active: w.active,
      }));
    },
    async saveWindow(w) {
      const row = {
        label: w.label, weekday: w.weekday, starts_at: w.startsAt, ends_at: w.endsAt, cutoff_hours: w.cutoffHours,
        for_delivery: w.forDelivery, for_pickup: w.forPickup, active: w.active,
      };
      if (w.id) check(await sb.from('delivery_windows').update(row).eq('id', w.id));
      else check(await sb.from('delivery_windows').insert(row));
    },
  };
}
