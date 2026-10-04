import type { Config } from '@netlify/functions';
import { query } from '../../server/db';
import { getCatalog, getSlots } from '../../server/catalog';

// Catálogo y turnos (públicos, solo lectura de lo activo).
export default async (req: Request) => {
  const url = new URL(req.url);
  try {
    if (url.pathname === '/api/catalog') {
      return Response.json(await getCatalog(query), { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=60' } });
    }
    const method = url.searchParams.get('method') === 'pickup' ? 'pickup' : 'delivery';
    return Response.json(await getSlots(query, method), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[public]', e);
    return Response.json({ error: 'No pudimos cargar la tienda' }, { status: 500 });
  }
};

export const config: Config = { path: ['/api/catalog', '/api/slots'], method: 'GET' };
