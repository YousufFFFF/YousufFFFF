import {
  DEFAULT_SCORING,
  canCompare,
  catchUpCallToAction,
  computeRivalryScore,
  consistencyGap,
  fromGrams,
  resolveBattle,
  rivalryPair,
  rollingWindow,
  weightDelta,
  type PrBattleResult,
  type RivalryScoringConfig,
  type WeightUnit,
} from '@rival/core';
import { many, one, transaction, type Queryable } from '../db/index.ts';
import { ApiError } from '../lib/errors.ts';
import { todayInTimezone } from '../lib/time.ts';
import { publishActivity } from './feed.ts';
import { notify } from './notifications.ts';
import type { PersistedPr } from './prs.ts';
import { getPrivacy, getProfile, loadViewerContext } from './users.ts';

/**
 * Rivalries.
 *
 * Every read here is already restricted to accepted connections by the
 * `rivalries` table itself — a row only exists because both users accepted. On
 * top of that, `canCompare` re-checks privacy and the competition-paused flag,
 * so hiding your PRs takes you out of the comparison even from a connection.
 */

export async function loadScoringConfig(client?: Queryable): Promise<RivalryScoringConfig> {
  const runner = client ? client.query.bind(client) : undefined;
  const row = runner
    ? (await runner('SELECT * FROM rivalry_scoring_config WHERE id = 1')).rows[0]
    : await one('SELECT * FROM rivalry_scoring_config WHERE id = 1');
  if (!row) return DEFAULT_SCORING;
  const typed = row as {
    pr_battle_win: number;
    consistency_win: number;
    challenge_win: number;
    consistency_window_days: number;
    min_sessions_per_exercise: number;
  };
  return {
    prBattleWin: typed.pr_battle_win,
    consistencyWin: typed.consistency_win,
    challengeWin: typed.challenge_win,
    consistencyWindowDays: typed.consistency_window_days,
    minSessionsPerExercise: typed.min_sessions_per_exercise,
  };
}

export interface RivalryRow {
  id: string;
  user_a_id: string;
  user_b_id: string;
  is_active: boolean;
}

export async function findRivalry(userId: string, rivalId: string): Promise<RivalryRow | null> {
  const [low, high] = rivalryPair(userId, rivalId);
  return one<RivalryRow>(
    'SELECT id, user_a_id, user_b_id, is_active FROM rivalries WHERE user_a_id = $1 AND user_b_id = $2',
    [low, high],
  );
}

/**
 * Best weight PR per exercise for two users, restricted to exercises from the
 * shared library — a custom exercise is private and never battled.
 */
async function loadBattleRows(userId: string, rivalId: string) {
  return many<{
    exercise_id: string;
    exercise_name: string;
    your_grams: number | null;
    rival_grams: number | null;
    your_entries: number;
    rival_entries: number;
  }>(
    `WITH mine AS (
        SELECT r.exercise_id, r.value AS grams,
               (SELECT count(DISTINCT s.session_id) FROM workout_sets s
                 WHERE s.user_id = r.user_id AND s.exercise_id = r.exercise_id)::int AS entries
          FROM personal_records r
         WHERE r.user_id = $1 AND r.pr_type = 'weight'
     ), theirs AS (
        SELECT r.exercise_id, r.value AS grams,
               (SELECT count(DISTINCT s.session_id) FROM workout_sets s
                 WHERE s.user_id = r.user_id AND s.exercise_id = r.exercise_id)::int AS entries
          FROM personal_records r
         WHERE r.user_id = $2 AND r.pr_type = 'weight'
     )
     SELECT e.id AS exercise_id, e.name AS exercise_name,
            mine.grams AS your_grams, theirs.grams AS rival_grams,
            coalesce(mine.entries, 0) AS your_entries,
            coalesce(theirs.entries, 0) AS rival_entries
       FROM exercises e
       LEFT JOIN mine ON mine.exercise_id = e.id
       LEFT JOIN theirs ON theirs.exercise_id = e.id
      WHERE e.created_by IS NULL
        AND (mine.exercise_id IS NOT NULL OR theirs.exercise_id IS NOT NULL)
      ORDER BY e.is_compound DESC, e.name`,
    [userId, rivalId],
  );
}

