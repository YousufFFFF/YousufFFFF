import {
  CHALLENGE_TEMPLATES,
  evaluateChallenge,
  suggestTarget,
  toGrams,
  type ChallengeStatus,
  type ChallengeType,
  type WeightUnit,
} from '@rival/core';
import { many, one, query, transaction } from '../db/index.ts';
import { ApiError } from '../lib/errors.ts';
import { todayInTimezone } from '../lib/time.ts';
import { publishActivity } from './feed.ts';
import { notify } from './notifications.ts';
import { findRivalry } from './rivalries.ts';
import { awardXp, getProfile } from './users.ts';
import { XP_AWARDS } from '@rival/core';
import { hasProAccess } from './subscriptions.ts';

/**
 * Challenges.
 *
 * Only between connected users, and only one opponent per challenge — a
 * challenge is a rivalry event, not a group event. Progress is measured live
 * from the participants' own logs, never self-reported.
 */

export interface ChallengeRow {
  id: string;
  creator_id: string;
  opponent_id: string;
  challenge_type: ChallengeType;
  exercise_id: string | null;
  title: string;
  target_value: number | null;
  start_date: string;
  deadline: string;
  status: ChallengeStatus;
  winner_id: string | null;
  created_at: Date;
}

/** Free accounts get the built-in templates; custom targets are a Pro feature. */
const FREE_CUSTOM_CHALLENGE_LIMIT = 3;

export async function listTemplates() {
  const rows = await many<{
    id: string;
    code: string;
    challenge_type: ChallengeType;
    title: string;
    description: string;
    default_duration_days: number;
    suggested_target_pct: number | null;
    requires_pro: boolean;
  }>('SELECT * FROM challenge_templates WHERE is_active ORDER BY requires_pro, title');
  return rows;
}

export interface CreateChallengeInput {
  opponentId: string;
  type: ChallengeType;
  exerciseId?: string | null;
  templateCode?: string;
  title?: string;
  target?: number;
  targetUnit?: WeightUnit;
  deadline: string;
}

