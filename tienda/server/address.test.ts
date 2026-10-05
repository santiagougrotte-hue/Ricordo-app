import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { matchLocality, norm, searchAddress } from './address';
import { distanceFor } from './distance';
import type { Query } from './db';
import { freshDb, TEST_DB } from './testdb';
import { SEED_LOCALITIES } from '../src/lib/api/seed-data';

const id = (name: string) => SEED_LOCALITIES.find((l) => l.name === name)!.id;

describe('matchLocality (resultado de OpenRouteService → nuestra localidad)', () => {
  it('normaliza tildes y "Partido de"', () => expect(norm('Partido de Berazategui ')).toBe('berazategui'));
  it('el barrio manda: Ranelagh aunque la localidad diga Berazategui', () =>
    expect(matchLocality({ neighbourhood: 'Ranelagh', locality: 'Berazategui', county: 'Partido de Berazategui' }, SEED_LOCALITIES)).toEqual({ status: 'found', localityId: id('Ranelagh') }));
  it('tildes: Villa España / Plátanos', () => {
    expect(matchLocality({ locality: 'Villa Espana', county: 'Berazategui' }, SEED_LOCALITIES)).toEqual({ status: 'found', localityId: id('Villa España') });
    expect(matchLocality({ neighbourhood: 'Platanos' }, SEED_LOCALITIES)).toEqual({ status: 'found', localityId: id('Plátanos') });
  });
  it('CABA por región', () =>
    expect(matchLocality({ locality: 'Buenos Aires', region: 'Ciudad Autónoma de Buenos Aires', neighbourhood: 'Palermo' }, SEED_LOCALITIES)).toEqual({ status: 'found', localityId: id('CABA') }));
  it('solo el partido (varias localidades) → que confirme', () => {
    const r = matchLocality({ county: 'Partido de Quilmes', locality: 'Pasaje X' }, SEED_LOCALITIES);
    expect(r.status).toBe('confirm');
    expect(r.status === 'confirm' && r.options.length).toBe(7);
  });
  it('partido con una sola localidad → directo (Avellaneda → Wilde)', () =>
    expect(matchLocality({ county: 'Avellaneda', locality: 'Sarandí' }, SEED_LOCALITIES)).toEqual({ status: 'found', localityId: id('Wilde') }));
  it('fuera de la lista → not_found', () =>
    expect(matchLocality({ locality: 'Florencio Varela', county: 'Florencio Varela' }, SEED_LOCALITIES)).toEqual({ status: 'not_found' }));
});

describe.skipIf(!TEST_DB)('searchAddress contra la base (ORS simulado)', () => {
  let q: Query;
  let pool: pg.Pool;
  const calls: string[] = [];
  const ors = (async (url: string | URL | Request) => {
    const u = String(url);
    calls.push(u);
    if (u.includes('/geocode/autocomplete')) {
      return Response.json({ features: [
        { geometry: { coordinates: [-58.21, -34.79] }, properties: { street: 'Calle 361', housenumber: '1234', neighbourhood: 'Ranelagh', locality: 'Berazategui', county: 'Partido de Berazategui', postalcode: 'B1886' } },
        { geometry: { coordinates: [-58.27, -34.72] }, properties: { name: 'Avenida Calchaquí', street: 'Avenida Calchaquí', county: 'Partido de Quilmes' } },
        { geometry: { coordinates: [-58.3, -34.8] }, properties: { street: 'Calle 1', housenumber: '50', locality: 'Florencio Varela', county: 'Florencio Varela' } },
      ] });
    }
    if (u.includes('/v2/directions')) return Response.json({ routes: [{ summary: { distance: 4000 } }] });
    return new Response('?', { status: 404 });
  }) as unknown as typeof fetch;

  beforeAll(async () => ({ q, pool } = await freshDb()));
  afterAll(() => pool.end());

  it('sin clave o con menos de 4 letras no consulta', async () => {
    expect(await searchAddress('Calle 361 1234', { query: q, fetch: ors })).toEqual([]);
    expect(await searchAddress('Cal', { query: q, fetch: ors, orsKey: 'k' })).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('sugiere direcciones, las relaciona con la localidad y guarda el punto; el envío sale sin volver a ubicarla', async () => {
    const r = await searchAddress('Calle 361 1234', { query: q, fetch: ors, orsKey: 'k' });
    const [{ id: ranelagh }] = await q<{ id: number }>(`select id from localities where name = 'Ranelagh'`);
    expect(r[0]).toMatchObject({ address: 'Calle 361 1234', postalCode: 'B1886', hasNumber: true, match: { status: 'found', localityId: ranelagh } });
    expect(r[0].label).toBe('Calle 361 1234, Ranelagh, Partido de Berazategui');
    expect(r[1].match.status).toBe('confirm');
    expect(r[2].match).toEqual({ status: 'not_found' });
    // Elegida la primera: solo se mide la ruta (no se vuelve a geocodificar). 4 km → 8 km i/v × 7 l × $1700 = $952 → $1000
    calls.length = 0;
    const d = await distanceFor({ address: 'Calle 361 1234', localityId: ranelagh }, { query: q, fetch: ors, orsKey: 'k' });
    expect(d).toMatchObject({ cost: 1000, km: 8 });
    expect(calls.every((u) => u.includes('/v2/directions'))).toBe(true);
  });
});
