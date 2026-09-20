import {
  candidatesFromSession,
  detectPrs,
  headlinePr,
  improvementPercent,
  prKey,
  type DetectedPr,
  type PersonalRecord,
  type WorkoutSet,
} from '@rival/core';
import { many, one, type Queryable } from '../db/index.ts';

/**
 * Personal records.
 *
 * Detection itself lives in `@rival/core` and is pure; this module only loads
 * the standing records, hands them over, and persists whatever came back. The
 * write is a single upsert per record plus an append to `pr_history`, so the
 * history is a real timeline rather than a derived guess.
 */

export interface StoredPr {
  id: string;
  exercise_id: string;
  exercise_name: string;
  pr_type: 'weight' | 'reps' | 'volume' | 'e1rm';
  value: number;
  weight_grams: number | null;
  reps: number | null;
  achieved_at: Date;
}

export async function loadStandingRecords(
  client: Queryable,
  userId: string,
  exerciseIds: ReadonlyArray<string>,
): Promise<PersonalRecord[]> {
  if (exerciseIds.length === 0) return [];
  const { rows } = await client.query<{
    exercise_id: string;
    pr_type: PersonalRecord['prType'];
    value: number;
    weight_grams: number | null;
    reps: number | null;
    achieved_at: Date;
  }>(
    `SELECT exercise_id, pr_type, value, weight_grams, reps, achieved_at
       FROM personal_records
      WHERE user_id = $1 AND exercise_id = ANY($2::uuid[])`,
    [userId, exerciseIds],
  );

  return rows.map((row) => ({
    userId,
    exerciseId: row.exercise_id,
    prType: row.pr_type,
    value: Number(row.value),
    weightGrams: row.weight_grams,
    reps: row.reps,
    achievedAt: row.achieved_at,
  }));
}

export interface PersistedPr extends DetectedPr {
  exerciseName: string;
}

/**
 * Detect and persist every record broken by one session.
 * Runs inside the caller's transaction so a failed write cannot leave a PR
 * recorded against a workout that was rolled back.
 */
