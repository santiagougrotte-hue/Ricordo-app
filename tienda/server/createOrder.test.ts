import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import { handleCreateOrder, mapDbError, parseInput, type ServerEnv } from './createOrder';
import type { Query } from './db';
import { freshDb, TEST_DB } from './testdb';

const P1 = '00000000-0000-4000-8000-000000000001'; // sorrentinos J&M&N $9800, stock 14
const P2 = '00000000-0000-4000-8000-000000000002'; // ravioles ricota $8500, stock 2
const P5 = '00000000-0000-4000-8000-000000000005'; // verdura y pollo $8900, stock 20
const W = '11111111-1111-4111-8111-111111111111';
const BASE = {
  customerName: 'Ana Pérez', customerPhone: '11 5555 1234', customerEmail: 'ana@x.com', deliveryMethod: 'delivery',
  address: 'Calle 14 1234', postalCode: 'B1884ABC', notes: '', paymentMethod: 'transfer',
  deliveryDate: '2026-10-09', deliveryWindowId: W, items: [{ productId: P1, quantity: 2 }], turnstileToken: 'ok',
};

describe('parseInput (forma del pedido)', () => {
  it('acepta un pedido válido', () => expect(typeof parseInput(BASE)).toBe('object'));
  it.each([
    [{ ...BASE, items: [] }, 'Carrito vacío o inválido'],
    [{ ...BASE, items: [{ productId: P1, quantity: 0 }] }, 'Cantidad inválida'],
    [{ ...BASE, items: [{ productId: 'x', quantity: 1 }] }, 'Producto inválido'],
    [{ ...BASE, paymentMethod: 'mercadopago' }, 'Método de pago no disponible'],
    [{ ...BASE, customerPhone: '123' }, 'Teléfono inválido'],
    [{ ...BASE, deliveryWindowId: 'nope' }, 'Turno inválido'],
    [null, 'Pedido vacío'],
  ])('rechaza %#', (body, msg) => expect(parseInput(body)).toBe(msg));
});

describe('mapDbError', () => {
  it('RC001 trae el detalle', () => expect(mapDbError({ code: 'RC001', message: 'm', detail: '[{"name":"x","available":1}]' }).error).toMatchObject({ code: 'RC001', short: [{ available: 1 }] }));
  it('error inesperado no filtra detalles', () => expect(JSON.stringify(mapDbError({ code: '42501', message: 'permission denied' }))).not.toContain('permission'));
});