async function sessionsInWindow(userId: string, from: string, to: string): Promise<number> {
  const row = await one<{ count: number }>(
    'SELECT count(*)::int AS count FROM attendance WHERE user_id = $1 AND session_date BETWEEN $2 AND $3',
    [userId, from, to],
  );
  return row?.count ?? 0;
}

export interface RivalryDetail {
  rivalryId: string;
  rival: { id: string; username: string; displayName: string; avatarUrl: string | null };
  comparable: boolean;
  /** Why comparison is off, when it is. */
  reason: string | null;
  score: ReturnType<typeof computeRivalryScore>;
  battles: PrBattleResult[];
  consistency: ReturnType<typeof consistencyGap> & { windowDays: number };
  challenges: { youWon: number; rivalWon: number; active: number };
  unit: WeightUnit;
}

export async function getRivalryDetail(userId: string, rivalId: string): Promise<RivalryDetail> {
  const rivalry = await findRivalry(userId, rivalId);
  if (!rivalry || !rivalry.is_active) {
    throw ApiError.notFound('You are not connected with that user.');
  }

  const [profile, rivalProfile, ctx, rivalPrivacy, config] = await Promise.all([
    getProfile(userId),
    getProfile(rivalId),
    loadViewerContext(userId, rivalId),
    getPrivacy(rivalId),
    loadScoringConfig(),
  ]);

  const unit = profile.preferred_unit;
  const names = { you: profile.display_name, rival: rivalProfile.display_name };
  const rival = {
    id: rivalId,
    username: rivalProfile.username,
    displayName: rivalProfile.display_name,
    avatarUrl: rivalProfile.avatar_url,
  };

  const yourPrivacy = await getPrivacy(userId);
  const comparable = canCompare(ctx, rivalPrivacy, yourPrivacy);
  const today = todayInTimezone(profile.timezone);
  const window = rollingWindow(today, config.consistencyWindowDays);

  if (!comparable) {
    const reason = ctx.competitionPaused
      ? `${rivalProfile.display_name} has paused competition.`
      : `${rivalProfile.display_name} keeps their records private.`;
    return {
      rivalryId: rivalry.id,
      rival,
      comparable: false,
      reason,
      score: computeRivalryScore(
        { battles: [], consistency: { you: 0, rival: 0 }, challenges: { youWon: 0, rivalWon: 0 } },
        config,
        names,
      ),
      battles: [],
      consistency: { ...consistencyGap(0, 0, today, names), windowDays: config.consistencyWindowDays },
      challenges: { youWon: 0, rivalWon: 0, active: 0 },
      unit,
    };
  }

  const [battleRows, yourSessions, rivalSessions, challengeCounts] = await Promise.all([
    loadBattleRows(userId, rivalId),
    sessionsInWindow(userId, window.from, window.to),
    sessionsInWindow(rivalId, window.from, window.to),
    one<{ you_won: number; rival_won: number; active: number }>(
      `SELECT count(*) FILTER (WHERE winner_id = $1)::int AS you_won,
              count(*) FILTER (WHERE winner_id = $2)::int AS rival_won,
              count(*) FILTER (WHERE status = 'active')::int AS active
         FROM challenges
        WHERE (creator_id = $1 AND opponent_id = $2) OR (creator_id = $2 AND opponent_id = $1)`,
      [userId, rivalId],
    ),
  ]);

  const battles = battleRows.map((row) =>
    resolveBattle(
      {
        exerciseId: row.exercise_id,
        exerciseName: row.exercise_name,
        youGrams: row.your_grams === null ? null : Number(row.your_grams),
        rivalGrams: row.rival_grams === null ? null : Number(row.rival_grams),
        yourEntries: row.your_entries,
        rivalEntries: row.rival_entries,
      },
      unit,
      config,
      names,
    ),
  );

  const challenges = {
    youWon: challengeCounts?.you_won ?? 0,
    rivalWon: challengeCounts?.rival_won ?? 0,
    active: challengeCounts?.active ?? 0,
  };

  const score = computeRivalryScore(
    {
      battles,
      consistency: { you: yourSessions, rival: rivalSessions },
      challenges: { youWon: challenges.youWon, rivalWon: challenges.rivalWon },
    },
    config,
    names,
  );

  await cacheRivalryScore(rivalry, userId, score, yourSessions, rivalSessions, challenges);

  return {
    rivalryId: rivalry.id,
    rival,
    comparable: true,
    reason: null,
    score,
    battles,
    consistency: {
      ...consistencyGap(yourSessions, rivalSessions, today, names),
      windowDays: config.consistencyWindowDays,
    },
    challenges,
    unit,
  };
}

