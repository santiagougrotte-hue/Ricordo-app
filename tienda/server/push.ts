// Web Push: avisos al celular del dueño aunque el panel esté cerrado.
// web-push arma y cifra el mensaje; el envío va por fetch (así se puede probar sin red).
import webpush from 'web-push';
import type { Query } from './db';

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushPayload {
  title: string;
  body: string;
  /** A dónde lleva al tocar la notificación. */
  url: string;
  /** Misma etiqueta = reemplaza a la anterior en vez de apilarse. */
  tag?: string;
}

const B64URL = /^[A-Za-z0-9_-]+=*$/;

export function validSubscription(v: unknown): PushSubscriptionInput | null {
  const s = v as PushSubscriptionInput | null;
  if (!s || typeof s.endpoint !== 'string' || !s.keys) return null;
  let url: URL;
  try { url = new URL(s.endpoint); } catch { return null; }
  if (url.protocol !== 'https:' || s.endpoint.length > 1000) return null;
  const { p256dh, auth } = s.keys;
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || !B64URL.test(p256dh) || !B64URL.test(auth) || p256dh.length > 200 || auth.length > 100) return null;
  return { endpoint: s.endpoint, keys: { p256dh, auth } };
}

/** Claves VAPID: se crean la primera vez y quedan guardadas en la base (tabla privada). */
export async function vapidKeys(q: Query): Promise<{ publicKey: string; privateKey: string }> {
  const [row] = await q<{ public_key: string; private_key: string }>(`select public_key, private_key from push_config`);
  if (row) return { publicKey: row.public_key, privateKey: row.private_key };
  const k = webpush.generateVAPIDKeys();
  await q(`insert into push_config (public_key, private_key) values ($1, $2) on conflict (id) do nothing`, [k.publicKey, k.privateKey]);
  const [saved] = await q<{ public_key: string; private_key: string }>(`select public_key, private_key from push_config`);
  return { publicKey: saved.public_key, privateKey: saved.private_key };
}

/** Manda el aviso a todos los celulares registrados. Borra los que ya no existen (el navegador los dio de baja). */
export async function sendPush(payload: PushPayload, deps: { query: Query; fetch: typeof fetch; siteUrl?: string }): Promise<{ sent: number; failed: number }> {
  const subs = await deps.query<{ endpoint: string; p256dh: string; auth: string }>(`select endpoint, p256dh, auth from push_subscriptions`);
  if (subs.length === 0) return { sent: 0, failed: 0 };
  const keys = await vapidKeys(deps.query);
  const subject = (deps.siteUrl || 'https://ricordopasta.netlify.app').replace(/\/$/, '');
  let sent = 0, failed = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      const req = webpush.generateRequestDetails(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 60 * 60 * 24, urgency: 'high', topic: payload.tag?.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) },
      );
      const res = await deps.fetch(req.endpoint, {
        method: req.method, headers: req.headers as Record<string, string>, body: req.body as unknown as BodyInit, signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        sent++;
        await deps.query(`update push_subscriptions set last_ok_at = now() where endpoint = $1`, [s.endpoint]);
      } else {
        failed++;
        if (res.status === 404 || res.status === 410) await deps.query(`delete from push_subscriptions where endpoint = $1`, [s.endpoint]);
      }
    } catch {
      failed++;
    }
  }));
  return { sent, failed };
}
