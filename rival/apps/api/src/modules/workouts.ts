import {
  XP_AWARDS,
  attendanceCalendar,
  currentStreak,
  newlyEarnedAchievements,
  recoveryNotices,
  toGrams,
  type WeightUnit,
  type WorkoutSet,
  type WorkoutType,
} from '@rival/core';
import { many, one, query, transaction, type Queryable } from '../db/index.ts';
import { ApiError } from '../lib/errors.ts';
import { todayInTimezone } from '../lib/time.ts';
import { publishActivity } from './feed.ts';
import { notify } from './notifications.ts';
import { recordPrsForSession, type PersistedPr } from './prs.ts';
import { onWorkoutLogged } from './rivalries.ts';
import { awardXp, getProfile, getUserStats } from './users.ts';

/**
 * Workout logging — the loop everything else hangs off.
 *
 * A session starts as a draft, collects sets, then `finishWorkout` closes it in
 * one transaction: attendance, PR detection, XP, achievements, the activity
 * feed, rival notifications and the rivalry recompute either all land or none
 * of them do.
 */

export interface SessionRow {
  id: string;
  user_id: string;
  workout_type: WorkoutType;
  title: string | null;
  session_date: string;
  started_at: Date;
  ended_at: Date | null;
  duration_seconds: number | null;
  notes: string | null;
  exercise_count: number;
  set_count: number;
  total_volume_grams: number;
  is_counted: boolean;
}

export async function startWorkout(
  userId: string,
  input: { workoutType: WorkoutType; title?: string; sessionDate?: string },
): Promise<SessionRow> {
  const profile = await getProfile(userId);
  const sessionDate = input.sessionDate ?? todayInTimezone(profile.timezone);

  // A session logged for today starts now; one entered after the fact is
  // anchored to an evening on its own date, so every timestamp that hangs off
  // it (set times, PR history, improvement windows) lands in the right week
  // instead of clustering at the moment it was typed in.
  const row = await one<SessionRow>(
    `INSERT INTO workout_sessions (user_id, workout_type, title, session_date, started_at)
     VALUES ($1, $2, $3, $4,
             CASE WHEN $4::date = $5::date THEN now()
                  ELSE ($4::date + time '18:00') AT TIME ZONE 'UTC' END)
     RETURNING *`,
    [userId, input.workoutType, input.title ?? null, sessionDate, todayInTimezone(profile.timezone)],
  );
  return row!;
}

/** Sets are spaced through the session so their order is stable and realistic. */
const SECONDS_BETWEEN_SETS = 90;

async function loadOwnedSession(userId: string, sessionId: string): Promise<SessionRow> {
  const row = await one<SessionRow>(
    'SELECT * FROM workout_sessions WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
    [sessionId, userId],
  );
  if (!row) throw ApiError.notFound('Workout not found.');
  return row;
}

export interface AddSetInput {
  exerciseId: string;
  weight: number;
  unit: WeightUnit;
  reps: number;
  rpe?: number | null;
  notes?: string | null;
}

export interface SetRow {
  id: string;
  exercise_id: string;
  exercise_name: string;
  set_number: number;
  weight_grams: number;
  reps: number;
  entered_unit: WeightUnit;
  rpe: number | null;
  notes: string | null;
  performed_at: Date;
}

