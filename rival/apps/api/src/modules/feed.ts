import { many, one, query, type Queryable } from '../db/index.ts';
import { ApiError } from '../lib/errors.ts';

/**
 * The activity feed.
 *
 * Fitness events only — there is no way to post free text. The reader sees a
 * row when the actor is a connection and the actor's `activity_feed` visibility
 * allowed it at write time; `visibility` is copied onto the row so the feed
 * query stays a single index scan.
 */

export type ActivityType =
  | 'workout_completed'
  | 'new_pr'
  | 'took_number_one'
  | 'challenge_sent'
  | 'challenge_won'
  | 'streak_milestone'
  | 'achievement_earned'
  | 'rivalry_started';

export type Reaction = 'fire' | 'muscle' | 'crown' | 'laugh';

export const REACTION_EMOJI: Record<Reaction, string> = {
  fire: '🔥',
  muscle: '💪',
  crown: '👑',
  laugh: '😂',
};

export interface ActivityInput {
  actorId: string;
  type: ActivityType;
  exerciseId?: string | null;
  sessionId?: string | null;
  subjectId?: string | null;
  payload?: Record<string, unknown>;
}

export async function publishActivity(client: Queryable, input: ActivityInput): Promise<string | null> {
  const { rows: privacyRows } = await client.query<{ activity_feed: string }>(
    'SELECT activity_feed FROM user_privacy WHERE user_id = $1',
    [input.actorId],
  );
  const visibility = privacyRows[0]?.activity_feed ?? 'connections';
  // A user who hid their feed publishes nothing at all, rather than writing
  // rows that a later privacy change would retroactively expose.
  if (visibility === 'private') return null;

  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO activity_feed (actor_id, activity_type, exercise_id, session_id, subject_id, payload, visibility)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      input.actorId,
      input.type,
      input.exerciseId ?? null,
      input.sessionId ?? null,
      input.subjectId ?? null,
      input.payload ?? {},
      visibility,
    ],
  );
  return rows[0]?.id ?? null;
}

export interface FeedItem {
  id: string;
  type: string;
  actor: { id: string; username: string; displayName: string; avatarUrl: string | null };
  subject: { id: string; username: string; displayName: string } | null;
  exercise: { id: string; name: string } | null;
  payload: Record<string, unknown>;
  createdAt: Date;
  reactions: Record<string, number>;
  yourReactions: string[];
  commentCount: number;
}

export async function listFeed(viewerId: string, limit = 30, before?: string): Promise<FeedItem[]> {
  const rows = await many<{
    id: string;
    activity_type: string;
    actor_id: string;
    actor_username: string;
    actor_display_name: string;
    actor_avatar: string | null;
    subject_id: string | null;
    subject_username: string | null;
    subject_display_name: string | null;
    exercise_id: string | null;
    exercise_name: string | null;
    payload: Record<string, unknown>;
    created_at: Date;
    reactions: { reaction: string; count: number }[] | null;
    your_reactions: string[] | null;
    comment_count: number;
  }>(
    `WITH network AS (
        SELECT CASE WHEN user_a_id = $1 THEN user_b_id ELSE user_a_id END AS user_id
          FROM connections
         WHERE user_a_id = $1 OR user_b_id = $1
        UNION SELECT $1::uuid
     )
     SELECT a.id, a.activity_type, a.actor_id,
            ap.username AS actor_username, ap.display_name AS actor_display_name, ap.avatar_url AS actor_avatar,
            a.subject_id, sp.username AS subject_username, sp.display_name AS subject_display_name,
            a.exercise_id, e.name AS exercise_name,
            a.payload, a.created_at,
            (SELECT json_agg(json_build_object('reaction', r.reaction, 'count', r.count))
               FROM (SELECT reaction, count(*)::int AS count
                       FROM activity_reactions WHERE activity_id = a.id GROUP BY reaction) r) AS reactions,
            (SELECT array_agg(reaction) FROM activity_reactions
              WHERE activity_id = a.id AND user_id = $1) AS your_reactions,
            (SELECT count(*)::int FROM activity_comments
              WHERE activity_id = a.id AND deleted_at IS NULL) AS comment_count
       FROM activity_feed a
       JOIN profiles ap ON ap.user_id = a.actor_id
       JOIN user_privacy aup ON aup.user_id = a.actor_id
       LEFT JOIN profiles sp ON sp.user_id = a.subject_id
       LEFT JOIN exercises e ON e.id = a.exercise_id
      WHERE a.actor_id IN (SELECT user_id FROM network)
        AND a.visibility <> 'private'
        AND (a.actor_id = $1 OR aup.activity_feed <> 'private')
        AND NOT EXISTS (SELECT 1 FROM mutes WHERE muter_id = $1 AND muted_id = a.actor_id)
        AND NOT EXISTS (SELECT 1 FROM blocks
                         WHERE (blocker_id = $1 AND blocked_id = a.actor_id)
                            OR (blocker_id = a.actor_id AND blocked_id = $1))
        AND ($3::timestamptz IS NULL OR a.created_at < $3)
      ORDER BY a.created_at DESC
      LIMIT $2`,
    [viewerId, limit, before ?? null],
  );

  return rows.map((row) => ({
    id: row.id,
    type: row.activity_type,
    actor: {
      id: row.actor_id,
      username: row.actor_username,
      displayName: row.actor_display_name,
      avatarUrl: row.actor_avatar,
    },
    subject: row.subject_id
      ? { id: row.subject_id, username: row.subject_username!, displayName: row.subject_display_name! }
      : null,
    exercise: row.exercise_id ? { id: row.exercise_id, name: row.exercise_name! } : null,
    payload: row.payload,
    createdAt: row.created_at,
    reactions: Object.fromEntries((row.reactions ?? []).map((r) => [r.reaction, r.count])),
    yourReactions: row.your_reactions ?? [],
    commentCount: row.comment_count,
  }));
}

