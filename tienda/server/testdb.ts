// Utilidades de prueba: base Postgres real con las migraciones de Netlify aplicadas desde cero.
import pg from 'pg';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { poolQuery, type Query } from './db';

export const TEST_DB = process.env.TEST_DATABASE_URL;

export async function freshDb(): Promise<{ q: Query; pool: pg.Pool }> {
  const pool = new pg.Pool({ connectionString: TEST_DB, max: 6 });
  await pool.query('drop schema if exists public cascade; create schema public;');
  const dir = new URL('../netlify/database/migrations/', import.meta.url).pathname;
  for (const m of readdirSync(dir).sort()) await pool.query(readFileSync(join(dir, m, 'migration.sql'), 'utf8'));
  return { q: poolQuery(pool), pool };
}
