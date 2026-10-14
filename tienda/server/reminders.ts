// Recordatorio por mail (función programada, todos los días a las 10 de Argentina):
// a quien dejó su mail y pidió novedades, si hace más de X días que no compra y no le escribimos en 30 días,
// le mandamos un cupón personal. Todo mail lleva un link para darse de baja sin iniciar sesión.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Query } from './db';
import { createPersonalCoupon } from './coupons';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export interface ReminderEnv { RESEND_API_KEY?: string; NOTIFY_FROM?: string; SESSION_SECRET?: string; SITE_URL?: string }

export const unsubToken = (email: string, secret: string) =>
  createHmac('sha256', secret).update(`unsub:${email.trim().toLowerCase()}`).digest('base64url').slice(0, 32);

export function unsubscribeUrl(email: string, env: ReminderEnv): string {
  const base = (env.SITE_URL ?? '').replace(/\/$/, '');
  return `${base}/api/unsubscribe?e=${encodeURIComponent(email.trim().toLowerCase())}&t=${unsubToken(email, env.SESSION_SECRET ?? '')}`;
}

/** Candidatos: con mail y "quiero novedades", más de X días sin comprar, sin baja y sin recordatorio en 30 días. */
export const REMINDER_SQL = `
  with c as (
    select lower(customer_email) as email,
           (array_agg(customer_name order by created_at desc))[1] as name,
           (array_agg(customer_phone order by created_at desc))[1] as phone,
           max(created_at) as last_at,
           bool_or(marketing_opt_in) as opt_in
    from orders where customer_email is not null and status <> 'cancelled'
    group by 1
  )
  select c.* from c
  where c.opt_in and c.last_at < now() - make_interval(days => $1)
    and not exists (select 1 from email_optouts x where x.email = c.email)
    and not exists (select 1 from email_reminders r where lower(r.email) = c.email and r.sent_at > now() - interval '30 days')
  order by c.last_at limit 50`;

export async function runReminders(deps: { query: Query; fetch: typeof fetch; env: ReminderEnv; log?: (m: string) => void }) {
  const { query: q, env } = deps;
  const log = deps.log ?? (() => {});
  const [cfg] = await q<Row>(`select reminder_enabled, recontact_days, recontact_coupon_pct from store_settings limit 1`);
  if (!cfg?.reminder_enabled) return { sent: 0, skipped: 'apagado' };
  if (!env.RESEND_API_KEY || !env.SESSION_SECRET || !env.SITE_URL) {
    log('recordatorios: falta RESEND_API_KEY, SESSION_SECRET o la URL del sitio');
    return { sent: 0, skipped: 'sin configurar' };
  }
  const list = await q<Row>(REMINDER_SQL, [cfg.recontact_days]);
  let sent = 0;
  for (const c of list) {
    try {
      const { code, expiresOn } = await createPersonalCoupon(q, c.phone, cfg.recontact_coupon_pct);
      const name = String(c.name ?? '').trim().split(/\s+/)[0];
      const vence = `${expiresOn.slice(8, 10)}/${expiresOn.slice(5, 7)}`;
      const unsub = unsubscribeUrl(c.email, env);
      const shop = env.SITE_URL!.replace(/\/$/, '');
      const text = [
        `¡Hola ${name}!`, '',
        `Hace un tiempo que no te vemos por Ricordo 🍝`,
        `Te dejamos un ${cfg.recontact_coupon_pct}% de descuento con el código ${code}, válido hasta el ${vence}.`,
        `Es para tu celular: escribilo en "¿Tenés un cupón?" al hacer el pedido en ${shop}`, '',
        `Si no querés recibir más mails: ${unsub}`,
      ].join('\n');
      const html = `<p>¡Hola ${escapeHtml(name)}!</p><p>Hace un tiempo que no te vemos por Ricordo 🍝</p>
<p>Te dejamos un <b>${cfg.recontact_coupon_pct}% de descuento</b> con el código <b style="font-size:1.2em">${code}</b>, válido hasta el ${vence}.</p>
<p>Escribilo en “¿Tenés un cupón?” al hacer tu pedido en <a href="${shop}">${shop.replace(/^https?:\/\//, '')}</a>.</p>
<p style="color:#777;font-size:12px">¿No querés recibir más mails? <a href="${unsub}">Darte de baja</a>.</p>`;
      const res = await deps.fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: env.NOTIFY_FROM || 'Ricordo <onboarding@resend.dev>', to: [c.email],
          subject: `${name ? name + ', te' : 'Te'} dejamos un ${cfg.recontact_coupon_pct}% para tu próximo pedido`, text, html,
          headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}`);
      await q(`insert into email_reminders (email, coupon_code) values ($1, $2)`, [c.email, code]);
      sent++;
    } catch (e) {
      log(`recordatorio a un cliente falló: ${String(e)}`);
    }
  }
  return { sent, candidates: list.length };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** GET/POST /api/unsubscribe?e=&t= : baja sin iniciar sesión (el link va firmado). */
export async function handleUnsubscribe(url: URL, q: Query, secret: string): Promise<{ status: number; html: string }> {
  const email = (url.searchParams.get('e') ?? '').trim().toLowerCase();
  const token = url.searchParams.get('t') ?? '';
  const expected = unsubToken(email, secret);
  const ok = !!email && !!secret && token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  if (!ok) return { status: 400, html: page('Este link no es válido', 'Si querés darte de baja, escribinos por WhatsApp y lo hacemos nosotros.') };
  await q(`insert into email_optouts (email) values ($1) on conflict (email) do nothing`, [email]);
  return { status: 200, html: page('Listo, te diste de baja', 'No te vamos a mandar más mails de novedades ni descuentos. Tus pedidos siguen igual.') };
}

const page = (title: string, body: string) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Ricordo</title><style>body{font-family:system-ui,sans-serif;background:#faf6f0;color:#221a16;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}main{max-width:28rem;background:#fff;border:1px solid #221a16;padding:24px}h1{font-size:1.4rem;margin:0 0 8px}a{color:#b8322a}</style></head>
<body><main><h1>${title}</h1><p>${body}</p><p><a href="/">Volver a la tienda</a></p></main></body></html>`;
