// Envío por distancia (integra la Edge Function "cotizar-envio" del dueño, adaptada a Netlify).
// Ubica la dirección con OpenRouteService (OpenStreetMap), calcula los km de ida y vuelta desde el origen
// y arma el envío según el modo: escalones por km, (nafta + peaje) / pedidos por ruta, o por cajas
// (viaje − cajas × lo que absorbe cada caja, redondeado hacia arriba).
// Si algo falla (sin clave, dirección dudosa, ORS caído) devuelve null y se usa el costo fijo de la zona.
import type { Query } from './db';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export interface ShippingBand { upToKm: number | null; price: number }

export interface ShippingConfig {
  originLat: number;
  originLng: number;
  /** 'bands' = escalones por km (tabla) · 'fuel' = nafta + peaje · 'boxes' = viaje menos lo que absorbe cada caja. */
  pricingMode: 'bands' | 'fuel' | 'boxes';
  /** Modo por cajas: cuánto del margen de cada caja va a pagar el viaje. */
  absorbPerBox: number;
  /** Modo por localidad: % del viaje que paga el cliente con el pedido mínimo. */
  clientSharePct: number;
  fuelPrice: number;
  consumption100km: number;
  rounding: number;
}

export const mapShippingConfig = (r: Row): ShippingConfig => ({
  originLat: Number(r.origin_lat), originLng: Number(r.origin_lng),
  pricingMode: r.pricing_mode === 'fuel' || r.pricing_mode === 'boxes' ? r.pricing_mode : 'bands', absorbPerBox: r.absorb_per_box ?? 0, clientSharePct: r.client_share_pct ?? 50,
  fuelPrice: r.fuel_price, consumption100km: Number(r.consumption_100km), rounding: r.rounding,
});

export const mapBand = (r: Row): ShippingBand => ({ upToKm: r.up_to_km === null ? null : Number(r.up_to_km), price: r.price });

export async function loadBands(q: Query): Promise<ShippingBand[]> {
  return (await q<Row>(`select * from shipping_bands order by up_to_km nulls last`)).map(mapBand);
}

/** Precio del escalón para una distancia (km de ida). null si no hay escalón que la cubra. */
export function priceForKm(oneWayKm: number, bands: ShippingBand[]): number | null {
  const sorted = [...bands].sort((a, b) => (a.upToKm ?? Infinity) - (b.upToKm ?? Infinity));
  return sorted.find((b) => b.upToKm === null || oneWayKm <= b.upToKm)?.price ?? null;
}

/** cost: el envío (escalones / nafta), o en modo por cajas el costo del VIAJE entero (el envío sale de restarle las cajas). */
export interface DistanceResult { cost: number; km: number; lat: number; lng: number }

/** Costo del viaje ida y vuelta para un solo cliente: nafta + peaje, sin redondear. */
export const tripCost = (km: number, toll: number, cfg: Pick<ShippingConfig, 'consumption100km' | 'fuelPrice'>) =>
  Math.round(km * (cfg.consumption100km / 100) * cfg.fuelPrice + toll);

/** Costo a partir de los km ida y vuelta (misma fórmula que la Edge Function). */
export function costFromKm(km: number, toll: number, avgOrders: number, cfg: ShippingConfig): number {
  const fuel = km * (cfg.consumption100km / 100) * cfg.fuelPrice;
  const gross = (fuel + toll) / Math.max(avgOrders, 1);
  return Math.ceil(gross / cfg.rounding) * cfg.rounding;
}

/** Se puede apuntar a otro servidor en pruebas locales (ORS_BASE_URL). */
export const orsBase = () => (typeof process !== 'undefined' && process.env?.ORS_BASE_URL) || 'https://api.openrouteservice.org';
const MIN_CONFIDENCE = 0.6; // solo resultados precisos (0 a 1)

async function routeKm(lat: number, lng: number, cfg: ShippingConfig, key: string, fetchFn: typeof fetch): Promise<number | null> {
  const route = (await (await fetchFn(`${orsBase()}/v2/directions/driving-car`, {
    method: 'POST',
    headers: { Authorization: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ coordinates: [[cfg.originLng, cfg.originLat], [lng, lat]] }),
    signal: AbortSignal.timeout(6000),
  })).json()) as Row;
  const meters = route?.routes?.[0]?.summary?.distance;
  return typeof meters === 'number' ? Math.round((meters / 1000) * 2 * 10) / 10 : null; // ida y vuelta
}

async function geocodeAndRoute(text: string, cfg: ShippingConfig, key: string, fetchFn: typeof fetch) {
  const url = `${orsBase()}/geocode/search?` + new URLSearchParams({
    api_key: key, text, 'boundary.country': 'AR', 'focus.point.lat': String(cfg.originLat), 'focus.point.lon': String(cfg.originLng), size: '1',
  });
  const geo = (await (await fetchFn(url, { signal: AbortSignal.timeout(6000) })).json()) as Row;
  const point = geo?.features?.[0];
  if (!point || (point.properties?.confidence ?? 0) < MIN_CONFIDENCE) return null;
  const [lng, lat] = point.geometry.coordinates as [number, number];
  const km = await routeKm(lat, lng, cfg, key, fetchFn);
  return km === null ? null : { lat, lng, km };
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
  const key = geoKey(address, input.localityId);

  let hit = (await deps.query<Row>(`select lat, lng, km_round_trip from geo_cache where key = $1 and origin = $2`, [key, origin]))[0];
  if (hit && hit.km_round_trip === null) {
    // Punto conocido (vino de una sugerencia de dirección): falta medir la ruta.
    if (!deps.orsKey) return null;
    try {
      const km = await routeKm(Number(hit.lat), Number(hit.lng), cfg, deps.orsKey, deps.fetch);
      if (km === null) return null;
      await deps.query(`update geo_cache set km_round_trip = $2 where key = $1`, [key, km]);
      hit = { ...hit, km_round_trip: km };
    } catch {
      return null;
    }
  }
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
  let cost: number | null;
  if (cfg.pricingMode === 'bands') {
    cost = priceForKm(km / 2, await loadBands(deps.query)); // la tabla va en km de ida
    if (cost === null) return null; // más lejos que el último escalón: costo fijo de la zona
  } else if (cfg.pricingMode === 'boxes') {
    cost = tripCost(km, row.toll_round_trip, cfg); // create_order le resta lo que absorben las cajas
  } else {
    cost = costFromKm(km, row.toll_round_trip, Number(row.avg_orders_per_route), cfg);
  }
  return { cost, km, lat: Number(hit.lat), lng: Number(hit.lng) };
}

/** Clave de la caché: dirección normalizada + localidad. */
export const geoKey = (address: string, localityId: number) => `${address.trim().replace(/\s+/g, ' ').toLowerCase()}|${localityId}`;
