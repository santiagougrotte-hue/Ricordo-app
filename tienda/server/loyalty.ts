// Cliente frecuente: cuántas compras entregadas lleva un celular y si en este pedido le toca el descuento.
import type { Query } from './db';
import type { LoyaltyStatus } from '../src/lib/types';
import { allow, ipHash } from './http';

export async function loyaltyFor(q: Query, phone: string): Promise<LoyaltyStatus> {
  const [cfg] = await q<{ loyalty_enabled: boolean }>(`select loyalty_enabled from store_settings limit 1`);
  const [s] = await q<{ eligible: boolean; pct: number; missing: number; nth: number }>(`select * from loyalty_status($1)`, [phone]);
  return { enabled: !!cfg?.loyalty_enabled, eligible: !!cfg?.loyalty_enabled && s.eligible, pct: s.pct, missing: s.missing, nth: s.nth };
}

/** POST /api/loyalty { phone }: con límite de consultas (no sirve para averiguar cuánto compra otro). */
export async function checkLoyalty(raw: unknown, deps: { query: Query; ip: string; secret: string }): Promise<{ status: number; body: LoyaltyStatus | { error: string } }> {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const phone = typeof b.phone === 'string' ? b.phone.replace(/\D/g, '').slice(0, 15) : '';
  if (phone.length < 8) return { status: 400, body: { error: 'Celular inválido' } };
  if (!(await allow(deps.query, 'loyalty', ipHash(deps.ip, deps.secret), 10, 15))) return { status: 429, body: { error: 'Demasiadas consultas' } };
  return { status: 200, body: await loyaltyFor(deps.query, phone) };
}