export async function addSet(userId: string, sessionId: string, input: AddSetInput): Promise<SetRow> {
  const session = await loadOwnedSession(userId, sessionId);

  return transaction(async (client) => {
    const { rows: exerciseRows } = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM exercises
        WHERE id = $1 AND is_active AND (created_by IS NULL OR created_by = $2)`,
      [input.exerciseId, userId],
    );
    const exercise = exerciseRows[0];
    if (!exercise) throw ApiError.notFound('Exercise not found.');

    const { rows: weRows } = await client.query<{ id: string }>(
      `INSERT INTO workout_exercises (session_id, exercise_id, position)
       VALUES ($1, $2, (SELECT coalesce(max(position), -1) + 1 FROM workout_exercises WHERE session_id = $1))
       ON CONFLICT (session_id, exercise_id) DO UPDATE SET position = workout_exercises.position
       RETURNING id`,
      [sessionId, input.exerciseId],
    );
    const workoutExerciseId = weRows[0]!.id;

    // Convert at the boundary; everything downstream works in grams.
    const weightGrams = toGrams(input.weight, input.unit);

    const { rows: setRows } = await client.query<SetRow>(
      `INSERT INTO workout_sets
         (workout_exercise_id, session_id, user_id, exercise_id, set_number,
          weight_grams, reps, entered_unit, rpe, notes, performed_at)
       VALUES ($1, $2, $3, $4,
               (SELECT coalesce(max(set_number), 0) + 1 FROM workout_sets WHERE workout_exercise_id = $1),
               $5, $6, $7, $8, $9,
               $10::timestamptz
                 + make_interval(secs => (SELECT count(*) FROM workout_sets WHERE session_id = $2) * $11))
       RETURNING id, exercise_id, set_number, weight_grams, reps, entered_unit, rpe, notes, performed_at`,
      [
        workoutExerciseId,
        sessionId,
        userId,
        input.exerciseId,
        weightGrams,
        input.reps,
        input.unit,
        input.rpe ?? null,
        input.notes ?? null,
        session.started_at,
        SECONDS_BETWEEN_SETS,
      ],
    );

    await refreshSessionTotals(client, sessionId);
    return { ...setRows[0]!, exercise_name: exercise.name };
  });
}

export async function updateSet(
  userId: string,
  sessionId: string,
  setId: string,
  input: Partial<Pick<AddSetInput, 'weight' | 'unit' | 'reps' | 'rpe' | 'notes'>>,
): Promise<SetRow> {
  await loadOwnedSession(userId, sessionId);

  return transaction(async (client) => {
    const { rows: current } = await client.query<{ weight_grams: number; entered_unit: WeightUnit }>(
      'SELECT weight_grams, entered_unit FROM workout_sets WHERE id = $1 AND session_id = $2 AND user_id = $3',
      [setId, sessionId, userId],
    );
    if (!current[0]) throw ApiError.notFound('Set not found.');

    const unit = input.unit ?? current[0].entered_unit;
    const weightGrams = input.weight !== undefined ? toGrams(input.weight, unit) : current[0].weight_grams;

    const { rows } = await client.query<SetRow>(
      `UPDATE workout_sets
          SET weight_grams = $4,
              reps = coalesce($5, reps),
              entered_unit = $6,
              rpe = coalesce($7, rpe),
              notes = coalesce($8, notes)
        WHERE id = $1 AND session_id = $2 AND user_id = $3
        RETURNING id, exercise_id, set_number, weight_grams, reps, entered_unit, rpe, notes, performed_at`,
      [setId, sessionId, userId, weightGrams, input.reps ?? null, unit, input.rpe ?? null, input.notes ?? null],
    );

    await refreshSessionTotals(client, sessionId);
    const { rows: nameRows } = await client.query<{ name: string }>(
      'SELECT name FROM exercises WHERE id = $1',
      [rows[0]!.exercise_id],
    );
    return { ...rows[0]!, exercise_name: nameRows[0]?.name ?? 'Exercise' };
  });
}

export async function deleteSet(userId: string, sessionId: string, setId: string): Promise<void> {
  await loadOwnedSession(userId, sessionId);
  await transaction(async (client) => {
    const result = await client.query('DELETE FROM workout_sets WHERE id = $1 AND session_id = $2 AND user_id = $3', [
      setId,
      sessionId,
      userId,
    ]);
    if (result.rowCount === 0) throw ApiError.notFound('Set not found.');
    // Drop an exercise that no longer has any sets, so the summary stays honest.
    await client.query(
      `DELETE FROM workout_exercises we
        WHERE we.session_id = $1
          AND NOT EXISTS (SELECT 1 FROM workout_sets s WHERE s.workout_exercise_id = we.id)`,
      [sessionId],
    );
    await refreshSessionTotals(client, sessionId);
  });
}

/** Keeps the denormalised counters on `workout_sessions` in step with its sets. */
async function refreshSessionTotals(client: Queryable, sessionId: string): Promise<void> {
  await client.query(
    `UPDATE workout_sessions s
        SET set_count = t.set_count,
            exercise_count = t.exercise_count,
            total_volume_grams = t.volume,
            updated_at = now()
       FROM (SELECT count(*)::int AS set_count,
                    count(DISTINCT exercise_id)::int AS exercise_count,
                    coalesce(sum(weight_grams::bigint * reps), 0) AS volume
               FROM workout_sets WHERE session_id = $1) t
      WHERE s.id = $1`,
    [sessionId],
  );
}

export interface FinishResult {
  session: SessionRow;
  prs: PersistedPr[];
  headlinePr: PersistedPr | null;
  xpAwarded: number;
  totalXp: number;
  newAchievements: { code: string; icon: string; title: string; description: string }[];
  recovery: { flag: string; title: string; message: string }[];
  streak: { currentDays: number; longestDays: number };
  leadsTaken: {
    rivalId: string;
    rivalName: string;
    exerciseId: string;
    exerciseName: string;
    deltaGrams: number;
  }[];
}

/**
 * Close a session.
 *
 * Everything that happens as a consequence of training happens here, in one
 * transaction. The response is what the client needs to run the PR celebration
 * and the "you took the lead" moment without a second round trip.
 */
export async function finishWorkout(
  userId: string,
  sessionId: string,
  input: { durationSeconds?: number; notes?: string } = {},
): Promise<FinishResult> {
  const profile = await getProfile(userId);
  const session = await loadOwnedSession(userId, sessionId);

  const result = await transaction(async (client) => {
    const { rows: setRows } = await client.query<{
      id: string;
      exercise_id: string;
      set_number: number;
      weight_grams: number;
      reps: number;
      entered_unit: WeightUnit;
      rpe: number | null;
      notes: string | null;
      performed_at: Date;
    }>('SELECT * FROM workout_sets WHERE session_id = $1 ORDER BY performed_at', [sessionId]);

    // An empty session is a draft the user abandoned: it closes, but it does
    // not become a gym day and it does not touch any rivalry.
    const hasWork = setRows.length > 0;

    // For a session logged live, the elapsed time is the duration. For one
    // entered after the fact, "now minus started_at" would be days, so fall
    // back to the time the sets themselves span.
    const today = todayInTimezone(profile.timezone);
    const durationSeconds =
      input.durationSeconds ??
      (session.session_date === today
        ? Math.max(0, Math.round((Date.now() - session.started_at.getTime()) / 1000))
        : setRows.length * SECONDS_BETWEEN_SETS);

    const { rows: updatedRows } = await client.query<SessionRow>(
      `UPDATE workout_sessions
          SET ended_at = now(), duration_seconds = $2, notes = coalesce($3, notes),
              is_counted = $4, updated_at = now()
        WHERE id = $1
        RETURNING *`,
      [sessionId, durationSeconds, input.notes ?? null, hasWork],
    );
    const updated = updatedRows[0]!;

    if (!hasWork) {
      return {
        session: updated,
        prs: [] as PersistedPr[],
        xpAwarded: 0,
        newAchievementCodes: [] as string[],
        alreadyCounted: false,
      };
    }

    // One attendance row per calendar day: logging twice never buys a gym day.
    const { rows: attendanceRows } = await client.query<{ session_count: number }>(
      `INSERT INTO attendance (user_id, session_date, first_session_id, total_duration_seconds)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, session_date)
       DO UPDATE SET session_count = attendance.session_count + 1,
                     total_duration_seconds = attendance.total_duration_seconds + EXCLUDED.total_duration_seconds
       RETURNING session_count`,
      [userId, updated.session_date, sessionId, durationSeconds],
    );
    const alreadyCounted = (attendanceRows[0]?.session_count ?? 1) > 1;

    const sets: WorkoutSet[] = setRows.map((row) => ({
      id: row.id,
      exerciseId: row.exercise_id,
      setNumber: row.set_number,
      weightGrams: row.weight_grams,
      reps: row.reps,
      enteredUnit: row.entered_unit,
      rpe: row.rpe,
      notes: row.notes,
      performedAt: row.performed_at,
    }));

    const prs = await recordPrsForSession(client, userId, sessionId, sets);

    // XP: the workout award is once per gym day, matching attendance.
    let xpAwarded = alreadyCounted ? 0 : XP_AWARDS.workout_completed;
    xpAwarded += prs.length * XP_AWARDS.new_pr;
    await awardXp(client, userId, xpAwarded);

    await publishActivity(client, {
      actorId: userId,
      type: 'workout_completed',
      sessionId,
      payload: {
        workoutType: updated.workout_type,
        exerciseCount: updated.exercise_count,
        setCount: updated.set_count,
        volumeGrams: Number(updated.total_volume_grams),
      },
    });

    for (const pr of prs) {
      // Only the headline record types earn a feed post; a volume PR every
      // session would drown the feed.
      if (pr.prType !== 'weight' && pr.prType !== 'e1rm') continue;
      await publishActivity(client, {
        actorId: userId,
        type: 'new_pr',
        exerciseId: pr.exerciseId,
        sessionId,
        payload: {
          prType: pr.prType,
          value: pr.value,
          previousValue: pr.previousValue,
          improvementPct: pr.improvementPct,
          reps: pr.reps,
        },
      });
      await notify(client, {
        userId,
        type: 'own_pr',
        title: 'New PR',
        body: `You set a new ${pr.exerciseName} record.`,
        payload: { exerciseId: pr.exerciseId, prType: pr.prType, value: pr.value },
      });
    }

    const newAchievementCodes = await grantAchievements(client, userId);

    return { session: updated, prs, xpAwarded, newAchievementCodes, alreadyCounted };
  });

  // Rivalry effects run after the session is durably committed: they read the
  // freshly written PRs and may notify other users, and none of that should be
  // able to roll back a workout the user already saw succeed.
  const leadsTaken = result.session.is_counted ? await onWorkoutLogged(userId, result.prs) : [];

  const today = todayInTimezone(profile.timezone);
  const [dates, stats, achievementRows] = await Promise.all([
    many<{ session_date: string }>('SELECT session_date FROM attendance WHERE user_id = $1 ORDER BY session_date', [
      userId,
    ]),
    getUserStats(userId),
    result.newAchievementCodes.length
      ? many<{ code: string; icon: string; title: string; description: string }>(
          'SELECT code, icon, title, description FROM achievements WHERE code = ANY($1::text[])',
          [result.newAchievementCodes],
        )
      : Promise.resolve([]),
  ]);

  const sessionDates = dates.map((d) => d.session_date);
  const allSessionDates = await many<{ session_date: string }>(
    'SELECT session_date FROM workout_sessions WHERE user_id = $1 AND is_counted AND deleted_at IS NULL',
    [userId],
  );

  const streak = currentStreak(sessionDates, today, profile.weekly_target as 1 | 2 | 3 | 4 | 5 | 6 | 7);

  return {
    session: result.session,
    prs: result.prs,
    headlinePr: result.prs.length
      ? [...result.prs].sort((a, b) => headlineRank(a.prType) - headlineRank(b.prType))[0]!
      : null,
    xpAwarded: result.xpAwarded,
    totalXp: stats.xp,
    newAchievements: achievementRows,
    // Uses raw session rows, not attendance days, so a second session today is
    // visible to the guard even though it did not add a gym day.
    recovery: recoveryNotices({
      sessionDates: allSessionDates.map((d) => d.session_date),
      today,
      lastSessionSeconds: result.session.duration_seconds,
    }),
    streak: { currentDays: streak.currentDays, longestDays: streak.longestDays },
    leadsTaken,
  };
}

function headlineRank(prType: string): number {
  return { weight: 0, e1rm: 1, reps: 2, volume: 3 }[prType] ?? 9;
}

/** Evaluates every achievement against the user's current stats. */
async function grantAchievements(client: Queryable, userId: string): Promise<string[]> {
  const { rows: statRows } = await client.query<{
    pr_count: number;
    total_workouts: number;
    challenges_won: number;
    connections: number;
    battles_won: number;
    rivalry_wins: number;
    top_ranks: number;
    longest_streak: number;
  }>(
    `SELECT
       (SELECT count(*)::int FROM personal_records WHERE user_id = $1)                    AS pr_count,
       (SELECT count(*)::int FROM attendance WHERE user_id = $1)                          AS total_workouts,
       (SELECT count(*)::int FROM challenges WHERE winner_id = $1)                        AS challenges_won,
       (SELECT count(*)::int FROM connections WHERE user_a_id = $1 OR user_b_id = $1)     AS connections,
       (SELECT coalesce(sum(CASE WHEN r.user_a_id = $1 THEN s.battles_won_a ELSE s.battles_won_b END), 0)::int
          FROM rivalry_scores s JOIN rivalries r ON r.id = s.rivalry_id
         WHERE r.user_a_id = $1 OR r.user_b_id = $1)                                      AS battles_won,
       (SELECT count(*)::int FROM rivalry_scores s JOIN rivalries r ON r.id = s.rivalry_id
         WHERE (r.user_a_id = $1 AND s.score_a > s.score_b)
            OR (r.user_b_id = $1 AND s.score_b > s.score_a))                              AS rivalry_wins,
       0 AS top_ranks,
       0 AS longest_streak`,
    [userId],
  );
  const raw = statRows[0]!;

  const { rows: dateRows } = await client.query<{ session_date: string }>(
    'SELECT session_date FROM attendance WHERE user_id = $1 ORDER BY session_date',
    [userId],
  );
  const { rows: profileRows } = await client.query<{ timezone: string; weekly_target: number }>(
    'SELECT timezone, weekly_target FROM profiles WHERE user_id = $1',
    [userId],
  );
  const streak = currentStreak(
    dateRows.map((d) => d.session_date),
    todayInTimezone(profileRows[0]?.timezone ?? 'UTC'),
    (profileRows[0]?.weekly_target ?? 4) as 1 | 2 | 3 | 4 | 5 | 6 | 7,
  );

  const { rows: earnedRows } = await client.query<{ code: string }>(
    'SELECT a.code FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id WHERE ua.user_id = $1',
    [userId],
  );
  const alreadyEarned = earnedRows.map((r) => r.code);

  const earned = newlyEarnedAchievements(
    {
      prCount: raw.pr_count,
      currentStreak: streak.currentDays,
      longestStreak: streak.longestDays,
      totalWorkouts: raw.total_workouts,
      rivalryWins: raw.rivalry_wins,
      battlesWon: raw.battles_won,
      challengesWon: raw.challenges_won,
      topExerciseRanks: raw.top_ranks,
      connections: raw.connections,
    },
    alreadyEarned,
  );
  if (earned.length === 0) return [];

  const codes = earned.map((a) => a.code);
  await client.query(
    `INSERT INTO user_achievements (user_id, achievement_id)
     SELECT $1, id FROM achievements WHERE code = ANY($2::text[])
     ON CONFLICT DO NOTHING`,
    [userId, codes],
  );
  for (const achievement of earned) {
    await notify(client, {
      userId,
      type: 'achievement_earned',
      title: `${achievement.icon} ${achievement.title}`,
      body: achievement.description,
      payload: { code: achievement.code },
    });
    await publishActivity(client, {
      actorId: userId,
      type: 'achievement_earned',
      payload: { code: achievement.code, title: achievement.title, icon: achievement.icon },
    });
  }
  return codes;
}

/**
 * One-shot logging: start, fill and finish in a single call. The mobile app
 * uses the incremental endpoints while the user is mid-session; this is for
 * logging a workout after the fact.
 */
export async function logCompleteWorkout(
  userId: string,
  input: {
    workoutType: WorkoutType;
    title?: string;
    sessionDate?: string;
    durationSeconds?: number;
    notes?: string;
    exercises: { exerciseId: string; sets: { weight: number; unit: WeightUnit; reps: number; rpe?: number | null }[] }[];
  },
): Promise<FinishResult> {
  const session = await startWorkout(userId, {
    workoutType: input.workoutType,
    title: input.title,
    sessionDate: input.sessionDate,
  });

  for (const exercise of input.exercises) {
    for (const set of exercise.sets) {
      await addSet(userId, session.id, {
        exerciseId: exercise.exerciseId,
        weight: set.weight,
        unit: set.unit,
        reps: set.reps,
        rpe: set.rpe ?? null,
      });
    }
  }

  return finishWorkout(userId, session.id, {
    durationSeconds: input.durationSeconds,
    notes: input.notes,
  });
}

export async function getWorkout(viewerId: string, sessionId: string) {
  const session = await one<SessionRow>(
    'SELECT * FROM workout_sessions WHERE id = $1 AND deleted_at IS NULL',
    [sessionId],
  );
  if (!session) throw ApiError.notFound('Workout not found.');

  if (session.user_id !== viewerId) {
    // Viewing someone else's workout needs their workout-history permission.
    const { assertCanView } = await import('./users.ts');
    await assertCanView(viewerId, session.user_id, 'workoutHistory');
  }

  const sets = await many<SetRow>(
    `SELECT s.id, s.exercise_id, e.name AS exercise_name, s.set_number,
            s.weight_grams, s.reps, s.entered_unit, s.rpe, s.notes, s.performed_at
       FROM workout_sets s JOIN exercises e ON e.id = s.exercise_id
      WHERE s.session_id = $1
      ORDER BY s.performed_at, s.set_number`,
    [sessionId],
  );

  const byExercise = new Map<string, { exerciseId: string; exerciseName: string; sets: SetRow[] }>();
  for (const set of sets) {
    const group = byExercise.get(set.exercise_id);
    if (group) group.sets.push(set);
    else byExercise.set(set.exercise_id, { exerciseId: set.exercise_id, exerciseName: set.exercise_name, sets: [set] });
  }

  return { session, exercises: [...byExercise.values()] };
}

export async function listWorkouts(
  viewerId: string,
  ownerId: string,
  filters: { from?: string; to?: string; limit?: number } = {},
) {
  if (viewerId !== ownerId) {
    const { assertCanView } = await import('./users.ts');
    await assertCanView(viewerId, ownerId, 'workoutHistory');
  }
  return many<SessionRow>(
    `SELECT * FROM workout_sessions
      WHERE user_id = $1 AND deleted_at IS NULL
        AND ($2::date IS NULL OR session_date >= $2)
        AND ($3::date IS NULL OR session_date <= $3)
      ORDER BY session_date DESC, started_at DESC
      LIMIT $4`,
    [ownerId, filters.from ?? null, filters.to ?? null, filters.limit ?? 50],
  );
}

/** Calendar view: trained days, planned rest days and misses kept distinct. */
export async function workoutCalendar(viewerId: string, ownerId: string, from: string, to: string) {
  if (viewerId !== ownerId) {
    const { assertCanView } = await import('./users.ts');
    await assertCanView(viewerId, ownerId, 'attendance');
  }
  const [dates, profile] = await Promise.all([
    many<{ session_date: string }>(
      'SELECT session_date FROM attendance WHERE user_id = $1 AND session_date BETWEEN $2 AND $3',
      [ownerId, from, to],
    ),
    getProfile(ownerId),
  ]);
  return attendanceCalendar(
    dates.map((d) => d.session_date),
    from,
    to,
    profile.rest_weekdays,
  );
}

/**
 * Deleting a workout un-counts the gym day. PRs it set are deliberately left
 * standing — they were really lifted, and silently rolling a rival's record
 * back would be worse than the alternative.
 */
export async function deleteWorkout(userId: string, sessionId: string): Promise<void> {
  const session = await loadOwnedSession(userId, sessionId);
  await transaction(async (client) => {
    await client.query('UPDATE workout_sessions SET deleted_at = now(), is_counted = false WHERE id = $1', [sessionId]);
    await client.query(
      `UPDATE attendance SET session_count = session_count - 1
        WHERE user_id = $1 AND session_date = $2 AND session_count > 1`,
      [userId, session.session_date],
    );
    await client.query(
      `DELETE FROM attendance
        WHERE user_id = $1 AND session_date = $2
          AND NOT EXISTS (SELECT 1 FROM workout_sessions
                           WHERE user_id = $1 AND session_date = $2
                             AND is_counted AND deleted_at IS NULL)`,
      [userId, session.session_date],
    );
  });
}

export async function todaysWorkout(userId: string): Promise<SessionRow | null> {
  const profile = await getProfile(userId);
  return one<SessionRow>(
    `SELECT * FROM workout_sessions
      WHERE user_id = $1 AND session_date = $2 AND deleted_at IS NULL
      ORDER BY started_at DESC LIMIT 1`,
    [userId, todayInTimezone(profile.timezone)],
  );
}

export async function attendanceDates(userId: string): Promise<string[]> {
  const rows = await query<{ session_date: string }>(
    'SELECT session_date FROM attendance WHERE user_id = $1 ORDER BY session_date',
    [userId],
  );
  return rows.rows.map((r) => r.session_date);
}
