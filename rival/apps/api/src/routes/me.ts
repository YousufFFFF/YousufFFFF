import type { FastifyInstance } from 'fastify';
import { toGrams } from '@rival/core';
import { requireUser } from '../server.ts';
import { isoDate, parse, uuid, weightUnit, z, username as usernameSchema } from '../lib/validation.ts';
import { ApiError } from '../lib/errors.ts';
import { isValidTimezone } from '../lib/time.ts';
import {
  getPrivacy,
  getProfile,
  getUserStats,
  touchLastSeen,
  updatePrivacy,
  updateProfile,
} from '../modules/users.ts';
import { listFavorites, setFavorites } from '../modules/exercises.ts';
import { listPersonalRecords, prHistory, improvementSince } from '../modules/prs.ts';
import { getAnalytics } from '../modules/analytics.ts';
import { assertPro, getSubscription } from '../modules/subscriptions.ts';
import { one, query } from '../db/index.ts';

const visibility = z.enum(['public', 'connections', 'private']);

const profileBody = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  username: usernameSchema.optional(),
  avatarUrl: z.string().url().max(500).nullable().optional(),
  bio: z.string().trim().max(280).nullable().optional(),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()).nullable().optional(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).nullable().optional(),
  heightCm: z.number().min(50).max(280).nullable().optional(),
  bodyweight: z.number().positive().max(500).nullable().optional(),
  bodyweightUnit: weightUnit.optional(),
  experienceLevel: z.enum(['beginner', 'intermediate', 'advanced']).nullable().optional(),
  goals: z
    .array(z.enum(['strength', 'muscle_building', 'fitness', 'fat_loss', 'general_health', 'powerlifting', 'bodybuilding']))
    .max(7)
    .optional(),
  preferredUnit: weightUnit.optional(),
  weeklyTarget: z.number().int().min(1).max(7).optional(),
  restWeekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  timezone: z.string().max(64).optional(),
  onboardingStep: z.string().max(32).optional(),
});

