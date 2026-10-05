// Creación de pedidos del lado del servidor (la usa netlify/functions/create-order.mts).
// 1) límite por visitante  2) valida Turnstile  3) valida la forma del pedido
// 4) llama a create_order() en Netlify Database (una transacción: stock, precios, envío, total)
// 5) arma el comprobante  6) avisa al dueño (email / Telegram). Si el aviso falla, el pedido igual queda.
import type { OrderInput, OrderReceipt, OrderResult, ShortItem } from '../src/lib/types';
import type { Query } from './db';
import { allow, ipHash } from './http';
import { distanceFor } from './distance';

export interface ServerEnv {
  TURNSTILE_SECRET_KEY?: string;
  SESSION_SECRET?: string;
  RESEND_API_KEY?: string;
  NOTIFY_FROM?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  /** WhatsApp al dueño con cada pedido, vía CallMeBot (gratis, para el propio número). */
  CALLMEBOT_APIKEY?: string;
  /** Número que recibe el aviso (54911…). Si no está, se usa el WhatsApp de la tienda (Ajustes). */
  WHATSAPP_NOTIFY_PHONE?: string;
  /** OpenRouteService: envío por distancia. Sin clave se usa el costo fijo de cada zona. */
  ORS_API_KEY?: string;
  SITE_URL?: string;
}

export interface Deps {
  query: Query;
  fetch: typeof fetch;
  ip?: string;
  log?: (msg: string, extra?: unknown) => void;
}

export interface HttpResult {
  status: number;
  body: OrderResult;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status: number, error: OrderResult & { ok: false }): HttpResult => ({ status, body: error });
const bad = (message: string) => fail(400, { ok: false, error: { code: 'RC004', message } });

/** Valida la forma (no las reglas de negocio: esas las aplica create_order en la base). */
export function parseInput(raw: unknown): OrderInput | string {
  if (!raw || typeof raw !== 'object') return 'Pedido vacío';
  const b = raw as Record<string, unknown>;
  const str = (k: string, max: number) => (typeof b[k] === 'string' ? (b[k] as string).slice(0, max) : '');
  const input: OrderInput = {
    customerName: str('customerName', 120),
    customerPhone: str('customerPhone', 40),
    customerEmail: str('customerEmail', 160),
    deliveryMethod: b.deliveryMethod === 'pickup' ? 'pickup' : 'delivery',
    address: str('address', 200),
    postalCode: str('postalCode', 16),
    localityId: Number.isInteger(b.localityId) && (b.localityId as number) > 0 ? (b.localityId as number) : null,
    notes: str('notes', 1000),
    paymentMethod: b.paymentMethod === 'cash' ? 'cash' : 'transfer',
    flexibleDelivery: b.flexibleDelivery === true,
    items: [],
    turnstileToken: str('turnstileToken', 4096),
  };
  if (b.deliveryMethod !== 'pickup' && b.deliveryMethod !== 'delivery') return 'Modalidad de entrega inválida';
  if (b.paymentMethod !== 'cash' && b.paymentMethod !== 'transfer') return 'Método de pago no disponible';
  if (input.customerName.trim().length < 2) return 'Falta el nombre';
  // El teléfono se guarda solo con números.
  input.customerPhone = input.customerPhone.replace(/\D/g, '');
  if (input.customerPhone.length < 8 || input.customerPhone.length > 15) return 'Teléfono inválido';
  if (!Array.isArray(b.items) || b.items.length === 0 || b.items.length > 30) return 'Carrito vacío o inválido';
  for (const it of b.items as unknown[]) {
    const o = it as Record<string, unknown>;
    if (!o || typeof o.productId !== 'string' || !UUID.test(o.productId)) return 'Producto inválido';
    if (!Number.isInteger(o.quantity) || (o.quantity as number) < 1 || (o.quantity as number) > 99) return 'Cantidad inválida';
    input.items.push({ productId: o.productId, quantity: o.quantity as number });
  }
  if (input.deliveryMethod === 'delivery' && input.localityId === null) return 'Elegí tu localidad';
  return input;
}

