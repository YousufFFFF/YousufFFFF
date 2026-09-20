import type { FastifyInstance } from 'fastify';
import { requireUser } from '../server.ts';
import { ApiError } from '../lib/errors.ts';
import { RATE_LIMITS, consume } from '../lib/rate-limit.ts';
import { email, parse, username as usernameSchema, z } from '../lib/validation.ts';
import * as auth from '../modules/auth.ts';
import { deleteAccount, isUsernameAvailable } from '../modules/users.ts';
import { isProviderConfigured, OAuthNotConfiguredError, OAuthVerificationError } from '../auth/oauth.ts';

const registerBody = z.object({
  email,
  password: z.string(),
  displayName: z.string().trim().min(1).max(60).optional(),
  username: usernameSchema.optional(),
  referralCode: z.string().trim().max(16).optional(),
});

const loginBody = z.object({ email, password: z.string() });

export function authRoutes(app: FastifyInstance): void {
  app.post('/v1/auth/register', async (request, reply) => {
    if (!(await consume(`register:${request.ip}`, RATE_LIMITS.register))) throw ApiError.tooManyRequests();
    const body = parse(registerBody, request.body);
    const session = await auth.register({ ...body, device: request.headers['user-agent'] });
    reply.code(201);
    return session;
  });

  app.post('/v1/auth/login', async (request) => {
    const body = parse(loginBody, request.body);
    // Limit per address and per IP: one stops credential stuffing against a
    // single account, the other stops a spray across many.
    const withinAccount = await consume(`login:${body.email}`, RATE_LIMITS.login);
    const withinIp = await consume(`login:ip:${request.ip}`, RATE_LIMITS.login);
    if (!withinAccount || !withinIp) throw ApiError.tooManyRequests();

    return auth.login(body.email, body.password, request.headers['user-agent']);
  });

  app.post('/v1/auth/oauth/:provider', async (request) => {
    const { provider } = parse(z.object({ provider: z.enum(['google', 'apple']) }), request.params);
    const body = parse(
      z.object({ idToken: z.string().min(1), referralCode: z.string().trim().max(16).optional() }),
      request.body,
    );

    if (!isProviderConfigured(provider)) {
      throw ApiError.notImplemented(`${provider} sign-in is not configured on this deployment.`);
    }

    try {
      return await auth.loginWithOAuth(provider, body.idToken, body.referralCode, request.headers['user-agent']);
    } catch (error) {
      if (error instanceof OAuthNotConfiguredError) throw ApiError.notImplemented(error.message);
      if (error instanceof OAuthVerificationError) throw ApiError.unauthorized(error.message);
      throw error;
    }
  });

  app.get('/v1/auth/providers', async () => ({
    email: true,
    google: isProviderConfigured('google'),
    apple: isProviderConfigured('apple'),
  }));

  app.post('/v1/auth/refresh', async (request) => {
    const body = parse(z.object({ refreshToken: z.string().min(1) }), request.body);
    return auth.refresh(body.refreshToken, request.headers['user-agent']);
  });

  app.post('/v1/auth/logout', async (request, reply) => {
    const body = parse(z.object({ refreshToken: z.string().min(1) }), request.body);
    await auth.logout(body.refreshToken);
    reply.code(204);
  });

  app.post('/v1/auth/logout-everywhere', async (request, reply) => {
    await auth.logoutEverywhere(requireUser(request));
    reply.code(204);
  });

  app.post('/v1/auth/verify-email', async (request, reply) => {
    const body = parse(z.object({ token: z.string().min(1) }), request.body);
    await auth.verifyEmail(body.token);
    reply.code(204);
  });

  app.post('/v1/auth/resend-verification', async (request, reply) => {
    const userId = requireUser(request);
    const { one } = await import('../db/index.ts');
    const user = await one<{ email: string | null; email_verified: boolean }>(
      'SELECT email, email_verified FROM users WHERE id = $1',
      [userId],
    );
    if (!user?.email) throw ApiError.badRequest('This account has no email address.');
    if (user.email_verified) throw ApiError.badRequest('Your email is already verified.');
    await auth.issueVerificationEmail(userId, user.email);
    reply.code(204);
  });

  app.post('/v1/auth/forgot-password', async (request, reply) => {
    const body = parse(z.object({ email }), request.body);
    if (!(await consume(`reset:${body.email}`, RATE_LIMITS.passwordReset))) throw ApiError.tooManyRequests();
    await auth.requestPasswordReset(body.email);
    // 204 whether or not the address exists — see requestPasswordReset.
    reply.code(204);
  });

  app.post('/v1/auth/reset-password', async (request, reply) => {
    const body = parse(z.object({ token: z.string().min(1), password: z.string() }), request.body);
    await auth.resetPassword(body.token, body.password);
    reply.code(204);
  });

  app.post('/v1/auth/change-password', async (request, reply) => {
    const userId = requireUser(request);
    const body = parse(
      z.object({ currentPassword: z.string().default(''), newPassword: z.string() }),
      request.body,
    );
    await auth.changePassword(userId, body.currentPassword, body.newPassword);
    reply.code(204);
  });

  app.get('/v1/auth/username-available', async (request) => {
    const { username } = parse(z.object({ username: usernameSchema }), request.query);
    return { username, available: await isUsernameAvailable(username) };
  });

  app.delete('/v1/auth/account', async (request, reply) => {
    const userId = requireUser(request);
    // Deleting is destructive and irreversible, so it takes an explicit
    // confirmation rather than happening on a stray DELETE.
    const body = parse(z.object({ confirm: z.literal('DELETE') }), request.body ?? {});
    void body;
    await deleteAccount(userId);
    reply.code(204);
  });
}
