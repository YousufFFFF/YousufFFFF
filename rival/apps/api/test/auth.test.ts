import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import { createUser, request, resetRateLimits, teardown } from './helpers.ts';

// Every request here arrives from the same address, so the shared window would
// trip after a few fixtures. The limiter has a test of its own below.
beforeEach(resetRateLimits);
after(teardown);

describe('registration', () => {
  it('creates an account with tokens and a profile', async () => {
    const response = await request<{ accessToken: string; refreshToken: string; profile: { username: string } }>(
      'POST',
      '/v1/auth/register',
      { body: { email: 'new.lifter@example.test', password: 'StrongPass1', displayName: 'New Lifter' } },
    );
    assert.equal(response.status, 201);
    assert.ok(response.body.accessToken);
    assert.ok(response.body.refreshToken);
    assert.equal(response.body.profile.username, 'newlifter');
  });

  it('rejects a weak password', async () => {
    const response = await request<{ error: { message: string } }>('POST', '/v1/auth/register', {
      body: { email: 'weak@example.test', password: 'short' },
    });
    assert.equal(response.status, 400);
    assert.match(response.body.error.message, /at least 8 characters/);
  });

  it('rejects a password with no digit', async () => {
    const response = await request<{ error: { message: string } }>('POST', '/v1/auth/register', {
      body: { email: 'nodigit@example.test', password: 'alphabetical' },
    });
    assert.equal(response.status, 400);
    assert.match(response.body.error.message, /letter and one number/);
  });

  it('refuses a duplicate email', async () => {
    const body = { email: 'dupe@example.test', password: 'StrongPass1' };
    await request('POST', '/v1/auth/register', { body });
    const second = await request<{ error: { code: string } }>('POST', '/v1/auth/register', { body });
    assert.equal(second.status, 409);
    assert.equal(second.body.error.code, 'email_taken');
  });

  it('gives the second person with the same name a free username', async () => {
    await request('POST', '/v1/auth/register', {
      body: { email: 'twin1@example.test', password: 'StrongPass1', displayName: 'Twin' },
    });
    const second = await request<{ profile: { username: string } }>('POST', '/v1/auth/register', {
      body: { email: 'twin2@example.test', password: 'StrongPass1', displayName: 'Twin' },
    });
    assert.equal(second.body.profile.username, 'twin1');
  });

  it('starts every account with private bodyweight', async () => {
    const user = await createUser();
    const me = await request<{ privacy: { bodyweight: string; prs: string } }>('GET', '/v1/me', {
      token: user.accessToken,
    });
    assert.equal(me.body.privacy.bodyweight, 'private');
    assert.equal(me.body.privacy.prs, 'connections');
  });
});

describe('sign in', () => {
  it('accepts the right password', async () => {
    await request('POST', '/v1/auth/register', {
      body: { email: 'signin@example.test', password: 'StrongPass1' },
    });
    const response = await request<{ accessToken: string }>('POST', '/v1/auth/login', {
      body: { email: 'signin@example.test', password: 'StrongPass1' },
    });
    assert.equal(response.status, 200);
    assert.ok(response.body.accessToken);
  });

  it('rejects the wrong password', async () => {
    const response = await request('POST', '/v1/auth/login', {
      body: { email: 'signin@example.test', password: 'WrongPass1' },
    });
    assert.equal(response.status, 401);
  });

  it('gives an unknown address the same answer as a wrong password', async () => {
    const unknown = await request<{ error: { message: string } }>('POST', '/v1/auth/login', {
      body: { email: 'nobody@example.test', password: 'StrongPass1' },
    });
    assert.equal(unknown.status, 401);
    assert.equal(unknown.body.error.message, 'Email or password is incorrect.');
  });
});

