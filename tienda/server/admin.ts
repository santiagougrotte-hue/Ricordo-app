// API del panel (/api/admin/*). Todo exige sesión salvo el login.
// Sesión: cookie HttpOnly firmada (HMAC), SameSite=Strict. Login con límite de intentos por IP.
import type { Query } from './db';
import type { MediaStore } from './media';
import { allow, clearCookie, ipHash, json, readCookie, sameText, sessionCookie, signSession, verifySession } from './http';
import { mapProduct, PRODUCTS_SQL } from './catalog';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export interface AdminEnv {
  ADMIN_EMAIL?: string;
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
}
export interface AdminDeps {
  query: Query;
  media: () => Promise<MediaStore>;
  ip?: string;
  secure: boolean;
}

const STATUSES = ['new', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled'];
const PAY = ['pending', 'paid', 'refunded'];
const TYPES = ['ravioles', 'sorrentinos', 'cappellacci'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEDIA_TYPES: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'video/mp4': 'mp4', 'video/webm': 'webm' };
export const MAX_UPLOAD = 5.5 * 1024 * 1024; // límite de cuerpo de las funciones de Netlify (~6 MB)

const ORDER_SQL = `
  select o.*, coalesce((select json_agg(json_build_object('product_id', product_id, 'product_name', product_name, 'quantity', quantity, 'unit_price', unit_price))
                        from order_items where order_id = o.id), '[]') as items
  from orders o`;

const day = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

export function mapOrder(r: Row) {
  return {
    id: r.id, number: Number(r.number), createdAt: new Date(r.created_at).toISOString(), updatedAt: new Date(r.updated_at).toISOString(),
    customerName: r.customer_name, customerPhone: r.customer_phone, customerEmail: r.customer_email, deliveryMethod: r.delivery_method,
    address: r.address, postalCode: r.postal_code, zoneName: r.zone_name, deliveryDate: day(r.delivery_date), windowLabel: r.delivery_window_label,
    notes: r.notes, subtotal: r.subtotal, shippingCost: r.shipping_cost, total: r.total, paymentMethod: r.payment_method,
    paymentStatus: r.payment_status, status: r.status,
    items: (r.items as Row[]).map((i) => ({ productId: i.product_id, productName: i.product_name, quantity: i.quantity, unitPrice: i.unit_price })),
  };
}

const bad = (message: string, status = 400) => json({ error: message }, status);
const int = (v: unknown, min = 0) => (Number.isInteger(v) && (v as number) >= min ? (v as number) : null);

export async function handleAdmin(req: Request, path: string, env: AdminEnv, deps: AdminDeps): Promise<Response> {
  const q = deps.query;
  const method = req.method;
  if (!env.SESSION_SECRET || !env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) return bad('El panel no está configurado (faltan variables de entorno).', 503);

  // Protección CSRF extra además de SameSite: las escrituras tienen que venir del propio panel.
  if (method !== 'GET' && req.headers.get('x-ricordo') !== 'panel') return bad('Solicitud inválida', 403);

  if (path === 'login' && method === 'POST') {
    const who = ipHash(deps.ip, env.SESSION_SECRET);
    if (!(await allow(q, 'login', who, 8, 15))) return bad('Demasiados intentos. Esperá 15 minutos.', 429);
    const b = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
    const okEmail = sameText(String(b.email ?? '').trim().toLowerCase(), env.ADMIN_EMAIL.trim().toLowerCase());
    const okPass = sameText(String(b.password ?? ''), env.ADMIN_PASSWORD);
    if (!okEmail || !okPass) return bad('Email o contraseña incorrectos.', 401);
    return json({ email: env.ADMIN_EMAIL }, 200, { 'Set-Cookie': sessionCookie(signSession(env.ADMIN_EMAIL, env.SESSION_SECRET), deps.secure) });
  }

  const email = verifySession(readCookie(req), env.SESSION_SECRET);
  if (path === 'session') return email ? json({ email }) : json({ email: null });
  if (!email) return bad('Sesión vencida. Entrá de nuevo.', 401);
  if (path === 'logout' && method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': clearCookie(deps.secure) });

  const url = new URL(req.url);
  const seg = path.split('/');
  const body = async () => (await req.json().catch(() => ({}))) as Row;

  // ── Pedidos ──
  if (path === 'orders' && method === 'GET') {
    const since = url.searchParams.get('since');
    const changed = url.searchParams.get('changedAfter');
    const rows = changed
      ? await q(`${ORDER_SQL} where o.updated_at > $1 order by o.created_at desc limit 500`, [changed])
      : await q(`${ORDER_SQL} where o.created_at >= $1 order by o.created_at desc limit 2000`, [since ?? new Date(Date.now() - 400 * 86400_000).toISOString()]);
    const [{ now }] = await q<{ now: Date }>(`select now()`);
    return json({ orders: rows.map(mapOrder), serverTime: new Date(now).toISOString() });
  }
  if (seg[0] === 'orders' && UUID.test(seg[1] ?? '') && method === 'POST') {
    const b = await body();
    if (seg[2] === 'status') {
      if (!STATUSES.includes(b.status)) return bad('Estado inválido');
      try {
        await q(`select set_order_status($1, $2::order_status)`, [seg[1], b.status]);
      } catch (e) {
        return bad((e as Error).message, 409);
      }
      return json({ ok: true });
    }
    if (seg[2] === 'payment') {
      if (!PAY.includes(b.status)) return bad('Estado de pago inválido');
      await q(`update orders set payment_status = $2::payment_status where id = $1`, [seg[1], b.status]);
      return json({ ok: true });
    }
  }

  // ── Productos ──
  if (path === 'products' && method === 'GET') {
    const rows = await q(`${PRODUCTS_SQL} order by p.sort_order`);
    return json({ products: rows.map(mapProduct) });
  }
  if (path === 'products' && method === 'POST') {
    const d = await body();
    const name = String(d.name ?? '').trim();
    const slug = String(d.slug ?? '').trim();
    if (name.length < 2 || !/^[a-z0-9-]+$/.test(slug) || !TYPES.includes(d.pastaType)) return bad('Revisá nombre, tipo y dirección (slug).');
    const price = int(d.price, 1), stock = int(d.stock), low = int(d.lowStockThreshold), order = Number.isInteger(d.sortOrder) ? d.sortOrder : 99;
    if (price === null || stock === null || low === null) return bad('Precio, stock y umbral tienen que ser números enteros.');
    const vals = [slug, name, d.pastaType, String(d.filling ?? ''), String(d.description ?? ''), price, stock, low, !!d.featured, !!d.active, order];
    try {
      if (d.id) {
        if (!UUID.test(d.id)) return bad('Producto inválido');
        await q(`update products set slug=$2, name=$3, pasta_type=$4::pasta_type, filling=$5, description=$6, price=$7, stock=$8,
                   low_stock_threshold=$9, featured=$10, active=$11, sort_order=$12, updated_at=now() where id=$1`, [d.id, ...vals]);
        return json({ id: d.id });
      }
      const [r] = await q<{ id: string }>(`insert into products (slug, name, pasta_type, filling, description, price, stock, low_stock_threshold, featured, active, sort_order)
                                          values ($1,$2,$3::pasta_type,$4,$5,$6,$7,$8,$9,$10,$11) returning id`, vals);
      return json({ id: r.id });
    } catch (e) {
      return bad(/unique|duplicate/i.test((e as Error).message) ? 'duplicate slug' : (e as Error).message, 409);
    }
  }
  if (seg[0] === 'products' && UUID.test(seg[1] ?? '') && seg[2] === 'stock' && method === 'POST') {
    const b = await body();
    const sets: string[] = [];
    const vals: unknown[] = [seg[1]];
    if (b.stock !== undefined) { if (int(b.stock) === null) return bad('Stock inválido'); vals.push(b.stock); sets.push(`stock = $${vals.length}`); }
    if (b.lowStockThreshold !== undefined) { if (int(b.lowStockThreshold) === null) return bad('Umbral inválido'); vals.push(b.lowStockThreshold); sets.push(`low_stock_threshold = $${vals.length}`); }
    if (b.active !== undefined) { vals.push(!!b.active); sets.push(`active = $${vals.length}`); }
    if (sets.length) await q(`update products set ${sets.join(', ')} where id = $1`, vals);
    return json({ ok: true });
  }
  if (seg[0] === 'products' && UUID.test(seg[1] ?? '') && seg[2] === 'media' && method === 'POST') {
    const type = (req.headers.get('content-type') ?? '').split(';')[0];
    const ext = MEDIA_TYPES[type];
    if (!ext) return bad('Formato no soportado (fotos WebP/JPG/PNG o video MP4/WebM).', 415);
    const data = await req.arrayBuffer();
    if (data.byteLength === 0) return bad('Archivo vacío');
    if (data.byteLength > MAX_UPLOAD) return bad('El archivo es muy pesado (máximo 5 MB).', 413);
    const key = `${seg[1]}/${crypto.randomUUID()}.${ext}`;
    await (await deps.media()).put(key, data, type);
    const kind = type.startsWith('video/') ? 'video' : 'photo';
    const alt = (url.searchParams.get('alt') ?? '').slice(0, 200);
    await q(`insert into product_media (product_id, url, kind, alt, sort_order, is_cover)
             select $1, $2, $3::media_kind, $4, coalesce(max(sort_order) + 1, 0),
                    $3 = 'photo' and not exists (select 1 from product_media where product_id = $1 and is_cover)
             from product_media where product_id = $1`, [seg[1], key, kind, alt]);
    return json({ ok: true, key });
  }

  // ── Archivos de producto ──
  if (seg[0] === 'media' && UUID.test(seg[1] ?? '')) {
    const [m] = await q<{ product_id: string; url: string; is_cover: boolean }>(`select product_id, url, is_cover from product_media where id = $1`, [seg[1]]);
    if (!m) return bad('Archivo inexistente', 404);
    if (method === 'DELETE') {
      await q(`delete from product_media where id = $1`, [seg[1]]);
      await (await deps.media()).delete(m.url).catch(() => {});
      if (m.is_cover) {
        await q(`update product_media set is_cover = true where id = (select id from product_media where product_id = $1 and kind = 'photo' order by sort_order limit 1)`, [m.product_id]);
      }
      return json({ ok: true });
    }
    if (seg[2] === 'cover' && method === 'POST') {
      await q(`update product_media set is_cover = false where product_id = $1 and is_cover`, [m.product_id]);
      await q(`update product_media set is_cover = true where id = $1`, [seg[1]]);
      return json({ ok: true });
    }
    if (seg[2] === 'move' && method === 'POST') {
      const dir = (await body()).dir === -1 ? -1 : 1;
      const list = await q<{ id: string }>(`select id from product_media where product_id = $1 order by sort_order, id`, [m.product_id]);
      const i = list.findIndex((x) => x.id === seg[1]);
      const j = i + dir;
      if (j >= 0 && j < list.length) {
        [list[i], list[j]] = [list[j], list[i]];
        for (const [k, x] of list.entries()) await q(`update product_media set sort_order = $2 where id = $1`, [x.id, k]);
      }
      return json({ ok: true });
    }
  }

  // ── Zonas ──
  if (path === 'zones' && method === 'GET') {
    const rows = await q(`select * from shipping_zones order by sort_order, name`);
    return json({ zones: rows.map((z) => ({ id: z.id, name: z.name, postalCodes: z.postal_codes, shippingCost: z.shipping_cost, minOrder: z.min_order, freeShippingFrom: z.free_shipping_from, active: z.active })) });
  }
  if (path === 'zones' && method === 'POST') {
    const z = await body();
    const cps = Array.isArray(z.postalCodes) ? z.postalCodes.map(String) : [];
    if (!String(z.name ?? '').trim() || !cps.length || cps.some((c: string) => !/^\d{4}$/.test(c))) return bad('Revisá el nombre y los códigos postales (4 números).');
    const cost = int(z.shippingCost), min = int(z.minOrder), free = z.freeShippingFrom === null ? null : int(z.freeShippingFrom);
    if (cost === null || min === null || (z.freeShippingFrom !== null && free === null)) return bad('Montos inválidos');
    const vals = [String(z.name).trim(), cps, cost, min, free, !!z.active];
    if (z.id) {
      if (!UUID.test(z.id)) return bad('Zona inválida');
      await q(`update shipping_zones set name=$2, postal_codes=$3, shipping_cost=$4, min_order=$5, free_shipping_from=$6, active=$7 where id=$1`, [z.id, ...vals]);
    } else {
      await q(`insert into shipping_zones (name, postal_codes, shipping_cost, min_order, free_shipping_from, active, sort_order)
               values ($1,$2,$3,$4,$5,$6,(select coalesce(max(sort_order),0)+1 from shipping_zones))`, vals);
    }
    return json({ ok: true });
  }
  if (seg[0] === 'zones' && UUID.test(seg[1] ?? '') && method === 'DELETE') {
    await q(`delete from shipping_zones where id = $1`, [seg[1]]);
    return json({ ok: true });
  }

  // ── Ajustes y turnos ──
  if (path === 'settings' && method === 'GET') {
    const [s] = await q(`select * from store_settings limit 1`);
    return json({ settings: { pickupEnabled: s.pickup_enabled, pickupMinOrder: s.pickup_min_order, pickupAddress: s.pickup_address, whatsappPhone: s.whatsapp_phone, transferInfo: s.transfer_info, notifyEmail: s.notify_email ?? '' } });
  }
  if (path === 'settings' && method === 'POST') {
    const s = await body();
    if (int(s.pickupMinOrder) === null) return bad('Mínimo inválido');
    await q(`update store_settings set pickup_enabled=$1, pickup_min_order=$2, pickup_address=$3, whatsapp_phone=$4, transfer_info=$5, notify_email=$6`,
      [!!s.pickupEnabled, s.pickupMinOrder, String(s.pickupAddress ?? ''), String(s.whatsappPhone ?? '').replace(/\D/g, ''), String(s.transferInfo ?? ''), String(s.notifyEmail ?? '').trim() || null]);
    return json({ ok: true });
  }
  if (path === 'windows' && method === 'GET') {
    const rows = await q(`select * from delivery_windows order by sort_order, weekday`);
    return json({ windows: rows.map((w) => ({ id: w.id, label: w.label, weekday: w.weekday, startsAt: String(w.starts_at).slice(0, 5), endsAt: String(w.ends_at).slice(0, 5), cutoffHours: w.cutoff_hours, forDelivery: w.for_delivery, forPickup: w.for_pickup, active: w.active })) });
  }
  if (path === 'windows' && method === 'POST') {
    const w = await body();
    const hhmm = /^\d{2}:\d{2}$/;
    if (!String(w.label ?? '').trim() || !(int(w.weekday) !== null && w.weekday <= 6) || !hhmm.test(w.startsAt) || !hhmm.test(w.endsAt) || w.endsAt <= w.startsAt || int(w.cutoffHours) === null) return bad('Revisá el turno.');
    const vals = [String(w.label).trim(), w.weekday, w.startsAt, w.endsAt, w.cutoffHours, !!w.forDelivery, !!w.forPickup, !!w.active];
    if (w.id) {
      if (!UUID.test(w.id)) return bad('Turno inválido');
      await q(`update delivery_windows set label=$2, weekday=$3, starts_at=$4, ends_at=$5, cutoff_hours=$6, for_delivery=$7, for_pickup=$8, active=$9 where id=$1`, [w.id, ...vals]);
    } else {
      await q(`insert into delivery_windows (label, weekday, starts_at, ends_at, cutoff_hours, for_delivery, for_pickup, active, sort_order)
               values ($1,$2,$3,$4,$5,$6,$7,$8,(select coalesce(max(sort_order),0)+1 from delivery_windows))`, vals);
    }
    return json({ ok: true });
  }

  return bad('No encontrado', 404);
}
