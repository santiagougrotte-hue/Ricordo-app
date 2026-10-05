import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { handleAdmin, type AdminEnv } from './admin';
import type { Query } from './db';
import { memoryMedia } from './media';
import { freshDb, TEST_DB } from './testdb';
import { getCatalog } from './catalog';

const ENV: AdminEnv = { ADMIN_EMAIL: 'duenio@ricordo.com', ADMIN_PASSWORD: 'una-clave-larga-123', SESSION_SECRET: 'secreto-de-prueba' };
const P1 = '00000000-0000-4000-8000-000000000001';

describe.skipIf(!TEST_DB)('API del panel contra Netlify Database (Postgres real)', () => {
  let q: Query;
  let pool: pg.Pool;
  const media = memoryMedia();
  let cookie = '';
  let ipN = 0;

  async function call(method: string, path: string, opts: { body?: unknown; raw?: BodyInit; type?: string; auth?: boolean; csrf?: boolean; ip?: string } = {}) {
    const headers: Record<string, string> = {};
    if (opts.csrf !== false) headers['x-ricordo'] = 'panel';
    if (opts.auth !== false && cookie) headers.cookie = cookie;
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    if (opts.type) headers['content-type'] = opts.type;
    const req = new Request(`https://ricordo-pastas.netlify.app/api/admin/${path}`, {
      method, headers, body: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
    const res = await handleAdmin(req, path.split('?')[0], ENV, { query: q, media: async () => media, ip: opts.ip ?? `10.1.0.${++ipN}`, secure: true });
    return { status: res.status, data: (await res.json()) as Record<string, any>, setCookie: res.headers.get('set-cookie') };
  }

  beforeAll(async () => ({ q, pool } = await freshDb()));
  afterAll(() => pool.end());

  it('sin sesión: 401 en todo menos login/session', async () => {
    expect((await call('GET', 'orders')).status).toBe(401);
    expect((await call('GET', 'session')).data).toEqual({ email: null });
  });

  it('login incorrecto → 401; correcto → cookie HttpOnly + Secure + SameSite=Strict', async () => {
    expect((await call('POST', 'login', { body: { email: ENV.ADMIN_EMAIL, password: 'mal' } })).status).toBe(401);
    const ok = await call('POST', 'login', { body: { email: 'DUENIO@ricordo.com ', password: ENV.ADMIN_PASSWORD } });
    expect(ok.status).toBe(200);
    expect(ok.setCookie).toMatch(/HttpOnly; SameSite=Strict; Max-Age=604800; Secure/);
    cookie = ok.setCookie!.split(';')[0];
    expect((await call('GET', 'session')).data).toEqual({ email: ENV.ADMIN_EMAIL });
  });

  it('escrituras sin el encabezado del panel → 403 (CSRF)', async () => {
    expect((await call('POST', `products/${P1}/stock`, { body: { stock: 1 }, csrf: false })).status).toBe(403);
  });

  it('login: 9.º intento desde la misma IP en 15 min → 429', async () => {
    const s: number[] = [];
    for (let i = 0; i < 9; i++) s.push((await call('POST', 'login', { body: { email: 'x', password: 'y' }, ip: '6.6.6.6' })).status);
    expect(s.slice(0, 8).every((x) => x === 401)).toBe(true);
    expect(s[8]).toBe(429);
  });

  it('pedidos: lista, cambio de estado, pago, cancelar devuelve stock, no se reabre', async () => {
    const [o] = await q<{ order_id: string }>(
      `select * from create_order('Laura','11 4444-3333',null,'delivery','Calle 14 1234','1884',(select id from localities where name = 'Berazategui'),null,'cash',$1::jsonb,true)`,
      [JSON.stringify([{ product_id: P1, quantity: 3 }])],
    );
    const list = await call('GET', 'orders');
    expect(list.data.orders[0]).toMatchObject({
      number: 1001, customerName: 'Laura', customerPhone: '1144443333', status: 'new', items: [{ productId: P1, quantity: 3 }],
      zoneName: 'Berazategui', locality: 'Berazategui', partido: 'Berazategui', boxCount: 3, flexibleDelivery: true, deliveredOn: null, discount: 0,
      distancePriced: false, km: null,
    });
    expect(list.data.orders[0].deliveryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const t0 = list.data.serverTime;

    expect((await call('POST', `orders/${o.order_id}/status`, { body: { status: 'confirmed' } })).status).toBe(200);
    expect((await call('POST', `orders/${o.order_id}/payment`, { body: { status: 'paid' } })).status).toBe(200);
    const changed = await call('GET', `orders?changedAfter=${encodeURIComponent(t0)}`);
    expect(changed.data.orders).toHaveLength(1);
    expect(changed.data.orders[0]).toMatchObject({ status: 'confirmed', paymentStatus: 'paid' });

    // Fecha real de entrega: la carga el admin, se puede borrar, y valida el formato.
    expect((await call('POST', `orders/${o.order_id}/delivered-on`, { body: { date: '2026-10-09' } })).status).toBe(200);
    expect((await call('GET', 'orders')).data.orders[0].deliveredOn).toBe('2026-10-09');
    expect((await call('POST', `orders/${o.order_id}/delivered-on`, { body: { date: 'mañana' } })).status).toBe(400);
    expect((await call('POST', `orders/${o.order_id}/delivered-on`, { body: { date: null } })).status).toBe(200);
    expect((await call('GET', 'orders')).data.orders[0].deliveredOn).toBe(null);

    const [{ stock: before }] = await q<{ stock: number }>('select stock from products where id = $1', [P1]);
    await call('POST', `orders/${o.order_id}/status`, { body: { status: 'cancelled' } });
    await call('POST', `orders/${o.order_id}/status`, { body: { status: 'cancelled' } });
    const [{ stock: after }] = await q<{ stock: number }>('select stock from products where id = $1', [P1]);
    expect(after).toBe(before + 3);
    expect((await call('POST', `orders/${o.order_id}/status`, { body: { status: 'new' } })).status).toBe(409);
    expect((await call('POST', `orders/${o.order_id}/status`, { body: { status: 'hackeado' } })).status).toBe(400);
  });

  it('productos: crear, editar, slug duplicado, stock, ocultar (sale del catálogo público)', async () => {
    const draft = { slug: 'cuatro-quesos', name: 'Cuatro quesos', pastaType: 'sorrentinos', filling: 'Muzza, azul', description: '', price: 10900, stock: 6, lowStockThreshold: 2, featured: false, countsAsBox: true, active: true, sortOrder: 9 };
    const c = await call('POST', 'products', { body: draft });
    expect(c.status).toBe(200);
    expect((await call('POST', 'products', { body: draft })).status).toBe(409);
    expect((await call('POST', 'products', { body: { ...draft, id: c.data.id, price: 11500 } })).status).toBe(200);
    expect((await call('POST', 'products', { body: { ...draft, slug: 'otro', price: 0 } })).status).toBe(400);
    await call('POST', `products/${c.data.id}/stock`, { body: { stock: 1, active: false } });
    const all = await call('GET', 'products');
    expect(all.data.products.find((p: { id: string }) => p.id === c.data.id)).toMatchObject({ price: 11500, stock: 1, active: false });
    expect((await getCatalog(q)).products.some((p) => p.id === c.data.id)).toBe(false);
  });

  it('archivos: subir foto (primera = portada), video, formato inválido, portada, mover, borrar', async () => {
    const up = (type: string, size = 2048) => call('POST', `products/${P1}/media?alt=Sorrentinos`, { raw: new Uint8Array(size), type });
    expect((await up('image/webp')).status).toBe(200);
    expect((await up('video/mp4')).status).toBe(200);
    expect((await up('application/pdf')).status).toBe(415);
    expect((await up('image/webp', 6 * 1024 * 1024)).status).toBe(413);
    let p = (await call('GET', 'products')).data.products.find((x: { id: string }) => x.id === P1);
    expect(p.media).toHaveLength(2);
    expect(p.media[0]).toMatchObject({ kind: 'photo', isCover: true });
    expect(p.media[0].url).toMatch(/^\/media\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/);
    expect(media.keys()).toHaveLength(2);
    const video = p.media.find((m: { kind: string }) => m.kind === 'video');
    await call('POST', `media/${video.id}/move`, { body: { dir: -1 } });
    await call('DELETE', `media/${p.media.find((m: { kind: string }) => m.kind === 'photo').id}`);
    p = (await call('GET', 'products')).data.products.find((x: { id: string }) => x.id === P1);
    expect(p.media).toHaveLength(1);
    expect(media.keys()).toHaveLength(1);
  });

  it('zonas: validación, alta, edición y baja (se refleja en el catálogo)', async () => {
    const zone = {
      name: 'Varela', shippingCost: 2500, minBoxes: 3, freeFromBoxes: 5, deliveryWeekday: 5, deliveryMoment: 'a la noche',
      discountPerBox: 4, discountMax: 8, distancePricing: true, tollRoundTrip: 800, avgOrdersPerRoute: 2.5, active: true,
    };
    expect((await call('POST', 'zones', { body: { ...zone, freeFromBoxes: 3 } })).status).toBe(400); // gratis no puede ser ≤ mínimo
    expect((await call('POST', 'zones', { body: { ...zone, discountMax: 150 } })).status).toBe(400);
    expect((await call('POST', 'zones', { body: { ...zone, deliveryWeekday: 7 } })).status).toBe(400);
    expect((await call('POST', 'zones', { body: { ...zone, avgOrdersPerRoute: 0 } })).status).toBe(400);
    expect((await call('POST', 'zones', { body: zone })).status).toBe(200);
    const z = (await call('GET', 'zones')).data.zones.find((x: { name: string }) => x.name === 'Varela');
    expect(z).toMatchObject(zone);

    // Localidades: alta en la zona nueva, aparece en el catálogo; duplicada → 409
    expect((await call('POST', 'localities', { body: { name: 'Florencio Varela', partido: 'Florencio Varela', zoneId: z.id, active: true } })).status).toBe(200);
    expect((await call('POST', 'localities', { body: { name: 'Florencio Varela', partido: 'Florencio Varela', zoneId: z.id, active: true } })).status).toBe(409);
    expect((await call('POST', 'localities', { body: { name: 'X', partido: 'Y', zoneId: 'nope' } })).status).toBe(400);
    const cat = await getCatalog(q);
    const fv = cat.localities.find((l) => l.name === 'Florencio Varela')!;
    expect(fv.zoneId).toBe(z.id);
    // La zona no se puede borrar mientras tenga localidades
    expect((await call('DELETE', `zones/${z.id}`)).status).toBe(409);
    // Desactivar la zona saca sus localidades del catálogo
    await call('POST', 'zones', { body: { ...z, active: false } });
    expect((await getCatalog(q)).localities.some((l) => l.name === 'Florencio Varela')).toBe(false);
    expect((await call('DELETE', `localities/${fv.id}`)).status).toBe(200);
    expect((await call('DELETE', `zones/${z.id}`)).status).toBe(200);

    // Pasar una localidad de zona
    const ranelagh = (await call('GET', 'localities')).data.localities.find((l: { name: string }) => l.name === 'Ranelagh');
    const bera = (await call('GET', 'zones')).data.zones.find((x: { name: string }) => x.name === 'Berazategui');
    expect((await call('POST', 'localities', { body: { ...ranelagh, zoneId: bera.id } })).status).toBe(200);
    expect((await getCatalog(q)).localities.find((l) => l.name === 'Ranelagh')!.zoneId).toBe(bera.id);
  });

  it('cálculo por distancia: privado, se valida y al cambiar el origen se borra la caché', async () => {
    const got = (await call('GET', 'shipping-config')).data;
    expect(got.enabled).toBe(false); // sin ORS_API_KEY
    const cfg = got.config;
    expect(cfg).toEqual({ originLat: -34.765, originLng: -58.212, pricingMode: 'bands', fuelPrice: 1700, consumption100km: 7, rounding: 500 });
    expect(got.bands).toHaveLength(7);
    // Escalones: validación y guardado (sin tocar el origen no se borra la caché)
    expect((await call('POST', 'shipping-config', { body: { ...cfg, bands: [{ upToKm: 5, price: 1000 }, { upToKm: 5, price: 2000 }] } })).status).toBe(400);
    expect((await call('POST', 'shipping-config', { body: { ...cfg, bands: [{ upToKm: null, price: 1000 }, { upToKm: null, price: 2000 }] } })).status).toBe(400);
    expect((await call('POST', 'shipping-config', { body: { ...cfg, bands: [{ upToKm: 4, price: 1200 }, { upToKm: 12.5, price: 2500 }, { upToKm: null, price: 5000 }] } })).status).toBe(200);
    expect((await call('GET', 'shipping-config')).data.bands).toEqual([{ upToKm: 4, price: 1200 }, { upToKm: 12.5, price: 2500 }, { upToKm: null, price: 5000 }]);
    // La tabla es pública solo si el cálculo por distancia está activo
    expect((await getCatalog(q)).settings.shippingBands).toEqual([]);
    expect((await getCatalog(q, { distanceEnabled: true })).settings.shippingBands).toHaveLength(3);
    expect((await call('POST', 'shipping-config', { body: { ...cfg, originLat: 40.4 } })).status).toBe(400); // fuera de Argentina
    await q(`insert into geo_cache (key, lat, lng, km_round_trip, origin) values ('x|1', -34.7, -58.2, 10, '-34.765,-58.212')`);
    expect((await call('POST', 'shipping-config', { body: { ...cfg, originLat: -34.77, fuelPrice: 1800 } })).status).toBe(200);
    expect((await call('GET', 'shipping-config')).data.config).toMatchObject({ originLat: -34.77, fuelPrice: 1800 });
    expect((await q(`select count(*)::int n from geo_cache`))[0].n).toBe(0);
    expect(JSON.stringify(await getCatalog(q))).not.toContain('-34.77'); // el origen nunca sale en la tienda
  });

  it('ajustes: email de aviso privado, retiro en cajas y cierre semanal', async () => {
    const s = { pickupEnabled: true, pickupMinBoxes: 2, pickupAddress: 'Calle 1', whatsappPhone: '+54 9 11 5555-1234', transferInfo: 'Alias X', notifyEmail: 'yo@ricordo.com', cutoffWeekday: 3, cutoffTime: '18:30' };
    expect((await call('POST', 'settings', { body: { ...s, cutoffTime: '25:00' } })).status).toBe(400);
    expect((await call('POST', 'settings', { body: s })).status).toBe(200);
    expect((await call('GET', 'settings')).data.settings).toMatchObject({ whatsappPhone: '5491155551234', notifyEmail: 'yo@ricordo.com', pickupMinBoxes: 2, cutoffWeekday: 3, cutoffTime: '18:30' });
    const cat = await getCatalog(q);
    expect(cat.settings).toMatchObject({ pickupMinBoxes: 2, cutoffWeekday: 3, cutoffTime: '18:30' });
    expect(JSON.stringify(cat)).not.toContain('yo@ricordo.com');
  });

  it('probar aviso de WhatsApp: sin clave avisa qué falta; con clave manda al número de la tienda', async () => {
    expect((await call('POST', 'notify-test')).data.error).toContain('CALLMEBOT_APIKEY');
    const urls: string[] = [];
    const fakeFetch = (async (u: string | URL | Request) => { urls.push(String(u)); return new Response('Message queued. You will receive it in a few seconds.'); }) as typeof fetch;
    const req = new Request('https://x/api/admin/notify-test', { method: 'POST', headers: { 'x-ricordo': 'panel', cookie } });
    const res = await handleAdmin(req, 'notify-test', { ...ENV, CALLMEBOT_APIKEY: 'k1' }, { query: q, media: async () => media, ip: '10.9.9.9', secure: true, fetch: fakeFetch });
    expect(res.status).toBe(200);
    expect(new URL(urls[0]).searchParams.get('phone')).toBe('5491155551234'); // el WhatsApp que se guardó en Ajustes
    const bad = (async () => new Response('<p>APIKey is invalid. You need to get a new one</p>')) as unknown as typeof fetch;
    const res2 = await handleAdmin(new Request('https://x/api/admin/notify-test', { method: 'POST', headers: { 'x-ricordo': 'panel', cookie } }), 'notify-test', { ...ENV, CALLMEBOT_APIKEY: 'k1' }, { query: q, media: async () => media, ip: '10.9.9.8', secure: true, fetch: bad });
    expect(res2.status).toBe(400);
    expect(((await res2.json()) as { error: string }).error).toContain('APIKey is invalid');
    // Una respuesta rara (sin "queued") no se toma como enviado.
    const weird = (async () => new Response('Something unexpected')) as unknown as typeof fetch;
    const res3 = await handleAdmin(new Request('https://x/api/admin/notify-test', { method: 'POST', headers: { 'x-ricordo': 'panel', cookie } }), 'notify-test', { ...ENV, CALLMEBOT_APIKEY: 'k1' }, { query: q, media: async () => media, ip: '10.9.9.7', secure: true, fetch: weird });
    expect(res3.status).toBe(400);
  });

  it('logout borra la cookie', async () => {
    const r = await call('POST', 'logout');
    expect(r.setCookie).toMatch(/Max-Age=0/);
  });
});

describe.skipIf(!TEST_DB)('migraciones: gusto real cargado', () => {
  it('la tienda muestra cabutia ($11.500), osobuco ($14.000), espinaca ($13.000) y jamón y queso ($11.000), con fotos y video; los ejemplos quedan ocultos', async () => {
    const { q, pool } = await freshDb(false);
    const c = await getCatalog(q);
    expect(c.products.map((p) => p.name)).toEqual(['Cabutia', 'Osobuco', 'Espinaca', 'Jamón y queso']);
    expect(c.products[3]).toMatchObject({ price: 11000, pastaType: 'sorrentinos', featured: true, filling: 'Jamón cocido, muzzarella y queso sardo' });
    expect(c.products[3].media.map((m) => m.url)).toEqual(['/fotos/jamon-queso-mano.webp', '/fotos/jamon-queso-ingredientes.webp']);
    expect(c.products[2]).toMatchObject({ price: 13000, pastaType: 'ravioles', featured: true, filling: 'Espinaca, ricotta, sardo, muzzarella y nueces picadas' });
    expect(c.products[2].media.map((m) => m.url)).toEqual(['/fotos/espinaca-mano.webp', '/fotos/espinaca-ingredientes.webp']);
    expect(c.products[1]).toMatchObject({ price: 14000, unitsPerBox: 12, featured: true, filling: 'Osobuco braseado 4 horas al vino tinto y vermut, con zanahoria, apio y cebolla' });
    expect(c.products[1].media.map((m) => m.url)).toEqual(['/fotos/osobuco-mano.webp', '/fotos/osobuco-ingredientes.webp']);
    expect(c.products[0]).toMatchObject({ price: 11500, unitsPerBox: 12, pastaType: 'sorrentinos', featured: true });
    expect(c.products[0].filling).toBe('Cabutia asada, ajo asado, muzzarella, sardo y almendras picadas');
    expect(c.products[0].media.map((m) => m.url)).toEqual(['/fotos/cabutia-mano.webp', '/fotos/cabutia-corte.webp', '/fotos/amasado-masa-nero.mp4', '/fotos/cabutia-ingredientes.webp']);
    const [{ n }] = await q<{ n: number }>('select count(*)::int n from products where not active');
    expect(n).toBe(5);
    expect(c.products.every((p) => p.countsAsBox)).toBe(true);
    expect(c.zones.map((z) => [z.name, z.shippingCost, z.minBoxes, z.freeFromBoxes, z.deliveryWeekday, z.deliveryMoment, z.distancePricing])).toEqual([
      ['Hudson / Plátanos / Ranelagh', 1500, 3, 4, 5, 'a la noche', true],
      ['Berazategui', 2500, 3, 4, 6, 'a la mañana', true],
      ['Quilmes / Bernal / Wilde', 4500, 4, 6, 6, 'a la mañana', true],
      ['CABA', 5000, 5, 6, 6, 'a la mañana', false],
      ['City Bell / La Plata', 6000, 5, 8, 0, '', true],
    ]);
    const zoneOf = (name: string) => c.zones.find((z) => z.id === c.localities.find((l) => l.name === name)!.zoneId)!.name;
    expect(c.localities).toHaveLength(20);
    expect([zoneOf('Ranelagh'), zoneOf('Villa España'), zoneOf('Wilde'), zoneOf('Gonnet')]).toEqual(['Hudson / Plátanos / Ranelagh', 'Berazategui', 'Quilmes / Bernal / Wilde', 'City Bell / La Plata']);
    expect(c.zones.every((z) => z.discountPerBox === 5 && z.discountMax === 10)).toBe(true);
    expect(c.settings).toMatchObject({ pickupMinBoxes: 2, cutoffWeekday: 4, cutoffTime: '13:00' });
    await pool.end();
  });
});

