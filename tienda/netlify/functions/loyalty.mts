import type { Config, Context } from '@netlify/functions';
import { checkLoyalty } from '../../server/loyalty';
import { query } from '../../server/db';

// Cliente frecuente para el checkout (informativo: create_order lo vuelve a calcular).
export default async (req: Request, context: Context) => {
  const body = await req.json().catch(() => null);
  const r = await checkLoyalty(body, { query, ip: context.ip, secret: Netlify.env.get('SESSION_SECRET') ?? 'ricordo' }).catch((e) => {
    console.error('[loyalty]', e);
    return { status: 500, body: { error: 'No disponible' } };
  });
  return Response.json(r.body, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
};

export const config: Config = { path: '/api/loyalty', method: 'POST' };
