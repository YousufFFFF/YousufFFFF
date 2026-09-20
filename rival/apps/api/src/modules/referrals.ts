import { randomBytes } from 'node:crypto';
import { config } from '../config.ts';
import { many, one, query } from '../db/index.ts';
import { grantEntitlement } from './subscriptions.ts';

/**
 * Referrals.
 *
 * Counts are always derived from the `referrals` rows — there is no stored
 * tally to drift, and nothing displays an invented number. A referral only
 * counts once the invited person actually signs up.
 */

export const REFERRALS_FOR_REWARD = 3;
export const REWARD_DAYS = 30;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alike characters

function generateCode(): string {
  const bytes = randomBytes(6);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export async function getOrCreateCode(userId: string): Promise<string> {
  const existing = await one<{ code: string }>('SELECT code FROM referral_codes WHERE user_id = $1', [userId]);
  if (existing) return existing.code;

  // Retry on the vanishingly unlikely collision rather than failing the request.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const row = await one<{ code: string }>(
      'INSERT INTO referral_codes (user_id, code) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING code',
      [userId, code],
    );
    if (row) return row.code;
  }
  throw new Error('could not allocate a referral code');
}

export interface ReferralSummary {
  code: string;
  link: string;
  signedUp: number;
  qualified: number;
  needed: number;
  rewardGranted: boolean;
  rewardDays: number;
}

export async function getReferralSummary(userId: string): Promise<ReferralSummary> {
  const code = await getOrCreateCode(userId);
  const counts = await one<{ signed_up: number; qualified: number; rewarded: number }>(
    `SELECT count(*) FILTER (WHERE status IN ('signed_up', 'qualified'))::int AS signed_up,
            count(*) FILTER (WHERE status = 'qualified')::int AS qualified,
            count(*) FILTER (WHERE rewarded_at IS NOT NULL)::int AS rewarded
       FROM referrals WHERE referrer_id = $1`,
    [userId],
  );

  const signedUp = counts?.signed_up ?? 0;
  return {
    code,
    link: `${config.publicAppUrl}/join?ref=${code}`,
    signedUp,
    qualified: counts?.qualified ?? 0,
    needed: Math.max(0, REFERRALS_FOR_REWARD - signedUp),
    rewardGranted: (counts?.rewarded ?? 0) > 0,
    rewardDays: REWARD_DAYS,
  };
}

/**
 * Called once, when a new account is created with a referral code.
 * Returns whether the referrer's reward was unlocked by this signup.
 */
export async function attachReferral(newUserId: string, code: string): Promise<boolean> {
  const owner = await one<{ user_id: string }>('SELECT user_id FROM referral_codes WHERE code = $1', [
    code.trim().toUpperCase(),
  ]);
  // Self-referral and unknown codes are simply ignored; signup still succeeds.
  if (!owner || owner.user_id === newUserId) return false;

  await query(
    `INSERT INTO referrals (referrer_id, referred_id, code, status)
     VALUES ($1, $2, $3, 'signed_up')
     ON CONFLICT (referred_id) DO NOTHING`,
    [owner.user_id, newUserId, code.trim().toUpperCase()],
  );

  const counts = await one<{ signed_up: number; rewarded: number }>(
    `SELECT count(*) FILTER (WHERE status IN ('signed_up', 'qualified'))::int AS signed_up,
            count(*) FILTER (WHERE rewarded_at IS NOT NULL)::int AS rewarded
       FROM referrals WHERE referrer_id = $1`,
    [owner.user_id],
  );

  if ((counts?.signed_up ?? 0) < REFERRALS_FOR_REWARD || (counts?.rewarded ?? 0) > 0) return false;

  await grantEntitlement({
    userId: owner.user_id,
    planCode: 'pro_monthly',
    provider: 'promo',
    providerRef: `referral:${REFERRALS_FOR_REWARD}`,
    periodEnd: new Date(Date.now() + REWARD_DAYS * 86_400_000),
  });
  await query('UPDATE referrals SET rewarded_at = now() WHERE referrer_id = $1 AND rewarded_at IS NULL', [
    owner.user_id,
  ]);
  return true;
}

export async function listReferrals(userId: string) {
  return many<{ username: string | null; display_name: string | null; status: string; created_at: Date }>(
    `SELECT p.username, p.display_name, r.status, r.created_at
       FROM referrals r LEFT JOIN profiles p ON p.user_id = r.referred_id
      WHERE r.referrer_id = $1 ORDER BY r.created_at DESC`,
    [userId],
  );
}
