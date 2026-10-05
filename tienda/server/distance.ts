// Envío por distancia (integra la Edge Function "cotizar-envio" del dueño, adaptada a Netlify).
// Ubica la dirección con OpenRouteService (OpenStreetMap), calcula los km de ida y vuelta desde el origen
// y arma: envío = (nafta + peaje de la zona) / pedidos promedio por ruta, redondeado hacia arriba.
// Si algo falla (sin clave, dirección dudosa, ORS caído) devuelve null y se usa el costo fijo de la zona.
import type { Query } from './db';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export interface ShippingConfig {
  originLat: number;
  originLng: number;
  fuelPrice: number;
  consumption100km: number;
  rounding: number;
}

export const mapShippingConfig = (r: Row): ShippingConfig => ({
  originLat: Number(r.origin_lat), originLng: Number(r.origin_lng), fuelPrice: r.fuel_price,
  consumption100km: Number(r.consumption_100km), rounding: r.rounding,
});

export interface DistanceResult { cost: number; km: number; lat: number; lng: number }

/** Costo a partir de los km ida y vuelta (misma fórmula que la Edge Function). */
export function costFromKm(km: number, toll: number, avgOrders: number, cfg: ShippingConfig): number {
  const fuel = km * (cfg.consumption100km / 100) * cfg.fuelPrice;
  const gross = (fuel + toll) / Math.max(avgOrders, 1);
  return Math.ceil(gross / cfg.rounding) * cfg.rounding;
}

const ORS = 'https://api.openrouteservice.org';
const MIN_CONFIDENCE = 0.6; // solo resultados precisos (0 a 1)

async function geocodeAndRoute(text: string, cfg: ShippingConfig, key: string, fetchFn: typeof fetch) {
  const url = `${ORS}/geocode/search?` + new URLSearchParams({
    api_key: key, text, 'boundary.country': 'AR', 'focus.point.lat': String(cfg.originLat), 'focus.point.lon': String(cfg.originLng), size: '1',
  });
  const geo = (await (await fetchFn(url, { signal: AbortSignal.timeout(6000) })).json()) as Row;
  const point = geo?.features?.[0];
  if (!point || (point.properties?.confidence ?? 0) < MIN_CONFIDENCE) return null;
  const [lng, lat] = point.geometry.coordinates as [number, number];
  const route = (await (await fetchFn(`${ORS}/v2/directions/driving-car`, {
    method: 'POST',
    headers: { Authorization: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ coordinates: [[cfg.originLng, cfg.originLat], [lng, lat]] }),
    signal: AbortSignal.timeout(6000),
  })).json()) as Row;
  const meters = route?.routes?.[0]?.summary?.distance;
  if (typeof meters !== 'number') return null;
  return { lat, lng, km: Math.round((meters / 1000) * 2 * 10) / 10 }; // ida y vuelta
}

/**
 * Envío por distancia para una dirección en una localidad. Usa la caché (geo_cache) para no repetir consultas.
 * Devuelve null si la zona no calcula por distancia o si no se pudo ubicar la dirección.
 */
export async function distanceFor(
  input: { address: string; localityId: number },
  deps: { query: Query; fetch: typeof fetch; orsKey?: string },
): Promise<DistanceResult | null> {
  const address = input.address.trim().replace(/\s+/g, ' ');
  if (address.length < 4) return null;
  const [row] = await deps.query<Row>(
    `select l.name, l.partido, z.distance_pricing, z.toll_round_trip, z.avg_orders_per_route
     from localities l join shipping_zones z on z.id = l.zone_id where l.id = $1 and l.active and z.active`,
    [input.localityId],
  );
  if (!row || !row.distance_pricing) return null;
  const [c] = await deps.query<Row>(`select * from shipping_config limit 1`);
  if (!c) return null;
  const cfg = mapShippingConfig(c);
  const origin = `${cfg.originLat},${cfg.originLng}`;
  const key = `${address.toLowerCase()}|${input.localityId}`;

  let hit = (await deps.query<Row>(`select lat, lng, km_round_trip from geo_cache where key = $1 and origin = $2`, [key, origin]))[0];
  if (!hit) {
    if (!deps.orsKey) return null;
    try {
      const r = await geocodeAndRoute(`${address}, ${row.name}, ${row.partido}, Buenos Aires, Argentina`, cfg, deps.orsKey, deps.fetch);
      if (!r) return null;
      await deps.query(
        `insert into geo_cache (key, lat, lng, km_round_trip, origin) values ($1, $2, $3, $4, $5)
         on conflict (key) do update set lat = excluded.lat, lng = excluded.lng, km_round_trip = excluded.km_round_trip, origin = excluded.origin, created_at = now()`,
        [key, r.lat, r.lng, r.km, origin],
      );
      hit = { lat: r.lat, lng: r.lng, km_round_trip: r.km };
    } catch {
      return null; // ORS caído o lento: costo fijo
    }
  }
  const km = Number(hit.km_round_trip);
  return { cost: costFromKm(km, row.toll_round_trip, Number(row.avg_orders_per_route), cfg), km, lat: Number(hit.lat), lng: Number(hit.lng) };
}
