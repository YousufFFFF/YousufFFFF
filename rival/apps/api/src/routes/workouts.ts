import type { FastifyInstance } from 'fastify';
import { requireUser } from '../server.ts';
import { isoDate, parse, uuid, weightUnit, z } from '../lib/validation.ts';
import {
  addSet,
  deleteSet,
  deleteWorkout,
  finishWorkout,
  getWorkout,
  listWorkouts,
  logCompleteWorkout,
  startWorkout,
  todaysWorkout,
  updateSet,
} from '../modules/workouts.ts';

const workoutType = z.enum(['push', 'pull', 'legs', 'upper', 'lower', 'full_body', 'custom']);

const setBody = z.object({
  exerciseId: uuid,
  weight: z.number().min(0).max(2000),
  unit: weightUnit,
  reps: z.number().int().min(0).max(1000),
  rpe: z.number().min(1).max(10).nullable().optional(),
  notes: z.string().trim().max(200).nullable().optional(),
});

export function workoutRoutes(app: FastifyInstance): void {
  app.post('/v1/workouts', async (request, reply) => {
    const userId = requireUser(request);
    const body = parse(
      z.object({
        workoutType,
        title: z.string().trim().max(80).optional(),
        sessionDate: isoDate.optional(),
      }),
      request.body,
    );
    reply.code(201);
    return startWorkout(userId, body);
  });

  /** One-shot logging, for a workout entered after the fact. */
  app.post('/v1/workouts/complete', async (request, reply) => {
    const userId = requireUser(request);
    const body = parse(
      z.object({
        workoutType,
        title: z.string().trim().max(80).optional(),
        sessionDate: isoDate.optional(),
        durationSeconds: z.number().int().min(0).max(86_400).optional(),
        notes: z.string().trim().max(500).optional(),
        exercises: z
          .array(
            z.object({
              exerciseId: uuid,
              sets: z
                .array(
                  z.object({
                    weight: z.number().min(0).max(2000),
                    unit: weightUnit,
                    reps: z.number().int().min(0).max(1000),
                    rpe: z.number().min(1).max(10).nullable().optional(),
                  }),
                )
                .min(1)
                .max(30),
            }),
          )
          .min(1)
          .max(20),
      }),
      request.body,
    );
    reply.code(201);
    return logCompleteWorkout(userId, body);
  });

  app.get('/v1/workouts', async (request) => {
    const userId = requireUser(request);
    const { from, to, limit, userId: ownerId } = parse(
      z.object({
        from: isoDate.optional(),
        to: isoDate.optional(),
        limit: z.coerce.number().int().min(1).max(100).default(30),
        userId: uuid.optional(),
      }),
      request.query,
    );
    return listWorkouts(userId, ownerId ?? userId, { from, to, limit });
  });

  app.get('/v1/workouts/today', async (request) => {
    const session = await todaysWorkout(requireUser(request));
    return { session };
  });

  app.get('/v1/workouts/:id', async (request) => {
    const userId = requireUser(request);
    const { id } = parse(z.object({ id: uuid }), request.params);
    return getWorkout(userId, id);
  });

  app.post('/v1/workouts/:id/sets', async (request, reply) => {
    const userId = requireUser(request);
    const { id } = parse(z.object({ id: uuid }), request.params);
    const body = parse(setBody, request.body);
    reply.code(201);
    return addSet(userId, id, body);
  });

  app.patch('/v1/workouts/:id/sets/:setId', async (request) => {
    const userId = requireUser(request);
    const { id, setId } = parse(z.object({ id: uuid, setId: uuid }), request.params);
    const body = parse(setBody.partial().omit({ exerciseId: true }), request.body);
    return updateSet(userId, id, setId, body);
  });

  app.delete('/v1/workouts/:id/sets/:setId', async (request, reply) => {
    const userId = requireUser(request);
    const { id, setId } = parse(z.object({ id: uuid, setId: uuid }), request.params);
    await deleteSet(userId, id, setId);
    reply.code(204);
  });

  /**
   * Finishing is the interesting one: the response carries the PRs detected,
   * XP, new badges, recovery notices and any lead just taken, so the client can
   * run the whole celebration without another round trip.
   */
  app.post('/v1/workouts/:id/finish', async (request) => {
    const userId = requireUser(request);
    const { id } = parse(z.object({ id: uuid }), request.params);
    const body = parse(
      z.object({
        durationSeconds: z.number().int().min(0).max(86_400).optional(),
        notes: z.string().trim().max(500).optional(),
      }),
      request.body ?? {},
    );
    return finishWorkout(userId, id, body);
  });

  app.delete('/v1/workouts/:id', async (request, reply) => {
    const userId = requireUser(request);
    const { id } = parse(z.object({ id: uuid }), request.params);
    await deleteWorkout(userId, id);
    reply.code(204);
  });
}
