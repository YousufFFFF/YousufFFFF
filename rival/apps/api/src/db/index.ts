import pg from 'pg';
import { config } from '../config.ts';

/**
 * Database access.
 *
 * One pool for the process. Every write that spans more than one table goes
 * through `transaction`, so a half-logged workout can never reach the PR or
 * rivalry tables.
 */

// Postgres `bigint` arrives as a string by default to avoid precision loss.
// Every bigint column here (volume, PR values in grams) is far inside
// `Number.MAX_SAFE_INTEGER`, so parsing to a number is safe and keeps the
// domain layer working in plain numbers.
pg.types.setTypeParser(pg.types.builtins.INT8, (value: string) => Number.parseInt(value, 10));
// `numeric` likewise — only used for percentages and RPE.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value: string) => Number.parseFloat(value));
// `date` columns are calendar days; hand them back as the raw YYYY-MM-DD string
// rather than a Date that would drift with the server timezone.
pg.types.setTypeParser(pg.types.builtins.DATE, (value: string) => value);

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: config.isProduction ? 20 : 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export type Queryable = Pick<pg.PoolClient, 'query'>;

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: ReadonlyArray<unknown> = [],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as unknown[]);
}

export async function one<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: ReadonlyArray<unknown> = [],
): Promise<T | null> {
  const result = await pool.query<T>(text, params as unknown[]);
  return result.rows[0] ?? null;
}

export async function many<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: ReadonlyArray<unknown> = [],
): Promise<T[]> {
  const result = await pool.query<T>(text, params as unknown[]);
  return result.rows;
}

export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}

/** Postgres unique-violation, used to turn a race into a clean 409. */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
}
