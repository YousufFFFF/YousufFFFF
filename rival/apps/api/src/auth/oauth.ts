import { createPublicKey, createVerify } from 'node:crypto';
import { config } from '../config.ts';

/**
 * Third-party sign-in.
 *
 * The rest of the app only knows about `OAuthProfile`. Adding a provider means
 * adding a verifier here — no route, service or table changes. Google and Apple
 * both issue standard OIDC ID tokens, so one RS256 verifier covers both; only
 * the issuer, audience and JWKS endpoint differ.
 */

export type OAuthProvider = 'google' | 'apple';

export interface OAuthProfile {
  provider: OAuthProvider;
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
}

export class OAuthNotConfiguredError extends Error {
  readonly provider: OAuthProvider;

  constructor(provider: OAuthProvider) {
    super(`${provider} sign-in is not configured on this deployment`);
    this.name = 'OAuthNotConfiguredError';
    this.provider = provider;
  }
}

export class OAuthVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OAuthVerificationError';
  }
}

interface ProviderSpec {
  issuers: string[];
  jwksUri: string;
  clientId: () => string;
}

const PROVIDERS: Record<OAuthProvider, ProviderSpec> = {
  google: {
    issuers: ['https://accounts.google.com', 'accounts.google.com'],
    jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
    clientId: () => config.oauth.google.clientId,
  },
  apple: {
    issuers: ['https://appleid.apple.com'],
    jwksUri: 'https://appleid.apple.com/auth/keys',
    clientId: () => config.oauth.apple.clientId,
  },
};

export function isProviderConfigured(provider: OAuthProvider): boolean {
  return PROVIDERS[provider].clientId().length > 0;
}

interface Jwk {
  kid: string;
  kty: string;
  n?: string;
  e?: string;
  alg?: string;
}

const jwksCache = new Map<string, { keys: Jwk[]; fetchedAt: number }>();
const JWKS_TTL_MS = 60 * 60 * 1000;

async function fetchJwks(uri: string): Promise<Jwk[]> {
  const cached = jwksCache.get(uri);
  if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.keys;

  const response = await fetch(uri);
  if (!response.ok) throw new OAuthVerificationError(`could not fetch signing keys (${response.status})`);
  const body = (await response.json()) as { keys: Jwk[] };
  jwksCache.set(uri, { keys: body.keys, fetchedAt: Date.now() });
  return body.keys;
}

interface IdTokenClaims {
  iss: string;
  aud: string | string[];
  sub: string;
  exp: number;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
}

function decodeSegment<T>(segment: string): T {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T;
}

/**
 * Verify a provider ID token and reduce it to the fields RIVAL stores.
 * Signature, issuer, audience and expiry are all checked; an unverified token
 * never creates an account.
 */
export async function verifyIdToken(provider: OAuthProvider, idToken: string): Promise<OAuthProfile> {
  const spec = PROVIDERS[provider];
  const clientId = spec.clientId();
  if (!clientId) throw new OAuthNotConfiguredError(provider);

  const parts = idToken.split('.');
  if (parts.length !== 3) throw new OAuthVerificationError('malformed id token');
  const [headerSegment, payloadSegment, signatureSegment] = parts as [string, string, string];

  const header = decodeSegment<{ kid?: string; alg?: string }>(headerSegment);
  if (header.alg !== 'RS256') throw new OAuthVerificationError('unsupported token algorithm');

  const keys = await fetchJwks(spec.jwksUri);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new OAuthVerificationError('unknown signing key');

  const publicKey = createPublicKey({ key: jwk as never, format: 'jwk' });
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${headerSegment}.${payloadSegment}`);
  if (!verifier.verify(publicKey, Buffer.from(signatureSegment, 'base64url'))) {
    throw new OAuthVerificationError('invalid token signature');
  }

  const claims = decodeSegment<IdTokenClaims>(payloadSegment);
  if (!spec.issuers.includes(claims.iss)) throw new OAuthVerificationError('unexpected token issuer');

  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(clientId)) throw new OAuthVerificationError('token was not issued for this app');
  if (claims.exp * 1000 <= Date.now()) throw new OAuthVerificationError('token has expired');

  return {
    provider,
    providerUserId: claims.sub,
    email: claims.email ?? null,
    // Apple sends this as the string "true"; Google as a boolean.
    emailVerified: claims.email_verified === true || claims.email_verified === 'true',
    displayName: claims.name ?? null,
  };
}
