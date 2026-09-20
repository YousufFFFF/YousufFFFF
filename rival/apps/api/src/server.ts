import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { config } from './config.ts';
import { verifyAccessToken } from './auth/tokens.ts';
import { ApiError } from './lib/errors.ts';
import { one } from './db/index.ts';
import { registerRoutes } from './routes/index.ts';

/**
 * HTTP layer.
 *
 * Thin by design: authentication, error shaping and CORS live here; everything
 * else is a call into a module. Routes never touch SQL directly.
 */

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
    isAdmin?: boolean;
  }
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export function buildServer(): FastifyInstance {
  const app = Fastify({
    logger: config.isProduction
      ? { level: 'info' }
      : { level: process.env.LOG_LEVEL ?? 'warn' },
    trustProxy: true,
    bodyLimit: 1_000_000,
  });

  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (origin) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Vary', 'Origin');
      reply.header('Access-Control-Allow-Credentials', 'true');
    }
    reply.header('Access-Control-Allow-Headers', 'authorization, content-type');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    // Nothing the API serves should be cached by an intermediary.
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');

    if (request.method === 'OPTIONS') {
      reply.code(204).send();
    }
  });

  // Decodes the bearer token if one is present. Enforcement is per-route via
  // `requireUser`, so public endpoints stay public.
  app.addHook('preHandler', async (request) => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return;
    const claims = verifyAccessToken(header.slice(7));
    if (!claims) return;
    request.userId = claims.sub;
    request.isAdmin = claims.admin;
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      const body: ApiErrorBody = {
        error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
      };
      reply.code(error.statusCode).send(body);
      return;
    }
    if (error instanceof ZodError) {
      reply.code(400).send({
        error: {
          code: 'bad_request',
          message: error.issues[0]?.message ?? 'Invalid request.',
          details: { issues: error.issues },
        },
      } satisfies ApiErrorBody);
      return;
    }
    if ((error as { statusCode?: number }).statusCode === 400) {
      reply.code(400).send({ error: { code: 'bad_request', message: 'Invalid request body.' } } satisfies ApiErrorBody);
      return;
    }

    // Anything unrecognised is a bug: log it in full, tell the client nothing.
    request.log.error({ err: error }, 'unhandled error');
    reply.code(500).send({
      error: { code: 'internal_error', message: 'Something went wrong. Try again.' },
    } satisfies ApiErrorBody);
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ error: { code: 'not_found', message: 'No such endpoint.' } } satisfies ApiErrorBody);
  });

  app.get('/health', async () => {
    const row = await one<{ ok: number }>('SELECT 1 AS ok');
    return { status: row ? 'ok' : 'degraded', env: config.env };
  });

  registerRoutes(app);
  return app;
}

/** Every authenticated route starts with this. */
export function requireUser(request: FastifyRequest): string {
  if (!request.userId) throw ApiError.unauthorized();
  return request.userId;
}

export function requireAdmin(request: FastifyRequest): string {
  const userId = requireUser(request);
  if (!request.isAdmin) throw ApiError.forbidden('Admin access required.');
  return userId;
}
