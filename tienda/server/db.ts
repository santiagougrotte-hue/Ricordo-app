// Acceso a Netlify Database (Postgres). En tests/local se puede forzar DATABASE_URL.
import pg from 'pg';

export type Query = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

let pool: pg.Pool | null = null;

async function getPool(): Promise<pg.Pool> {
  if (pool) return pool;
  if (process.env.DATABASE_URL) {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  } else {
    const { getDatabase } = await import('@netlify/database');
    pool = getDatabase().pool as unknown as pg.Pool;
  }
  return pool;
}

export const query: Query = async (sql, params) => {
  const p = await getPool();
  return (await p.query(sql, params as unknown[])).rows;
};

export function poolQuery(p: pg.Pool): Query {
  return async (sql, params) => (await p.query(sql, params as unknown[])).rows;
}