describe.skipIf(!TEST_DB)('handleCreateOrder contra Netlify Database (Postgres real)', () => {
  let q: Query;
  let pool: pg.Pool;
  let slot: { window_id: string; d: string };
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const env: ServerEnv = { TURNSTILE_SECRET_KEY: 'secreto', SESSION_SECRET: 's', RESEND_API_KEY: 're', TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1', SITE_URL: 'https://ricordo-pastas.netlify.app' };
  const fakeFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('siteverify')) {
      const f = new URLSearchParams(String(init!.body));
      return Response.json({ success: f.get('secret') === 'secreto' && f.get('response') === 'ok' });
    }
    sent.push({ url: u, body: JSON.parse(String(init!.body)) });
    return Response.json({ ok: true });
  }) as unknown as typeof fetch;
  let ipN = 0;
  const run = (body: unknown, ip = `10.0.0.${++ipN}`) => handleCreateOrder(body, env, { query: q, fetch: fakeFetch, ip });
  const stock = async () => Object.fromEntries((await q<{ id: string; stock: number }>('select id, stock from products')).map((r) => [r.id, r.stock]));

  beforeAll(async () => {
    ({ q, pool } = await freshDb());
    await q(`update store_settings set notify_email = 'duenio@ricordo.com'`);
  });
  beforeEach(async () => {
    [slot] = await q<{ window_id: string; d: string }>(`select window_id, delivery_date::text d from available_delivery_slots('delivery') limit 1`);
    sent.length = 0;
  });
  afterAll(() => pool.end());

  it('pedido OK: recalcula en la base, descuenta stock, devuelve comprobante y avisa', async () => {
    const before = await stock();
    const r = await run({ ...BASE, deliveryDate: slot.d, deliveryWindowId: slot.window_id, total: 1, price: 1 });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, receipt: { number: 1001, subtotal: 19600, shippingCost: 1500, total: 21100 } });
    expect((await stock())[P1]).toBe(before[P1] - 2);
    const mail = sent.find((s) => s.url.includes('resend'))!;
    expect(mail.body).toMatchObject({ to: ['duenio@ricordo.com'], subject: 'Nuevo pedido #1001 — $21.100' });
    expect(String(mail.body.text)).toContain('Ver en el panel: https://ricordo-pastas.netlify.app/admin/pedidos');
    expect(sent.some((s) => s.url.includes('telegram'))).toBe(true);
  });

  it('captcha inválido → 403 y no toca stock ni pedidos', async () => {
    const before = await stock();
    const r = await run({ ...BASE, turnstileToken: 'otro', deliveryDate: slot.d, deliveryWindowId: slot.window_id });
    expect(r.status).toBe(403);
    expect(await stock()).toEqual(before);
  });

  it('sin TURNSTILE_SECRET_KEY no se aceptan pedidos (falla cerrado)', async () => {
    const r = await handleCreateOrder({ ...BASE, deliveryDate: slot.d, deliveryWindowId: slot.window_id }, { ...env, TURNSTILE_SECRET_KEY: undefined }, { query: q, fetch: fakeFetch, ip: '9.9.9.9' });
    expect(r.status).toBe(403);
  });

  it.each([
    ['sin stock', { items: [{ productId: P2, quantity: 3 }] }, 'RC001'],
    ['CP fuera de zona', { postalCode: '1900' }, 'RC002'],
    ['bajo el mínimo', { items: [{ productId: P2, quantity: 1 }] }, 'RC003'],
    ['turno inexistente', { deliveryWindowId: W }, 'RC006'],
  ])('%s → 409 %s y no se crea nada', async (_n, patch, code) => {
    const [{ n: before }] = await q<{ n: number }>('select count(*)::int n from orders');
    const r = await run({ ...BASE, deliveryDate: slot.d, deliveryWindowId: slot.window_id, ...patch });
    expect(r).toMatchObject({ status: 409, body: { ok: false, error: { code } } });
    const [{ n: after }] = await q<{ n: number }>('select count(*)::int n from orders');
    expect(after).toBe(before);
  });

  it('retiro sin mínimo y en efectivo', async () => {
    const [ps] = await q<{ window_id: string; d: string }>(`select window_id, delivery_date::text d from available_delivery_slots('pickup') limit 1`);
    const r = await run({ ...BASE, deliveryMethod: 'pickup', paymentMethod: 'cash', items: [{ productId: P2, quantity: 1 }], deliveryDate: ps.d, deliveryWindowId: ps.window_id });
    expect(r.body).toMatchObject({ ok: true, receipt: { shippingCost: 0, total: 8500 } });
  });

  it('concurrencia: 3 pedidos simultáneos de 8 cajas sobre 20 → pasan 2, nunca se vende de más', async () => {
    const [ps] = await q<{ window_id: string; d: string }>(`select window_id, delivery_date::text d from available_delivery_slots('pickup') limit 1`);
    const body = { ...BASE, deliveryMethod: 'pickup', items: [{ productId: P5, quantity: 8 }], deliveryDate: ps.d, deliveryWindowId: ps.window_id };
    const res = await Promise.all([run(body), run(body), run(body)]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 200, 409]);
    expect((await stock())[P5]).toBe(4);
  });

  it('límite: el 7.º pedido en una hora desde la misma IP → 429', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await run({ ...BASE, postalCode: '1900', deliveryDate: slot.d, deliveryWindowId: slot.window_id }, '7.7.7.7')).status);
    expect(statuses.slice(0, 6).every((s) => s === 409)).toBe(true);
    expect(statuses[6]).toBe(429);
  });
});
