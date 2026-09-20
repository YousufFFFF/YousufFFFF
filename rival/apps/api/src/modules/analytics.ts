import { rollingWindow, startOfWeek } from '@rival/core';
import { many } from '../db/index.ts';
import { todayInTimezone } from '../lib/time.ts';
import { getProfile } from './users.ts';

/**
 * Personal analytics.
 *
 * Every series is the user's own data over a window they choose. Nothing here
 * reaches across users — comparison lives in the rivalry and leaderboard
 * modules, which apply the privacy rules.
 */

export interface SeriesPoint {
  label: string;
  value: number;
}

export interface AnalyticsView {
  workoutFrequency: SeriesPoint[];
  volumeByWeek: SeriesPoint[];
  strengthProgression: { exerciseId: string; exerciseName: string; points: { date: string; value: number }[] }[];
  consistencyByMonth: SeriesPoint[];
  volumeByExercise: SeriesPoint[];
  unit: string;
}

export async function getAnalytics(userId: string, windowDays = 180): Promise<AnalyticsView> {
  const profile = await getProfile(userId);
  const today = todayInTimezone(profile.timezone);
  const window = rollingWindow(today, windowDays);

  const [frequency, volume, progression, monthly, byExercise] = await Promise.all([
    many<{ week: string; count: number }>(
      `SELECT to_char(date_trunc('week', session_date), 'YYYY-MM-DD') AS week, count(*)::int AS count
         FROM attendance
        WHERE user_id = $1 AND session_date BETWEEN $2 AND $3
        GROUP BY 1 ORDER BY 1`,
      [userId, window.from, window.to],
    ),
    many<{ week: string; volume: number }>(
      `SELECT to_char(date_trunc('week', w.session_date), 'YYYY-MM-DD') AS week,
              sum(w.total_volume_grams)::bigint AS volume
         FROM workout_sessions w
        WHERE w.user_id = $1 AND w.is_counted AND w.deleted_at IS NULL
          AND w.session_date BETWEEN $2 AND $3
        GROUP BY 1 ORDER BY 1`,
      [userId, window.from, window.to],
    ),
    many<{ exercise_id: string; exercise_name: string; achieved_at: Date; value: number }>(
      `SELECT h.exercise_id, e.name AS exercise_name, h.achieved_at, h.value
         FROM pr_history h
         JOIN exercises e ON e.id = h.exercise_id
        WHERE h.user_id = $1 AND h.pr_type = 'weight'
          AND e.slug IN ('squat', 'bench-press', 'deadlift', 'overhead-press')
        ORDER BY h.achieved_at`,
      [userId],
    ),
    many<{ month: string; count: number }>(
      `SELECT to_char(date_trunc('month', session_date), 'YYYY-MM') AS month, count(*)::int AS count
         FROM attendance WHERE user_id = $1
        GROUP BY 1 ORDER BY 1 DESC LIMIT 12`,
      [userId],
    ),
    many<{ exercise_name: string; volume: number }>(
      `SELECT e.name AS exercise_name, sum(s.weight_grams::bigint * s.reps)::bigint AS volume
         FROM workout_sets s
         JOIN exercises e ON e.id = s.exercise_id
         JOIN workout_sessions w ON w.id = s.session_id AND w.deleted_at IS NULL
        WHERE s.user_id = $1 AND w.session_date BETWEEN $2 AND $3
        GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
      [userId, window.from, window.to],
    ),
  ]);

  const byExerciseSeries = new Map<string, { exerciseId: string; exerciseName: string; points: { date: string; value: number }[] }>();
  for (const row of progression) {
    const series = byExerciseSeries.get(row.exercise_id) ?? {
      exerciseId: row.exercise_id,
      exerciseName: row.exercise_name,
      points: [],
    };
    series.points.push({ date: row.achieved_at.toISOString().slice(0, 10), value: Number(row.value) });
    byExerciseSeries.set(row.exercise_id, series);
  }

  return {
    workoutFrequency: frequency.map((r) => ({ label: startOfWeek(r.week), value: r.count })),
    volumeByWeek: volume.map((r) => ({ label: r.week, value: Number(r.volume) })),
    strengthProgression: [...byExerciseSeries.values()],
    consistencyByMonth: monthly.reverse().map((r) => ({ label: r.month, value: r.count })),
    volumeByExercise: byExercise.map((r) => ({ label: r.exercise_name, value: Number(r.volume) })),
    unit: profile.preferred_unit,
  };
}
