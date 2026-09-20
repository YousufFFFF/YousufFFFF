import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

/**
 * Integration test harness.
 *
 * Each run gets its own PostgreSQL database, migrated and seeded from the real
 * migration and seed scripts — the tests therefore exercise the same schema the
 * app ships with, not a hand-written approximation.
 */

const BASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://rival:rival@127.0.0.1:5432';
const ADMIN_DB = `${BASE_URL}/postgres`;

export const TEST_DB_NAME = `rival_test_${process.pid}_${Date.now().toString(36)}`;
export const TEST_DATABASE_URL = `${BASE_URL}/${TEST_DB_NAME}`;

function psql(connection: string, sql: string): void {
  execFileSync('psql', [connection, '-v', 'ON_ERROR_STOP=1', '-q', '-c', sql], { stdio: 'pipe' });
}

export function createTestDatabase(): void {
  psql(ADMIN_DB, `CREATE DATABASE ${TEST_DB_NAME}`);
}

export function dropTestDatabase(): void {
  try {
    psql(ADMIN_DB, `DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
  } catch {
    // A leaked connection can hold the database open; a leftover test database
    // is not worth failing an otherwise green run over.
  }
}

// The config module reads the environment once at import time, so the database
// has to exist and DATABASE_URL has to be set before anything else is loaded.
createTestDatabase();
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.JWT_SECRET = `test-secret-${randomUUID()}`;
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

const { migrate } = await import('../src/db/migrate.ts');
const { seedReferenceData } = await import('../src/db/seed.ts');
const { buildServer } = await import('../src/server.ts');
const { closePool, query } = await import('../src/db/index.ts');
const { rateLimitStore } = await import('../src/lib/rate-limit.ts');

await migrate(() => undefined);
await seedReferenceData(() => undefined);

export const app = buildServer();
export { closePool, query };

/**
 * Every request in these tests comes from the same address, so the real rate
 * limits would fire after a handful of fixtures. Tests that care about limiting
 * exercise it deliberately; everything else clears the window first.
 */
export function resetRateLimits(): void {
  rateLimitStore.clear();
}

export interface TestUser {
  id: string;
  username: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

interface ApiResponse<T = unknown> {
  status: number;
  body: T;
}

export async function request<T = unknown>(
  method: string,
  url: string,
  options: { token?: string; body?: unknown } = {},
): Promise<ApiResponse<T>> {
  const response = await app.inject({
    method: method as 'GET',
    url,
    headers: {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(options.body !== undefined ? { payload: JSON.stringify(options.body) } : {}),
  });

  const text = response.body;
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: response.statusCode, body: body as T };
}

let userCounter = 0;

export async function createUser(overrides: { username?: string; displayName?: string } = {}): Promise<TestUser> {
  resetRateLimits();
  userCounter += 1;
  const username = overrides.username ?? `lifter${userCounter}${process.pid % 1000}`;
  const email = `${username}@example.test`;

  const response = await request<{
    accessToken: string;
    refreshToken: string;
    user: { id: string };
    profile: { username: string };
  }>('POST', '/v1/auth/register', {
    body: {
      email,
      password: 'StrongPass1',
      displayName: overrides.displayName ?? username,
      username,
    },
  });

  if (response.status !== 201) {
    throw new Error(`could not create test user: ${JSON.stringify(response.body)}`);
  }

  return {
    id: response.body.user.id,
    username: response.body.profile.username,
    email,
    accessToken: response.body.accessToken,
    refreshToken: response.body.refreshToken,
  };
}

/** Sends a request and accepts it, leaving the two users connected and rivals. */
export async function connect(a: TestUser, b: TestUser): Promise<void> {
  resetRateLimits();
  const sent = await request<{ id: string }>('POST', '/v1/connections/requests', {
    token: a.accessToken,
    body: { username: b.username },
  });
  if (sent.status !== 201) throw new Error(`could not send request: ${JSON.stringify(sent.body)}`);

  const accepted = await request('POST', `/v1/connections/requests/${sent.body.id}/accept`, {
    token: b.accessToken,
  });
  if (accepted.status !== 200) throw new Error(`could not accept request: ${JSON.stringify(accepted.body)}`);
}

export async function exerciseId(slug: string): Promise<string> {
  const { rows } = await query<{ id: string }>('SELECT id FROM exercises WHERE slug = $1', [slug]);
  if (!rows[0]) throw new Error(`no exercise ${slug}`);
  return rows[0].id;
}

export interface LoggedWorkout {
  session: { id: string; session_date: string };
  prs: { prType: string; exerciseName: string; value: number; previousValue: number | null }[];
  leadsTaken: { rivalName: string; exerciseName: string; deltaGrams: number }[];
  recovery: { flag: string; title: string; message: string }[];
  xpAwarded: number;
  streak: { currentDays: number; longestDays: number };
  newAchievements: { code: string }[];
}

/** Logs a complete workout of one exercise, the common shape in these tests. */
export async function logLift(
  user: TestUser,
  slug: string,
  sets: { weight: number; reps: number }[],
  options: { sessionDate?: string; workoutType?: string } = {},
): Promise<LoggedWorkout> {
  const id = await exerciseId(slug);
  const response = await request<LoggedWorkout>('POST', '/v1/workouts/complete', {
    token: user.accessToken,
    body: {
      workoutType: options.workoutType ?? 'push',
      ...(options.sessionDate ? { sessionDate: options.sessionDate } : {}),
      exercises: [{ exerciseId: id, sets: sets.map((s) => ({ ...s, unit: 'kg' })) }],
    },
  });
  if (response.status !== 201) throw new Error(`could not log workout: ${JSON.stringify(response.body)}`);
  return response.body;
}

export async function makeAdmin(user: TestUser): Promise<string> {
  await query('UPDATE users SET is_admin = true WHERE id = $1', [user.id]);
  // The admin flag is baked into the access token, so a fresh one is needed.
  const refreshed = await request<{ accessToken: string }>('POST', '/v1/auth/refresh', {
    body: { refreshToken: user.refreshToken },
  });
  return refreshed.body.accessToken;
}

export async function teardown(): Promise<void> {
  await app.close();
  await closePool();
  dropTestDatabase();
}