export async function createChallenge(creatorId: string, input: CreateChallengeInput): Promise<ChallengeRow> {
  const rivalry = await findRivalry(creatorId, input.opponentId);
  if (!rivalry || !rivalry.is_active) {
    throw ApiError.forbidden('You can only challenge people you are connected with.');
  }

  const profile = await getProfile(creatorId);
  const today = todayInTimezone(profile.timezone);
  if (input.deadline <= today) throw ApiError.badRequest('Pick a deadline in the future.');

  const template = input.templateCode
    ? await one<{ id: string; title: string; requires_pro: boolean }>(
        'SELECT id, title, requires_pro FROM challenge_templates WHERE code = $1 AND is_active',
        [input.templateCode],
      )
    : null;

  const isPro = await hasProAccess(creatorId);
  if (template?.requires_pro && !isPro) throw ApiError.requiresPro('That challenge template is part of RIVAL PRO.');

  if (!template && !isPro) {
    const { rows } = await query<{ count: number }>(
      `SELECT count(*)::int AS count FROM challenges
        WHERE creator_id = $1 AND template_id IS NULL AND status IN ('pending', 'active')`,
      [creatorId],
    );
    if ((rows[0]?.count ?? 0) >= FREE_CUSTOM_CHALLENGE_LIMIT) {
      throw ApiError.requiresPro(
        `Free accounts can run ${FREE_CUSTOM_CHALLENGE_LIMIT} custom challenges at a time. RIVAL PRO removes the limit.`,
      );
    }
  }

  // Weight targets arrive in the creator's unit and are stored in grams.
  const targetValue =
    input.target === undefined || input.target === null
      ? null
      : isWeightTarget(input.type)
        ? toGrams(input.target, input.targetUnit ?? profile.preferred_unit)
        : Math.round(input.target);

  if (input.exerciseId) {
    const exercise = await one('SELECT 1 FROM exercises WHERE id = $1 AND is_active AND created_by IS NULL', [
      input.exerciseId,
    ]);
    if (!exercise) throw ApiError.badRequest('Pick an exercise from the shared library.');
  }

  const title = input.title ?? template?.title ?? defaultTitle(input.type);

  return transaction(async (client) => {
    const { rows } = await client.query<ChallengeRow>(
      `INSERT INTO challenges
         (creator_id, opponent_id, template_id, challenge_type, exercise_id, title, target_value, start_date, deadline)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        creatorId,
        input.opponentId,
        template?.id ?? null,
        input.type,
        input.exerciseId ?? null,
        title,
        targetValue,
        today,
        input.deadline,
      ],
    );
    const challenge = rows[0]!;

    await client.query(
      'INSERT INTO challenge_members (challenge_id, user_id) VALUES ($1, $2), ($1, $3)',
      [challenge.id, creatorId, input.opponentId],
    );

    await notify(client, {
      userId: input.opponentId,
      type: 'challenge_received',
      title: `${profile.display_name} challenged you`,
      body: title,
      actorId: creatorId,
      payload: { challengeId: challenge.id },
    });

    await client.query(
      `INSERT INTO rivalry_events (rivalry_id, actor_id, event_type, exercise_id, payload)
       VALUES ($1, $2, 'challenge_sent', $3, $4)`,
      [rivalry.id, creatorId, input.exerciseId ?? null, { challengeId: challenge.id, title }],
    );

    await publishActivity(client, {
      actorId: creatorId,
      type: 'challenge_sent',
      exerciseId: input.exerciseId ?? null,
      subjectId: input.opponentId,
      payload: { challengeId: challenge.id, title },
    });

    return challenge;
  });
}

function isWeightTarget(type: ChallengeType): boolean {
  return type === 'pr' || type === 'exercise' || type === 'volume';
}

function defaultTitle(type: ChallengeType): string {
  switch (type) {
    case 'pr':
      return 'Beat my PR';
    case 'exercise':
      return 'Highest PR by the deadline';
    case 'consistency':
      return 'Consistency challenge';
    case 'volume':
      return 'Volume war';
    case 'workout_count':
      return 'Workout sprint';
  }
}

export async function respondToChallenge(
  userId: string,
  challengeId: string,
  accept: boolean,
): Promise<ChallengeRow> {
  return transaction(async (client) => {
    const { rows } = await client.query<ChallengeRow>(
      `SELECT * FROM challenges WHERE id = $1 AND opponent_id = $2 AND status = 'pending' FOR UPDATE`,
      [challengeId, userId],
    );
    const challenge = rows[0];
    if (!challenge) throw ApiError.notFound('No pending challenge to respond to.');

    const nextStatus: ChallengeStatus = accept ? 'active' : 'declined';
    const { rows: updated } = await client.query<ChallengeRow>(
      `UPDATE challenges SET status = $2, responded_at = now() WHERE id = $1 RETURNING *`,
      [challengeId, nextStatus],
    );

    if (accept) {
      // Freeze both sides' starting point so progress is measured fairly from
      // acceptance rather than from whatever they had already banked.
      for (const participant of [challenge.creator_id, challenge.opponent_id]) {
        const baseline = await measureProgress(client, challenge, participant, true);
        await client.query(
          'UPDATE challenge_members SET baseline_value = $3, current_value = $3, updated_at = now() WHERE challenge_id = $1 AND user_id = $2',
          [challengeId, participant, baseline],
        );
      }
    }

    const { rows: profiles } = await client.query<{ display_name: string }>(
      'SELECT display_name FROM profiles WHERE user_id = $1',
      [userId],
    );

    await notify(client, {
      userId: challenge.creator_id,
      type: accept ? 'challenge_accepted' : 'challenge_declined',
      title: accept ? 'Challenge accepted' : 'Challenge declined',
      body: `${profiles[0]?.display_name ?? 'Your rival'} ${accept ? 'accepted' : 'declined'}: ${challenge.title}`,
      actorId: userId,
      payload: { challengeId },
    });

    return updated[0]!;
  });
}

export async function cancelChallenge(userId: string, challengeId: string): Promise<void> {
  const result = await query(
    `UPDATE challenges SET status = 'cancelled', resolved_at = now()
      WHERE id = $1 AND creator_id = $2 AND status IN ('pending', 'active')`,
    [challengeId, userId],
  );
  if (result.rowCount === 0) throw ApiError.notFound('No challenge to cancel.');
}

/**
 * Live progress for one participant, read from their own logged data.
 * `asBaseline` measures from the challenge start rather than the current total.
 */
async function measureProgress(
  client: { query: typeof query },
  challenge: ChallengeRow,
  userId: string,
  asBaseline = false,
): Promise<number> {
  switch (challenge.challenge_type) {
    case 'pr':
    case 'exercise': {
      const { rows } = await client.query<{ value: number }>(
        `SELECT coalesce(max(value), 0) AS value FROM personal_records
          WHERE user_id = $1 AND exercise_id = $2 AND pr_type = 'weight'`,
        [userId, challenge.exercise_id],
      );
      return Number(rows[0]?.value ?? 0);
    }
    case 'volume': {
      const { rows } = await client.query<{ value: number }>(
        `SELECT coalesce(sum(s.weight_grams::bigint * s.reps), 0) AS value
           FROM workout_sets s
           JOIN workout_sessions w ON w.id = s.session_id AND w.deleted_at IS NULL
          WHERE s.user_id = $1
            AND w.session_date >= $2 AND w.session_date <= $3
            AND ($4::uuid IS NULL OR s.exercise_id = $4)`,
        [
          userId,
          asBaseline ? challenge.deadline : challenge.start_date,
          asBaseline ? challenge.start_date : challenge.deadline,
          challenge.exercise_id,
        ],
      );
      return Number(rows[0]?.value ?? 0);
    }
    case 'consistency':
    case 'workout_count': {
      if (asBaseline) return 0; // attendance challenges always start from zero
      const { rows } = await client.query<{ value: number }>(
        `SELECT count(*)::int AS value FROM attendance
          WHERE user_id = $1 AND session_date BETWEEN $2 AND $3`,
        [userId, challenge.start_date, challenge.deadline],
      );
      return Number(rows[0]?.value ?? 0);
    }
  }
}

export interface ChallengeView {
  id: string;
  type: ChallengeType;
  title: string;
  status: ChallengeStatus;
  exercise: { id: string; name: string } | null;
  target: number | null;
  startDate: string;
  deadline: string;
  daysRemaining: number;
  summary: string;
  you: { id: string; displayName: string; value: number; progressPct: number };
  opponent: { id: string; username: string; displayName: string; avatarUrl: string | null; value: number; progressPct: number };
  leaderId: string | null;
  winnerId: string | null;
  isCreator: boolean;
  unit: WeightUnit;
  /** Weight targets are in grams; counts are plain numbers. */
  targetIsWeight: boolean;
}

export async function getChallenge(userId: string, challengeId: string): Promise<ChallengeView> {
  const challenge = await one<ChallengeRow>(
    'SELECT * FROM challenges WHERE id = $1 AND (creator_id = $2 OR opponent_id = $2)',
    [challengeId, userId],
  );
  if (!challenge) throw ApiError.notFound('Challenge not found.');
  return buildChallengeView(userId, challenge);
}

async function buildChallengeView(userId: string, challenge: ChallengeRow): Promise<ChallengeView> {
  const profile = await getProfile(userId);
  const today = todayInTimezone(profile.timezone);
  const otherId = challenge.creator_id === userId ? challenge.opponent_id : challenge.creator_id;

  const [otherProfile, exercise] = await Promise.all([
    getProfile(otherId),
    challenge.exercise_id
      ? one<{ id: string; name: string }>('SELECT id, name FROM exercises WHERE id = $1', [challenge.exercise_id])
      : Promise.resolve(null),
  ]);

  const runner = { query };
  const [yourValue, theirValue] = await Promise.all([
    measureProgress(runner, challenge, userId),
    measureProgress(runner, challenge, otherId),
  ]);

  const state = evaluateChallenge(
    {
      type: challenge.challenge_type,
      exerciseId: challenge.exercise_id,
      target: challenge.target_value === null ? null : Number(challenge.target_value),
      startDate: challenge.start_date,
      deadline: challenge.deadline,
    },
    [
      { userId, value: yourValue },
      { userId: otherId, value: theirValue },
    ],
    challenge.status,
    today,
  );

  // A resolution reached here is persisted, so the winner is recorded once.
  if (state.status !== challenge.status && (state.status === 'completed' || state.status === 'expired')) {
    await resolveChallenge(challenge, state.status, state.winnerId);
  }

  return {
    id: challenge.id,
    type: challenge.challenge_type,
    title: challenge.title,
    status: state.status,
    exercise,
    target: challenge.target_value === null ? null : Number(challenge.target_value),
    startDate: challenge.start_date,
    deadline: challenge.deadline,
    daysRemaining: state.daysRemaining,
    summary: state.summary,
    you: {
      id: userId,
      displayName: profile.display_name,
      value: yourValue,
      progressPct: state.progressPct[userId] ?? 0,
    },
    opponent: {
      id: otherId,
      username: otherProfile.username,
      displayName: otherProfile.display_name,
      avatarUrl: otherProfile.avatar_url,
      value: theirValue,
      progressPct: state.progressPct[otherId] ?? 0,
    },
    leaderId: state.leaderId,
    winnerId: challenge.winner_id ?? state.winnerId,
    isCreator: challenge.creator_id === userId,
    unit: profile.preferred_unit,
    targetIsWeight: isWeightTarget(challenge.challenge_type),
  };
}

async function resolveChallenge(
  challenge: ChallengeRow,
  status: 'completed' | 'expired',
  winnerId: string | null,
): Promise<void> {
  await transaction(async (client) => {
    const result = await client.query(
      `UPDATE challenges SET status = $2, winner_id = $3, resolved_at = now()
        WHERE id = $1 AND status = 'active'`,
      [challenge.id, status, winnerId],
    );
    // Another request may have resolved it first; only the winner does the rest.
    if (result.rowCount === 0) return;
    if (!winnerId) return;

    const loserId = winnerId === challenge.creator_id ? challenge.opponent_id : challenge.creator_id;
    await awardXp(client, winnerId, XP_AWARDS.challenge_won);

    await notify(client, {
      userId: winnerId,
      type: 'challenge_won',
      title: 'You won your challenge',
      body: challenge.title,
      actorId: loserId,
      payload: { challengeId: challenge.id },
    });
    await notify(client, {
      userId: loserId,
      type: 'challenge_lost',
      title: 'Challenge finished',
      body: `${challenge.title} — your rival took it.`,
      actorId: winnerId,
      payload: { challengeId: challenge.id },
    });
    await publishActivity(client, {
      actorId: winnerId,
      type: 'challenge_won',
      exerciseId: challenge.exercise_id,
      subjectId: loserId,
      payload: { challengeId: challenge.id, title: challenge.title },
    });
  });
}

export async function listChallenges(userId: string, status?: ChallengeStatus): Promise<ChallengeView[]> {
  const rows = await many<ChallengeRow>(
    `SELECT * FROM challenges
      WHERE (creator_id = $1 OR opponent_id = $1)
        AND ($2::text IS NULL OR status = $2)
      ORDER BY
        CASE status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
        deadline`,
    [userId, status ?? null],
  );
  return Promise.all(rows.map((row) => buildChallengeView(userId, row)));
}

/**
 * Suggested target for a "beat my PR" style challenge, based on the opponent's
 * current best — the number the creation screen pre-fills.
 */
export async function suggestChallengeTarget(userId: string, opponentId: string, exerciseId: string) {
  const rivalry = await findRivalry(userId, opponentId);
  if (!rivalry?.is_active) throw ApiError.forbidden('You are not connected with that user.');

  const row = await one<{ value: number }>(
    `SELECT r.value FROM personal_records r
       JOIN user_privacy up ON up.user_id = r.user_id AND up.prs <> 'private'
      WHERE r.user_id = $1 AND r.exercise_id = $2 AND r.pr_type = 'weight'`,
    [opponentId, exerciseId],
  );

  const opponentBest = row ? Number(row.value) : null;
  const template = CHALLENGE_TEMPLATES.find((t) => t.code === 'beat_my_pr')!;
  return { opponentBest, suggestedTarget: suggestTarget(template, opponentBest) };
}

/** Sweeps challenges past their deadline; run from a scheduled job. */
export async function expireOverdueChallenges(): Promise<number> {
  const rows = await many<ChallengeRow>(
    `SELECT * FROM challenges WHERE status = 'active' AND deadline < CURRENT_DATE`,
  );
  for (const challenge of rows) {
    await buildChallengeView(challenge.creator_id, challenge).catch(() => undefined);
  }
  return rows.length;
}
