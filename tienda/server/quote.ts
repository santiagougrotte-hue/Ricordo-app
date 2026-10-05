// Cotización de envío por distancia para el checkout. Limitada por visitante (cuota gratuita de OpenRouteService).
import type { DistanceQuote } from '../src/lib/types';
import type { Query } from './db';
import { allow, ipHash } from './http';
import { distanceFor } from './distance';

export async function handleQuoteShipping(
  raw: unknown,
  env: { ORS_API_KEY?: string; SESSION_SECRET?: string },
  deps: { query: Query; fetch: typeof fetch; ip?: string },
): Promise<{ status: number; body: DistanceQuote | { error: string } }> {
  const b = (raw ?? {}) as { localityId?: unknown; address?: unknown };
  if (!Number.isInteger(b.localityId) || typeof b.address !== 'string') return { status: 400, body: { error: 'Datos inválidos' } };
  if (!(await allow(deps.query, 'quote', ipHash(deps.ip, env.SESSION_SECRET ?? 'ricordo'), 40, 60))) {
    return { status: 200, body: { distanceCost: null, km: null } }; // sin más consultas: costo fijo
  }
  const r = await distanceFor({ address: b.address.slice(0, 200), localityId: b.localityId as number }, { query: deps.query, fetch: deps.fetch, orsKey: env.ORS_API_KEY }).catch(() => null);
  return { status: 200, body: { distanceCost: r?.cost ?? null, km: r?.km ?? null } };
}
