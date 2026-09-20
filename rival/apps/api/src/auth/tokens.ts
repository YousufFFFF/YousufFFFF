import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config.ts';

/**
 * Access and refresh tokens.
 *
 * Access tokens are stateless HS256 JWTs, short-lived and never stored.
 * Refresh tokens are long random strings; only their SHA-256 reaches the
 * database, so a dump of `refresh_tokens` cannot be replayed.
 */

export interface AccessTokenClaims {
  sub: string;
  admin: boolean;
  iat: number;
  exp: number;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(data: string): string {
  return createHmac('sha256', config.jwtSecret).update(data).digest('base64url');
}

export function issueAccessToken(userId: string, isAdmin: boolean, now = Date.now()): string {
  const issuedAt = Math.floor(now / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      sub: userId,
      admin: isAdmin,
      iat: issuedAt,
      exp: issuedAt + config.accessTokenTtlSeconds,
    } satisfies AccessTokenClaims),
  );
  return `${header}.${payload}.${sign(`${header}.${payload}`)}`;
}

/** Returns the claims, or `null` for anything malformed, forged or expired. */
export function verifyAccessToken(token: string, now = Date.now()): AccessTokenClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts as [string, string, string];

  const expected = Buffer.from(sign(`${header}.${payload}`));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AccessTokenClaims;
    if (typeof claims.sub !== 'string' || typeof claims.exp !== 'number') return null;
    if (claims.exp * 1000 <= now) return null;
    return claims;
  } catch {
    return null;
  }
}

export interface OpaqueToken {
  /** Sent to the client — never stored. */
  value: string;
  /** Stored — never sent. */
  hash: string;
}

export function createOpaqueToken(bytes = 48): OpaqueToken {
  const value = randomBytes(bytes).toString('base64url');
  return { value, hash: hashToken(value) };
}

export function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function refreshTokenExpiry(now = new Date()): Date {
  return new Date(now.getTime() + config.refreshTokenTtlDays * 86_400_000);
}
