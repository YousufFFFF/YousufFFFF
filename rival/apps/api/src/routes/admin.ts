import type { FastifyInstance } from 'fastify';
import { requireAdmin } from '../server.ts';
import { parse, uuid, z } from '../lib/validation.ts';
import {
  getMetrics,
  getTrends,
  listAuditLog,
  listReports,
  listUsers,
  resolveReport,
  setUserStatus,
  updateScoringConfig,
  upsertBadge,
  upsertChallengeTemplate,
  upsertExercise,
  upsertPlan,
} from '../modules/admin.ts';
import { loadScoringConfig } from '../modules/rivalries.ts';

/** Every route here is admin-only and audited. */
export function adminRoutes(app: FastifyInstance): void {
  app.get('/v1/admin/metrics', async (request) => {
    requireAdmin(request);
    const { days } = parse(z.object({ days: z.coerce.number().int().min(7).max(90).default(30) }), request.query);
    const [metrics, trends] = await Promise.all([getMetrics(), getTrends(days)]);
    return { metrics, trends };
  });

  app.get('/v1/admin/users', async (request) => {
    requireAdmin(request);
    const query = parse(
      z.object({
        search: z.string().trim().max(60).optional(),
        status: z.enum(['active', 'suspended']).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }),
      request.query,
    );
    return listUsers(query);
  });

  app.patch('/v1/admin/users/:id', async (request, reply) => {
    const adminId = requireAdmin(request);
    const { id } = parse(z.object({ id: uuid }), request.params);
    const body = parse(z.object({ status: z.enum(['active', 'suspended']) }), request.body);
    await setUserStatus(adminId, id, body.status);
    reply.code(204);
  });

  app.get('/v1/admin/reports', async (request) => {
    requireAdmin(request);
    const { status } = parse(
      z.object({ status: z.enum(['open', 'reviewing', 'resolved', 'dismissed', 'all']).default('open') }),
      request.query,
    );
    return listReports(status);
  });

  app.patch('/v1/admin/reports/:id', async (request, reply) => {
    const adminId = requireAdmin(request);
    const { id } = parse(z.object({ id: uuid }), request.params);
    const body = parse(
      z.object({
        status: z.enum(['reviewing', 'resolved', 'dismissed']),
        resolution: z.string().trim().max(500).optional(),
      }),
      request.body,
    );
    await resolveReport(adminId, id, body.status, body.resolution);
    reply.code(204);
  });

  app.put('/v1/admin/exercises', async (request) => {
    const adminId = requireAdmin(request);
    const body = parse(
      z.object({
        slug: z.string().trim().min(2).max(80),
        name: z.string().trim().min(2).max(60),
        categorySlug: z.string().trim().max(32).optional(),
        equipment: z.enum(['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other']).optional(),
        isCompound: z.boolean().optional(),
        isPopular: z.boolean().optional(),
        isActive: z.boolean().optional(),
      }),
      request.body,
    );
    return upsertExercise(adminId, body);
  });

  app.put('/v1/admin/challenge-templates', async (request) => {
    const adminId = requireAdmin(request);
    const body = parse(
      z.object({
        code: z.string().trim().min(2).max(40),
        challengeType: z.enum(['pr', 'consistency', 'exercise', 'volume', 'workout_count']),
        title: z.string().trim().min(2).max(80),
        description: z.string().trim().min(2).max(300),
        defaultDurationDays: z.number().int().min(1).max(365),
        suggestedTargetPct: z.number().int().min(100).max(300).nullable().optional(),
        requiresPro: z.boolean().optional(),
        isActive: z.boolean().optional(),
      }),
      request.body,
    );
    return upsertChallengeTemplate(adminId, body);
  });

  app.put('/v1/admin/badges', async (request) => {
    const adminId = requireAdmin(request);
    const body = parse(
      z.object({
        code: z.string().trim().min(2).max(40),
        icon: z.string().trim().min(1).max(8),
        title: z.string().trim().min(2).max(60),
        description: z.string().trim().min(2).max(200),
        thresholdStat: z.enum([
          'prCount',
          'currentStreak',
          'longestStreak',
          'totalWorkouts',
          'rivalryWins',
          'battlesWon',
          'challengesWon',
          'topExerciseRanks',
          'connections',
        ]),
        thresholdValue: z.number().int().min(1).max(100_000),
        isActive: z.boolean().optional(),
      }),
      request.body,
    );
    return upsertBadge(adminId, body);
  });

  app.put('/v1/admin/plans', async (request) => {
    const adminId = requireAdmin(request);
    const body = parse(
      z.object({
        code: z.string().trim().min(2).max(40),
        name: z.string().trim().min(2).max(60),
        description: z.string().trim().max(200).optional(),
        priceMinor: z.number().int().min(0).max(10_000_000),
        currency: z.string().trim().length(3),
        interval: z.enum(['month', 'year', 'lifetime']),
        features: z.array(z.string().max(100)).max(20).optional(),
        isActive: z.boolean().optional(),
      }),
      request.body,
    );
    return upsertPlan(adminId, body);
  });

  app.get('/v1/admin/scoring', async (request) => {
    requireAdmin(request);
    return loadScoringConfig();
  });

  /** Retunes the rivalry score for everyone, without a release. */
  app.put('/v1/admin/scoring', async (request) => {
    const adminId = requireAdmin(request);
    const body = parse(
      z.object({
        prBattleWin: z.number().int().min(0).max(100).optional(),
        consistencyWin: z.number().int().min(0).max(100).optional(),
        challengeWin: z.number().int().min(0).max(100).optional(),
        consistencyWindowDays: z.number().int().min(7).max(365).optional(),
        minSessionsPerExercise: z.number().int().min(1).max(20).optional(),
      }),
      request.body,
    );
    return updateScoringConfig(adminId, body);
  });

  app.get('/v1/admin/audit-log', async (request) => {
    requireAdmin(request);
    const { limit } = parse(z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }), request.query);
    return listAuditLog(limit);
  });
}