describe('tokens', () => {
  it('refuses an authenticated route without a token', async () => {
    const response = await request('GET', '/v1/me');
    assert.equal(response.status, 401);
  });

  it('refuses a forged token', async () => {
    const response = await request('GET', '/v1/me', { token: 'not.a.token' });
    assert.equal(response.status, 401);
  });

  it('exchanges a refresh token for a new session', async () => {
    const user = await createUser();
    const response = await request<{ accessToken: string; refreshToken: string }>('POST', '/v1/auth/refresh', {
      body: { refreshToken: user.refreshToken },
    });
    assert.equal(response.status, 200);
    assert.notEqual(response.body.refreshToken, user.refreshToken);
  });

  it('spends a refresh token on use, so a replay fails', async () => {
    const user = await createUser();
    await request('POST', '/v1/auth/refresh', { body: { refreshToken: user.refreshToken } });
    const replay = await request('POST', '/v1/auth/refresh', { body: { refreshToken: user.refreshToken } });
    assert.equal(replay.status, 401);
  });

  it('invalidates a refresh token on logout', async () => {
    const user = await createUser();
    const out = await request('POST', '/v1/auth/logout', { body: { refreshToken: user.refreshToken } });
    assert.equal(out.status, 204);
    const after = await request('POST', '/v1/auth/refresh', { body: { refreshToken: user.refreshToken } });
    assert.equal(after.status, 401);
  });
});

describe('password reset', () => {
  it('answers the same whether or not the address exists', async () => {
    const known = await request('POST', '/v1/auth/forgot-password', { body: { email: 'signin@example.test' } });
    const unknown = await request('POST', '/v1/auth/forgot-password', { body: { email: 'ghost@example.test' } });
    assert.equal(known.status, 204);
    assert.equal(unknown.status, 204);
  });

  it('rejects an unknown reset token', async () => {
    const response = await request('POST', '/v1/auth/reset-password', {
      body: { token: 'made-up', password: 'StrongPass1' },
    });
    assert.equal(response.status, 400);
  });
});

describe('rate limiting', () => {
  it('stops repeated sign-in attempts against one account', async () => {
    resetRateLimits();
    const body = { email: 'bruteforce@example.test', password: 'WrongPass1' };
    let limited = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      const response = await request<{ error: { code: string } }>('POST', '/v1/auth/login', { body });
      if (response.status === 429) {
        limited = true;
        break;
      }
    }
    assert.ok(limited, 'expected sign-in attempts to be rate limited');
  });

  it('stops repeated registrations from one address', async () => {
    resetRateLimits();
    let limited = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      const response = await request('POST', '/v1/auth/register', {
        body: { email: `flood${attempt}@example.test`, password: 'StrongPass1' },
      });
      if (response.status === 429) {
        limited = true;
        break;
      }
    }
    assert.ok(limited, 'expected registrations to be rate limited');
  });
});

describe('oauth', () => {
  it('reports which providers this deployment has configured', async () => {
    const response = await request<{ email: boolean; google: boolean; apple: boolean }>('GET', '/v1/auth/providers');
    assert.equal(response.body.email, true);
    assert.equal(response.body.google, false); // no client id in the test env
  });

  it('says so rather than half-working when a provider is unconfigured', async () => {
    const response = await request<{ error: { code: string } }>('POST', '/v1/auth/oauth/google', {
      body: { idToken: 'anything' },
    });
    assert.equal(response.status, 501);
    assert.equal(response.body.error.code, 'not_implemented');
  });
});

describe('account deletion', () => {
  it('needs an explicit confirmation', async () => {
    const user = await createUser();
    const without = await request('DELETE', '/v1/auth/account', { token: user.accessToken, body: {} });
    assert.equal(without.status, 400);
  });

  it('removes the account and everything hanging off it', async () => {
    const user = await createUser();
    const response = await request('DELETE', '/v1/auth/account', {
      token: user.accessToken,
      body: { confirm: 'DELETE' },
    });
    assert.equal(response.status, 204);

    const { query } = await import('./helpers.ts');
    const rows = await query('SELECT 1 FROM users WHERE id = $1', [user.id]);
    assert.equal(rows.rowCount, 0);
    const profiles = await query('SELECT 1 FROM profiles WHERE user_id = $1', [user.id]);
    assert.equal(profiles.rowCount, 0);
  });
});