export async function recordPrsForSession(
  client: Queryable,
  userId: string,
  sessionId: string,
  sets: ReadonlyArray<WorkoutSet>,
): Promise<PersistedPr[]> {
  const exerciseIds = [...new Set(sets.map((s) => s.exerciseId))];
  if (exerciseIds.length === 0) return [];

  const existing = await loadStandingRecords(client, userId, exerciseIds);
  const detected = detectPrs(candidatesFromSession(sets), existing);
  if (detected.length === 0) return [];

  // Within one session several sets can beat the same record; keep the best.
  const best = new Map<string, DetectedPr>();
  for (const pr of detected) {
    const key = prKey(pr);
    const current = best.get(key);
    if (!current || pr.value > current.value) best.set(key, pr);
  }

  const { rows: nameRows } = await client.query<{ id: string; name: string }>(
    'SELECT id, name FROM exercises WHERE id = ANY($1::uuid[])',
    [exerciseIds],
  );
  const names = new Map(nameRows.map((row) => [row.id, row.name]));

  const persisted: PersistedPr[] = [];
  for (const pr of best.values()) {
    // The two unique indexes on personal_records differ for rep PRs (keyed by
    // weight) and everything else, so each needs its own conflict target.
    const conflictTarget =
      pr.prType === 'reps'
        ? '(user_id, exercise_id, weight_grams) WHERE pr_type = \'reps\''
        : '(user_id, exercise_id, pr_type) WHERE pr_type <> \'reps\'';

    await client.query(
      `INSERT INTO personal_records
         (user_id, exercise_id, pr_type, value, weight_grams, reps, session_id, achieved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT ${conflictTarget}
       DO UPDATE SET value = EXCLUDED.value,
                     weight_grams = EXCLUDED.weight_grams,
                     reps = EXCLUDED.reps,
                     session_id = EXCLUDED.session_id,
                     achieved_at = EXCLUDED.achieved_at,
                     updated_at = now()`,
      [userId, pr.exerciseId, pr.prType, pr.value, pr.weightGrams, pr.reps, sessionId, pr.achievedAt],
    );

    await client.query(
      `INSERT INTO pr_history
         (user_id, exercise_id, pr_type, value, previous_value, improvement_pct,
          weight_grams, reps, session_id, achieved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        userId,
        pr.exerciseId,
        pr.prType,
        pr.value,
        pr.previousValue,
        pr.improvementPct,
        pr.weightGrams,
        pr.reps,
        sessionId,
        pr.achievedAt,
      ],
    );

    persisted.push({ ...pr, exerciseName: names.get(pr.exerciseId) ?? 'Exercise' });
  }

  return persisted;
}

export function headline(prs: ReadonlyArray<PersistedPr>): PersistedPr | null {
  return headlinePr(prs) as PersistedPr | null;
}

/** Every standing record for a user, newest first. */
export async function listPersonalRecords(userId: string, exerciseId?: string): Promise<StoredPr[]> {
  return many<StoredPr>(
    `SELECT r.id, r.exercise_id, e.name AS exercise_name, r.pr_type, r.value,
            r.weight_grams, r.reps, r.achieved_at
       FROM personal_records r
       JOIN exercises e ON e.id = r.exercise_id
      WHERE r.user_id = $1 AND ($2::uuid IS NULL OR r.exercise_id = $2)
      ORDER BY r.achieved_at DESC`,
    [userId, exerciseId ?? null],
  );
}

export interface PrHistoryPoint {
  value: number;
  previousValue: number | null;
  improvementPct: number | null;
  weightGrams: number | null;
  reps: number | null;
  achievedAt: Date;
}

export async function prHistory(
  userId: string,
  exerciseId: string,
  prType: 'weight' | 'reps' | 'volume' | 'e1rm' = 'weight',
): Promise<PrHistoryPoint[]> {
  const rows = await many<{
    value: number;
    previous_value: number | null;
    improvement_pct: number | null;
    weight_grams: number | null;
    reps: number | null;
    achieved_at: Date;
  }>(
    `SELECT value, previous_value, improvement_pct, weight_grams, reps, achieved_at
       FROM pr_history
      WHERE user_id = $1 AND exercise_id = $2 AND pr_type = $3
      ORDER BY achieved_at`,
    [userId, exerciseId, prType],
  );

  return rows.map((row) => ({
    value: Number(row.value),
    previousValue: row.previous_value === null ? null : Number(row.previous_value),
    improvementPct: row.improvement_pct,
    weightGrams: row.weight_grams,
    reps: row.reps,
    achievedAt: row.achieved_at,
  }));
}

/**
 * Improvement over a window, per exercise: the baseline is the best record the
 * user held when the window opened, so someone who started lighter can gain
 * more percentage and out-rank a stronger lifter.
 */
export async function improvementSince(
  userId: string,
  since: Date,
  prType: 'weight' | 'e1rm' = 'weight',
): Promise<{ exerciseId: string; exerciseName: string; baseline: number; current: number; improvementPct: number }[]> {
  const rows = await many<{
    exercise_id: string;
    exercise_name: string;
    baseline: number | null;
    current: number;
  }>(
    `SELECT r.exercise_id,
            e.name AS exercise_name,
            (SELECT h.value FROM pr_history h
              WHERE h.user_id = r.user_id AND h.exercise_id = r.exercise_id
                AND h.pr_type = r.pr_type AND h.achieved_at < $2
              ORDER BY h.achieved_at DESC LIMIT 1) AS baseline,
            r.value AS current
       FROM personal_records r
       JOIN exercises e ON e.id = r.exercise_id
      WHERE r.user_id = $1 AND r.pr_type = $3`,
    [userId, since, prType],
  );

  return rows
    .map((row) => {
      const baseline = row.baseline === null ? null : Number(row.baseline);
      const pct = baseline === null ? null : improvementPercent(baseline, Number(row.current));
      return {
        exerciseId: row.exercise_id,
        exerciseName: row.exercise_name,
        baseline: baseline ?? 0,
        current: Number(row.current),
        improvementPct: pct ?? 0,
      };
    })
    .filter((row) => row.baseline > 0 && row.improvementPct > 0)
    .sort((a, b) => b.improvementPct - a.improvementPct);
}

export type { WorkoutSet };
