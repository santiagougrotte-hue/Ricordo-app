// Utilidades de prueba: base Postgres real con las migraciones de Netlify aplicadas desde cero.
import pg from 'pg';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { poolQuery, type Query } from './db';

export const TEST_DB = process.env.TEST_DATABASE_URL;

/** Base nueva con todas las migraciones. `withExamples` reactiva los productos de ejemplo para usarlos como datos de prueba. */
export async function freshDb(withExamples = true): Promise<{ q: Query; pool: pg.Pool }> {
  const pool = new pg.Pool({ connectionString: TEST_DB, max: 6 });
  await pool.query('drop schema if exists public cascade; create schema public;');
  const dir = new URL('../netlify/database/migrations/', import.meta.url).pathname;
  const examples = `update products set active = true where id::text like '00000000-0000-4000-8000-00000000000_'`;
  for (const m of readdirSync(dir).sort()) {
    // La migración que borra los inactivos se llevaría los ejemplos: se reactivan antes.
    if (withExamples && m.endsWith('_borrar-inactivos')) await pool.query(examples);
    await pool.query(readFileSync(join(dir, m, 'migration.sql'), 'utf8'));
  }
  if (withExamples) await pool.query(examples);
  return { q: poolQuery(pool), pool };
}

/**
 * Envío como estaba antes de "por cajas" (escalones por km, costos fijos 1500…6000, CABA fijo).
 * Muchas pruebas se escribieron con esos valores; las de "por cajas" usan la configuración real.
 */
export async function legacyShipping(q: Query): Promise<void> {
  await q(`update shipping_config set pricing_mode = 'bands', fuel_price = 1700`);
  for (const [name, cost, free, dist, toll] of [
    ['Hudson / Plátanos / Ranelagh', 1500, 4, true, 0], ['Berazategui', 2500, 4, true, 0], ['Quilmes / Bernal / Wilde', 4500, 6, true, 0],
    ['CABA', 5000, 6, false, 0], ['City Bell / La Plata', 6000, 8, true, 0],
  ] as const) {
    await q(`update shipping_zones set shipping_cost = $2, free_from_boxes = $3, distance_pricing = $4, toll_round_trip = $5 where name = $1`, [name, cost, free, dist, toll]);
  }
}
