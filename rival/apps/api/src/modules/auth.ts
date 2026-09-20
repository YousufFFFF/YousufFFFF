import { DEFAULT_PRIVACY } from '@rival/core';
import { isUniqueViolation, one, query, transaction } from '../db/index.ts';
import { config } from '../config.ts';
import { ApiError } from '../lib/errors.ts';
import { sendPasswordResetEmail, sendVerificationEmail } from '../lib/mail.ts';
import { hashPassword, validatePassword, verifyPassword } from '../auth/passwords.ts';
import {
  createOpaqueToken,
  hashToken,
  issueAccessToken,
  refreshTokenExpiry,
} from '../auth/tokens.ts';
import { verifyIdToken, type OAuthProvider } from '../auth/oauth.ts';
import { attachReferral } from './referrals.ts';

/**
 * Authentication.
 *
 * Email/password, Google and Apple all converge on `createSession`, so every
 * route below returns exactly the same token pair and the client has one code
 * path for being signed in.
 */

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; email: string | null; emailVerified: boolean; isAdmin: boolean };
  profile: { username: string; displayName: string; onboardingStep: string } | null;
}

const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

async function createSession(userId: string, device?: string): Promise<Session> {
  const user = await one<{ id: string; email: string | null; email_verified: boolean; is_admin: boolean; status: string }>(
    'SELECT id, email, email_verified, is_admin, status FROM users WHERE id = $1 AND deleted_at IS NULL',
    [userId],
  );
  if (!user) throw ApiError.unauthorized();
  if (user.status === 'suspended') {
    throw ApiError.forbidden('This account is suspended. Contact support.');
  }

  const refresh = createOpaqueToken();
  await query(
    'INSERT INTO refresh_tokens (user_id, token_hash, device, expires_at) VALUES ($1, $2, $3, $4)',
    [userId, refresh.hash, device ?? null, refreshTokenExpiry()],
  );

  const profile = await one<{ username: string; display_name: string; onboarding_step: string }>(
    'SELECT username, display_name, onboarding_step FROM profiles WHERE user_id = $1',
    [userId],
  );

  return {
    accessToken: issueAccessToken(user.id, user.is_admin),
    refreshToken: refresh.value,
    expiresIn: config.accessTokenTtlSeconds,
    user: { id: user.id, email: user.email, emailVerified: user.email_verified, isAdmin: user.is_admin },
    profile: profile
      ? { username: profile.username, displayName: profile.display_name, onboardingStep: profile.onboarding_step }
      : null,
  };
}

