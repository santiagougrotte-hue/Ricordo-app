// Creación de pedidos del lado del servidor (la usa netlify/functions/create-order.mts).
// 1) valida Turnstile  2) valida la forma del pedido  3) llama a create_order() con la service key
// 4) arma el comprobante  5) avisa al dueño (email / Telegram). Si el aviso falla, el pedido igual queda.
import type { OrderInput, OrderReceipt, OrderResult, ShortItem } from '../src/lib/types';

export interface ServerEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
  NOTIFY_FROM?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  SITE_URL?: string;
}

export interface Deps {
  fetch: typeof fetch;
  ip?: string;
  log?: (msg: string, extra?: unknown) => void;
}

export interface HttpResult {
  status: number;
  body: OrderResult;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
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
    notes: str('notes', 1000),
    paymentMethod: b.paymentMethod === 'cash' ? 'cash' : 'transfer',
    deliveryDate: str('deliveryDate', 10),
    deliveryWindowId: str('deliveryWindowId', 36),
    items: [],
    turnstileToken: str('turnstileToken', 4096),
  };
  if (b.deliveryMethod !== 'pickup' && b.deliveryMethod !== 'delivery') return 'Modalidad de entrega inválida';
  if (b.paymentMethod !== 'cash' && b.paymentMethod !== 'transfer') return 'Método de pago no disponible';
  if (input.customerName.trim().length < 2) return 'Falta el nombre';
  const digits = input.customerPhone.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return 'Teléfono inválido';
  if (!DATE.test(input.deliveryDate) || !UUID.test(input.deliveryWindowId)) return 'Turno inválido';
  if (!Array.isArray(b.items) || b.items.length === 0 || b.items.length > 30) return 'Carrito vacío o inválido';
  for (const it of b.items as unknown[]) {
    const o = it as Record<string, unknown>;
    if (!o || typeof o.productId !== 'string' || !UUID.test(o.productId)) return 'Producto inválido';
    if (!Number.isInteger(o.quantity) || (o.quantity as number) < 1 || (o.quantity as number) > 99) return 'Cantidad inválida';
    input.items.push({ productId: o.productId, quantity: o.quantity as number });
  }
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
  details?: string | null;
}

