import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import { handleCreateOrder, mapDbError, parseInput, type ServerEnv } from './createOrder';
import type { Query } from './db';
import { freshDb, TEST_DB } from './testdb';
import { deliveryDateFor } from '../src/lib/delivery';
import { discountAmount } from '../src/lib/shipping';

const P1 = '00000000-0000-4000-8000-000000000001'; // sorrentinos J&M&N $9800, stock 14
const P2 = '00000000-0000-4000-8000-000000000002'; // ravioles ricota $8500, stock 2
const P3 = '00000000-0000-4000-8000-000000000003'; // cappellacci $10200, stock 9 (en estas pruebas: "salsa", no cuenta como caja)
const P5 = '00000000-0000-4000-8000-000000000005'; // verdura y pollo $8900, stock 20
const BASE = {
  customerName: 'Ana Pérez', customerPhone: '11 5555-1234', customerEmail: 'ana@x.com', deliveryMethod: 'delivery',
  address: 'Calle 14 1234', postalCode: 'B1884ABC', localityId: 0 /* se completa con la base: Berazategui */, notes: '', paymentMethod: 'transfer', flexibleDelivery: true,
  items: [{ productId: P1, quantity: 3 }], turnstileToken: 'ok',
};

describe('parseInput (forma del pedido)', () => {
  it('acepta un pedido válido y deja el teléfono solo con números', () => {
    const r = parseInput({ ...BASE, localityId: 5 });
    expect(typeof r === 'object' && r.customerPhone).toBe('1155551234');
  });
  it.each([
    [{ ...BASE, items: [] }, 'Carrito vacío o inválido'],
    [{ ...BASE, items: [{ productId: P1, quantity: 0 }] }, 'Cantidad inválida'],
    [{ ...BASE, items: [{ productId: 'x', quantity: 1 }] }, 'Producto inválido'],
    [{ ...BASE, paymentMethod: 'mercadopago' }, 'Método de pago no disponible'],
    [{ ...BASE, customerPhone: '123' }, 'Teléfono inválido'],
    [{ ...BASE, customerPhone: '' }, 'Teléfono inválido'],
    [{ ...BASE, localityId: undefined }, 'Elegí tu localidad'],
    [null, 'Pedido vacío'],
  ])('rechaza %#', (body, msg) => expect(parseInput(body)).toBe(msg));
});

describe('mapDbError', () => {
  it('RC001 trae el detalle', () => expect(mapDbError({ code: 'RC001', message: 'm', detail: '[{"name":"x","available":1}]' }).error).toMatchObject({ code: 'RC001', short: [{ available: 1 }] }));
  it('RC003 trae cajas faltantes y el mínimo de retiro', () =>
    expect(mapDbError({ code: 'RC003', message: 'm', detail: '{"min_boxes":3,"missing":1,"pickup_min_boxes":2}' }).error).toEqual({ code: 'RC003', message: 'm', minBoxes: 3, missing: 1, pickupMinBoxes: 2 }));
  it('error inesperado no filtra detalles', () => expect(JSON.stringify(mapDbError({ code: '42501', message: 'permission denied' }))).not.toContain('permission'));
});

