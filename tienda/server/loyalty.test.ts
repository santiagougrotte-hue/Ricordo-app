/* eslint-disable @typescript-eslint/no-explicit-any */
// Cliente frecuente, pedido para la app de gestión, recontacto y recordatorios por mail (Postgres real).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import type { Query } from './db';
import { freshDb, TEST_DB } from './testdb';
import { handleCreateOrder, type ServerEnv } from './createOrder';
import { loyaltyFor } from './loyalty';
import { pedidoDesdeWeb, loadPedidoDesdeWeb, sendToGestion } from './gestion';
import { createPersonalCoupon, recontactMessage } from './coupons';
import { handleUnsubscribe, runReminders, unsubscribeUrl } from './reminders';

const P1 = '00000000-0000-4000-8000-000000000001';

describe.skipIf(!TEST_DB)('cliente frecuente', () => {
  let q: Query;
  let pool: pg.Pool;
  let price = 0;
  let ipN = 0;
  const sent: { url: string; body: Record<string, unknown>; auth?: string }[] = [];
  const env: ServerEnv = { TURNSTILE_SECRET_KEY: 'x', SESSION_SECRET: 's', GESTION_WEBHOOK_URL: 'https://gestion.test/api/pedidos', GESTION_WEBHOOK_SECRET: 'clave' };
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (!u.includes('siteverify')) sent.push({ url: u, body: init?.body ? JSON.parse(String(init.body)) : {}, auth: (init?.headers as Record<string, string>)?.Authorization });
    return Response.json({ success: true });
  }) as unknown as typeof fetch;
  const order = async (phone: string, extra: Record<string, unknown> = {}, boxes = 1) => {
    const r = await handleCreateOrder({
      customerName: 'Laura Gómez', customerPhone: phone, customerEmail: '', deliveryMethod: 'pickup', paymentMethod: 'cash', turnstileToken: 'ok',
      items: [{ productId: P1, quantity: boxes }], ...extra,
    }, env, { query: q, fetch: fakeFetch, ip: `10.8.0.${++ipN}` });
    expect(r.status).toBe(200);
    const id = (r.body as { receipt: { orderId: string } }).receipt.orderId;
    return (await q<Record<string, any> & { id: string }>('select id, discount, discount_pct, discount_type, discount_reason, coupon_code, loyalty_cycle from orders where id = $1', [id]))[0];
  };
  const deliverAll = (phone: string) => q(`update orders set status = 'delivered' where normalize_ar_phone(customer_phone) = normalize_ar_phone($1) and status <> 'cancelled'`, [phone]);

  beforeAll(async () => {
    ({ q, pool } = await freshDb());
    await q(`update store_settings set pickup_min_boxes = 1, loyalty_every = 4, loyalty_pct = 10`);
    await q(`update products set stock = 999 where id = $1`, [P1]);
    price = (await q<{ price: number }>('select price from products where id = $1', [P1]))[0].price;
  });
  beforeEach(async () => { sent.length = 0; await q('delete from request_log'); });
  afterAll(async () => pool?.end());

  it('el descuento va en el pedido N+1 (5.º), no en el N (4.º) ni en el N+2 (6.º)', async () => {
    const tel = '1155550001';
    for (let i = 1; i <= 3; i++) {
      expect(await order(tel)).toMatchObject({ discount: 0 });
      await deliverAll(tel);
    }
    expect(await loyaltyFor(q, tel)).toMatchObject({ eligible: false, missing: 1 });
    expect(await order(tel)).toMatchObject({ discount: 0 }); // 4.º
    // mientras el 4.º no se entrega, todavía no le toca
    expect(await loyaltyFor(q, tel)).toMatchObject({ eligible: false });
    await deliverAll(tel);
    expect(await loyaltyFor(q, '011 15 5555-0001')).toMatchObject({ eligible: true, pct: 10, nth: 5 }); // mismo celular escrito distinto
    const fifth = await order('+54 9 11 5555-0001');
    expect(fifth).toMatchObject({ discount: Math.round(price * 0.1), discount_pct: 10, discount_type: 'cliente_frecuente', discount_reason: 'Cliente frecuente (5ª compra)', loyalty_cycle: 1 });
    // el 6.º no, aunque el 5.º todavía no se haya entregado
    expect(await order(tel)).toMatchObject({ discount: 0 });
    await deliverAll(tel);
    expect(await order(tel)).toMatchObject({ discount: 0 }); // 7.º
    expect(await loyaltyFor(q, tel)).toMatchObject({ eligible: false, missing: 2 });
  });

  it('los pedidos cancelados no cuentan', async () => {
    const tel = '1155550002';
    for (let i = 0; i < 4; i++) await order(tel);
    await q(`update orders set status = 'cancelled' where normalize_ar_phone(customer_phone) = $1`, [tel]);
    expect(await loyaltyFor(q, tel)).toMatchObject({ eligible: false, missing: 4 });
  });

  it('con cupón y cliente frecuente juntos se aplica solo el mayor, y se avisa cuál quedó', async () => {
    const tel = '1155550003';
    for (let i = 0; i < 4; i++) await order(tel);
    await deliverAll(tel);
    await q(`insert into cupones (codigo, tipo, valor) values ('CHICO5', 'porcentaje', 5), ('GRANDE20', 'porcentaje', 20)`);
    // cupón menor: queda cliente frecuente y el cupón no se gasta
    const a = await order(tel, { couponCode: 'CHICO5' }, 2);
    expect(a).toMatchObject({ discount_type: 'cliente_frecuente', discount_pct: 10, coupon_code: null });
    expect((await q(`select usos from cupones where codigo = 'CHICO5'`))[0]).toEqual({ usos: 0 });
    // otro cliente en su 5.ª compra con un cupón mayor: queda el cupón
    const tel2 = '1155550004';
    for (let i = 0; i < 4; i++) await order(tel2);
    await deliverAll(tel2);
    const b = await order(tel2, { couponCode: 'GRANDE20' }, 2);
    expect(b).toMatchObject({ discount_type: 'cupon', discount_pct: 20, coupon_code: 'GRANDE20', discount: Math.round(price * 2 * 0.2) });
  });

  it('el pedido que va a la app de gestión lleva descuento, motivo, cupón y tipo correctos', async () => {
    await q(`insert into cupones (codigo, tipo, valor) values ('VUELVE10', 'monto', 2000)`);
    const o = await order('1155550005', { couponCode: 'VUELVE10' }, 2);
    // se mandó solo, con el secreto, al crear el pedido
    const hook = sent.find((x) => x.url === env.GESTION_WEBHOOK_URL)!;
    expect(hook.auth).toBe('Bearer clave');
    expect(hook.body.accion).toBe('crearPedidoDesdeWeb');
    expect(hook.body.pedido).toMatchObject({
      origen: 'web', descuento: 2000, motivo_descuento: 'Cupón VUELVE10', cupon_codigo: 'VUELVE10', tipo_descuento: 'cupon',
      subtotal: price * 2, total: price * 2 - 2000, cliente: { nombre: 'Laura Gómez', telefono: '1155550005' },
      lineas: [{ nombre_producto: expect.any(String), cantidad: 2, precio_unitario: price, precio_total: price * 2, regalo: false }],
    });
    // cliente frecuente
    const tel = '1155550006';
    for (let i = 0; i < 4; i++) await order(tel);
    await deliverAll(tel);
    const f = await order(tel);
    expect(await loadPedidoDesdeWeb(q, f.id)).toMatchObject({ descuento: Math.round(price * 0.1), motivo_descuento: 'Cliente frecuente (5ª compra)', cupon_codigo: null, tipo_descuento: 'cliente_frecuente' });
    // sin descuento: todo en cero / null
    expect(await loadPedidoDesdeWeb(q, (await order('1155550007')).id)).toMatchObject({ descuento: 0, motivo_descuento: null, cupon_codigo: null, tipo_descuento: null });
    expect(o.coupon_code).toBe('VUELVE10');
  });

  it('sin URL de la app de gestión no se manda nada; si la app falla, el pedido igual se crea', async () => {
    const [o] = await q<{ id: string }>(`select id from orders limit 1`);
    expect(await sendToGestion(o.id, {}, { query: q, fetch: fakeFetch })).toBe(false);
    const failing = (async () => new Response('x', { status: 500 })) as unknown as typeof fetch;
    const r = await handleCreateOrder({ customerName: 'Ana', customerPhone: '1155550008', deliveryMethod: 'pickup', paymentMethod: 'cash', turnstileToken: 'ok', items: [{ productId: P1, quantity: 1 }] },
      { ...env }, { query: q, fetch: (async (u: string) => (String(u).includes('siteverify') ? Response.json({ success: true }) : failing(u))) as unknown as typeof fetch, ip: '10.8.9.9' });
    expect(r.status).toBe(200);
  });

  it('pedidoDesdeWeb marca los regalos', () => {
    const p = pedidoDesdeWeb({ id: 'x', number: 1, created_at: new Date(), customer_name: 'A', customer_phone: '1', delivery_method: 'pickup', subtotal: 10, shipping_cost: 0, total: 10, payment_method: 'cash', discount: 0 },
      [{ product_name: 'Salsa', quantity: 1, unit_price: 0 }]);
    expect(p.lineas[0]).toMatchObject({ regalo: true, precio_total: 0 });
  });
});

