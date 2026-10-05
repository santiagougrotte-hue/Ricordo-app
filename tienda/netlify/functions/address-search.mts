import type { Config, Context } from '@netlify/functions';
import { query } from '../../server/db';
import { searchAddress } from '../../server/address';
import { allow, ipHash } from '../../server/http';

// Sugerencias de direcciones para el carrito y el checkout.
export default async (req: Request, context: Context) => {
  const b = (await req.json().catch(() => ({}))) as { text?: unknown };
  if (typeof b.text !== 'string') return Response.json({ error: 'Datos inválidos' }, { status: 400 });
  // Límite por visitante: protege la cuota gratuita de OpenRouteService.
  if (!(await allow(query, 'address', ipHash(context.ip, Netlify.env.get('SESSION_SECRET') ?? 'ricordo'), 120, 60))) return Response.json({ suggestions: [] });
  try {
    const suggestions = await searchAddress(b.text, { query, fetch, orsKey: Netlify.env.get('ORS_API_KEY') });
    return Response.json({ suggestions }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[address-search]', e);
    return Response.json({ suggestions: [] });
  }
};

export const config: Config = { path: '/api/address-search', method: 'POST' };