describe.skipIf(!TEST_DB)('handleCreateOrder contra Netlify Database (Postgres real)', () => {
  let q: Query;
  let pool: pg.Pool;
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const env: ServerEnv = { TURNSTILE_SECRET_KEY: 'secreto', SESSION_SECRET: 's', RESEND_API_KEY: 're', TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1', CALLMEBOT_APIKEY: 'k123', SITE_URL: 'https://ricordo-pastas.netlify.app' };
  const fakeFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('siteverify')) {
      const f = new URLSearchParams(String(init!.body));
      return Response.json({ success: f.get('secret') === 'secreto' && f.get('response') === 'ok' });
    }
    sent.push({ url: u, body: init?.body ? JSON.parse(String(init.body)) : {} });
    return Response.json({ ok: true });
  }) as unknown as typeof fetch;
  let ipN = 0;
  const run = (body: unknown, ip = `10.0.0.${++ipN}`) => handleCreateOrder(body, env, { query: q, fetch: fakeFetch, ip });
  const stock = async () => Object.fromEntries((await q<{ id: string; stock: number }>('select id, stock from products')).map((r) => [r.id, r.stock]));
  const count = async () => (await q<{ n: number }>('select count(*)::int n from orders'))[0].n;
  const locs: Record<string, number> = {};

  beforeAll(async () => {
    ({ q, pool } = await freshDb());
    await q(`update store_settings set notify_email = 'duenio@ricordo.com'`);
    await q(`update products set counts_as_box = false where id = $1`, [P3]);
    for (const r of await q<{ id: number; name: string }>(`select id, name from localities`)) locs[r.name] = r.id;
    BASE.localityId = locs['Berazategui'];
  });
  beforeEach(() => {
    sent.length = 0;
  });
  afterAll(() => pool.end());

  it('envío OK: cajas, zona, localidad, fecha y teléfono solo con números; recalcula en la base y avisa', async () => {
    const before = await stock();
    const r = await run({ ...BASE, total: 1, price: 1 });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, receipt: { number: 1001, subtotal: 29400, discount: 0, shippingCost: 2500, total: 31900, boxCount: 3, locality: 'Berazategui' } });
    expect((await stock())[P1]).toBe(before[P1] - 3);
    const [o] = await q(`select customer_phone, zone_name, locality, partido, postal_code, box_count, flexible_delivery, distance_priced, delivery_date::text d, delivery_window_label from orders where number = 1001`);
    const [{ d: expected }] = await q<{ d: string }>(`select delivery_date_for(6::smallint)::text d`);
    expect(o).toMatchObject({ customer_phone: '1155551234', zone_name: 'Berazategui', locality: 'Berazategui', partido: 'Berazategui', postal_code: '1884', box_count: 3, flexible_delivery: true, distance_priced: false, d: expected });
    expect(o.delivery_window_label).toMatch(/^Sábado \d+\/\d+ a la mañana$/);
    expect(expected).toBe(deliveryDateFor(6, { cutoffWeekday: 4, cutoffTime: '13:00' }));
    const mail = sent.find((s) => s.url.includes('resend'))!;
    expect(mail.body).toMatchObject({ to: ['duenio@ricordo.com'], subject: 'Nuevo pedido #1001 — $31.900' });
    expect(String(mail.body.text)).toContain('3 cajas');
    expect(String(mail.body.text)).toContain('acepta que se lo lleven otro día');
    expect(sent.some((s) => s.url.includes('telegram'))).toBe(true);
    // WhatsApp al dueño (CallMeBot): al número de la tienda, con productos, CP, total y día de entrega.
    const wa = new URL(sent.find((s) => s.url.includes('callmebot'))!.url);
    expect(wa.searchParams.get('phone')).toBe('5491100000000');
    expect(wa.searchParams.get('apikey')).toBe('k123');
    const text = wa.searchParams.get('text')!;
    expect(text).toContain('Nuevo pedido #1001');
    expect(text).toContain('3 × Jamón, muzza y nuez');
    expect(text).toContain('Calle 14 1234, Berazategui · CP B1884ABC');
    expect(text).toContain('Total: $31.900');
    expect(text).toMatch(/Entrega: Sábado \d+\/\d+ a la mañana \(acepta otro día\)/);
  });

  it('WhatsApp a un número propio para avisos (WHATSAPP_NOTIFY_PHONE) y sin clave no se manda', async () => {
    await handleCreateOrder({ ...BASE, flexibleDelivery: false }, { ...env, WHATSAPP_NOTIFY_PHONE: '54 9 11 2222-3333' }, { query: q, fetch: fakeFetch, ip: '8.8.8.1' });
    expect(new URL(sent.find((s) => s.url.includes('callmebot'))!.url).searchParams.get('phone')).toBe('5491122223333');
    sent.length = 0;
    await handleCreateOrder(BASE, { ...env, CALLMEBOT_APIKEY: undefined }, { query: q, fetch: fakeFetch, ip: '8.8.8.2' });
    expect(sent.some((s) => s.url.includes('callmebot'))).toBe(false);
    await q(`update products set stock = stock + 6 where id = $1`, [P1]); // devuelve las 6 cajas para las pruebas siguientes
  });

  it('CABA con 8 cajas: envío gratis y 10 % (tope) solo sobre las 2 cajas extra', async () => {
    const r = await run({ ...BASE, postalCode: 'C1425ABC', localityId: locs['CABA'], items: [{ productId: P5, quantity: 8 }] });
    // 2 cajas extra × 8900 × 10 % = 1780
    expect(r.body).toMatchObject({ ok: true, receipt: { subtotal: 71200, discountPct: 10, discount: 1780, shippingCost: 0, total: 69420, boxCount: 8 } });
  });

  it('CABA con 7 cajas: 5 %; las salsas no suman cajas ni entran en el descuento', async () => {
    const r = await run({ ...BASE, postalCode: '1000', localityId: locs['CABA'], items: [{ productId: P1, quantity: 7 }, { productId: P3, quantity: 1 }] });
    // 1 caja extra × 9800 × 5 % = 490; la "salsa" (10200) se cobra entera y no entra en el promedio
    expect(r.body).toMatchObject({ ok: true, receipt: { subtotal: 78800, discountPct: 5, discount: 490, shippingCost: 0, total: 78310, boxCount: 7 } });
  });

  it('gustos con precios distintos: el descuento va al precio promedio de caja, igual que en el carrito', async () => {
    const r = await run({ ...BASE, postalCode: '1000', localityId: locs['CABA'], items: [{ productId: P1, quantity: 4 }, { productId: P5, quantity: 3 }] });
    // (4 × 9800 + 3 × 8900) / 7 × 1 caja extra × 5 % = 470,71 → 471
    expect(r.body).toMatchObject({ ok: true, receipt: { subtotal: 65900, discount: 471, total: 65429, boxCount: 7 } });
    expect(discountAmount(65900, 7, 1, 5)).toBe(471);
    await q(`update products set stock = stock + 4 where id = $1`, [P1]); // devuelve las cajas para las pruebas siguientes
  });

  it.each([
    ['sin stock', { items: [{ productId: P2, quantity: 3 }] }, 'RC001'],
    ['localidad que no existe', { localityId: 9999 }, 'RC002'],
    ['bajo el mínimo de cajas', { items: [{ productId: P1, quantity: 2 }] }, 'RC003'],
    ['las salsas no completan el mínimo', { items: [{ productId: P1, quantity: 2 }, { productId: P3, quantity: 4 }] }, 'RC003'],
    ['CP inválido', { postalCode: 'hola' }, 'RC004'],
  ])('%s → 409 %s y no se crea nada', async (_n, patch, code) => {
    const before = await count();
    const r = await run({ ...BASE, localityId: locs['Berazategui'], ...patch });
    expect(r).toMatchObject({ status: 409, body: { ok: false, error: { code } } });
    expect(await count()).toBe(before);
  });

  it('bajo el mínimo de envío: dice cuántas cajas faltan y el mínimo de retiro', async () => {
    const r = await run({ ...BASE, items: [{ productId: P1, quantity: 2 }] });
    expect(r.body).toMatchObject({ ok: false, error: { code: 'RC003', minBoxes: 3, missing: 1, pickupMinBoxes: 2 } });
  });

  it('retiro: mínimo 2 cajas, sin envío ni zona, a coordinar', async () => {
    expect((await run({ ...BASE, deliveryMethod: 'pickup', postalCode: '', items: [{ productId: P2, quantity: 1 }] })).body).toMatchObject({ ok: false, error: { code: 'RC003', missing: 1 } });
    const r = await run({ ...BASE, deliveryMethod: 'pickup', paymentMethod: 'cash', postalCode: '', items: [{ productId: P2, quantity: 2 }] });
    expect(r.body).toMatchObject({ ok: true, receipt: { shippingCost: 0, discount: 0, total: 17000, deliveryDate: null } });
    const [o] = await q(`select delivery_date, zone_name, locality, flexible_delivery, delivery_window_label from orders order by number desc limit 1`);
    expect(o).toMatchObject({ delivery_date: null, zone_name: null, locality: null, flexible_delivery: false });
    expect(o.delivery_window_label).toContain('a coordinar por WhatsApp');
  });

  it('captcha inválido → 403 y no toca stock ni pedidos', async () => {
    const before = await stock();
    const r = await run({ ...BASE, turnstileToken: 'otro' });
    expect(r.status).toBe(403);
    expect(await stock()).toEqual(before);
  });

  it('sin TURNSTILE_SECRET_KEY no se aceptan pedidos (falla cerrado)', async () => {
    const r = await handleCreateOrder(BASE, { ...env, TURNSTILE_SECRET_KEY: undefined }, { query: q, fetch: fakeFetch, ip: '9.9.9.9' });
    expect(r.status).toBe(403);
  });

  it('concurrencia: 3 pedidos simultáneos de 8 cajas sobre 20 → pasan 2, nunca se vende de más', async () => {
    await q(`update products set stock = 20 where id = $1`, [P5]);
    const body = { ...BASE, deliveryMethod: 'pickup', items: [{ productId: P5, quantity: 8 }] };
    const res = await Promise.all([run(body), run(body), run(body)]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 200, 409]);
    expect((await stock())[P5]).toBe(4);
  });

  it('límite: el 7.º pedido en una hora desde la misma IP → 429', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await run({ ...BASE, localityId: 9999 }, '7.7.7.7')).status);
    expect(statuses.slice(0, 6).every((s) => s === 409)).toBe(true);
    expect(statuses[6]).toBe(429);
  });

  it('envío por distancia (OpenRouteService simulado): nafta + peaje, redondeo y caché', async () => {
    let orsCalls = 0;
    const ors = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('openrouteservice.org/geocode')) {
        orsCalls++;
        return Response.json({ features: [{ geometry: { coordinates: [-58.2, -34.75] }, properties: { confidence: 0.9 } }] });
      }
      if (u.includes('openrouteservice.org/v2/directions')) { orsCalls++; return Response.json({ routes: [{ summary: { distance: 7500 } }] }); }
      return fakeFetch(url, init);
    }) as unknown as typeof fetch;
    await q(`update products set stock = 20 where id = $1`, [P5]);
    await q(`update shipping_config set pricing_mode = 'fuel'`);
    const body = { ...BASE, localityId: locs['Berazategui'], address: 'Calle 148 2345', items: [{ productId: P5, quantity: 3 }] };
    // 7,5 km → 15 km ida y vuelta × 7 l/100 km × $1700 = $1785 → redondeado de a $500 = $2000
    const r = await handleCreateOrder(body, { ...env, ORS_API_KEY: 'ors' }, { query: q, fetch: ors, ip: '5.5.5.1' });
    expect(r.body).toMatchObject({ ok: true, receipt: { shippingCost: 2000, total: 26700 + 2000 } });
    const [o] = await q(`select distance_priced, km_round_trip::float km, lat::float lat from orders order by number desc limit 1`);
    expect(o).toEqual({ distance_priced: true, km: 15, lat: -34.75 });
    // Peaje y pedidos por ruta de la zona: (1785 + 1000) / 2 = 1392,5 → $1500. Misma dirección: sale de la caché (no consulta ORS).
    await q(`update shipping_zones set toll_round_trip = 1000, avg_orders_per_route = 2 where name = 'Berazategui'`);
    const calls = orsCalls;
    const r2 = await handleCreateOrder(body, { ...env, ORS_API_KEY: 'ors' }, { query: q, fetch: ors, ip: '5.5.5.2' });
    expect(r2.body).toMatchObject({ ok: true, receipt: { shippingCost: 1500 } });
    expect(orsCalls).toBe(calls);
    // Dirección que ORS no ubica con precisión → costo fijo de la zona
    const vague = vi.fn(async (url: string | URL | Request, init?: RequestInit) =>
      String(url).includes('geocode') ? Response.json({ features: [{ geometry: { coordinates: [0, 0] }, properties: { confidence: 0.3 } }] }) : fakeFetch(url, init)) as unknown as typeof fetch;
    const r3 = await handleCreateOrder({ ...body, address: 'por ahí 1' }, { ...env, ORS_API_KEY: 'ors' }, { query: q, fetch: vague, ip: '5.5.5.3' });
    expect(r3.body).toMatchObject({ ok: true, receipt: { shippingCost: 2500 } });
    await q(`update shipping_zones set toll_round_trip = 0, avg_orders_per_route = 1 where name = 'Berazategui'`);
    await q(`update products set stock = 20 where id = $1`, [P5]);
    await q(`update shipping_config set pricing_mode = 'bands'`);
  });

  it('escalones por km (modo por defecto): 7,5 km de ida → escalón "hasta 10 km" = $2.500; más lejos que todo → último escalón', async () => {
    const mk = (meters: number) => vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/geocode/search')) return Response.json({ features: [{ geometry: { coordinates: [-58.2, -34.75] }, properties: { confidence: 0.9 } }] });
      if (u.includes('/v2/directions')) return Response.json({ routes: [{ summary: { distance: meters } }] });
      return fakeFetch(url, init);
    }) as unknown as typeof fetch;
    const body = { ...BASE, localityId: locs['Berazategui'], items: [{ productId: P5, quantity: 3 }] };
    const r = await handleCreateOrder({ ...body, address: 'Calle 10 100' }, { ...env, ORS_API_KEY: 'ors' }, { query: q, fetch: mk(7500), ip: '6.6.6.1' });
    expect(r.body).toMatchObject({ ok: true, receipt: { shippingCost: 2500 } });
    const r2 = await handleCreateOrder({ ...body, address: 'Calle 20 200' }, { ...env, ORS_API_KEY: 'ors' }, { query: q, fetch: mk(2900), ip: '6.6.6.2' });
    expect(r2.body).toMatchObject({ ok: true, receipt: { shippingCost: 1500 } });
    const r3 = await handleCreateOrder({ ...body, address: 'Calle 30 300' }, { ...env, ORS_API_KEY: 'ors' }, { query: q, fetch: mk(55000), ip: '6.6.6.3' });
    expect(r3.body).toMatchObject({ ok: true, receipt: { shippingCost: 8000 } });
    await q(`update products set stock = 20 where id = $1`, [P5]);
  });

  it('la fecha de entrega de la base coincide con la de la tienda (cierre jueves 13 h y otro cierre)', async () => {
    const nows = ['2026-10-05T10:00', '2026-10-08T12:59', '2026-10-08T13:00', '2026-10-09T23:59', '2026-10-10T08:00', '2026-10-11T23:30', '2026-12-31T22:00'];
    for (const [cw, ct] of [[4, '13:00'], [3, '18:30']] as const) {
      await q(`update store_settings set cutoff_weekday = $1, cutoff_time = $2`, [cw, ct]);
      for (const n of nows) {
        for (const wd of [0, 5, 6]) {
          const [{ d }] = await q<{ d: string }>(`select delivery_date_for($1::smallint, $2::timestamptz)::text d`, [wd, n + '-03:00']);
          expect(`${cw} ${ct} ${n} ${wd} ${d}`).toBe(`${cw} ${ct} ${n} ${wd} ${deliveryDateFor(wd, { cutoffWeekday: cw, cutoffTime: ct }, new Date(n + '-03:00'))}`);
        }
      }
    }
    await q(`update store_settings set cutoff_weekday = 4, cutoff_time = '13:00'`);
  });
});
