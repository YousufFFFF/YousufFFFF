import {
  consistencyLeaderboard,
  improvementLeaderboard,
  overallLeaderboard,
  rollingWindow,
  strengthLeaderboard,
  type LeaderboardEntry,
} from '@rival/core';
import { many } from '../db/index.ts';
import { todayInTimezone } from '../lib/time.ts';
import { getProfile } from './users.ts';
import { loadScoringConfig } from './rivalries.ts';

/**
 * Private leaderboards.
 *
 * Every query starts from the same `network` CTE: the viewer plus their
 * accepted connections, minus anyone blocked, muted-out, paused or with the
 * relevant category set to private. Nobody outside that set can appear on a
 * board, so a leaderboard cannot leak a stranger's numbers.
 */

const NETWORK_CTE = (privacyColumn: string) => `
  WITH network AS (
    SELECT $1::uuid AS user_id
    UNION
    SELECT CASE WHEN c.user_a_id = $1 THEN c.user_b_id ELSE c.user_a_id END
      FROM connections c
      JOIN profiles p
        ON p.user_id = CASE WHEN c.user_a_id = $1 THEN c.user_b_id ELSE c.user_a_id END
      JOIN user_privacy up ON up.user_id = p.user_id
     WHERE (c.user_a_id = $1 OR c.user_b_id = $1)
       AND NOT p.competition_paused
       AND up.${privacyColumn} <> 'private'
       AND NOT EXISTS (SELECT 1 FROM blocks b
                        WHERE (b.blocker_id = $1 AND b.blocked_id = p.user_id)
                           OR (b.blocker_id = p.user_id AND b.blocked_id = $1))
  )`;

