import type { Config } from '@netlify/functions';
import { query } from '../../server/db';
import { getCatalog } from '../../server/catalog';

// Catálogo, zonas y ajustes públicos (solo lectura de lo activo).
export default async () => {
  try {
    return Response.json(await getCatalog(query, { distanceEnabled: !!Netlify.env.get('ORS_API_KEY') }), { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=60' } });
  } catch (e) {
    console.error('[public]', e);
    return Response.json({ error: 'No pudimos cargar la tienda' }, { status: 500 });
  }
};

export const config: Config = { path: ['/api/catalog'], method: 'GET' };