/** Only someone who can already see the activity may react to it. */
async function assertCanSeeActivity(viewerId: string, activityId: string): Promise<string> {
  const row = await one<{ actor_id: string }>(
    `SELECT a.actor_id
       FROM activity_feed a
       JOIN user_privacy up ON up.user_id = a.actor_id
      WHERE a.id = $2
        AND a.visibility <> 'private'
        AND (a.actor_id = $1
             OR (up.activity_feed <> 'private'
                 AND EXISTS (SELECT 1 FROM connections c
                              WHERE c.user_a_id = least($1::uuid, a.actor_id)
                                AND c.user_b_id = greatest($1::uuid, a.actor_id))))`,
    [viewerId, activityId],
  );
  if (!row) throw ApiError.notFound('That activity is not available.');
  return row.actor_id;
}

export async function addReaction(viewerId: string, activityId: string, reaction: Reaction): Promise<void> {
  await assertCanSeeActivity(viewerId, activityId);
  await query(
    `INSERT INTO activity_reactions (activity_id, user_id, reaction)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [activityId, viewerId, reaction],
  );
}

export async function removeReaction(viewerId: string, activityId: string, reaction: Reaction): Promise<void> {
  await query('DELETE FROM activity_reactions WHERE activity_id = $1 AND user_id = $2 AND reaction = $3', [
    activityId,
    viewerId,
    reaction,
  ]);
}

export async function addComment(viewerId: string, activityId: string, body: string) {
  await assertCanSeeActivity(viewerId, activityId);
  const row = await one<{ id: string; created_at: Date }>(
    'INSERT INTO activity_comments (activity_id, user_id, body) VALUES ($1, $2, $3) RETURNING id, created_at',
    [activityId, viewerId, body.trim()],
  );
  return row;
}

export async function listComments(viewerId: string, activityId: string) {
  await assertCanSeeActivity(viewerId, activityId);
  return many<{ id: string; body: string; created_at: Date; user_id: string; username: string; avatar_url: string | null }>(
    `SELECT c.id, c.body, c.created_at, c.user_id, p.username, p.avatar_url
       FROM activity_comments c
       JOIN profiles p ON p.user_id = c.user_id
      WHERE c.activity_id = $1 AND c.deleted_at IS NULL
      ORDER BY c.created_at`,
    [activityId],
  );
}

export async function deleteComment(viewerId: string, commentId: string): Promise<void> {
  const result = await query(
    'UPDATE activity_comments SET deleted_at = now() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
    [commentId, viewerId],
  );
  if (result.rowCount === 0) throw ApiError.notFound('Comment not found.');
}