/** The cached score powers the rivals list and the overall leaderboard. */
async function cacheRivalryScore(
  rivalry: RivalryRow,
  viewerId: string,
  score: ReturnType<typeof computeRivalryScore>,
  yourSessions: number,
  rivalSessions: number,
  challenges: { youWon: number; rivalWon: number },
): Promise<void> {
  const viewerIsA = rivalry.user_a_id === viewerId;
  const values = viewerIsA
    ? {
        scoreA: score.you,
        scoreB: score.rival,
        battlesA: score.breakdown.prBattles.you,
        battlesB: score.breakdown.prBattles.rival,
        sessionsA: yourSessions,
        sessionsB: rivalSessions,
        challengesA: challenges.youWon,
        challengesB: challenges.rivalWon,
      }
    : {
        scoreA: score.rival,
        scoreB: score.you,
        battlesA: score.breakdown.prBattles.rival,
        battlesB: score.breakdown.prBattles.you,
        sessionsA: rivalSessions,
        sessionsB: yourSessions,
        challengesA: challenges.rivalWon,
        challengesB: challenges.youWon,
      };

  await one(
    `INSERT INTO rivalry_scores
       (rivalry_id, score_a, score_b, battles_won_a, battles_won_b,
        sessions_a, sessions_b, challenges_won_a, challenges_won_b, computed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     ON CONFLICT (rivalry_id) DO UPDATE SET
       score_a = EXCLUDED.score_a, score_b = EXCLUDED.score_b,
       battles_won_a = EXCLUDED.battles_won_a, battles_won_b = EXCLUDED.battles_won_b,
       sessions_a = EXCLUDED.sessions_a, sessions_b = EXCLUDED.sessions_b,
       challenges_won_a = EXCLUDED.challenges_won_a, challenges_won_b = EXCLUDED.challenges_won_b,
       computed_at = now()`,
    [
      rivalry.id,
      values.scoreA,
      values.scoreB,
      values.battlesA,
      values.battlesB,
      values.sessionsA,
      values.sessionsB,
      values.challengesA,
      values.challengesB,
    ],
  );
}

export interface RivalSummary {
  rivalryId: string;
  rival: { id: string; username: string; displayName: string; avatarUrl: string | null };
  you: number;
  them: number;
  leader: 'you' | 'rival' | 'tie';
  headline: string;
  sessionsYou: number;
  sessionsThem: number;
  recentPr: { exerciseName: string; value: number; achievedAt: Date } | null;
  competitionPaused: boolean;
}

/**
 * Recompute and re-cache a user's rivalry scores.
 *
 * `rivalry_scores` is a cache, and it can fall behind in two ways: either side
 * trained since it was written, or the rolling consistency window moved on with
 * nobody training at all. `staleOnly` tests both against the data rather than
 * trusting a time-to-live, so a stale row is never served.
 */
