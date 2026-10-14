// Cupones: validación para el checkout (informativa) y CRUD del panel. El descuento definitivo lo calcula create_order.
import type { Query } from './db';
import type { CouponCheck } from '../src/lib/types';
import { allow, ipHash } from './http';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CouponDeps { query: Query; ip: string; secret: string }

/** POST /api/coupon { code, phone, items }: subtotales con los precios de la base, nunca con los del navegador. */
export async function checkCoupon(raw: unknown, deps: CouponDeps): Promise<{ status: number; body: CouponCheck }> {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const code = typeof b.code === 'string' ? b.code.trim().toUpperCase().slice(0, 40) : '';
  const phone = typeof b.phone === 'string' ? b.phone.replace(/\D/g, '').slice(0, 15) : '';
  const items = Array.isArray(b.items) ? (b.items as Record<string, unknown>[]).slice(0, 30) : [];
  if (!code) return { status: 400, body: { ok: false, message: 'Escribí el código del cupón.' } };

  // 10 intentos cada 15 minutos por visitante y por teléfono (frena a quien quiera adivinar códigos).
  const byIp = ipHash(deps.ip, deps.secret);
  const tooMany = { status: 429, body: { ok: false as const, message: 'Probaste muchos cupones seguidos. Esperá 15 minutos.' } };
  if (!(await allow(deps.query, 'coupon', byIp, 10, 15))) return tooMany;
  if (phone.length >= 8 && !(await allow(deps.query, 'coupon-tel', ipHash(phone, deps.secret), 10, 15))) return tooMany;

  const req = items
    .filter((i) => typeof i.productId === 'string' && UUID.test(i.productId) && Number.isInteger(i.quantity) && (i.quantity as number) > 0)
    .map((i) => ({ id: i.productId as string, q: Math.min(i.quantity as number, 99) }));
  let subtotal = 0, base = 0;
  if (req.length) {
    const rows = await deps.query<{ id: string; price: number; promo_eligible: boolean }>(
      `select id, price, promo_eligible from products where active and id = any($1::uuid[])`, [req.map((r) => r.id)]);
    for (const r of req) {
      const p = rows.find((x) => x.id === r.id);
      if (!p) continue;
      subtotal += p.price * r.q;
      if (p.promo_eligible) base += p.price * r.q;
    }
  }
  const [c] = await deps.query<{ codigo: string | null; tipo: 'porcentaje' | 'monto'; valor: number; compra_minima: number | null; descuento: number; mensaje: string | null }>(
    `select * from cupon_evaluar($1, $2, $3, $4, false)`, [code, phone, subtotal, base]);
  if (!c || c.mensaje) return { status: 200, body: { ok: false, message: c?.mensaje ?? 'Ese cupón no existe o ya no está activo.' } };
  return { status: 200, body: { ok: true, code: c.codigo!, type: c.tipo, value: c.valor, minPurchase: c.compra_minima, discount: c.descuento } };
}

/* ── Panel ─────────────────────────────────────────────── */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export const mapCoupon = (r: Row) => ({
  id: Number(r.id), code: r.codigo, type: r.tipo, value: r.valor, minPurchase: r.compra_minima, expiresOn: r.vence_el ? String(r.vence_el instanceof Date ? r.vence_el.toISOString() : r.vence_el).slice(0, 10) : null,
  maxUses: r.usos_maximos, uses: r.usos, onePerCustomer: r.un_uso_por_cliente, customerPhone: r.cliente_telefono, active: r.activo,
  createdAt: new Date(r.creado_el).toISOString(), totalDiscounted: Number(r.total_descontado ?? 0),
});

export const COUPONS_SQL = `
  select c.*, coalesce((select sum(monto_descontado) from cupones_usos u where u.cupon_id = c.id), 0) as total_descontado
  from cupones c`;

/** Valida y normaliza lo que manda el panel. Devuelve el mensaje de error o los valores para la base. */
export function parseCoupon(d: Row): string | unknown[] {
  const code = String(d.code ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return 'El código va de 3 a 30 letras o números, sin espacios.';
  if (d.type !== 'porcentaje' && d.type !== 'monto') return 'Elegí si es un % o un monto fijo.';
  const value = Number(d.value);
  if (!Number.isInteger(value) || value <= 0 || (d.type === 'porcentaje' && value > 100)) return 'Revisá el valor del descuento.';
  const opt = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
  const min = opt(d.minPurchase), max = opt(d.maxUses);
  if (min !== null && (!Number.isInteger(min) || min <= 0)) return 'Revisá la compra mínima.';
  if (max !== null && (!Number.isInteger(max) || max <= 0)) return 'Revisá los usos máximos.';
  const exp = d.expiresOn ? String(d.expiresOn) : null;
  if (exp && !/^\d{4}-\d{2}-\d{2}$/.test(exp)) return 'Revisá la fecha de vencimiento.';
  const phone = d.customerPhone ? String(d.customerPhone).replace(/\D/g, '') : '';
  if (phone && phone.length < 8) return 'Revisá el celular del cupón personal.';
  return [code, d.type, value, min, exp, max, !!d.onePerCustomer, phone || null, d.active !== false];
}