interface MemberRow {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export async function exerciseLeaderboard(viewerId: string, exerciseId: string): Promise<LeaderboardEntry[]> {
  const profile = await getProfile(viewerId);
  const rows = await many<MemberRow & { best_grams: number }>(
    `${NETWORK_CTE('prs')}
     SELECT p.user_id, p.username, p.display_name, p.avatar_url, r.value AS best_grams
       FROM network n
       JOIN profiles p ON p.user_id = n.user_id
       JOIN personal_records r
         ON r.user_id = n.user_id AND r.exercise_id = $2 AND r.pr_type = 'weight'`,
    [viewerId, exerciseId],
  );
  return strengthLeaderboard(
    rows.map((r) => ({
      userId: r.user_id,
      username: r.username,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      bestGrams: Number(r.best_grams),
    })),
    viewerId,
    profile.preferred_unit,
  );
}

/**
 * Strength board across the headline compound lifts, so one big deadlift does
 * not decide the whole ranking.
 */
export async function strengthBoard(viewerId: string): Promise<LeaderboardEntry[]> {
  const profile = await getProfile(viewerId);
  const rows = await many<MemberRow & { total_grams: number }>(
    `${NETWORK_CTE('prs')}
     SELECT p.user_id, p.username, p.display_name, p.avatar_url,
            coalesce(sum(r.value), 0) AS total_grams
       FROM network n
       JOIN profiles p ON p.user_id = n.user_id
       LEFT JOIN personal_records r ON r.user_id = n.user_id AND r.pr_type = 'weight'
       LEFT JOIN exercises e ON e.id = r.exercise_id
        AND e.slug IN ('squat', 'bench-press', 'deadlift', 'overhead-press')
      WHERE e.id IS NOT NULL
      GROUP BY p.user_id, p.username, p.display_name, p.avatar_url`,
    [viewerId],
  );
  return strengthLeaderboard(
    rows.map((r) => ({
      userId: r.user_id,
      username: r.username,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      bestGrams: Number(r.total_grams),
    })),
    viewerId,
    profile.preferred_unit,
  );
}

export async function consistencyBoard(viewerId: string): Promise<LeaderboardEntry[]> {
  const [profile, config] = await Promise.all([getProfile(viewerId), loadScoringConfig()]);
  const window = rollingWindow(todayInTimezone(profile.timezone), config.consistencyWindowDays);

  const rows = await many<MemberRow & { sessions: number }>(
    `${NETWORK_CTE('attendance')}
     SELECT p.user_id, p.username, p.display_name, p.avatar_url,
            (SELECT count(*)::int FROM attendance a
              WHERE a.user_id = p.user_id AND a.session_date BETWEEN $2 AND $3) AS sessions
       FROM network n
       JOIN profiles p ON p.user_id = n.user_id`,
    [viewerId, window.from, window.to],
  );

  return consistencyLeaderboard(
    rows.map((r) => ({
      userId: r.user_id,
      username: r.username,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      sessions: r.sessions,
    })),
    viewerId,
  );
}

/**
 * Most improved.
 *
 * Ranked on percentage gain over the window rather than absolute load, which is
 * what lets a beginner finish above the strongest person in the group.
 */
export async function improvementBoard(viewerId: string, windowDays = 90) {
  const since = new Date(Date.now() - windowDays * 86_400_000);
  const rows = await many<MemberRow & { baseline: number | null; current: number | null }>(
    `${NETWORK_CTE('progress')}
     SELECT p.user_id, p.username, p.display_name, p.avatar_url,
            sum(coalesce(baseline.value, 0))::bigint AS baseline,
            sum(r.value)::bigint AS current
       FROM network n
       JOIN profiles p ON p.user_id = n.user_id
       JOIN personal_records r ON r.user_id = n.user_id AND r.pr_type = 'weight'
       JOIN exercises e ON e.id = r.exercise_id
        AND e.slug IN ('squat', 'bench-press', 'deadlift', 'overhead-press')
       LEFT JOIN LATERAL (
            SELECT h.value FROM pr_history h
             WHERE h.user_id = r.user_id AND h.exercise_id = r.exercise_id
               AND h.pr_type = 'weight' AND h.achieved_at < $2
             ORDER BY h.achieved_at DESC LIMIT 1
       ) baseline ON true
      GROUP BY p.user_id, p.username, p.display_name, p.avatar_url`,
    [viewerId, since],
  );

  return improvementLeaderboard(
    rows
      .filter((r) => Number(r.baseline ?? 0) > 0)
      .map((r) => ({
        userId: r.user_id,
        username: r.username,
        displayName: r.display_name,
        avatarUrl: r.avatar_url,
        baseline: Number(r.baseline),
        current: Number(r.current),
      })),
    viewerId,
  );
}

/** Overall: rivalry points won across the viewer's own rivalries. */
export async function overallBoard(viewerId: string): Promise<LeaderboardEntry[]> {
  const rows = await many<MemberRow & { points: number }>(
    `${NETWORK_CTE('prs')}
     SELECT p.user_id, p.username, p.display_name, p.avatar_url,
            coalesce((
              SELECT sum(CASE WHEN r.user_a_id = p.user_id THEN s.score_a ELSE s.score_b END)
                FROM rivalries r JOIN rivalry_scores s ON s.rivalry_id = r.id
               WHERE r.is_active AND (r.user_a_id = p.user_id OR r.user_b_id = p.user_id)
            ), 0)::int AS points
       FROM network n
       JOIN profiles p ON p.user_id = n.user_id`,
    [viewerId],
  );

  return overallLeaderboard(
    rows.map((r) => ({
      userId: r.user_id,
      username: r.username,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      points: r.points,
    })),
    viewerId,
  );
}

export async function challengesBoard(viewerId: string): Promise<LeaderboardEntry[]> {
  const rows = await many<MemberRow & { wins: number }>(
    `${NETWORK_CTE('prs')}
     SELECT p.user_id, p.username, p.display_name, p.avatar_url,
            (SELECT count(*)::int FROM challenges c WHERE c.winner_id = p.user_id) AS wins
       FROM network n
       JOIN profiles p ON p.user_id = n.user_id`,
    [viewerId],
  );

  return overallLeaderboard(
    rows.map((r) => ({
      userId: r.user_id,
      username: r.username,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      points: r.wins,
    })),
    viewerId,
  ).map((entry) => ({ ...entry, display: `${entry.value} won` }));
}