export async function refreshRivalryScores(userId: string, options: { staleOnly?: boolean } = {}): Promise<void> {
  const rows = await many<{ rival_id: string }>(
    `SELECT CASE WHEN r.user_a_id = $1 THEN r.user_b_id ELSE r.user_a_id END AS rival_id
       FROM rivalries r
       LEFT JOIN rivalry_scores s ON s.rivalry_id = r.id
      WHERE r.is_active AND (r.user_a_id = $1 OR r.user_b_id = $1)
        AND ($2 = false
             OR s.computed_at IS NULL
             -- the window has rolled over since it was computed
             OR s.computed_at < date_trunc('day', now())
             -- either side has trained or set a record since it was computed
             OR s.computed_at < (SELECT max(w.updated_at) FROM workout_sessions w
                                  WHERE w.user_id IN (r.user_a_id, r.user_b_id))
             OR s.computed_at < (SELECT max(h.achieved_at) FROM pr_history h
                                  WHERE h.user_id IN (r.user_a_id, r.user_b_id)))`,
    [userId, options.staleOnly ?? false],
  );

  for (const row of rows) {
    // A rivalry that cannot be computed (privacy, a pause) simply keeps its
    // last cached figures; it must not break the list for every other rival.
    await getRivalryDetail(userId, row.rival_id).catch(() => undefined);
  }
}

export async function listRivals(userId: string): Promise<RivalSummary[]> {
  await refreshRivalryScores(userId, { staleOnly: true });
  const profile = await getProfile(userId);

  const rows = await many<{
    rivalry_id: string;
    rival_id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    competition_paused: boolean;
    score_you: number;
    score_them: number;
    sessions_you: number;
    sessions_them: number;
    recent_pr_name: string | null;
    recent_pr_value: number | null;
    recent_pr_at: Date | null;
  }>(
    `SELECT r.id AS rivalry_id,
            CASE WHEN r.user_a_id = $1 THEN r.user_b_id ELSE r.user_a_id END AS rival_id,
            p.username, p.display_name, p.avatar_url, p.competition_paused,
            CASE WHEN r.user_a_id = $1 THEN coalesce(s.score_a, 0) ELSE coalesce(s.score_b, 0) END AS score_you,
            CASE WHEN r.user_a_id = $1 THEN coalesce(s.score_b, 0) ELSE coalesce(s.score_a, 0) END AS score_them,
            CASE WHEN r.user_a_id = $1 THEN coalesce(s.sessions_a, 0) ELSE coalesce(s.sessions_b, 0) END AS sessions_you,
            CASE WHEN r.user_a_id = $1 THEN coalesce(s.sessions_b, 0) ELSE coalesce(s.sessions_a, 0) END AS sessions_them,
            pr.exercise_name AS recent_pr_name, pr.value AS recent_pr_value, pr.achieved_at AS recent_pr_at
       FROM rivalries r
       JOIN profiles p
         ON p.user_id = CASE WHEN r.user_a_id = $1 THEN r.user_b_id ELSE r.user_a_id END
       LEFT JOIN rivalry_scores s ON s.rivalry_id = r.id
       LEFT JOIN LATERAL (
            SELECT e.name AS exercise_name, h.value, h.achieved_at
              FROM pr_history h JOIN exercises e ON e.id = h.exercise_id
             WHERE h.user_id = p.user_id AND h.pr_type = 'weight'
             ORDER BY h.achieved_at DESC LIMIT 1
       ) pr ON true
      WHERE r.is_active AND (r.user_a_id = $1 OR r.user_b_id = $1)
      ORDER BY p.display_name`,
    [userId],
  );

  return rows.map((row) => {
    const you = row.score_you;
    const them = row.score_them;
    const leader: RivalSummary['leader'] = you > them ? 'you' : you < them ? 'rival' : 'tie';
    return {
      rivalryId: row.rivalry_id,
      rival: {
        id: row.rival_id,
        username: row.username,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
      },
      you,
      them,
      leader,
      // Written from the viewer's side: their own device says "You lead".
      headline:
        leader === 'tie'
          ? `Draw ${you}–${them}`
          : leader === 'you'
            ? `You lead ${you}–${them}`
            : `${row.display_name} leads ${them}–${you}`,
      sessionsYou: row.sessions_you,
      sessionsThem: row.sessions_them,
      recentPr: row.recent_pr_name
        ? {
            exerciseName: row.recent_pr_name,
            value: Number(row.recent_pr_value),
            achievedAt: row.recent_pr_at!,
          }
        : null,
      competitionPaused: row.competition_paused,
    };
  });
}

