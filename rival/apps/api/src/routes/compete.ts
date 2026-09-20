import type { FastifyInstance } from 'fastify';
import { requireUser } from '../server.ts';
import { isoDate, parse, uuid, weightUnit, z } from '../lib/validation.ts';
import { getCatchUp, getRivalryDetail, listRivals, rivalryTimeline } from '../modules/rivalries.ts';
import {
  challengesBoard,
  consistencyBoard,
  exerciseLeaderboard,
  improvementBoard,
  overallBoard,
  strengthBoard,
} from '../modules/leaderboards.ts';
import {
  cancelChallenge,
  createChallenge,
  getChallenge,
  listChallenges,
  listTemplates,
  respondToChallenge,
  suggestChallengeTarget,
} from '../modules/challenges.ts';
import { createCustomExercise, getExercise, listCategories, listExercises } from '../modules/exercises.ts';
import { getHome } from '../modules/home.ts';
import { assertPro } from '../modules/subscriptions.ts';

export function competeRoutes(app: FastifyInstance): void {
  // ── home ───────────────────────────────────────────────────────────────
  app.get('/v1/home', async (request) => getHome(requireUser(request)));

  // ── exercises ──────────────────────────────────────────────────────────
  app.get('/v1/exercises/categories', async () => listCategories());

  app.get('/v1/exercises', async (request) => {
    const userId = requireUser(request);
    const { category, q, popular } = parse(
      z.object({
        category: z.string().trim().max(32).optional(),
        q: z.string().trim().max(40).optional(),
        popular: z.coerce.boolean().optional(),
      }),
      request.query,
    );
    return listExercises(userId, { categorySlug: category, search: q, popularOnly: popular });
  });

  app.get('/v1/exercises/:id', async (request) => {
    const userId = requireUser(request);
    const { id } = parse(z.object({ id: uuid }), request.params);
    return getExercise(userId, id);
  });

  app.post('/v1/exercises', async (request, reply) => {
    const userId = requireUser(request);
    const body = parse(
      z.object({
        name: z.string().trim().min(2).max(60),
        categorySlug: z.string().trim().max(32).optional(),
        equipment: z.enum(['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other']).optional(),
      }),
      request.body,
    );
    reply.code(201);
    return createCustomExercise(userId, body);
  });

  // ── rivals ─────────────────────────────────────────────────────────────
  app.get('/v1/rivals', async (request) => listRivals(requireUser(request)));

  app.get('/v1/rivals/:userId', async (request) => {
    const userId = requireUser(request);
    const params = parse(z.object({ userId: uuid }), request.params);
    return getRivalryDetail(userId, params.userId);
  });

  app.get('/v1/rivals/:userId/timeline', async (request) => {
    const userId = requireUser(request);
    const params = parse(z.object({ userId: uuid }), request.params);
    return rivalryTimeline(userId, params.userId);
  });

  app.get('/v1/rivals/:userId/catch-up', async (request) => {
    const userId = requireUser(request);
    const params = parse(z.object({ userId: uuid }), request.params);
    return getCatchUp(userId, params.userId);
  });

  // ── leaderboards ───────────────────────────────────────────────────────
  app.get('/v1/leaderboards/:board', async (request) => {
    const userId = requireUser(request);
    const { board } = parse(
      z.object({ board: z.enum(['overall', 'strength', 'consistency', 'improvement', 'challenges']) }),
      request.params,
    );

    switch (board) {
      case 'overall':
        return { board, entries: await overallBoard(userId) };
      case 'strength':
        return { board, entries: await strengthBoard(userId) };
      case 'consistency':
        return { board, entries: await consistencyBoard(userId) };
      case 'challenges':
        return { board, entries: await challengesBoard(userId) };
      case 'improvement': {
        // The improvement board's longer windows are a Pro analytic; the
        // default 90-day view stays free so beginners can still see it.
        const { days } = parse(z.object({ days: z.coerce.number().int().min(30).max(365).default(90) }), request.query);
        if (days > 90) await assertPro(userId, 'advanced_leaderboards');
        return { board, entries: await improvementBoard(userId, days) };
      }
    }
  });

  app.get('/v1/leaderboards/exercise/:exerciseId', async (request) => {
    const userId = requireUser(request);
    const { exerciseId } = parse(z.object({ exerciseId: uuid }), request.params);
    const [exercise, entries] = await Promise.all([
      getExercise(userId, exerciseId),
      exerciseLeaderboard(userId, exerciseId),
    ]);
    return { exercise: { id: exercise.id, name: exercise.name }, entries };
  });

  // ── challenges ─────────────────────────────────────────────────────────
  app.get('/v1/challenges/templates', async () => listTemplates());

  app.get('/v1/challenges', async (request) => {
    const userId = requireUser(request);
    const { status } = parse(
      z.object({
        status: z.enum(['pending', 'active', 'completed', 'declined', 'cancelled', 'expired']).optional(),
      }),
      request.query,
    );
    return listChallenges(userId, status);
  });

  app.get('/v1/challenges/suggest-target', async (request) => {
    const userId = requireUser(request);
    const { opponentId, exerciseId } = parse(z.object({ opponentId: uuid, exerciseId: uuid }), request.query);
    return suggestChallengeTarget(userId, opponentId, exerciseId);
  });

  app.post('/v1/challenges', async (request, reply) => {
    const userId = requireUser(request);
    const body = parse(
      z.object({
        opponentId: uuid,
        type: z.enum(['pr', 'consistency', 'exercise', 'volume', 'workout_count']),
        exerciseId: uuid.nullable().optional(),
        templateCode: z.string().trim().max(40).optional(),
        title: z.string().trim().max(80).optional(),
        target: z.number().positive().max(100_000).optional(),
        targetUnit: weightUnit.optional(),
        deadline: isoDate,
      }),
      request.body,
    );
    reply.code(201);
    return createChallenge(userId, body);
  });

  app.get('/v1/challenges/:id', async (request) => {
    const userId = requireUser(request);
    const { id } = parse(z.object({ id: uuid }), request.params);
    return getChallenge(userId, id);
  });

  app.post('/v1/challenges/:id/accept', async (request) => {
    const userId = requireUser(request);
    const { id } = parse(z.object({ id: uuid }), request.params);
    return respondToChallenge(userId, id, true);
  });

  app.post('/v1/challenges/:id/decline', async (request) => {
    const userId = requireUser(request);
    const { id } = parse(z.object({ id: uuid }), request.params);
    return respondToChallenge(userId, id, false);
  });

  app.post('/v1/challenges/:id/cancel', async (request, reply) => {
    const userId = requireUser(request);
    const { id } = parse(z.object({ id: uuid }), request.params);
    await cancelChallenge(userId, id);
    reply.code(204);
  });
}
