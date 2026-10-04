import { describe, expect, it, vi } from 'vitest';
import { handleCreateOrder, mapDbError, parseInput, type ServerEnv } from './createOrder';

const ENV: ServerEnv = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
  RESEND_API_KEY: 're_test',
  TELEGRAM_BOT_TOKEN: 'tg',
  TELEGRAM_CHAT_ID: '42',
};
const P1 = '00000000-0000-4000-8000-000000000001';
const W1 = '11111111-1111-4111-8111-111111111111';
const BODY = {
  customerName: 'Ana Pérez', customerPhone: '11 5555 1234', customerEmail: 'ana@x.com', deliveryMethod: 'delivery',
  address: 'Calle 14 1234', postalCode: 'B1884ABC', notes: '', paymentMethod: 'transfer',
  deliveryDate: '2026-10-09', deliveryWindowId: W1, items: [{ productId: P1, quantity: 2 }], turnstileToken: 'tok',
};
const ORDER_ROW = {
  number: 1001, subtotal: 19600, shipping_cost: 1500, total: 21100, delivery_method: 'delivery',
  delivery_window_label: 'Viernes 9/10 a la noche · 20 a 23 h', payment_method: 'transfer', customer_name: 'Ana Pérez',
  order_items: [{ product_name: 'Jamón, muzza y nuez', quantity: 2, unit_price: 9800 }],
};

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

/** fetch falso que enruta por URL y registra las llamadas. */
function fakeFetch(over: Partial<Record<string, () => Response | Promise<Response>>> = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const routes: Record<string, () => Response | Promise<Response>> = {
    siteverify: () => json({ success: true }),
    'rpc/create_order': () => json([{ order_id: 'o-1', order_number: 1001, total: 21100 }]),
    '/orders?': () => json(ORDER_ROW),
    store_settings: () => json({ notify_email: 'duenio@ricordo.com' }),
    'api.resend.com': () => json({ id: 'e1' }),
    'api.telegram.org': () => json({ ok: true }),
    ...over,
  };
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    const key = Object.keys(routes).find((k) => u.includes(k));
    if (!key) throw new Error('ruta no esperada ' + u);
    return routes[key]();
  });
  return { fetch: f as unknown as typeof fetch, calls };
}

describe('parseInput', () => {
  it('acepta un pedido válido', () => expect(typeof parseInput(BODY)).toBe('object'));
  it.each([
    [{ ...BODY, items: [] }, 'Carrito vacío o inválido'],
    [{ ...BODY, items: [{ productId: P1, quantity: 0 }] }, 'Cantidad inválida'],
    [{ ...BODY, items: [{ productId: 'x', quantity: 1 }] }, 'Producto inválido'],
    [{ ...BODY, paymentMethod: 'mercadopago' }, 'Método de pago no disponible'],
    [{ ...BODY, customerPhone: '123' }, 'Teléfono inválido'],
    [{ ...BODY, deliveryWindowId: 'nope' }, 'Turno inválido'],
    [null, 'Pedido vacío'],
  ])('rechaza %#', (body, msg) => expect(parseInput(body)).toBe(msg));
});

