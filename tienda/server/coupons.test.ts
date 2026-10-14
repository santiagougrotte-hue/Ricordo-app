// Cupones contra Postgres real: el servidor decide, el navegador solo manda el código.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import type { Query } from './db';
import { freshDb, TEST_DB } from './testdb';
import { handleCreateOrder, type ServerEnv } from './createOrder';
import { checkCoupon } from './coupons';

const P1 = '00000000-0000-4000-8000-000000000001';
const LASANA = '00000000-0000-4000-8000-000000000021';

describe.skipIf(!TEST_DB)('cupones', () => {
  let q: Query;
  let pool: pg.Pool;
  let price = 0;
  let ipN = 0;
  const env: ServerEnv = { TURNSTILE_SECRET_KEY: 'x', SESSION_SECRET: 's' };
  const okFetch = (async () => Response.json({ success: true })) as unknown as typeof fetch;
  const order = (extra: Record<string, unknown>, boxes = 3, phone = '1155551234') => handleCreateOrder({
    customerName: 'Ana', customerPhone: phone, customerEmail: '', deliveryMethod: 'pickup', address: '', postalCode: '', localityId: null,
    notes: '', paymentMethod: 'cash', flexibleDelivery: false, items: [{ productId: P1, quantity: boxes }], turnstileToken: 'ok', ...extra,
  }, env, { query: q, fetch: okFetch, ip: `10.9.0.${++ipN}` });
  const coupon = async (code: string, cols: Record<string, unknown> = {}) => {
    const c = { tipo: 'porcentaje', valor: 20, ...cols };
    const keys = Object.keys(c);
    await q(`insert into cupones (codigo, ${keys.join(', ')}) values ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')})`, [code, ...Object.values(c)]);
  };
  const orderRow = async (id: string) => (await q('select subtotal, discount, discount_pct, total, coupon_code, discount_reason from orders where id = $1', [id]))[0];

  beforeAll(async () => {
    ({ q, pool } = await freshDb());
    await q(`update store_settings set pickup_min_boxes = 1`);
    await q(`update products set stock = 999 where id = any($1::uuid[])`, [[P1, LASANA]]);
    price = (await q<{ price: number }>('select price from products where id = $1', [P1]))[0].price;
  });
  beforeEach(async () => { await q(`delete from request_log`); });
  afterAll(async () => pool?.end());

  it('un cupón válido descuenta sobre el subtotal sin envío, registra el uso y suma 1 en la misma transacción', async () => {
    await coupon('VUELVE20');
    // el navegador manda un descuento inventado: se ignora
    const r = await order({ couponCode: 'vuelve20', discount: 999999, total: 1 });
    expect(r.status).toBe(200);
    const id = (r.body as { receipt: { orderId: string } }).receipt.orderId;
    expect(await orderRow(id)).toMatchObject({ discount: Math.round(price * 3 * 0.2), discount_pct: 20, coupon_code: 'VUELVE20', discount_reason: 'Cupón VUELVE20', total: price * 3 - Math.round(price * 3 * 0.2) });
    expect((await q('select usos from cupones where codigo = $1', ['VUELVE20']))[0]).toEqual({ usos: 1 });
    expect(await q('select u.cliente_telefono, u.monto_descontado from cupones_usos u join cupones c on c.id = u.cupon_id where c.codigo = $1', ['VUELVE20']))
      .toEqual([{ cliente_telefono: '1155551234', monto_descontado: Math.round(price * 3 * 0.2) }]);
  });

  it.each([
    ['vencido', { vence_el: '2020-01-01' }, 'Este cupón venció.'],
    ['sin usos', { usos_maximos: 2, usos: 2 }, 'Este cupón ya no tiene usos disponibles.'],
    ['compra mínima', { compra_minima: 999999 }, 'La compra mínima es $999.999.'],
    ['inactivo', { activo: false }, 'Ese cupón no existe o ya no está activo.'],
    ['personal de otro', { cliente_telefono: '1144443333' }, 'Este cupón es personal y no corresponde a este celular.'],
  ])('rechaza un cupón %s aunque el navegador mande el descuento', async (_n, cols, message) => {
    const code = `XCUP${++ipN}`;
    await coupon(code, cols);
    const before = (await q<{ n: number }>('select count(*)::int n from orders'))[0].n;
    const r = await order({ couponCode: code, discount: 5000 });
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ ok: false, error: { code: 'RC007', message } });
    expect((await q<{ n: number }>('select count(*)::int n from orders'))[0].n).toBe(before); // no se creó el pedido
    expect(await checkCoupon({ code, phone: '1155551234', items: [{ productId: P1, quantity: 3 }] }, { query: q, ip: '1.1.1.1', secret: 's' }))
      .toEqual({ status: 200, body: { ok: false, message } });
  });

  it('un uso por cliente: el mismo celular (escrito distinto) no lo puede usar dos veces', async () => {
    await coupon('UNAVEZ', { un_uso_por_cliente: true });
    expect((await order({ couponCode: 'UNAVEZ' }, 3, '1155552222')).status).toBe(200);
    const again = await order({ couponCode: 'UNAVEZ' }, 3, '011 15 5555-2222');
    expect(again.body).toEqual({ ok: false, error: { code: 'RC007', message: 'Ya usaste este cupón.' } });
    expect((await order({ couponCode: 'UNAVEZ' }, 3, '1155553333')).status).toBe(200); // otro cliente sí
  });

  it('cupón personal: lo usa solo su celular', async () => {
    await coupon('SOLOANA', { cliente_telefono: '1155554444', tipo: 'monto', valor: 3000 });
    const r = await order({ couponCode: 'SOLOANA' }, 3, '+54 9 11 5555-4444');
    expect(r.status).toBe(200);
    expect(await orderRow((r.body as { receipt: { orderId: string } }).receipt.orderId)).toMatchObject({ discount: 3000, discount_pct: 0 });
  });

  it('no se suma a la promo: queda el mayor', async () => {
    await q(`update store_settings set promo_enabled = true, promo_starts_at = now() - interval '1 day', promo_ends_at = now() + interval '1 day'`);
    await coupon('CHICO5', { valor: 5 });
    await coupon('GRANDE30', { valor: 30 });
    const small = await order({ couponCode: 'CHICO5' }, 3); // promo 10% > cupón 5%
    expect(await orderRow((small.body as { receipt: { orderId: string } }).receipt.orderId)).toMatchObject({ discount_pct: 10, coupon_code: null, discount_reason: 'Promo Día de la Madre' });
    expect((await q('select usos from cupones where codigo = $1', ['CHICO5']))[0]).toEqual({ usos: 0 }); // no se gastó
    const big = await order({ couponCode: 'GRANDE30' }, 3);
    expect(await orderRow((big.body as { receipt: { orderId: string } }).receipt.orderId)).toMatchObject({ discount_pct: 30, coupon_code: 'GRANDE30', discount_reason: 'Cupón GRANDE30' });
    await q(`update store_settings set promo_enabled = false`);
  });

  it('no descuenta los productos con precio especial (lasaña de lanzamiento)', async () => {
    await coupon('MITAD', { valor: 50 });
    const r = await handleCreateOrder({
      customerName: 'Ana', customerPhone: '1155557777', deliveryMethod: 'pickup', paymentMethod: 'cash', turnstileToken: 'ok', couponCode: 'MITAD',
      items: [{ productId: P1, quantity: 1 }, { productId: LASANA, quantity: 1 }],
    }, env, { query: q, fetch: okFetch, ip: '10.9.9.9' });
    expect(await orderRow((r.body as { receipt: { orderId: string } }).receipt.orderId)).toMatchObject({ discount: Math.round(price * 0.5), subtotal: price + 16000 });
  });

  it('validación del checkout: devuelve el descuento con precios de la base y frena a los 10 intentos en 15 minutos', async () => {
    await coupon('PRUEBA', { valor: 10 });
    const deps = { query: q, ip: '2.2.2.2', secret: 's' };
    const body = { code: 'prueba', phone: '', items: [{ productId: P1, quantity: 2 }], price: 1 };
    expect(await checkCoupon(body, deps)).toEqual({ status: 200, body: { ok: true, code: 'PRUEBA', type: 'porcentaje', value: 10, minPurchase: null, discount: Math.round(price * 2 * 0.1) } });
    for (let i = 0; i < 9; i++) await checkCoupon(body, deps);
    expect((await checkCoupon(body, deps)).status).toBe(429);
    // por teléfono también, aunque cambie de conexión
    for (let i = 0; i < 10; i++) await checkCoupon({ ...body, phone: '1155558888' }, { ...deps, ip: `3.3.3.${i}` });
    expect((await checkCoupon({ ...body, phone: '1155558888' }, { ...deps, ip: '4.4.4.4' })).status).toBe(429);
  });
});