/** Traduce el error de create_order (SQLSTATE propio RC00x) al formato del front. */
export function mapDbError(e: PgError): OrderResult & { ok: false } {
  const msg = e.message ?? 'Error';
  switch (e.code) {
    case 'RC001': {
      let short: ShortItem[] = [];
      try {
        short = JSON.parse(e.details ?? '[]');
      } catch { /* sin detalle */ }
      return { ok: false, error: { code: 'RC001', message: msg, short } };
    }
    case 'RC003': {
      let d = { min_order: 0, missing: 0 };
      try {
        d = JSON.parse(e.details ?? '{}');
      } catch { /* sin detalle */ }
      return { ok: false, error: { code: 'RC003', message: msg, minOrder: d.min_order, missing: d.missing } };
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
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    log('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    return fail(500, { ok: false, error: { code: 'NETWORK', message: 'La tienda no está configurada todavía.' } });
  }
  const parsed = parseInput(raw);
  if (typeof parsed === 'string') return bad(parsed);

  if (!(await verifyTurnstile(parsed.turnstileToken, env, deps))) {
    return fail(403, { ok: false, error: { code: 'CAPTCHA', message: 'No pudimos verificar que no sos un robot.' } });
  }

  const rest = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1`;
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };

  let created: { order_id: string; order_number: number; total: number };
  try {
    const res = await deps.fetch(`${rest}/rpc/create_order`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        p_customer_name: parsed.customerName,
        p_customer_phone: parsed.customerPhone,
        p_customer_email: parsed.customerEmail || null,
        p_delivery_method: parsed.deliveryMethod,
        p_address: parsed.deliveryMethod === 'delivery' ? parsed.address : null,
        p_postal_code: parsed.deliveryMethod === 'delivery' ? parsed.postalCode : null,
        p_notes: parsed.notes || null,
        p_payment_method: parsed.paymentMethod,
        p_items: parsed.items.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
        p_delivery_date: parsed.deliveryDate,
        p_delivery_window_id: parsed.deliveryWindowId,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    if (!res.ok) {
      const mapped = mapDbError(data as PgError);
      if (mapped.error.code === 'NETWORK') log('create_order falló', data);
      return fail(mapped.error.code === 'NETWORK' ? 502 : 409, mapped);
    }
    created = (Array.isArray(data) ? data[0] : data) as typeof created;
  } catch (e) {
    log('create_order sin respuesta', String(e));
    return fail(502, { ok: false, error: { code: 'NETWORK', message: 'No pudimos registrar el pedido. Probá de nuevo en un momento.' } });
  }

  // Comprobante con los valores que quedaron guardados (no los del navegador).
  const receipt = await loadReceipt(rest, headers, created, parsed, deps);
  await notifyOwner(receipt, parsed, rest, headers, env, deps).catch((e) => log('aviso falló', String(e)));
  return { status: 200, body: { ok: true, receipt } };
}

async function loadReceipt(
  rest: string,
  headers: Record<string, string>,
  created: { order_id: string; order_number: number; total: number },
  input: OrderInput,
  deps: Deps,
): Promise<OrderReceipt> {
  const fallback: OrderReceipt = {
    orderId: created.order_id, number: Number(created.order_number), subtotal: created.total, shippingCost: 0, total: created.total,
    deliveryMethod: input.deliveryMethod, windowLabel: '', paymentMethod: input.paymentMethod, lines: [], customerName: input.customerName.trim(),
  };
  try {
    const res = await deps.fetch(
      `${rest}/orders?id=eq.${created.order_id}&select=number,subtotal,shipping_cost,total,delivery_method,delivery_window_label,payment_method,customer_name,order_items(product_name,quantity,unit_price)`,
      { headers: { ...headers, Accept: 'application/vnd.pgrst.object+json' }, signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return fallback;
    const o = (await res.json()) as {
      number: number; subtotal: number; shipping_cost: number; total: number; delivery_method: OrderReceipt['deliveryMethod'];
      delivery_window_label: string; payment_method: OrderReceipt['paymentMethod']; customer_name: string;
      order_items: { product_name: string; quantity: number; unit_price: number }[];
    };
    return {
      orderId: created.order_id, number: Number(o.number), subtotal: o.subtotal, shippingCost: o.shipping_cost, total: o.total,
      deliveryMethod: o.delivery_method, windowLabel: o.delivery_window_label, paymentMethod: o.payment_method, customerName: o.customer_name,
      lines: o.order_items.map((i) => ({ name: i.product_name, quantity: i.quantity, unitPrice: i.unit_price })),
    };
  } catch {
    return fallback;
  }
}

const peso = (n: number) => '$' + new Intl.NumberFormat('es-AR').format(n);

export function orderSummaryText(r: OrderReceipt, input: OrderInput): string {
  const lines = r.lines.map((l) => `• ${l.quantity} × ${l.name} — ${peso(l.quantity * l.unitPrice)}`).join('\n');
  const where = r.deliveryMethod === 'pickup' ? 'Retira en el local' : `Envío a ${input.address} (CP ${input.postalCode})`;
  return [
    `Pedido #${r.number} — ${peso(r.total)}`,
    `${r.customerName} · ${input.customerPhone}${input.customerEmail ? ' · ' + input.customerEmail : ''}`,
    where,
    r.windowLabel,
    `Pago: ${r.paymentMethod === 'cash' ? 'efectivo' : 'transferencia'}`,
    '',
    lines,
    `Subtotal ${peso(r.subtotal)} · Envío ${r.shippingCost ? peso(r.shippingCost) : 'gratis'}`,
    input.notes ? `\nNotas: ${input.notes}` : '',
  ].join('\n');
}

async function notifyOwner(
  r: OrderReceipt,
  input: OrderInput,
  rest: string,
  headers: Record<string, string>,
  env: ServerEnv,
  deps: Deps,
): Promise<void> {
  const text = orderSummaryText(r, input);
  const jobs: Promise<unknown>[] = [];

  if (env.RESEND_API_KEY) {
    const s = await deps.fetch(`${rest}/store_settings?select=notify_email`, {
      headers: { ...headers, Accept: 'application/vnd.pgrst.object+json' },
      signal: AbortSignal.timeout(4000),
    });
    const to = s.ok ? ((await s.json()) as { notify_email: string | null }).notify_email : null;
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
