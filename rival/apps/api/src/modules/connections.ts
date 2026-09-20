import { rivalryPair } from '@rival/core';
import { isUniqueViolation, many, one, query, transaction } from '../db/index.ts';
import { ApiError } from '../lib/errors.ts';
import { publishActivity } from './feed.ts';
import { notify } from './notifications.ts';

/**
 * Connections.
 *
 * The single most important rule in RIVAL lives here: **a rivalry exists only
 * once both users have accepted**. `acceptRequest` is the only code path that
 * creates a `connections` row, and it creates the matching `rivalries` row in
 * the same transaction, so the two can never disagree.
 */

export async function sendRequest(requesterId: string, addresseeUsername: string, message?: string) {
  const target = await one<{ user_id: string; display_name: string }>(
    `SELECT p.user_id, p.display_name
       FROM profiles p JOIN users u ON u.id = p.user_id
      WHERE p.username = $1 AND u.status = 'active' AND u.deleted_at IS NULL`,
    [addresseeUsername],
  );
  if (!target) throw ApiError.notFound('No such user.');
  if (target.user_id === requesterId) throw ApiError.badRequest('You cannot connect with yourself.');

  const blocked = await one(
    `SELECT 1 FROM blocks
      WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
    [requesterId, target.user_id],
  );
  // A blocked user gets the same answer as a non-existent one, so blocking is
  // not observable from the other side.
  if (blocked) throw ApiError.notFound('No such user.');

  const [low, high] = rivalryPair(requesterId, target.user_id);
  const already = await one('SELECT 1 FROM connections WHERE user_a_id = $1 AND user_b_id = $2', [low, high]);
  if (already) throw ApiError.conflict('already_connected', 'You are already connected.');

  // If they already asked you, accepting is the natural resolution.
  const inbound = await one<{ id: string }>(
    `SELECT id FROM connection_requests
      WHERE requester_id = $1 AND addressee_id = $2 AND status = 'pending'`,
    [target.user_id, requesterId],
  );
  if (inbound) return acceptRequest(requesterId, inbound.id);

  try {
    const row = await one<{ id: string; created_at: Date }>(
      `INSERT INTO connection_requests (requester_id, addressee_id, message)
       VALUES ($1, $2, $3) RETURNING id, created_at`,
      [requesterId, target.user_id, message ?? null],
    );

    await transaction(async (client) => {
      const { rows } = await client.query<{ display_name: string; username: string }>(
        'SELECT display_name, username FROM profiles WHERE user_id = $1',
        [requesterId],
      );
      const requester = rows[0];
      await notify(client, {
        userId: target.user_id,
        type: 'connection_request',
        title: 'New connection request',
        body: `${requester?.display_name ?? 'Someone'} wants to be your rival.`,
        actorId: requesterId,
        payload: { requestId: row!.id, username: requester?.username },
      });
    });

    return { id: row!.id, status: 'pending' as const, createdAt: row!.created_at };
  } catch (error) {
    if (isUniqueViolation(error)) throw ApiError.conflict('request_pending', 'You already sent them a request.');
    throw error;
  }
}

export interface AcceptResult {
  id: string;
  status: 'accepted';
  rivalryId: string;
  rival: { id: string; username: string; displayName: string; avatarUrl: string | null };
}

/**
 * Accepting is what turns two users into rivals. Connection, rivalry, score row
 * and the opening rivalry event are all written together.
 */
export async function acceptRequest(userId: string, requestId: string): Promise<AcceptResult> {
  return transaction(async (client) => {
    const { rows } = await client.query<{ id: string; requester_id: string; addressee_id: string }>(
      `SELECT id, requester_id, addressee_id
         FROM connection_requests
        WHERE id = $1 AND addressee_id = $2 AND status = 'pending'
        FOR UPDATE`,
      [requestId, userId],
    );
    const request = rows[0];
    if (!request) throw ApiError.notFound('No pending request to accept.');

    await client.query(
      `UPDATE connection_requests SET status = 'accepted', responded_at = now() WHERE id = $1`,
      [requestId],
    );

    const [low, high] = rivalryPair(request.requester_id, request.addressee_id);
    await client.query(
      'INSERT INTO connections (user_a_id, user_b_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [low, high],
    );

    const { rows: rivalryRows } = await client.query<{ id: string }>(
      `INSERT INTO rivalries (user_a_id, user_b_id) VALUES ($1, $2)
       ON CONFLICT (user_a_id, user_b_id) DO UPDATE SET is_active = true
       RETURNING id`,
      [low, high],
    );
    const rivalryId = rivalryRows[0]!.id;

    await client.query(
      'INSERT INTO rivalry_scores (rivalry_id) VALUES ($1) ON CONFLICT (rivalry_id) DO NOTHING',
      [rivalryId],
    );
    await client.query(
      `INSERT INTO rivalry_events (rivalry_id, actor_id, event_type, payload)
       VALUES ($1, $2, 'rivalry_started', '{}')`,
      [rivalryId, userId],
    );

    const { rows: profiles } = await client.query<{
      user_id: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
    }>('SELECT user_id, username, display_name, avatar_url FROM profiles WHERE user_id = ANY($1::uuid[])', [
      [request.requester_id, request.addressee_id],
    ]);
    const me = profiles.find((p) => p.user_id === userId)!;
    const rival = profiles.find((p) => p.user_id !== userId)!;

    await notify(client, {
      userId: rival.user_id,
      type: 'connection_accepted',
      title: 'Rivalry started',
      body: `${me.display_name} accepted. Your rivalry is live.`,
      actorId: userId,
      payload: { rivalryId },
    });
    await publishActivity(client, {
      actorId: userId,
      type: 'rivalry_started',
      subjectId: rival.user_id,
      payload: { rivalryId },
    });

    return {
      id: requestId,
      status: 'accepted',
      rivalryId,
      rival: {
        id: rival.user_id,
        username: rival.username,
        displayName: rival.display_name,
        avatarUrl: rival.avatar_url,
      },
    };
  });
}

export async function rejectRequest(userId: string, requestId: string): Promise<void> {
  const result = await query(
    `UPDATE connection_requests SET status = 'rejected', responded_at = now()
      WHERE id = $1 AND addressee_id = $2 AND status = 'pending'`,
    [requestId, userId],
  );
  if (result.rowCount === 0) throw ApiError.notFound('No pending request to reject.');
}

export async function cancelRequest(userId: string, requestId: string): Promise<void> {
  const result = await query(
    `UPDATE connection_requests SET status = 'cancelled', responded_at = now()
      WHERE id = $1 AND requester_id = $2 AND status = 'pending'`,
    [requestId, userId],
  );
  if (result.rowCount === 0) throw ApiError.notFound('No pending request to cancel.');
}

export async function listRequests(userId: string) {
  const rows = await many<{
    id: string;
    direction: 'incoming' | 'outgoing';
    other_id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    message: string | null;
    created_at: Date;
  }>(
    `SELECT r.id,
            CASE WHEN r.addressee_id = $1 THEN 'incoming' ELSE 'outgoing' END AS direction,
            CASE WHEN r.addressee_id = $1 THEN r.requester_id ELSE r.addressee_id END AS other_id,
            p.username, p.display_name, p.avatar_url, r.message, r.created_at
       FROM connection_requests r
       JOIN profiles p
         ON p.user_id = CASE WHEN r.addressee_id = $1 THEN r.requester_id ELSE r.addressee_id END
      WHERE r.status = 'pending' AND (r.addressee_id = $1 OR r.requester_id = $1)
      ORDER BY r.created_at DESC`,
    [userId],
  );

  return {
    incoming: rows.filter((r) => r.direction === 'incoming').map(toRequestView),
    outgoing: rows.filter((r) => r.direction === 'outgoing').map(toRequestView),
  };
}

function toRequestView(row: {
  id: string;
  other_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  message: string | null;
  created_at: Date;
}) {
  return {
    id: row.id,
    user: {
      id: row.other_id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    },
    message: row.message,
    createdAt: row.created_at,
  };
}

/** Removing a connection ends the rivalry; the history stays for both sides. */
export async function removeConnection(userId: string, otherId: string): Promise<void> {
  const [low, high] = rivalryPair(userId, otherId);
  await transaction(async (client) => {
    const result = await client.query('DELETE FROM connections WHERE user_a_id = $1 AND user_b_id = $2', [low, high]);
    if (result.rowCount === 0) throw ApiError.notFound('You are not connected.');
    await client.query('UPDATE rivalries SET is_active = false WHERE user_a_id = $1 AND user_b_id = $2', [low, high]);
  });
}

/**
 * Blocking removes the connection, ends the rivalry and hides each user from
 * the other's search, feed and leaderboards.
 */
export async function blockUser(userId: string, targetId: string): Promise<void> {
  if (userId === targetId) throw ApiError.badRequest('You cannot block yourself.');
  const [low, high] = rivalryPair(userId, targetId);
  await transaction(async (client) => {
    await client.query('INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
      userId,
      targetId,
    ]);
    await client.query('DELETE FROM connections WHERE user_a_id = $1 AND user_b_id = $2', [low, high]);
    await client.query('UPDATE rivalries SET is_active = false WHERE user_a_id = $1 AND user_b_id = $2', [low, high]);
    await client.query(
      `UPDATE connection_requests SET status = 'cancelled', responded_at = now()
        WHERE status = 'pending'
          AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))`,
      [userId, targetId],
    );
    await client.query(
      `UPDATE challenges SET status = 'cancelled', resolved_at = now()
        WHERE status IN ('pending', 'active')
          AND ((creator_id = $1 AND opponent_id = $2) OR (creator_id = $2 AND opponent_id = $1))`,
      [userId, targetId],
    );
  });
}

export async function unblockUser(userId: string, targetId: string): Promise<void> {
  await query('DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [userId, targetId]);
}

export async function listBlocks(userId: string) {
  return many<{ user_id: string; username: string; display_name: string; avatar_url: string | null; created_at: Date }>(
    `SELECT p.user_id, p.username, p.display_name, p.avatar_url, b.created_at
       FROM blocks b JOIN profiles p ON p.user_id = b.blocked_id
      WHERE b.blocker_id = $1 ORDER BY b.created_at DESC`,
    [userId],
  );
}

export async function muteUser(userId: string, targetId: string): Promise<void> {
  if (userId === targetId) throw ApiError.badRequest('You cannot mute yourself.');
  await query('INSERT INTO mutes (muter_id, muted_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, targetId]);
}

export async function unmuteUser(userId: string, targetId: string): Promise<void> {
  await query('DELETE FROM mutes WHERE muter_id = $1 AND muted_id = $2', [userId, targetId]);
}

export async function reportUser(
  reporterId: string,
  reportedId: string,
  reason: string,
  details?: string,
): Promise<{ id: string }> {
  if (reporterId === reportedId) throw ApiError.badRequest('You cannot report yourself.');
  const row = await one<{ id: string }>(
    'INSERT INTO reports (reporter_id, reported_id, reason, details) VALUES ($1, $2, $3, $4) RETURNING id',
    [reporterId, reportedId, reason, details ?? null],
  );
  return row!;
}

export async function listConnections(userId: string) {
  return many<{
    user_id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    connected_at: Date;
    competition_paused: boolean;
  }>(
    `SELECT p.user_id, p.username, p.display_name, p.avatar_url, c.connected_at, p.competition_paused
       FROM connections c
       JOIN profiles p
         ON p.user_id = CASE WHEN c.user_a_id = $1 THEN c.user_b_id ELSE c.user_a_id END
      WHERE c.user_a_id = $1 OR c.user_b_id = $1
      ORDER BY p.display_name`,
    [userId],
  );
}

export async function connectionCount(userId: string): Promise<number> {
  const row = await one<{ count: number }>(
    'SELECT count(*)::int AS count FROM connections WHERE user_a_id = $1 OR user_b_id = $1',
    [userId],
  );
  return row?.count ?? 0;
}