describe('mensaje de recontacto', () => {
  const tpl = '¡Hola {nombre}! Hace un tiempo que no te vemos por Ricordo 🍝 Te dejamos un {descuento} de descuento con el código {codigo}, válido hasta el {vence}.';
  it('con cupón completa todo', () => {
    expect(recontactMessage(tpl, { name: 'Laura Gómez', pct: 10, code: 'VUELVE-AB12', expiresOn: '2026-10-29' }))
      .toBe('¡Hola Laura! Hace un tiempo que no te vemos por Ricordo 🍝 Te dejamos un 10% de descuento con el código VUELVE-AB12, válido hasta el 29/10.');
  });
  it('sin cupón saca la oración del cupón', () => {
    expect(recontactMessage(tpl, { name: 'Laura' })).toBe('¡Hola Laura! Hace un tiempo que no te vemos por Ricordo 🍝');
  });
});

describe.skipIf(!TEST_DB)('recordatorio por mail', () => {
  let q: Query;
  let pool: pg.Pool;
  const mails: Record<string, unknown>[] = [];
  const fetchMail = (async (_u: string, init?: RequestInit) => { mails.push(JSON.parse(String(init!.body))); return Response.json({ id: 'm' }); }) as unknown as typeof fetch;
  const renv = { RESEND_API_KEY: 're', SESSION_SECRET: 'secreto', SITE_URL: 'https://ricordo.test' };
  const addOrder = (email: string | null, optIn: boolean, daysAgo: number, phone: string) => q(
    `insert into orders (customer_name, customer_phone, customer_email, delivery_method, subtotal, shipping_cost, total, payment_method, marketing_opt_in, created_at, delivery_window_label)
     values ('Laura', $1, $2, 'pickup', 1000, 0, 1000, 'cash', $3, now() - make_interval(days => $4), '')`, [phone, email, optIn, daysAgo]);

  beforeAll(async () => { ({ q, pool } = await freshDb(false)); });
  afterAll(async () => pool?.end());

  it('solo a quien pidió novedades, con más de X días sin comprar, una vez cada 30 días, y con baja sin sesión', async () => {
    await addOrder('si@x.com', true, 40, '1155551111');   // le toca
    await addOrder('no@x.com', false, 40, '1155552222');  // no pidió novedades
    await addOrder('reciente@x.com', true, 5, '1155553333'); // compró hace poco
    await addOrder(null, true, 40, '1155554444');          // sin mail
    expect(await runReminders({ query: q, fetch: fetchMail, env: {} })).toMatchObject({ sent: 0, skipped: 'sin configurar' });
    const r = await runReminders({ query: q, fetch: fetchMail, env: renv });
    expect(r).toMatchObject({ sent: 1 });
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toEqual(['si@x.com']);
    expect(String(mails[0].text)).toMatch(/VUELVE-[A-Z0-9]{4}/);
    const unsub = unsubscribeUrl('si@x.com', renv);
    expect(String(mails[0].text)).toContain(unsub);
    // el cupón personal quedó para su celular, de un uso y con vencimiento
    expect((await q(`select cliente_telefono, usos_maximos, un_uso_por_cliente from cupones`))[0]).toEqual({ cliente_telefono: '1155551111', usos_maximos: 1, un_uso_por_cliente: true });
    // no se repite en 30 días
    expect(await runReminders({ query: q, fetch: fetchMail, env: renv })).toMatchObject({ sent: 0 });
    // baja: link firmado, sin sesión; uno trucho no sirve
    expect((await handleUnsubscribe(new URL(unsub.replace('si%40x.com', 'otro%40x.com')), q, 'secreto')).status).toBe(400);
    expect((await handleUnsubscribe(new URL(unsub), q, 'secreto')).status).toBe(200);
    await q(`delete from email_reminders`);
    expect(await runReminders({ query: q, fetch: fetchMail, env: renv })).toMatchObject({ sent: 0 }); // dado de baja
  });

  it('cupón personal: código único, 15 días, solo para ese celular', async () => {
    const c = await createPersonalCoupon(q, '011 15 5555-9999', 10);
    expect(c.code).toMatch(/^VUELVE-[A-Z2-9]{4}$/);
    expect((await q(`select cliente_telefono, valor from cupones where codigo = $1`, [c.code]))[0]).toEqual({ cliente_telefono: '1155559999', valor: 10 });
  });
});
