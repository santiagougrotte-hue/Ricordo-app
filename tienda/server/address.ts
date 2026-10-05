// Buscador de direcciones (el cliente escribe su dirección y elige una sugerencia).
// Usa el autocompletado de OpenRouteService (OpenStreetMap) y relaciona cada resultado con nuestras localidades:
//   found     → la localidad está en la lista: queda definida la zona.
//   confirm   → el resultado dice el partido pero no la localidad exacta: el cliente la confirma entre las de ese partido.
//   not_found → no llegamos: WhatsApp o retiro.
// La clave de ORS nunca sale al navegador: el pedido pasa por esta función.
import type { AddressSuggestion, Locality } from '../src/lib/types';
import type { Query } from './db';
import { geoKey, mapShippingConfig, orsBase } from './distance';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

/** Minúsculas, sin tildes ni "Partido de". */
export const norm = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/^(partido|municipio|ciudad|localidad) de /, '').replace(/\s+/g, ' ').trim();

const CABA_HINTS = ['ciudad autonoma de buenos aires', 'autonomous city of buenos aires', 'caba', 'capital federal'];

/** Relaciona un resultado de OpenRouteService (propiedades de Pelias) con nuestras localidades. */
export function matchLocality(p: Row, localities: Locality[]): AddressSuggestion['match'] {
  const partidoOf = (name: string) => localities.filter((l) => norm(l.partido) === name);
  // De lo más específico a lo más general.
  const fields = [p.neighbourhood, p.borough, p.locality, p.localadmin].map(norm).filter(Boolean);
  for (const f of fields) {
    const hit = localities.find((l) => norm(l.name) === f);
    if (!hit) continue;
    // "Berazategui" puede ser la ciudad o todo el partido: si el partido tiene varias localidades, se decide por cercanía.
    const same = partidoOf(f);
    if (norm(hit.name) === norm(hit.partido) && same.length > 1 && !norm(p.neighbourhood)) return { status: 'confirm', options: same.map((l) => l.id) };
    return { status: 'found', localityId: hit.id };
  }
  const region = norm(p.region), county = norm(p.county), loc = norm(p.locality);
  if (CABA_HINTS.some((h) => region.includes(h) || county.includes(h)) || (loc === 'buenos aires' && /comuna/.test(county))) {
    const caba = localities.find((l) => norm(l.partido) === 'caba');
    if (caba) return { status: 'found', localityId: caba.id };
  }
  // Solo el partido: que confirme la localidad entre las de ese partido.
  const partidos = [county, norm(p.localadmin), loc].filter(Boolean);
  const options = localities.filter((l) => partidos.includes(norm(l.partido))).map((l) => l.id);
  if (options.length === 1) return { status: 'found', localityId: options[0] };
  if (options.length > 1) return { status: 'confirm', options };
  // Sin ningún dato de localidad ni partido: que el cliente la escriba. Con un partido que no atendemos: no llegamos.
  return partidos.length || region ? { status: 'not_found' } : { status: 'unknown' };
}

const R = 6371;
/** Distancia en km entre dos puntos (para elegir la localidad más cercana). */
export function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Centro de una localidad con OpenRouteService; se guarda en la base para no volver a pedirlo. */
async function ensureCentroids(ids: number[], deps: { query: Query; fetch: typeof fetch; orsKey: string }) {
  const missing = await deps.query<Row>(`select id, name, partido from localities where id = any($1) and lat is null`, [ids]);
  for (const l of missing.slice(0, 8)) {
    try {
      const url = `${orsBase()}/geocode/search?` + new URLSearchParams({
        api_key: deps.orsKey, text: `${l.name}, ${l.partido}, Buenos Aires, Argentina`, 'boundary.country': 'AR',
        layers: 'neighbourhood,locality,localadmin,borough', size: '1',
      });
      const g = (await (await deps.fetch(url, { signal: AbortSignal.timeout(5000) })).json()) as Row;
      const [lng, lat] = (g?.features?.[0]?.geometry?.coordinates ?? []) as number[];
      if (typeof lat === 'number' && typeof lng === 'number') await deps.query(`update localities set lat = $2, lng = $3 where id = $1`, [l.id, lat, lng]);
    } catch { /* se reintenta en la próxima búsqueda */ }
  }
}

