/**
 * Runtime configuration.
 *
 * Everything secret is read from the environment, once, at boot. Nothing in
 * here is ever serialised into an API response or a client bundle.
 */

function required(name: string, fallbackInDev?: string): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV !== 'production' && fallbackInDev !== undefined) return fallbackInDev;
  throw new Error(`Missing required environment variable ${name}`);
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) throw new Error(`${name} must be an integer`);
  return parsed;
}

export type PaymentProvider = 'stripe' | 'revenuecat' | 'apple' | 'google' | 'none';
export type PushTransport = 'expo' | 'fcm' | 'none';
export type MailTransport = 'console' | 'smtp';

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: int('PORT', 4000),
  host: process.env.HOST ?? '0.0.0.0',

  databaseUrl: required('DATABASE_URL', 'postgres://postgres@localhost:5432/rival'),

  // A random dev fallback keeps `npm run dev` working without setup while
  // guaranteeing production refuses to boot without a real secret.
  jwtSecret: required('JWT_SECRET', 'dev-only-insecure-secret-change-me'),
  accessTokenTtlSeconds: int('ACCESS_TOKEN_TTL_SECONDS', 900),
  refreshTokenTtlDays: int('REFRESH_TOKEN_TTL_DAYS', 60),

  publicAppUrl: process.env.PUBLIC_APP_URL ?? 'http://localhost:3000',

  oauth: {
    google: { clientId: process.env.GOOGLE_CLIENT_ID ?? '' },
    apple: { clientId: process.env.APPLE_CLIENT_ID ?? '' },
  },

  mail: {
    transport: (process.env.MAIL_TRANSPORT ?? 'console') as MailTransport,
    from: process.env.MAIL_FROM ?? 'no-reply@rival.app',
  },

  payments: {
    provider: (process.env.PAYMENT_PROVIDER ?? 'none') as PaymentProvider,
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET ?? '',
  },

  push: {
    transport: (process.env.PUSH_TRANSPORT ?? 'none') as PushTransport,
    expoAccessToken: process.env.EXPO_ACCESS_TOKEN ?? '',
    fcmServerKey: process.env.FCM_SERVER_KEY ?? '',
  },
} as const;

/** Fails loudly at boot rather than quietly at 3 a.m. */
export function assertProductionConfig(): void {
  if (!config.isProduction) return;
  if (config.jwtSecret === 'dev-only-insecure-secret-change-me' || config.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be set to at least 32 characters in production');
  }
  if (config.payments.provider !== 'none' && !config.payments.webhookSecret) {
    throw new Error('PAYMENT_WEBHOOK_SECRET is required when a payment provider is configured');
  }
}
