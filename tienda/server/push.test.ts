import { createECDH, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import type { Query } from './db';
import { sendPush, validSubscription, vapidKeys } from './push';
import { pushForOrder } from './createOrder';
import { freshDb, TEST_DB } from './testdb';

/** Claves como las que genera un navegador al suscribirse. */
function browserKeys() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') };
}

describe('validSubscription', () => {
  it('acepta https con claves base64url y rechaza lo demás', () => {
    const keys = browserKeys();
    expect(validSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys })).toEqual({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys });
    expect(validSubscription({ endpoint: 'http://x.com/a', keys })).toBeNull();
    expect(validSubscription({ endpoint: 'no es url', keys })).toBeNull();
    expect(validSubscription({ endpoint: 'https://x.com/a', keys: { p256dh: 'con espacios', auth: 'a' } })).toBeNull();
    expect(validSubscription(null)).toBeNull();
  });
});

describe('pushForOrder', () => {
  it('título con número y total; cuerpo con cliente, cajas, localidad y día', () => {
    const p = pushForOrder({
      orderId: 'x', number: 1042, subtotal: 33000, discount: 0, discountPct: 0, shippingCost: 2500, total: 35500, boxCount: 3,
      deliveryMethod: 'delivery', deliveryDate: '2026-10-10', windowLabel: 'Sábado 10/10 a la mañana', locality: 'Hudson',
      paymentMethod: 'transfer', lines: [], customerName: 'Ana',
    });
    expect(p).toEqual({ title: '🥟 Nuevo pedido #1042 · $35.500', body: 'Ana · 3 cajas · Hudson · Sábado 10/10 a la mañana', url: '/admin/pedidos', tag: 'pedido-1042' });
  });
});

describe.skipIf(!TEST_DB)('sendPush contra la base', () => {
  let q: Query;
  let pool: pg.Pool;
  beforeAll(async () => ({ q, pool } = await freshDb(false)));
  afterAll(() => pool.end());

  it('las claves VAPID se crean una sola vez', async () => {
    const a = await vapidKeys(q);
    const b = await vapidKeys(q);
    expect(a).toEqual(b);
    expect(a.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
  });

  it('sin celulares registrados no manda nada', async () => {
    const r = await sendPush({ title: 't', body: 'b', url: '/admin' }, { query: q, fetch: (() => { throw new Error('no debería'); }) as unknown as typeof fetch });
    expect(r).toEqual({ sent: 0, failed: 0 });
  });

  it('manda el aviso cifrado y firmado a cada celular; borra los que el navegador dio de baja (410)', async () => {
    const a = browserKeys(), b = browserKeys();
    await q(`insert into push_subscriptions (endpoint, p256dh, auth) values ($1, $2, $3), ($4, $5, $6)`,
      ['https://push.example/ok', a.p256dh, a.auth, 'https://push.example/gone', b.p256dh, b.auth]);
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, { status: url.endsWith('/gone') ? 410 : 201 });
    }) as unknown as typeof fetch;

    const r = await sendPush({ title: 'Nuevo pedido', body: 'Ana', url: '/admin/pedidos', tag: 'pedido-1' }, { query: q, fetch: fake, siteUrl: 'https://ricordopasta.netlify.app' });
    expect(r).toEqual({ sent: 1, failed: 1 });
    expect(calls.map((c) => c.url).sort()).toEqual(['https://push.example/gone', 'https://push.example/ok']);
    const h = calls[0].init.headers as Record<string, string>;
    expect(calls[0].init.method).toBe('POST');
    expect(h['Content-Encoding']).toBe('aes128gcm');
    expect(h.Authorization).toMatch(/^vapid t=.+, k=.+/);
    expect(h.Urgency).toBe('high');
    // el contenido va cifrado: no se lee el nombre del cliente en el cuerpo
    expect(Buffer.from(calls[0].init.body as Uint8Array).toString('latin1')).not.toContain('Ana');
    const left = await q<{ endpoint: string; last_ok_at: Date | null }>(`select endpoint, last_ok_at from push_subscriptions`);
    expect(left.map((s) => s.endpoint)).toEqual(['https://push.example/ok']);
    expect(left[0].last_ok_at).not.toBeNull();
  });
});