export async function verifyTurnstile(token: string | undefined, env: ServerEnv, deps: Deps): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) return false; // sin secret no se aceptan pedidos (falla cerrado)
  if (!token) return false;
  const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  if (deps.ip) form.set('remoteip', deps.ip);
  try {
    const res = await deps.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

interface PgError {
  code?: string;
  message?: string;
  detail?: string | null;
}

/** Traduce el error de create_order (SQLSTATE propio RC00x) al formato del front. */
export function mapDbError(e: PgError): OrderResult & { ok: false } {
  const msg = e.message ?? 'Error';
  switch (e.code) {
    case 'RC001': {
      let short: ShortItem[] = [];
      try {
        short = JSON.parse(e.detail ?? '[]');
      } catch { /* sin detalle */ }
      return { ok: false, error: { code: 'RC001', message: msg, short } };
    }
    case 'RC003': {
      let d: { min_boxes?: number; missing?: number; pickup_min_boxes?: number | null } = {};
      try {
        d = JSON.parse(e.detail ?? '{}');
      } catch { /* sin detalle */ }
      return { ok: false, error: { code: 'RC003', message: msg, minBoxes: d.min_boxes ?? 0, missing: d.missing ?? 0, pickupMinBoxes: d.pickup_min_boxes ?? null } };
    }
    case 'RC002':
    case 'RC004':
    case 'RC005':
    case 'RC006':
      return { ok: false, error: { code: e.code, message: msg } };
    default:
      return { ok: false, error: { code: 'NETWORK', message: 'No pudimos registrar el pedido. Probá de nuevo en un momento.' } };
  }
}

export async function handleCreateOrder(raw: unknown, env: ServerEnv, deps: Deps): Promise<HttpResult> {
  const log = deps.log ?? (() => {});
  const parsed = parseInput(raw);
  if (typeof parsed === 'string') return bad(parsed);

  // Hasta 6 pedidos por hora por visitante: frena a quien quiera "vaciar" el stock con pedidos falsos.
  const who = ipHash(deps.ip, env.SESSION_SECRET ?? 'ricordo');
  if (!(await allow(deps.query, 'order', who, 6, 60))) {
    return fail(429, { ok: false, error: { code: 'RC004', message: 'Hiciste varios pedidos seguidos. Esperá un rato o escribinos por WhatsApp.' } });
  }

  if (!(await verifyTurnstile(parsed.turnstileToken, env, deps))) {
    return fail(403, { ok: false, error: { code: 'CAPTCHA', message: 'No pudimos verificar que no sos un robot.' } });
  }

  // Envío por distancia: lo calcula el servidor (nunca se acepta un costo que mande el navegador).
  const dist = parsed.deliveryMethod === 'delivery' && parsed.localityId !== null
    ? await distanceFor({ address: parsed.address, localityId: parsed.localityId }, { query: deps.query, fetch: deps.fetch, orsKey: env.ORS_API_KEY }).catch(() => null)
    : null;

  let created: { order_id: string; order_number: number; total: number };
  try {
    const rows = await deps.query<{ order_id: string; order_number: string; total: number }>(
      `select * from create_order($1, $2, $3, $4::delivery_method, $5, $6, $7::smallint, $8, $9::payment_method, $10::jsonb, $11, $12, $13, $14, $15)`,
      [
        parsed.customerName, parsed.customerPhone, parsed.customerEmail || null, parsed.deliveryMethod,
        parsed.deliveryMethod === 'delivery' ? parsed.address : null,
        parsed.deliveryMethod === 'delivery' ? parsed.postalCode : null,
        parsed.deliveryMethod === 'delivery' ? parsed.localityId : null,
        parsed.notes || null, parsed.paymentMethod,
        JSON.stringify(parsed.items.map((i) => ({ product_id: i.productId, quantity: i.quantity }))),
        parsed.flexibleDelivery, dist?.cost ?? null, dist?.lat ?? null, dist?.lng ?? null, dist?.km ?? null,
      ],
    );
    created = { order_id: rows[0].order_id, order_number: Number(rows[0].order_number), total: rows[0].total };
  } catch (e) {
    const mapped = mapDbError(e as PgError);
    if (mapped.error.code === 'NETWORK') log('create_order falló', String((e as Error).message));
    return fail(mapped.error.code === 'NETWORK' ? 502 : 409, mapped);
  }

  // Comprobante con los valores que quedaron guardados (no los del navegador).
  const receipt = await loadReceipt(created, parsed, deps);
  await notifyOwner(receipt, parsed, env, deps).catch((e) => log('aviso falló', String(e)));
  return { status: 200, body: { ok: true, receipt } };
}

async function loadReceipt(created: { order_id: string; order_number: number; total: number }, input: OrderInput, deps: Deps): Promise<OrderReceipt> {
  const fallback: OrderReceipt = {
    orderId: created.order_id, number: created.order_number, subtotal: created.total, discount: 0, discountPct: 0, shippingCost: 0, total: created.total,
    boxCount: 0, deliveryMethod: input.deliveryMethod, deliveryDate: null, windowLabel: '', paymentMethod: input.paymentMethod, lines: [],
    customerName: input.customerName.trim(),
  };
  try {
    const [o] = await deps.query<{
      number: string; subtotal: number; discount: number; discount_pct: number; shipping_cost: number; total: number; box_count: number;
      delivery_method: OrderReceipt['deliveryMethod']; delivery_date: string | null;
      delivery_window_label: string; payment_method: OrderReceipt['paymentMethod']; customer_name: string; locality: string | null;
      items: { product_name: string; quantity: number; unit_price: number }[];
    }>(
      `select o.number, o.subtotal, o.discount, o.discount_pct, o.shipping_cost, o.total, o.box_count, o.delivery_method,
              to_char(o.delivery_date, 'YYYY-MM-DD') as delivery_date, o.delivery_window_label, o.payment_method, o.customer_name, o.locality,
              (select json_agg(json_build_object('product_name', product_name, 'quantity', quantity, 'unit_price', unit_price)) from order_items where order_id = o.id) as items
       from orders o where o.id = $1`,
      [created.order_id],
    );
    if (!o) return fallback;
    return {
      orderId: created.order_id, number: Number(o.number), subtotal: o.subtotal, discount: o.discount, discountPct: o.discount_pct,
      shippingCost: o.shipping_cost, total: o.total, boxCount: o.box_count, deliveryMethod: o.delivery_method, deliveryDate: o.delivery_date,
      windowLabel: o.delivery_window_label, paymentMethod: o.payment_method, customerName: o.customer_name, locality: o.locality,
      lines: (o.items ?? []).map((i) => ({ name: i.product_name, quantity: i.quantity, unitPrice: i.unit_price })),
    };
  } catch {
    return fallback;
  }
}

const peso = (n: number) => '$' + new Intl.NumberFormat('es-AR').format(n);

export function orderSummaryText(r: OrderReceipt, input: OrderInput): string {
  const lines = r.lines.map((l) => `• ${l.quantity} × ${l.name} — ${peso(l.quantity * l.unitPrice)}`).join('\n');
  const where = r.deliveryMethod === 'pickup'
    ? 'Retira en Berazategui'
    : `Envío a ${input.address}${r.locality ? ', ' + r.locality : ''} (CP ${input.postalCode})`;
  return [
    `Pedido #${r.number} — ${peso(r.total)} — ${r.boxCount} ${r.boxCount === 1 ? 'caja' : 'cajas'}`,
    `${r.customerName} · ${input.customerPhone}${input.customerEmail ? ' · ' + input.customerEmail : ''}`,
    where,
    r.windowLabel + (r.deliveryMethod === 'delivery' && input.flexibleDelivery ? ' (acepta que se lo lleven otro día)' : ''),
    `Pago: ${r.paymentMethod === 'cash' ? 'efectivo' : 'transferencia'}`,
    '',
    lines,
    `Subtotal ${peso(r.subtotal)}${r.discount ? ` · Descuento ${r.discountPct}% −${peso(r.discount)}` : ''} · Envío ${r.shippingCost ? peso(r.shippingCost) : 'gratis'}`,
    input.notes ? `\nNotas: ${input.notes}` : '',
  ].join('\n');
}

/** Aviso corto para WhatsApp: productos, CP, total y día de entrega. */
export function whatsappOrderText(r: OrderReceipt, input: OrderInput): string {
  const items = r.lines.map((l) => `• ${l.quantity} × ${l.name}`).join('\n');
  const where = r.deliveryMethod === 'pickup'
    ? 'Retira en Berazategui'
    : `${input.address}${r.locality ? ', ' + r.locality : ''} · CP ${input.postalCode}`;
  return [
    `Nuevo pedido #${r.number}`,
    `${r.customerName} · ${input.customerPhone}`,
    '',
    items,
    `${r.boxCount} ${r.boxCount === 1 ? 'caja' : 'cajas'}`,
    '',
    where,
    `Entrega: ${r.deliveryMethod === 'pickup' ? 'a coordinar' : r.windowLabel}${r.deliveryMethod === 'delivery' && input.flexibleDelivery ? ' (acepta otro día)' : ''}`,
    `Total: ${peso(r.total)} · ${r.paymentMethod === 'cash' ? 'efectivo' : 'transferencia'}`,
  ].join('\n');
}

/** Manda un WhatsApp al dueño vía CallMeBot. Número: WHATSAPP_NOTIFY_PHONE o el WhatsApp de la tienda (Ajustes). */
export async function sendWhatsapp(
  text: string,
  env: Pick<ServerEnv, 'CALLMEBOT_APIKEY' | 'WHATSAPP_NOTIFY_PHONE'>,
  deps: Pick<Deps, 'query' | 'fetch'>,
): Promise<{ ok: boolean; message: string }> {
  if (!env.CALLMEBOT_APIKEY) return { ok: false, message: 'Falta la clave de CallMeBot (CALLMEBOT_APIKEY) en Netlify.' };
  let phone = (env.WHATSAPP_NOTIFY_PHONE ?? '').replace(/\D/g, '');
  if (!phone) {
    const [s] = await deps.query<{ whatsapp_phone: string }>(`select whatsapp_phone from store_settings limit 1`);
    phone = (s?.whatsapp_phone ?? '').replace(/\D/g, '');
  }
  if (phone.length < 10) return { ok: false, message: 'Falta el WhatsApp de la tienda en Ajustes.' };
  // Mismo formato que el ejemplo de CallMeBot: el número con código de país, sin "+".
  const q = new URLSearchParams({ phone, text, apikey: env.CALLMEBOT_APIKEY });
  try {
    const res = await deps.fetch(`https://api.callmebot.com/whatsapp.php?${q}`, { signal: AbortSignal.timeout(8000) });
    const body = await res.text().catch(() => '');
    // CallMeBot responde con una página de texto: solo "queued"/"sent" es éxito. Cualquier otra cosa se muestra tal cual.
    const reply = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220);
    if (res.ok && /queued|message sent|enviado/i.test(reply) && !/invalid|error|not (yet )?(registered|activated)/i.test(reply)) {
      return { ok: true, message: `CallMeBot aceptó el mensaje para el +${phone}. Tiene que llegarte en unos segundos.` };
    }
    return { ok: false, message: `CallMeBot no lo mandó al +${phone}. Respuesta: "${reply || res.status}". Revisá que sea el mismo número con el que sacaste la clave.` };
  } catch {
    return { ok: false, message: 'No pudimos conectar con CallMeBot. Probá de nuevo en un rato.' };
  }
}

async function notifyOwner(r: OrderReceipt, input: OrderInput, env: ServerEnv, deps: Deps): Promise<void> {
  const text = orderSummaryText(r, input);
  const jobs: Promise<unknown>[] = [];
  if (env.RESEND_API_KEY) {
    const [s] = await deps.query<{ notify_email: string | null }>(`select notify_email from store_settings limit 1`);
    const to = s?.notify_email;
    if (to) {
      const link = env.SITE_URL ? `\n\nVer en el panel: ${env.SITE_URL.replace(/\/$/, '')}/admin/pedidos` : '';
      jobs.push(
        deps.fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: env.NOTIFY_FROM || 'Ricordo <onboarding@resend.dev>',
            to: [to],
            subject: `Nuevo pedido #${r.number} — ${peso(r.total)}`,
            text: text + link,
          }),
          signal: AbortSignal.timeout(5000),
        }),
      );
    }
  }
  if (env.CALLMEBOT_APIKEY) jobs.push(sendWhatsapp(whatsappOrderText(r, input), env, deps));
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    jobs.push(
      deps.fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: 'Nuevo pedido\n' + text }),
        signal: AbortSignal.timeout(5000),
      }),
    );
  }
  await Promise.allSettled(jobs);
}