export async function rivalryTimeline(userId: string, rivalId: string, limit = 30) {
  const rivalry = await findRivalry(userId, rivalId);
  if (!rivalry) throw ApiError.notFound('You are not connected with that user.');
  return many<{
    id: string;
    event_type: string;
    actor_id: string;
    actor_name: string;
    exercise_name: string | null;
    payload: Record<string, unknown>;
    created_at: Date;
  }>(
    `SELECT ev.id, ev.event_type, ev.actor_id, p.display_name AS actor_name,
            e.name AS exercise_name, ev.payload, ev.created_at
       FROM rivalry_events ev
       JOIN profiles p ON p.user_id = ev.actor_id
       LEFT JOIN exercises e ON e.id = ev.exercise_id
      WHERE ev.rivalry_id = $1
      ORDER BY ev.created_at DESC
      LIMIT $2`,
    [rivalry.id, limit],
  );
}

export interface CatchUpView {
  rival: { id: string; username: string; displayName: string; avatarUrl: string | null };
  you: number;
  them: number;
  gap: number;
  windowDays: number;
  message: string;
  trainedToday: boolean;
  cta: ReturnType<typeof catchUpCallToAction>;
  earliestLevelDate: string | null;
}

/**
 * Catch-up mode.
 *
 * The one place the app pushes hardest, and so the one place the guard rails
 * matter most: the call to action comes from `catchUpCallToAction`, which will
 * not ask for a second session in a day however far behind the user is.
 */
export async function getCatchUp(userId: string, rivalId: string): Promise<CatchUpView> {
  const rivalry = await findRivalry(userId, rivalId);
  if (!rivalry || !rivalry.is_active) throw ApiError.notFound('You are not connected with that user.');

  const [profile, rivalProfile, config] = await Promise.all([
    getProfile(userId),
    getProfile(rivalId),
    loadScoringConfig(),
  ]);

  const today = todayInTimezone(profile.timezone);
  const window = rollingWindow(today, config.consistencyWindowDays);

  const [you, them, trained] = await Promise.all([
    sessionsInWindow(userId, window.from, window.to),
    sessionsInWindow(rivalId, window.from, window.to),
    one('SELECT 1 FROM attendance WHERE user_id = $1 AND session_date = $2', [userId, today]),
  ]);

  const gap = consistencyGap(you, them, today, {
    you: profile.display_name,
    rival: rivalProfile.display_name,
  });

  return {
    rival: {
      id: rivalId,
      username: rivalProfile.username,
      displayName: rivalProfile.display_name,
      avatarUrl: rivalProfile.avatar_url,
    },
    you,
    them,
    gap: gap.gap,
    windowDays: config.consistencyWindowDays,
    message: gap.message,
    trainedToday: trained !== null,
    cta: catchUpCallToAction(trained !== null, gap.sessionsToCatchUp),
    earliestLevelDate: gap.earliestLevelDate,
  };
}

export interface LeadTaken {
  rivalId: string;
  rivalName: string;
  exerciseId: string;
  exerciseName: string;
  deltaGrams: number;
}

/**
 * Runs after a workout is committed.
 *
 * For each weight PR just set, finds every rival whose record on that exercise
 * has now been passed, records the rivalry event, tells both sides, and posts
 * the "took #1" activity. This is the moment the whole product loop turns on.
 */
