import type { FastifyInstance } from 'fastify';
import { requireUser } from '../server.ts';
import { config } from '../config.ts';
import { ApiError } from '../lib/errors.ts';
import { parse, z } from '../lib/validation.ts';
import {
  PRO_FEATURES,
  createCheckoutIntent,
  getSubscription,
  listPlans,
  revokeEntitlement,
} from '../modules/subscriptions.ts';
import { getReferralSummary, listReferrals } from '../modules/referrals.ts';
import { loadShareCard, renderShareCard, shareCaption, SHARE_DIMENSIONS } from '../modules/share.ts';
import { uuid } from '../lib/validation.ts';

export function billingRoutes(app: FastifyInstance): void {
  app.get('/v1/subscription/plans', async () => ({
    plans: await listPlans(),
    features: PRO_FEATURES,
    provider: config.payments.provider,
  }));

  app.get('/v1/me/subscription', async (request) => getSubscription(requireUser(request)));

  app.post('/v1/subscription/checkout', async (request) => {
    const userId = requireUser(request);
    const body = parse(z.object({ planCode: z.string().trim().min(1).max(40) }), request.body);
    return createCheckoutIntent(userId, body.planCode);
  });

  app.post('/v1/subscription/cancel', async (request, reply) => {
    await revokeEntitlement(requireUser(request));
    reply.code(204);
  });

  /**
   * Provider webhook.
   *
   * The signature check belongs to whichever provider a deployment configures,
   * so this endpoint refuses to act until one is wired up — it will not grant
   * entitlements on an unverified request.
   */
  app.post('/v1/subscription/webhook/:provider', async (request) => {
    const { provider } = parse(
      z.object({ provider: z.enum(['stripe', 'revenuecat', 'apple', 'google']) }),
      request.params,
    );
    if (config.payments.provider !== provider) {
      throw ApiError.notImplemented(`This deployment is not configured for ${provider}.`);
    }
    if (!config.payments.webhookSecret) {
      throw ApiError.notImplemented('No webhook secret is configured; refusing to process events.');
    }
    throw ApiError.notImplemented(
      `Signature verification for ${provider} is deployment-specific — implement it before enabling this endpoint.`,
    );
  });

  // ── referrals ──────────────────────────────────────────────────────────
  app.get('/v1/me/referrals', async (request) => {
    const userId = requireUser(request);
    const [summary, invites] = await Promise.all([getReferralSummary(userId), listReferrals(userId)]);
    return { ...summary, invites };
  });

  // ── share cards ────────────────────────────────────────────────────────
  app.get('/v1/share/pr/:id', async (request) => {
    const userId = requireUser(request);
    const { id } = parse(z.object({ id: uuid }), request.params);
    const data = await loadShareCard(userId, id);
    return {
      data,
      caption: shareCaption(data),
      formats: Object.entries(SHARE_DIMENSIONS).map(([format, size]) => ({
        format,
        ...size,
        url: `/v1/share/pr/${id}.svg?format=${format}`,
      })),
    };
  });

  app.get('/v1/share/pr/:id.svg', async (request, reply) => {
    const userId = requireUser(request);
    const { id } = parse(z.object({ id: uuid }), request.params);
    const { format } = parse(
      z.object({ format: z.enum(['story', 'square', 'compact']).default('story') }),
      request.query,
    );
    const data = await loadShareCard(userId, id);
    reply.header('Content-Type', 'image/svg+xml; charset=utf-8');
    return renderShareCard(data, format);
  });
}
