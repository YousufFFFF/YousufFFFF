import type { FastifyInstance } from 'fastify';
import { requireUser } from '../server.ts';
import { ApiError } from '../lib/errors.ts';
import { RATE_LIMITS, consume } from '../lib/rate-limit.ts';
import { parse, uuid, username as usernameSchema, z } from '../lib/validation.ts';
import {
  acceptRequest,
  blockUser,
  cancelRequest,
  listBlocks,
  listConnections,
  listRequests,
  muteUser,
  rejectRequest,
  removeConnection,
  reportUser,
  sendRequest,
  unblockUser,
  unmuteUser,
} from '../modules/connections.ts';
import { getPublicProfile, searchUsers } from '../modules/users.ts';
import { addComment, addReaction, deleteComment, listComments, listFeed, removeReaction } from '../modules/feed.ts';
import { listNotifications, markRead, unreadCount } from '../modules/notifications.ts';

export function socialRoutes(app: FastifyInstance): void {
  // ── discovery ──────────────────────────────────────────────────────────
  app.get('/v1/users/search', async (request) => {
    const userId = requireUser(request);
    if (!(await consume(`search:${userId}`, RATE_LIMITS.search))) throw ApiError.tooManyRequests();
    const { q, limit } = parse(
      z.object({ q: z.string().trim().min(2).max(40), limit: z.coerce.number().int().min(1).max(50).default(20) }),
      request.query,
    );
    return searchUsers(userId, q, limit);
  });

  app.get('/v1/users/:username', async (request) => {
    const userId = requireUser(request);
    const { username } = parse(z.object({ username: usernameSchema }), request.params);
    return getPublicProfile(userId, username);
  });

  // ── connections ────────────────────────────────────────────────────────
  app.get('/v1/connections', async (request) => listConnections(requireUser(request)));

  app.get('/v1/connections/requests', async (request) => listRequests(requireUser(request)));

  app.post('/v1/connections/requests', async (request, reply) => {
    const userId = requireUser(request);
    if (!(await consume(`connreq:${userId}`, RATE_LIMITS.connectionRequest))) throw ApiError.tooManyRequests();
    const body = parse(
      z.object({ username: usernameSchema, message: z.string().trim().max(200).optional() }),
      request.body,
    );
    reply.code(201);
    return sendRequest(userId, body.username, body.message);
  });

  app.post('/v1/connections/requests/:id/accept', async (request) => {
    const userId = requireUser(request);
    const { id } = parse(z.object({ id: uuid }), request.params);
    return acceptRequest(userId, id);
  });

  app.post('/v1/connections/requests/:id/reject', async (request, reply) => {
    const userId = requireUser(request);
    const { id } = parse(z.object({ id: uuid }), request.params);
    await rejectRequest(userId, id);
    reply.code(204);
  });

  app.post('/v1/connections/requests/:id/cancel', async (request, reply) => {
    const userId = requireUser(request);
    const { id } = parse(z.object({ id: uuid }), request.params);
    await cancelRequest(userId, id);
    reply.code(204);
  });

  app.delete('/v1/connections/:userId', async (request, reply) => {
    const userId = requireUser(request);
    const params = parse(z.object({ userId: uuid }), request.params);
    await removeConnection(userId, params.userId);
    reply.code(204);
  });

  // ── safety ─────────────────────────────────────────────────────────────
  app.get('/v1/blocks', async (request) => listBlocks(requireUser(request)));

  app.post('/v1/blocks/:userId', async (request, reply) => {
    const userId = requireUser(request);
    const params = parse(z.object({ userId: uuid }), request.params);
    await blockUser(userId, params.userId);
    reply.code(204);
  });

  app.delete('/v1/blocks/:userId', async (request, reply) => {
    const userId = requireUser(request);
    const params = parse(z.object({ userId: uuid }), request.params);
    await unblockUser(userId, params.userId);
    reply.code(204);
  });

  app.post('/v1/mutes/:userId', async (request, reply) => {
    const userId = requireUser(request);
    const params = parse(z.object({ userId: uuid }), request.params);
    await muteUser(userId, params.userId);
    reply.code(204);
  });

  app.delete('/v1/mutes/:userId', async (request, reply) => {
    const userId = requireUser(request);
    const params = parse(z.object({ userId: uuid }), request.params);
    await unmuteUser(userId, params.userId);
    reply.code(204);
  });

  app.post('/v1/reports', async (request, reply) => {
    const userId = requireUser(request);
    if (!(await consume(`report:${userId}`, RATE_LIMITS.report))) throw ApiError.tooManyRequests();
    const body = parse(
      z.object({
        userId: uuid,
        reason: z.enum(['harassment', 'impersonation', 'spam', 'fake_records', 'inappropriate', 'other']),
        details: z.string().trim().max(1000).optional(),
      }),
      request.body,
    );
    reply.code(201);
    return reportUser(userId, body.userId, body.reason, body.details);
  });

  // ── feed ───────────────────────────────────────────────────────────────
  app.get('/v1/feed', async (request) => {
    const userId = requireUser(request);
    const { limit, before } = parse(
      z.object({ limit: z.coerce.number().int().min(1).max(50).default(30), before: z.string().optional() }),
      request.query,
    );
    return listFeed(userId, limit, before);
  });

  app.post('/v1/feed/:id/reactions', async (request, reply) => {
    const userId = requireUser(request);
    const { id } = parse(z.object({ id: uuid }), request.params);
    const body = parse(z.object({ reaction: z.enum(['fire', 'muscle', 'crown', 'laugh']) }), request.body);
    await addReaction(userId, id, body.reaction);
    reply.code(204);
  });

  app.delete('/v1/feed/:id/reactions/:reaction', async (request, reply) => {
    const userId = requireUser(request);
    const { id, reaction } = parse(
      z.object({ id: uuid, reaction: z.enum(['fire', 'muscle', 'crown', 'laugh']) }),
      request.params,
    );
    await removeReaction(userId, id, reaction);
    reply.code(204);
  });

  app.get('/v1/feed/:id/comments', async (request) => {
    const userId = requireUser(request);
    const { id } = parse(z.object({ id: uuid }), request.params);
    return listComments(userId, id);
  });

  app.post('/v1/feed/:id/comments', async (request, reply) => {
    const userId = requireUser(request);
    const { id } = parse(z.object({ id: uuid }), request.params);
    const body = parse(z.object({ body: z.string().trim().min(1).max(500) }), request.body);
    reply.code(201);
    return addComment(userId, id, body.body);
  });

  app.delete('/v1/feed/comments/:id', async (request, reply) => {
    const userId = requireUser(request);
    const { id } = parse(z.object({ id: uuid }), request.params);
    await deleteComment(userId, id);
    reply.code(204);
  });

  // ── notifications ──────────────────────────────────────────────────────
  app.get('/v1/notifications', async (request) => {
    const userId = requireUser(request);
    const { limit, before } = parse(
      z.object({ limit: z.coerce.number().int().min(1).max(50).default(30), before: z.string().optional() }),
      request.query,
    );
    const [items, unread] = await Promise.all([listNotifications(userId, limit, before), unreadCount(userId)]);
    return { unread, items };
  });

  app.post('/v1/notifications/read', async (request) => {
    const userId = requireUser(request);
    const body = parse(z.object({ ids: z.array(uuid).max(100).optional() }), request.body ?? {});
    const updated = await markRead(userId, body.ids);
    return { marked: updated, unread: await unreadCount(userId) };
  });
}