export async function onWorkoutLogged(userId: string, prs: ReadonlyArray<PersistedPr>): Promise<LeadTaken[]> {
  const weightPrs = prs.filter((pr) => pr.prType === 'weight');
  // Even a session with no PR moves the consistency leg of every rivalry, so
  // the refresh at the end runs either way.
  if (weightPrs.length === 0) {
    await refreshRivalryScores(userId);
    return [];
  }

  const profile = await getProfile(userId);
  const leads: LeadTaken[] = [];

  for (const pr of weightPrs) {
    const overtaken = await many<{
      rivalry_id: string;
      rival_id: string;
      rival_name: string;
      rival_grams: number;
    }>(
      `SELECT r.id AS rivalry_id,
              CASE WHEN r.user_a_id = $1 THEN r.user_b_id ELSE r.user_a_id END AS rival_id,
              p.display_name AS rival_name,
              pr.value AS rival_grams
         FROM rivalries r
         JOIN profiles p
           ON p.user_id = CASE WHEN r.user_a_id = $1 THEN r.user_b_id ELSE r.user_a_id END
         JOIN personal_records pr
           ON pr.user_id = p.user_id AND pr.exercise_id = $2 AND pr.pr_type = 'weight'
         JOIN user_privacy up ON up.user_id = p.user_id
        WHERE r.is_active
          AND (r.user_a_id = $1 OR r.user_b_id = $1)
          AND NOT p.competition_paused
          AND up.prs <> 'private'
          -- they led before this session and do not any more
          AND pr.value < $3
          AND pr.value >= $4`,
      [userId, pr.exerciseId, pr.value, pr.previousValue ?? 0],
    );

    for (const row of overtaken) {
      const deltaGrams = pr.value - Number(row.rival_grams);
      leads.push({
        rivalId: row.rival_id,
        rivalName: row.rival_name,
        exerciseId: pr.exerciseId,
        exerciseName: pr.exerciseName,
        deltaGrams,
      });

      await transaction(async (client) => {
        await client.query(
          `INSERT INTO rivalry_events (rivalry_id, actor_id, event_type, exercise_id, payload)
           VALUES ($1, $2, 'lead_taken', $3, $4)`,
          [
            row.rivalry_id,
            userId,
            pr.exerciseId,
            { value: pr.value, previousLeaderValue: Number(row.rival_grams), deltaGrams },
          ],
        );

        await notify(client, {
          userId: row.rival_id,
          type: 'pr_beaten',
          title: `${profile.display_name} just took your ${pr.exerciseName} spot`,
          body: `They're now ${fromGrams(deltaGrams, 'kg')} kg ahead of you on ${pr.exerciseName}.`,
          actorId: userId,
          payload: { exerciseId: pr.exerciseId, value: pr.value },
        });

        await notify(client, {
          userId,
          type: 'took_number_one',
          title: 'You took the lead',
          body: `Your ${pr.exerciseName} PR is now higher than ${row.rival_name}'s.`,
          actorId: row.rival_id,
          payload: { exerciseId: pr.exerciseId, deltaGrams },
        });

        await publishActivity(client, {
          actorId: userId,
          type: 'took_number_one',
          exerciseId: pr.exerciseId,
          subjectId: row.rival_id,
          payload: { value: pr.value, deltaGrams },
        });
      });
    }
  }

  // A new PR can change the battle tally in every one of this user's
  // rivalries, not only the ones they just overtook, so refresh them all.
  await refreshRivalryScores(userId);

  return leads;
}

/**
 * Rivals within striking distance of one of the user's records — the
 * "Rahul is 2.5 kg away from your PR" signal on the home screen.
 */
