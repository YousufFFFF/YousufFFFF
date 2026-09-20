import { many, one, query, transaction } from '../db/index.ts';
import { config, type PaymentProvider } from '../config.ts';
import { ApiError } from '../lib/errors.ts';

/**
 * Subscriptions.
 *
 * Freemium, and deliberately provider-agnostic: the app records *that* a user
 * has Pro and which provider vouched for it, never how the money moved. A
 * deployment plugs in Stripe on web, RevenueCat or native billing on mobile,
 * and nothing above this module changes.
 */

export type ProFeature =
  | 'advanced_stats'
  | 'pr_history'
  | 'rivalry_analytics'
  | 'unlimited_challenges'
  | 'advanced_leaderboards'
  | 'improvement_analytics'
  | 'custom_rivalry_settings';

export const PRO_FEATURES: ReadonlyArray<{ key: ProFeature; label: string }> = [
  { key: 'advanced_stats', label: 'Advanced statistics' },
  { key: 'pr_history', label: 'Full PR history' },
  { key: 'rivalry_analytics', label: 'Advanced rivalry analytics' },
  { key: 'unlimited_challenges', label: 'Unlimited custom challenges' },
  { key: 'advanced_leaderboards', label: 'Advanced leaderboards' },
  { key: 'improvement_analytics', label: 'Detailed improvement analytics' },
  { key: 'custom_rivalry_settings', label: 'Custom rivalry settings' },
];

export interface PlanRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_minor: number;
  currency: string;
  interval: 'month' | 'year' | 'lifetime';
  features: string[];
}

export async function listPlans(): Promise<PlanRow[]> {
  return many<PlanRow>('SELECT * FROM subscription_plans WHERE is_active ORDER BY sort_order, price_minor');
}

export interface SubscriptionStatus {
  isPro: boolean;
  plan: { code: string; name: string; interval: string } | null;
  status: string | null;
  provider: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export async function getSubscription(userId: string): Promise<SubscriptionStatus> {
  const row = await one<{
    status: string;
    provider: string;
    current_period_end: Date | null;
    cancel_at_period_end: boolean;
    code: string | null;
    name: string | null;
    interval: string | null;
  }>(
    `SELECT s.status, s.provider, s.current_period_end, s.cancel_at_period_end,
            p.code, p.name, p.interval
       FROM subscriptions s
       LEFT JOIN subscription_plans p ON p.id = s.plan_id
      WHERE s.user_id = $1 AND s.status IN ('trialing', 'active')
      ORDER BY s.created_at DESC LIMIT 1`,
    [userId],
  );

  if (!row) {
    return { isPro: false, plan: null, status: null, provider: null, currentPeriodEnd: null, cancelAtPeriodEnd: false };
  }

  // An expired period still stored as active counts as lapsed, not as Pro.
  const active = row.current_period_end === null || row.current_period_end.getTime() > Date.now();

  return {
    isPro: active,
    plan: row.code ? { code: row.code, name: row.name!, interval: row.interval! } : null,
    status: row.status,
    provider: row.provider,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
  };
}

export async function hasProAccess(userId: string): Promise<boolean> {
  return (await getSubscription(userId)).isPro;
}

/** Throws a 402 the client can turn into the upgrade screen. */
export async function assertPro(userId: string, feature: ProFeature): Promise<void> {
  if (await hasProAccess(userId)) return;
  const label = PRO_FEATURES.find((f) => f.key === feature)?.label ?? 'That';
  throw ApiError.requiresPro(`${label} is part of RIVAL PRO.`);
}

export interface CheckoutIntent {
  provider: PaymentProvider;
  planCode: string;
  /** What the client should do next — the shape differs per provider. */
  action:
    | { kind: 'redirect'; url: string }
    | { kind: 'native_purchase'; productId: string }
    | { kind: 'unavailable'; reason: string };
}

/**
 * Starts a purchase.
 *
 * No provider SDK is imported here on purpose. Each deployment configures
 * `PAYMENT_PROVIDER` and supplies the integration; until then the endpoint says
 * so plainly rather than pretending to have taken a payment.
 */
export async function createCheckoutIntent(userId: string, planCode: string): Promise<CheckoutIntent> {
  const plan = await one<PlanRow>('SELECT * FROM subscription_plans WHERE code = $1 AND is_active', [planCode]);
  if (!plan) throw ApiError.notFound('No such plan.');

  switch (config.payments.provider) {
    case 'stripe':
      return {
        provider: 'stripe',
        planCode,
        action: {
          kind: 'redirect',
          url: `${config.publicAppUrl}/checkout/stripe?plan=${encodeURIComponent(planCode)}&user=${userId}`,
        },
      };
    case 'apple':
    case 'google':
    case 'revenuecat':
      return {
        provider: config.payments.provider,
        planCode,
        action: { kind: 'native_purchase', productId: `rival_pro_${plan.interval}` },
      };
    default:
      return {
        provider: 'none',
        planCode,
        action: { kind: 'unavailable', reason: 'No payment provider is configured for this deployment.' },
      };
  }
}

export interface EntitlementGrant {
  userId: string;
  planCode: string;
  provider: string;
  providerRef?: string | null;
  periodEnd: Date | null;
  status?: 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired';
}

/**
 * The single write path for entitlements. Provider webhooks, native receipt
 * validation and promotional grants (referrals) all funnel through here, so
 * there is one place that decides whether someone has Pro.
 */
export async function grantEntitlement(grant: EntitlementGrant): Promise<void> {
  const plan = await one<{ id: string }>('SELECT id FROM subscription_plans WHERE code = $1', [grant.planCode]);
  if (!plan) throw ApiError.notFound('No such plan.');

  await transaction(async (client) => {
    await client.query(
      `UPDATE subscriptions SET status = 'expired', updated_at = now()
        WHERE user_id = $1 AND status IN ('trialing', 'active')`,
      [grant.userId],
    );
    await client.query(
      `INSERT INTO subscriptions (user_id, plan_id, status, provider, provider_ref, current_period_end)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [grant.userId, plan.id, grant.status ?? 'active', grant.provider, grant.providerRef ?? null, grant.periodEnd],
    );
  });
}

export async function revokeEntitlement(userId: string, reason: 'cancelled' | 'expired' = 'cancelled'): Promise<void> {
  await query(
    `UPDATE subscriptions SET status = $2, updated_at = now()
      WHERE user_id = $1 AND status IN ('trialing', 'active')`,
    [userId, reason],
  );
}

export async function recordPayment(input: {
  userId: string;
  provider: string;
  providerRef?: string | null;
  amountMinor: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
}): Promise<void> {
  await query(
    `INSERT INTO payments (user_id, provider, provider_ref, amount_minor, currency, status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [input.userId, input.provider, input.providerRef ?? null, input.amountMinor, input.currency, input.status],
  );
}