export function meRoutes(app: FastifyInstance): void {
  app.get('/v1/me', async (request) => {
    const userId = requireUser(request);
    // Powers DAU/WAU/MAU in the admin dashboard; cheap enough to do per fetch.
    void touchLastSeen(userId);

    const [profile, privacy, stats, subscription, account] = await Promise.all([
      getProfile(userId),
      getPrivacy(userId),
      getUserStats(userId),
      getSubscription(userId),
      one<{ email: string | null; email_verified: boolean; is_admin: boolean }>(
        'SELECT email, email_verified, is_admin FROM users WHERE id = $1',
        [userId],
      ),
    ]);

    return {
      id: userId,
      email: account?.email ?? null,
      emailVerified: account?.email_verified ?? false,
      isAdmin: account?.is_admin ?? false,
      profile: {
        username: profile.username,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        bio: profile.bio,
        birthYear: profile.birth_year,
        gender: profile.gender,
        heightCm: profile.height_cm,
        bodyweightGrams: profile.bodyweight_grams,
        experienceLevel: profile.experience_level,
        goals: profile.goals,
        preferredUnit: profile.preferred_unit,
        weeklyTarget: profile.weekly_target,
        restWeekdays: profile.rest_weekdays,
        timezone: profile.timezone,
        competitionPaused: profile.competition_paused,
        onboardingStep: profile.onboarding_step,
      },
      privacy,
      stats,
      subscription,
    };
  });

  app.patch('/v1/me/profile', async (request) => {
    const userId = requireUser(request);
    const body = parse(profileBody, request.body);

    if (body.timezone && !isValidTimezone(body.timezone)) {
      throw ApiError.badRequest('Unknown timezone.');
    }

    // Bodyweight arrives in whatever the user typed and is stored in grams,
    // like every other weight in the system.
    const { bodyweight, bodyweightUnit, ...rest } = body;
    const update = {
      ...rest,
      ...(bodyweight === undefined
        ? {}
        : { bodyweightGrams: bodyweight === null ? null : toGrams(bodyweight, bodyweightUnit ?? 'kg') }),
    };

    try {
      const profile = await updateProfile(userId, update);
      return { username: profile.username, displayName: profile.display_name, onboardingStep: profile.onboarding_step };
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw ApiError.conflict('username_taken', 'That username is taken.');
      }
      throw error;
    }
  });

  app.put('/v1/me/privacy', async (request) => {
    const userId = requireUser(request);
    const body = parse(
      z.object({
        prs: visibility.optional(),
        workoutHistory: visibility.optional(),
        attendance: visibility.optional(),
        bodyweight: visibility.optional(),
        progress: visibility.optional(),
        activityFeed: visibility.optional(),
        gymLocation: visibility.optional(),
      }),
      request.body,
    );
    return updatePrivacy(userId, body);
  });

  app.put('/v1/me/notifications', async (request) => {
    const userId = requireUser(request);
    const body = parse(
      z.object({
        prBeaten: z.boolean().optional(),
        consistencyGap: z.boolean().optional(),
        tookNumberOne: z.boolean().optional(),
        challengeActivity: z.boolean().optional(),
        friendPrs: z.boolean().optional(),
        connectionRequests: z.boolean().optional(),
        pushEnabled: z.boolean().optional(),
        emailEnabled: z.boolean().optional(),
      }),
      request.body,
    );

    const columns: Record<string, string> = {
      prBeaten: 'pr_beaten',
      consistencyGap: 'consistency_gap',
      tookNumberOne: 'took_number_one',
      challengeActivity: 'challenge_activity',
      friendPrs: 'friend_prs',
      connectionRequests: 'connection_requests',
      pushEnabled: 'push_enabled',
      emailEnabled: 'email_enabled',
    };

    const sets: string[] = [];
    const values: unknown[] = [userId];
    for (const [key, column] of Object.entries(columns)) {
      const value = (body as Record<string, boolean | undefined>)[key];
      if (value === undefined) continue;
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    }

    if (sets.length > 0) {
      sets.push('updated_at = now()');
      await query(`UPDATE notification_settings SET ${sets.join(', ')} WHERE user_id = $1`, values);
    }
    return one('SELECT * FROM notification_settings WHERE user_id = $1', [userId]);
  });

  /**
   * Pausing competition takes the user out of every rivalry, leaderboard and
   * comparison until they resume — without deleting anything.
   */
  app.post('/v1/me/competition', async (request) => {
    const userId = requireUser(request);
    const body = parse(z.object({ paused: z.boolean() }), request.body);
    const profile = await updateProfile(userId, { competitionPaused: body.paused });
    return { competitionPaused: profile.competition_paused };
  });

  app.get('/v1/me/stats', async (request) => getUserStats(requireUser(request)));

  app.get('/v1/me/favorites', async (request) => listFavorites(requireUser(request)));

  app.put('/v1/me/favorites', async (request) => {
    const userId = requireUser(request);
    const body = parse(z.object({ exerciseIds: z.array(uuid).max(50) }), request.body);
    await setFavorites(userId, body.exerciseIds);
    return listFavorites(userId);
  });

  app.get('/v1/me/prs', async (request) => {
    const userId = requireUser(request);
    const { exerciseId } = parse(z.object({ exerciseId: uuid.optional() }), request.query);
    const [records, profile] = await Promise.all([listPersonalRecords(userId, exerciseId), getProfile(userId)]);
    return { unit: profile.preferred_unit, records };
  });

  app.get('/v1/me/prs/:exerciseId/history', async (request) => {
    const userId = requireUser(request);
    const { exerciseId } = parse(z.object({ exerciseId: uuid }), request.params);
    const { prType } = parse(
      z.object({ prType: z.enum(['weight', 'reps', 'volume', 'e1rm']).default('weight') }),
      request.query,
    );

    const points = await prHistory(userId, exerciseId, prType);
    const profile = await getProfile(userId);

    // Free accounts see their latest records; the full timeline is Pro.
    const subscription = await getSubscription(userId);
    const FREE_HISTORY_POINTS = 5;
    const limited = subscription.isPro ? points : points.slice(-FREE_HISTORY_POINTS);

    return {
      unit: profile.preferred_unit,
      prType,
      points: limited,
      truncated: !subscription.isPro && points.length > FREE_HISTORY_POINTS,
      totalPoints: points.length,
    };
  });

  app.get('/v1/me/improvement', async (request) => {
    const userId = requireUser(request);
    await assertPro(userId, 'improvement_analytics');
    const { days } = parse(z.object({ days: z.coerce.number().int().min(7).max(365).default(90) }), request.query);
    const since = new Date(Date.now() - days * 86_400_000);
    const [rows, profile] = await Promise.all([improvementSince(userId, since), getProfile(userId)]);
    return { unit: profile.preferred_unit, windowDays: days, exercises: rows };
  });

  app.get('/v1/me/analytics', async (request) => {
    const userId = requireUser(request);
    await assertPro(userId, 'advanced_stats');
    const { days } = parse(z.object({ days: z.coerce.number().int().min(30).max(730).default(180) }), request.query);
    return getAnalytics(userId, days);
  });

  app.get('/v1/me/achievements', async (request) => {
    const userId = requireUser(request);
    return query(
      `SELECT a.code, a.icon, a.title, a.description, ua.earned_at
         FROM achievements a
         LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = $1
        WHERE a.is_active
        ORDER BY (ua.earned_at IS NULL), a.sort_order, a.title`,
      [userId],
    ).then((result) => result.rows);
  });

  app.post('/v1/me/push-tokens', async (request, reply) => {
    const userId = requireUser(request);
    const body = parse(
      z.object({ token: z.string().min(8).max(500), platform: z.enum(['ios', 'android', 'web']) }),
      request.body,
    );
    await query(
      `INSERT INTO push_tokens (user_id, token, platform) VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id`,
      [userId, body.token, body.platform],
    );
    reply.code(204);
  });

  app.get('/v1/me/workouts/calendar', async (request) => {
    const userId = requireUser(request);
    const { from, to } = parse(z.object({ from: isoDate, to: isoDate }), request.query);
    const { workoutCalendar } = await import('../modules/workouts.ts');
    return workoutCalendar(userId, userId, from, to);
  });
}
