import { Pool, QueryResult, QueryResultRow } from 'pg';
import { env } from './env';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function checkDatabase(): Promise<boolean> {
  const result = await query('SELECT 1 as ok');
  return result.rows[0]?.ok === 1;
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