export async function prThreats(userId: string, marginGrams = 5_000) {
  return many<{
    rival_id: string;
    rival_name: string;
    exercise_id: string;
    exercise_name: string;
    your_grams: number;
    rival_grams: number;
  }>(
    `SELECT CASE WHEN r.user_a_id = $1 THEN r.user_b_id ELSE r.user_a_id END AS rival_id,
            p.display_name AS rival_name,
            mine.exercise_id, e.name AS exercise_name,
            mine.value AS your_grams, theirs.value AS rival_grams
       FROM rivalries r
       JOIN profiles p
         ON p.user_id = CASE WHEN r.user_a_id = $1 THEN r.user_b_id ELSE r.user_a_id END
       JOIN user_privacy up ON up.user_id = p.user_id AND up.prs <> 'private'
       JOIN personal_records mine ON mine.user_id = $1 AND mine.pr_type = 'weight'
       JOIN personal_records theirs
         ON theirs.user_id = p.user_id AND theirs.pr_type = 'weight'
        AND theirs.exercise_id = mine.exercise_id
       JOIN exercises e ON e.id = mine.exercise_id
      WHERE r.is_active AND (r.user_a_id = $1 OR r.user_b_id = $1)
        AND NOT p.competition_paused
        AND theirs.value < mine.value
        AND mine.value - theirs.value <= $2
      ORDER BY mine.value - theirs.value
      LIMIT 5`,
    [userId, marginGrams],
  );
}

/** The single closest ongoing battle, used for the home screen's battle card. */
export async function closestBattle(userId: string) {
  const row = await one<{
    rival_id: string;
    rival_name: string;
    exercise_id: string;
    exercise_name: string;
    your_grams: number;
    rival_grams: number;
  }>(
    `SELECT CASE WHEN r.user_a_id = $1 THEN r.user_b_id ELSE r.user_a_id END AS rival_id,
            p.display_name AS rival_name,
            mine.exercise_id, e.name AS exercise_name,
            mine.value AS your_grams, theirs.value AS rival_grams
       FROM rivalries r
       JOIN profiles p
         ON p.user_id = CASE WHEN r.user_a_id = $1 THEN r.user_b_id ELSE r.user_a_id END
       JOIN user_privacy up ON up.user_id = p.user_id AND up.prs <> 'private'
       JOIN personal_records mine ON mine.user_id = $1 AND mine.pr_type = 'weight'
       JOIN personal_records theirs
         ON theirs.user_id = p.user_id AND theirs.pr_type = 'weight'
        AND theirs.exercise_id = mine.exercise_id
       JOIN exercises e ON e.id = mine.exercise_id AND e.is_compound
      WHERE r.is_active AND (r.user_a_id = $1 OR r.user_b_id = $1)
        AND NOT p.competition_paused
      ORDER BY abs(mine.value - theirs.value)
      LIMIT 1`,
    [userId],
  );
  if (!row) return null;
  return {
    rivalId: row.rival_id,
    rivalName: row.rival_name,
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    yourGrams: Number(row.your_grams),
    rivalGrams: Number(row.rival_grams),
  };
}

/** Rivals ahead of the user on gym days in the scoring window. */
export async function rivalsAhead(userId: string) {
  const [profile, config] = await Promise.all([getProfile(userId), loadScoringConfig()]);
  const window = rollingWindow(todayInTimezone(profile.timezone), config.consistencyWindowDays);

  return many<{ rival_id: string; rival_name: string; your_sessions: number; rival_sessions: number }>(
    `WITH mine AS (
        SELECT count(*)::int AS sessions FROM attendance
         WHERE user_id = $1 AND session_date BETWEEN $2 AND $3
     )
     SELECT CASE WHEN r.user_a_id = $1 THEN r.user_b_id ELSE r.user_a_id END AS rival_id,
            p.display_name AS rival_name,
            (SELECT sessions FROM mine) AS your_sessions,
            (SELECT count(*)::int FROM attendance a
              WHERE a.user_id = p.user_id AND a.session_date BETWEEN $2 AND $3) AS rival_sessions
       FROM rivalries r
       JOIN profiles p
         ON p.user_id = CASE WHEN r.user_a_id = $1 THEN r.user_b_id ELSE r.user_a_id END
       JOIN user_privacy up ON up.user_id = p.user_id AND up.attendance <> 'private'
      WHERE r.is_active AND (r.user_a_id = $1 OR r.user_b_id = $1)
        AND NOT p.competition_paused`,
    [userId, window.from, window.to],
  ).then((rows) => rows.filter((row) => row.rival_sessions > row.your_sessions));
}

export { weightDelta };