/** Entre varias localidades posibles (mismo partido), la más cercana a la dirección. */
async function nearest(options: number[], point: { lat: number; lng: number }, deps: { query: Query; fetch: typeof fetch; orsKey: string }): Promise<number | null> {
  await ensureCentroids(options, deps);
  const rows = await deps.query<Row>(`select id, lat, lng from localities where id = any($1) and lat is not null`, [options]);
  let best: { id: number; d: number } | null = null;
  for (const r of rows) {
    const d = kmBetween(point, { lat: Number(r.lat), lng: Number(r.lng) });
    if (!best || d < best.d) best = { id: r.id, d };
  }
  return best && best.d < 15 ? best.id : null; // a más de 15 km del centro más cercano, mejor que la confirme
}

export async function searchAddress(
  text: string,
  deps: { query: Query; fetch: typeof fetch; orsKey?: string },
): Promise<AddressSuggestion[]> {
  const q = text.trim().replace(/\s+/g, ' ').slice(0, 120);
  if (!deps.orsKey || q.length < 4) return [];
  const [cfgRow] = await deps.query<Row>(`select * from shipping_config limit 1`);
  const cfg = cfgRow ? mapShippingConfig(cfgRow) : null;
  const localities = (await deps.query<Row>(
    `select l.* from localities l join shipping_zones z on z.id = l.zone_id where l.active and z.active`,
  )).map((l) => ({ id: l.id, name: l.name, partido: l.partido, zoneId: l.zone_id }));

  const params: Record<string, string> = { api_key: deps.orsKey, text: `${q}, Buenos Aires`, 'boundary.country': 'AR', layers: 'address,street', size: '6' };
  if (cfg) Object.assign(params, { 'focus.point.lat': String(cfg.originLat), 'focus.point.lon': String(cfg.originLng) });
  const res = await deps.fetch(`${orsBase()}/geocode/autocomplete?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return [];
  const data = (await res.json()) as Row;

  const out: AddressSuggestion[] = [];
  const seen = new Set<string>();
  for (const f of (data.features ?? []) as Row[]) {
    const p = f.properties ?? {};
    const [lng, lat] = (f.geometry?.coordinates ?? []) as number[];
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    const address = (p.housenumber && p.street ? `${p.street} ${p.housenumber}` : p.name ?? '').trim();
    if (!address) continue;
    let match = matchLocality(p, localities);
    // Solo sabemos el partido: la localidad más cercana a la dirección.
    if (match.status === 'confirm') {
      const id = await nearest(match.options, { lat, lng }, { ...deps, orsKey: deps.orsKey }).catch(() => null);
      if (id !== null) match = { status: 'found', localityId: id };
    }
    const placeName = match.status === 'found' ? localities.find((l) => l.id === (match as { localityId: number }).localityId)?.name : null;
    const town = placeName ?? p.neighbourhood ?? p.locality;
    const place = [town, p.county && norm(p.county) !== norm(town) ? p.county : null].filter(Boolean).join(', ');
    const label = place ? `${address}, ${place}` : address;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ label, address, postalCode: /^[A-Z]?\d{4}/i.test(p.postalcode ?? '') ? String(p.postalcode) : null, hasNumber: !!p.housenumber, match });
    // Guardamos el punto: cuando el cliente elija esta dirección no hace falta volver a ubicarla.
    if (match.status === 'found' && cfg) {
      await deps.query(
        `insert into geo_cache (key, lat, lng, km_round_trip, origin) values ($1, $2, $3, null, $4) on conflict (key) do nothing`,
        [geoKey(address, match.localityId), lat, lng, `${cfg.originLat},${cfg.originLng}`],
      );
    }
  }
  return out;
}