/** The rows every account needs, whichever way it was created. */
async function provisionUserRows(
  client: { query: typeof query },
  userId: string,
  seed: { username: string; displayName: string },
): Promise<void> {
  await client.query(
    'INSERT INTO profiles (user_id, username, display_name) VALUES ($1, $2, $3)',
    [userId, seed.username, seed.displayName],
  );
  await client.query(
    `INSERT INTO user_privacy (user_id, prs, workout_history, attendance, bodyweight, progress, activity_feed, gym_location)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      userId,
      DEFAULT_PRIVACY.prs,
      DEFAULT_PRIVACY.workoutHistory,
      DEFAULT_PRIVACY.attendance,
      DEFAULT_PRIVACY.bodyweight,
      DEFAULT_PRIVACY.progress,
      DEFAULT_PRIVACY.activityFeed,
      DEFAULT_PRIVACY.gymLocation,
    ],
  );
  await client.query('INSERT INTO notification_settings (user_id) VALUES ($1)', [userId]);
}

/** `muzz`, then `muzz1`, `muzz2`… until one is free. */
async function allocateUsername(client: { query: typeof query }, preferred: string): Promise<string> {
  const base =
    preferred
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 20) || 'lifter';

  for (let suffix = 0; suffix < 100; suffix++) {
    const candidate = suffix === 0 ? base : `${base}${suffix}`;
    const { rows } = await client.query('SELECT 1 FROM profiles WHERE username = $1', [candidate]);
    if (rows.length === 0) return candidate;
  }
  return `${base}${Date.now().toString(36).slice(-4)}`;
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName?: string;
  username?: string;
  referralCode?: string;
  device?: string;
}

export async function register(input: RegisterInput): Promise<Session> {
  const check = validatePassword(input.password);
  if (!check.ok) throw ApiError.badRequest(check.message);

  const passwordHash = await hashPassword(input.password);
  const displayName = input.displayName?.trim() || input.email.split('@')[0]!;

  let userId: string;
  try {
    userId = await transaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
        [input.email, passwordHash],
      );
      const id = rows[0]!.id;
      const username = await allocateUsername(client, input.username ?? displayName);
      await provisionUserRows(client, id, { username, displayName });
      return id;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw ApiError.conflict('email_taken', 'An account already uses that email.');
    }
    throw error;
  }

  await issueVerificationEmail(userId, input.email);
  if (input.referralCode) await attachReferral(userId, input.referralCode).catch(() => undefined);

  return createSession(userId, input.device);
}

export async function login(email: string, password: string, device?: string): Promise<Session> {
  const user = await one<{ id: string; password_hash: string | null }>(
    'SELECT id, password_hash FROM users WHERE email = $1 AND deleted_at IS NULL',
    [email],
  );

  // Hash even when the account does not exist, so response time does not reveal
  // whether an email is registered.
  const valid = await verifyPassword(password, user?.password_hash ?? null);
  if (!user || !valid) throw ApiError.unauthorized('Email or password is incorrect.');

  return createSession(user.id, device);
}

export async function loginWithOAuth(
  provider: OAuthProvider,
  idToken: string,
  referralCode?: string,
  device?: string,
): Promise<Session> {
  const profile = await verifyIdToken(provider, idToken);

  const linked = await one<{ user_id: string }>(
    'SELECT user_id FROM oauth_accounts WHERE provider = $1 AND provider_user_id = $2',
    [provider, profile.providerUserId],
  );
  if (linked) return createSession(linked.user_id, device);

  // An existing password account with the same verified email is linked rather
  // than duplicated, so a user who signs up twice ends up in one place.
  const byEmail =
    profile.email && profile.emailVerified
      ? await one<{ id: string }>('SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL', [profile.email])
      : null;

  if (byEmail) {
    await query(
      'INSERT INTO oauth_accounts (user_id, provider, provider_user_id, email) VALUES ($1, $2, $3, $4)',
      [byEmail.id, provider, profile.providerUserId, profile.email],
    );
    return createSession(byEmail.id, device);
  }

  const userId = await transaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      'INSERT INTO users (email, email_verified) VALUES ($1, $2) RETURNING id',
      [profile.email, profile.emailVerified],
    );
    const id = rows[0]!.id;
    const displayName = profile.displayName ?? profile.email?.split('@')[0] ?? 'Lifter';
    const username = await allocateUsername(client, displayName);
    await provisionUserRows(client, id, { username, displayName });
    await client.query(
      'INSERT INTO oauth_accounts (user_id, provider, provider_user_id, email) VALUES ($1, $2, $3, $4)',
      [id, provider, profile.providerUserId, profile.email],
    );
    return id;
  });

  if (referralCode) await attachReferral(userId, referralCode).catch(() => undefined);
  return createSession(userId, device);
}

export async function refresh(refreshToken: string, device?: string): Promise<Session> {
  const tokenHash = hashToken(refreshToken);
  const row = await one<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM refresh_tokens
      WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [tokenHash],
  );
  if (!row) throw ApiError.unauthorized('Session expired. Sign in again.');

  // Rotate: the presented token is spent, and a replay of it will now fail.
  await query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [row.id]);
  return createSession(row.user_id, device);
}

export async function logout(refreshToken: string): Promise<void> {
  await query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [
    hashToken(refreshToken),
  ]);
}

export async function logoutEverywhere(userId: string): Promise<void> {
  await query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
}

export async function issueVerificationEmail(userId: string, email: string): Promise<void> {
  const token = createOpaqueToken(32);
  await query(
    `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
     VALUES ($1, 'verify_email', $2, $3)`,
    [userId, token.hash, new Date(Date.now() + VERIFY_TOKEN_TTL_MS)],
  );
  await sendVerificationEmail(email, token.value);
}

export async function verifyEmail(token: string): Promise<void> {
  const row = await one<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM auth_tokens
      WHERE token_hash = $1 AND purpose = 'verify_email'
        AND consumed_at IS NULL AND expires_at > now()`,
    [hashToken(token)],
  );
  if (!row) throw ApiError.badRequest('That verification link is invalid or has expired.');

  await transaction(async (client) => {
    await client.query('UPDATE auth_tokens SET consumed_at = now() WHERE id = $1', [row.id]);
    await client.query('UPDATE users SET email_verified = true, updated_at = now() WHERE id = $1', [row.user_id]);
  });
}

/**
 * Always resolves, whether or not the address is registered — otherwise the
 * endpoint becomes a way to test which emails have accounts.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await one<{ id: string }>('SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL', [email]);
  if (!user) return;

  const token = createOpaqueToken(32);
  await query(
    `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
     VALUES ($1, 'reset_password', $2, $3)`,
    [user.id, token.hash, new Date(Date.now() + RESET_TOKEN_TTL_MS)],
  );
  await sendPasswordResetEmail(email, token.value);
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const check = validatePassword(newPassword);
  if (!check.ok) throw ApiError.badRequest(check.message);

  const row = await one<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM auth_tokens
      WHERE token_hash = $1 AND purpose = 'reset_password'
        AND consumed_at IS NULL AND expires_at > now()`,
    [hashToken(token)],
  );
  if (!row) throw ApiError.badRequest('That reset link is invalid or has expired.');

  const passwordHash = await hashPassword(newPassword);
  await transaction(async (client) => {
    await client.query('UPDATE auth_tokens SET consumed_at = now() WHERE id = $1', [row.id]);
    await client.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [
      row.user_id,
      passwordHash,
    ]);
    // A password reset ends every other session — that is the point of it.
    await client.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [
      row.user_id,
    ]);
  });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const check = validatePassword(newPassword);
  if (!check.ok) throw ApiError.badRequest(check.message);

  const user = await one<{ password_hash: string | null }>('SELECT password_hash FROM users WHERE id = $1', [userId]);
  // An OAuth-only account has no password to confirm; it sets one here.
  if (user?.password_hash && !(await verifyPassword(currentPassword, user.password_hash))) {
    throw ApiError.badRequest('Current password is incorrect.');
  }

  const passwordHash = await hashPassword(newPassword);
  await query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [userId, passwordHash]);
}

export { createSession };