describe('handleCreateOrder', () => {
  it('pedido OK: valida captcha, llama a create_order con la service key, arma comprobante y avisa', async () => {
    const { fetch, calls } = fakeFetch();
    const r = await handleCreateOrder(BODY, ENV, { fetch, ip: '1.2.3.4' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, receipt: { number: 1001, total: 21100, shippingCost: 1500, windowLabel: 'Viernes 9/10 a la noche · 20 a 23 h' } });

    const verify = calls.find((c) => c.url.includes('siteverify'))!;
    expect(String(verify.init!.body)).toContain('remoteip=1.2.3.4');
    const rpc = calls.find((c) => c.url.includes('rpc/create_order'))!;
    expect((rpc.init!.headers as Record<string, string>).Authorization).toBe('Bearer service');
    expect(JSON.parse(String(rpc.init!.body))).toMatchObject({
      p_postal_code: 'B1884ABC', p_payment_method: 'transfer', p_items: [{ product_id: P1, quantity: 2 }], p_delivery_window_id: W1,
    });
    const mail = calls.find((c) => c.url.includes('resend'))!;
    expect(JSON.parse(String(mail.init!.body))).toMatchObject({ to: ['duenio@ricordo.com'], subject: 'Nuevo pedido #1001 — $21.100' });
    expect(calls.some((c) => c.url.includes('telegram'))).toBe(true);
  });

  it('no manda precios del navegador: el RPC no recibe montos', async () => {
    const { fetch, calls } = fakeFetch();
    await handleCreateOrder({ ...BODY, total: 1, price: 1 }, ENV, { fetch });
    const sent = JSON.parse(String(calls.find((c) => c.url.includes('rpc/create_order'))!.init!.body));
    expect(Object.keys(sent).some((k) => /total|price|subtotal|shipping/.test(k))).toBe(false);
  });

  it('captcha inválido → 403 y no toca la base', async () => {
    const { fetch, calls } = fakeFetch({ siteverify: () => json({ success: false }) });
    const r = await handleCreateOrder(BODY, ENV, { fetch });
    expect(r).toMatchObject({ status: 403, body: { ok: false, error: { code: 'CAPTCHA' } } });
    expect(calls.some((c) => c.url.includes('create_order'))).toBe(false);
  });

  it('sin TURNSTILE_SECRET_KEY no se aceptan pedidos (falla cerrado)', async () => {
    const { fetch } = fakeFetch();
    const r = await handleCreateOrder(BODY, { ...ENV, TURNSTILE_SECRET_KEY: undefined }, { fetch });
    expect(r.status).toBe(403);
  });

  it('sin token → 403', async () => {
    const { fetch } = fakeFetch();
    expect((await handleCreateOrder({ ...BODY, turnstileToken: '' }, ENV, { fetch })).status).toBe(403);
  });

  it('sin stock → 409 con detalle de productos', async () => {
    const { fetch } = fakeFetch({
      'rpc/create_order': () => json({ code: 'RC001', message: 'Sin stock suficiente', details: JSON.stringify([{ product_id: P1, name: 'Jamón', requested: 2, available: 1 }]) }, 400),
    });
    const r = await handleCreateOrder(BODY, ENV, { fetch });
    expect(r).toMatchObject({ status: 409, body: { ok: false, error: { code: 'RC001', short: [{ available: 1 }] } } });
  });

  it('bajo el mínimo → RC003 con cuánto falta', async () => {
    const { fetch } = fakeFetch({ 'rpc/create_order': () => json({ code: 'RC003', message: 'min', details: '{"min_order":15000,"missing":6500}' }, 400) });
    expect((await handleCreateOrder(BODY, ENV, { fetch })).body).toMatchObject({ error: { code: 'RC003', minOrder: 15000, missing: 6500 } });
  });

  it('error inesperado de la base → 502 genérico, sin filtrar detalles', async () => {
    const log = vi.fn();
    const { fetch } = fakeFetch({ 'rpc/create_order': () => json({ code: '42501', message: 'permission denied for function create_order' }, 401) });
    const r = await handleCreateOrder(BODY, ENV, { fetch, log });
    expect(r.status).toBe(502);
    expect(JSON.stringify(r.body)).not.toContain('permission');
    expect(log).toHaveBeenCalled();
  });

  it('si el email falla, el pedido igual se confirma', async () => {
    const { fetch } = fakeFetch({ 'api.resend.com': () => Promise.reject(new Error('caído')), 'api.telegram.org': () => json({}, 500) });
    expect((await handleCreateOrder(BODY, ENV, { fetch })).status).toBe(200);
  });

  it('sin aviso configurado no llama a Resend ni Telegram', async () => {
    const { fetch, calls } = fakeFetch();
    await handleCreateOrder(BODY, { ...ENV, RESEND_API_KEY: undefined, TELEGRAM_BOT_TOKEN: undefined }, { fetch });
    expect(calls.some((c) => /resend|telegram|store_settings/.test(c.url))).toBe(false);
  });

  it('sin configuración de Supabase → 500 claro', async () => {
    const { fetch } = fakeFetch();
    expect((await handleCreateOrder(BODY, {}, { fetch })).status).toBe(500);
  });
});

describe('mapDbError', () => {
  it.each(['RC002', 'RC004', 'RC005', 'RC006'])('%s pasa tal cual', (code) => expect(mapDbError({ code, message: 'm' }).error.code).toBe(code));
});
