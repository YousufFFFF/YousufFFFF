import { many, query, type Queryable } from '../db/index.ts';

/**
 * Notifications.
 *
 * Only competition events — a beaten PR, a challenge, a gap opening up. Each
 * type maps to a user-controlled switch in `notification_settings`; a disabled
 * type is never written, so turning it off actually stops it rather than just
 * hiding it.
 */

export type NotificationType =
  | 'pr_beaten'
  | 'took_number_one'
  | 'lost_number_one'
  | 'consistency_gap'
  | 'challenge_received'
  | 'challenge_accepted'
  | 'challenge_declined'
  | 'challenge_won'
  | 'challenge_lost'
  | 'connection_request'
  | 'connection_accepted'
  | 'friend_pr'
  | 'own_pr'
  | 'achievement_earned';

/** Which settings column gates each type; `null` means always delivered. */
const SETTING_FOR_TYPE: Record<NotificationType, string | null> = {
  pr_beaten: 'pr_beaten',
  took_number_one: 'took_number_one',
  lost_number_one: 'took_number_one',
  consistency_gap: 'consistency_gap',
  challenge_received: 'challenge_activity',
  challenge_accepted: 'challenge_activity',
  challenge_declined: 'challenge_activity',
  challenge_won: 'challenge_activity',
  challenge_lost: 'challenge_activity',
  connection_request: 'connection_requests',
  connection_accepted: 'connection_requests',
  friend_pr: 'friend_prs',
  own_pr: null,
  achievement_earned: null,
};

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  actorId?: string | null;
  payload?: Record<string, unknown>;
}

/**
 * Writes the notification unless the recipient switched that type off, muted
 * the actor, or blocked them. Returns whether anything was written.
 */
export async function notify(client: Queryable, input: NotificationInput): Promise<boolean> {
  const setting = SETTING_FOR_TYPE[input.type];

  if (setting) {
    const { rows } = await client.query<Record<string, boolean>>(
      `SELECT ${setting} AS enabled FROM notification_settings WHERE user_id = $1`,
      [input.userId],
    );
    // Absent settings row means defaults, which are on.
    if (rows[0] && rows[0].enabled === false) return false;
  }

  if (input.actorId) {
    const { rows } = await client.query(
      `SELECT 1 FROM mutes WHERE muter_id = $1 AND muted_id = $2
       UNION ALL
       SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
      [input.userId, input.actorId],
    );
    if (rows.length > 0) return false;
  }

  await client.query(
    `INSERT INTO notifications (user_id, notification_type, title, body, actor_id, payload)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [input.userId, input.type, input.title, input.body, input.actorId ?? null, input.payload ?? {}],
  );
  return true;
}

export async function listNotifications(userId: string, limit = 30, before?: string) {
  const rows = await many<{
    id: string;
    notification_type: string;
    title: string;
    body: string;
    actor_id: string | null;
    actor_username: string | null;
    actor_avatar: string | null;
    payload: Record<string, unknown>;
    read_at: Date | null;
    created_at: Date;
  }>(
    `SELECT n.id, n.notification_type, n.title, n.body, n.actor_id,
            p.username AS actor_username, p.avatar_url AS actor_avatar,
            n.payload, n.read_at, n.created_at
       FROM notifications n
       LEFT JOIN profiles p ON p.user_id = n.actor_id
      WHERE n.user_id = $1
        AND ($3::timestamptz IS NULL OR n.created_at < $3)
      ORDER BY n.created_at DESC
      LIMIT $2`,
    [userId, limit, before ?? null],
  );

  return rows.map((row) => ({
    id: row.id,
    type: row.notification_type,
    title: row.title,
    body: row.body,
    actor: row.actor_id
      ? { id: row.actor_id, username: row.actor_username, avatarUrl: row.actor_avatar }
      : null,
    payload: row.payload,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));
}

export async function unreadCount(userId: string): Promise<number> {
  const { rows } = await query<{ count: number }>(
    'SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
    [userId],
  );
  return rows[0]?.count ?? 0;
}

export async function markRead(userId: string, ids?: string[]): Promise<number> {
  const result = ids?.length
    ? await query(
        'UPDATE notifications SET read_at = now() WHERE user_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL',
        [userId, ids],
      )
    : await query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [userId]);
  return result.rowCount ?? 0;
}
