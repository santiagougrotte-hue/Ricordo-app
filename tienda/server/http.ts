import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Query } from './db';

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

/** Hash de la IP (no se guarda la IP en la base). */
export function ipHash(ip: string | undefined, salt: string): string {
  return createHash('sha256').update(`${salt}:${ip ?? 'sin-ip'}`).digest('hex').slice(0, 32);
}

/** Límite de intentos por visitante. Devuelve true si todavía puede. */
export async function allow(q: Query, kind: string, key: string, max: number, minutes: number): Promise<boolean> {
  const [r] = await q<{ n: number }>(
    `select count(*)::int as n from request_log where kind = $1 and key_hash = $2 and at > now() - make_interval(mins => $3)`,
    [kind, key, minutes],
  );
  if (r.n >= max) return false;
  await q(`insert into request_log (kind, key_hash) values ($1, $2)`, [kind, key]);
  // limpieza ocasional
  if (Math.random() < 0.02) await q(`delete from request_log where at < now() - interval '2 days'`);
  return true;
}

// ── Sesión del panel: cookie firmada con HMAC (sin estado en el servidor) ──
const COOKIE = 'ricordo_admin';
const DAYS = 7;

export function signSession(email: string, secret: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ e: email, x: now + DAYS * 86400_000 })).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySession(token: string | undefined, secret: string, now = Date.now()): string | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { e, x } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { e: string; x: number };
    return x > now ? e : null;
  } catch {
    return null;
  }
}

export function sessionCookie(token: string, secure: boolean): string {
  return `${COOKIE}=${token}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${DAYS * 86400}${secure ? '; Secure' : ''}`;
}
export function clearCookie(secure: boolean): string {
  return `${COOKIE}=; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;
}
export function readCookie(req: Request): string | undefined {
  const raw = req.headers.get('cookie') ?? '';
  return raw.split(/;\s*/).find((c) => c.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
}

/** Comparación en tiempo constante (contraseñas). */
export function sameText(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}
