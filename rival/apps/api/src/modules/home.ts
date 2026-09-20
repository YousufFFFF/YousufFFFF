import { buildHomeFeed, currentStreak, greeting, recoveryNotices, type HomeCard } from '@rival/core';
import { many, one } from '../db/index.ts';
import { todayInTimezone } from '../lib/time.ts';
import { connectionCount } from './connections.ts';
import { closestBattle, prThreats, rivalsAhead } from './rivalries.ts';
import { getProfile } from './users.ts';
import { attendanceDates, todaysWorkout } from './workouts.ts';

/**
 * The home screen.
 *
 * Assembles the signals, hands them to the pure ranking in `@rival/core`, and
 * returns an ordered list of cards. The screen therefore changes as the
 * rivalries change rather than showing a fixed dashboard.
 */

export interface HomeView {
  greeting: string;
  streakDays: number;
  trainedToday: boolean;
  unit: string;
  connectionCount: number;
  cards: HomeCard[];
  today: { sessionId: string; workoutType: string; setCount: number } | null;
}

export async function getHome(userId: string): Promise<HomeView> {
  const profile = await getProfile(userId);
  const today = todayInTimezone(profile.timezone);

  const [dates, connections, threats, behind, battle, session, pendingChallenges, closingChallenges, recentLeads] =
    await Promise.all([
      attendanceDates(userId),
      connectionCount(userId),
      prThreats(userId),
      rivalsAhead(userId),
      closestBattle(userId),
      todaysWorkout(userId),
      many<{ id: string; title: string; from_name: string }>(
        `SELECT c.id, c.title, p.display_name AS from_name
           FROM challenges c JOIN profiles p ON p.user_id = c.creator_id
          WHERE c.opponent_id = $1 AND c.status = 'pending'
          ORDER BY c.created_at DESC LIMIT 5`,
        [userId],
      ),
      many<{ id: string; title: string; deadline: string }>(
        `SELECT id, title, deadline FROM challenges
          WHERE (creator_id = $1 OR opponent_id = $1) AND status = 'active'
          ORDER BY deadline LIMIT 5`,
        [userId],
      ),
      // Leads taken in the last week — but only ones that still stand. A
      // "you took the lead" card for a lead since lost is worse than no card,
      // so the current records are re-checked rather than trusting the event.
      many<{ rival_id: string; rival_name: string; exercise_id: string; exercise_name: string; delta_grams: number }>(
        `SELECT DISTINCT ON (ev.exercise_id, rival.user_id)
                rival.user_id AS rival_id,
                rival.display_name AS rival_name,
                ev.exercise_id, e.name AS exercise_name,
                (mine.value - theirs.value) AS delta_grams
           FROM rivalry_events ev
           JOIN rivalries r ON r.id = ev.rivalry_id AND r.is_active
           JOIN profiles rival
             ON rival.user_id = CASE WHEN r.user_a_id = $1 THEN r.user_b_id ELSE r.user_a_id END
           JOIN exercises e ON e.id = ev.exercise_id
           JOIN personal_records mine
             ON mine.user_id = $1 AND mine.exercise_id = ev.exercise_id AND mine.pr_type = 'weight'
           JOIN personal_records theirs
             ON theirs.user_id = rival.user_id AND theirs.exercise_id = ev.exercise_id
            AND theirs.pr_type = 'weight'
          WHERE ev.actor_id = $1
            AND ev.event_type = 'lead_taken'
            AND ev.created_at > now() - interval '7 days'
            AND mine.value > theirs.value
          ORDER BY ev.exercise_id, rival.user_id, ev.created_at DESC
          LIMIT 3`,
        [userId],
      ),
    ]);

  const streak = currentStreak(dates, today, profile.weekly_target as 1 | 2 | 3 | 4 | 5 | 6 | 7);
  const trainedToday = dates.includes(today);

  const allSessionDates = await many<{ session_date: string }>(
    'SELECT session_date FROM workout_sessions WHERE user_id = $1 AND is_counted AND deleted_at IS NULL',
    [userId],
  );

  const cards = buildHomeFeed({
    unit: profile.preferred_unit,
    trainedToday,
    streakDays: streak.currentDays,
    connectionCount: connections,
    threats: threats.map((t) => ({
      rivalId: t.rival_id,
      rivalName: t.rival_name,
      exerciseId: t.exercise_id,
      exerciseName: t.exercise_name,
      yourGrams: Number(t.your_grams),
      rivalGrams: Number(t.rival_grams),
    })),
    behind: behind.map((b) => ({
      rivalId: b.rival_id,
      rivalName: b.rival_name,
      yourSessions: b.your_sessions,
      rivalSessions: b.rival_sessions,
    })),
    recentLeads: recentLeads.map((l) => ({
      rivalId: l.rival_id,
      rivalName: l.rival_name,
      exerciseId: l.exercise_id,
      exerciseName: l.exercise_name ?? 'Exercise',
      deltaGrams: Number(l.delta_grams ?? 0),
    })),
    pendingChallenges: pendingChallenges.map((c) => ({
      challengeId: c.id,
      fromName: c.from_name,
      title: c.title,
    })),
    closingChallenges: closingChallenges.map((c) => ({
      challengeId: c.id,
      title: c.title,
      daysRemaining: Math.max(
        0,
        Math.round((Date.parse(`${c.deadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000),
      ),
    })),
    closestBattle: battle,
    recoveryNotices: recoveryNotices({
      sessionDates: allSessionDates.map((d) => d.session_date),
      today,
    }),
  });

  return {
    greeting: greeting(new Date(), profile.display_name.split(' ')[0] ?? profile.display_name),
    streakDays: streak.currentDays,
    trainedToday,
    unit: profile.preferred_unit,
    connectionCount: connections,
    cards,
    today: session
      ? { sessionId: session.id, workoutType: session.workout_type, setCount: session.set_count }
      : null,
  };
}

/** The "next battle" headline card, used by the landing preview and widgets. */
export async function nextBattle(userId: string) {
  const ahead = await rivalsAhead(userId);
  if (ahead.length === 0) return null;
  const worst = ahead.sort((a, b) => b.rival_sessions - b.your_sessions - (a.rival_sessions - a.your_sessions))[0]!;
  return {
    rivalId: worst.rival_id,
    rivalName: worst.rival_name,
    yourSessions: worst.your_sessions,
    rivalSessions: worst.rival_sessions,
    gap: worst.rival_sessions - worst.your_sessions,
  };
}

export async function unreadBadge(userId: string): Promise<number> {
  const row = await one<{ count: number }>(
    'SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
    [userId],
  );
  return row?.count ?? 0;
}
