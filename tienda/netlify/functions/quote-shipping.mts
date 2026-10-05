import type { Config, Context } from '@netlify/functions';
import { query } from '../../server/db';
import { handleQuoteShipping } from '../../server/quote';

// Envío por distancia para la dirección del checkout (informativo: el pedido lo recalcula igual).
export default async (req: Request, context: Context) => {
  const body = await req.json().catch(() => null);
  const r = await handleQuoteShipping(body, { ORS_API_KEY: Netlify.env.get('ORS_API_KEY'), SESSION_SECRET: Netlify.env.get('SESSION_SECRET') }, { query, fetch, ip: context.ip });
  return Response.json(r.body, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
};

export const config: Config = { path: '/api/quote-shipping', method: 'POST' };
