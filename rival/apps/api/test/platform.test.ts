import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import { connect, createUser, logLift, makeAdmin, query, request, resetRateLimits, teardown } from './helpers.ts';

/** Admin dashboard, subscriptions, referrals and share cards. */

beforeEach(resetRateLimits);
after(teardown);

describe('admin access', () => {
  it('refuses a normal user', async () => {
    const user = await createUser();
    const response = await request('GET', '/v1/admin/metrics', { token: user.accessToken });
    assert.equal(response.status, 403);
  });

  it('refuses an anonymous caller', async () => {
    const response = await request('GET', '/v1/admin/metrics');
    assert.equal(response.status, 401);
  });

  it('reports the platform numbers to an admin', async () => {
    const admin = await createUser({ username: 'metricsadmin' });
    const token = await makeAdmin(admin);
    const lifter = await createUser({ username: 'metricslifter' });
    await logLift(lifter, 'bench-press', [{ weight: 80, reps: 5 }]);

    const response = await request<{
      metrics: {
        users: { total: number };
        training: { workoutsLogged: number; prsAchieved: number };
        active: { daily: number };
        revenue: { currency: string };
      };
      trends: { day: string; workouts: number }[];
    }>('GET', '/v1/admin/metrics', { token });

    assert.equal(response.status, 200);
    assert.ok(response.body.metrics.users.total >= 2);
    assert.ok(response.body.metrics.training.workoutsLogged >= 1);
    assert.ok(response.body.metrics.training.prsAchieved >= 1);
    assert.equal(response.body.trends.length, 30);
  });

  it('lists and suspends users', async () => {
    const admin = await createUser({ username: 'modadmin' });
    const token = await makeAdmin(admin);
    const pest = await createUser({ username: 'modpest' });

    const list = await request<{ username: string }[]>('GET', '/v1/admin/users?search=modpest', { token });
    assert.equal(list.body[0]!.username, 'modpest');

    const suspended = await request('PATCH', `/v1/admin/users/${pest.id}`, {
      token,
      body: { status: 'suspended' },
    });
    assert.equal(suspended.status, 204);

    // A suspended account cannot start a new session.
    const signIn = await request<{ error: { code: string } }>('POST', '/v1/auth/login', {
      body: { email: pest.email, password: 'StrongPass1' },
    });
    assert.equal(signIn.status, 403);
  });

  it('surfaces reports and records their resolution', async () => {
    const admin = await createUser({ username: 'repadmin' });
    const token = await makeAdmin(admin);
    const reporter = await createUser({ username: 'reporter1' });
    const target = await createUser({ username: 'target1' });

    const filed = await request<{ id: string }>('POST', '/v1/reports', {
      token: reporter.accessToken,
      body: { userId: target.id, reason: 'harassment' },
    });

    const open = await request<{ id: string; reason: string; reported_username: string }[]>(
      'GET',
      '/v1/admin/reports',
      { token },
    );
    const found = open.body.find((r) => r.id === filed.body.id)!;
    assert.equal(found.reason, 'harassment');
    assert.equal(found.reported_username, 'target1');

    const resolved = await request('PATCH', `/v1/admin/reports/${filed.body.id}`, {
      token,
      body: { status: 'resolved', resolution: 'Warned the user.' },
    });
    assert.equal(resolved.status, 204);

    const stillOpen = await request<{ id: string }[]>('GET', '/v1/admin/reports', { token });
    assert.equal(stillOpen.body.some((r) => r.id === filed.body.id), false);
  });

  it('writes an audit entry for every moderation action', async () => {
    const admin = await createUser({ username: 'auditadmin' });
    const token = await makeAdmin(admin);
    const target = await createUser({ username: 'audittarget' });

    await request('PATCH', `/v1/admin/users/${target.id}`, { token, body: { status: 'suspended' } });

    const log = await request<{ action: string; target_id: string; admin_username: string }[]>(
      'GET',
      '/v1/admin/audit-log',
      { token },
    );
    const entry = log.body.find((row) => row.target_id === target.id)!;
    assert.equal(entry.action, 'user.status');
    assert.equal(entry.admin_username, 'auditadmin');
  });

  it('adds an exercise to the shared library', async () => {
    const admin = await createUser({ username: 'exadmin' });
    const token = await makeAdmin(admin);

    const created = await request('PUT', '/v1/admin/exercises', {
      token,
      body: { slug: 'zercher-squat', name: 'Zercher Squat', categorySlug: 'legs', equipment: 'barbell', isCompound: true },
    });
    assert.equal(created.status, 200);

    const lifter = await createUser({ username: 'exlifter' });
    const list = await request<{ slug: string }[]>('GET', '/v1/exercises?q=zercher', { token: lifter.accessToken });
    assert.equal(list.body[0]!.slug, 'zercher-squat');
  });
});

describe('subscriptions', () => {
  it('lists the free and pro plans with placeholder pricing', async () => {
    const response = await request<{
      plans: { code: string; price_minor: number; currency: string; interval: string }[];
      provider: string;
    }>('GET', '/v1/subscription/plans');

    const monthly = response.body.plans.find((p) => p.code === 'pro_monthly')!;
    assert.equal(monthly.price_minor, 19_900); // ₹199.00
    assert.equal(monthly.currency, 'INR');
    const yearly = response.body.plans.find((p) => p.code === 'pro_yearly')!;
    assert.equal(yearly.price_minor, 149_900); // ₹1,499.00
    assert.equal(response.body.provider, 'none');
  });

  it('starts everyone on the free tier', async () => {
    const user = await createUser();
    const response = await request<{ isPro: boolean }>('GET', '/v1/me/subscription', { token: user.accessToken });
    assert.equal(response.body.isPro, false);
  });

  it('gates a pro analytic behind a 402 the client can act on', async () => {
    const user = await createUser();
    const response = await request<{ error: { code: string; message: string } }>('GET', '/v1/me/analytics', {
      token: user.accessToken,
    });
    assert.equal(response.status, 402);
    assert.equal(response.body.error.code, 'requires_pro');
    assert.match(response.body.error.message, /RIVAL PRO/);
  });

  it('opens the gate once an entitlement is granted', async () => {
    const user = await createUser();
    const { grantEntitlement } = await import('../src/modules/subscriptions.ts');
    await grantEntitlement({
      userId: user.id,
      planCode: 'pro_monthly',
      provider: 'promo',
      periodEnd: new Date(Date.now() + 30 * 86_400_000),
    });

    const status = await request<{ isPro: boolean; plan: { code: string } }>('GET', '/v1/me/subscription', {
      token: user.accessToken,
    });
    assert.equal(status.body.isPro, true);
    assert.equal(status.body.plan.code, 'pro_monthly');

    const analytics = await request('GET', '/v1/me/analytics', { token: user.accessToken });
    assert.equal(analytics.status, 200);
  });

  it('treats a lapsed period as not pro', async () => {
    const user = await createUser();
    const { grantEntitlement } = await import('../src/modules/subscriptions.ts');
    await grantEntitlement({
      userId: user.id,
      planCode: 'pro_monthly',
      provider: 'promo',
      periodEnd: new Date(Date.now() - 86_400_000),
    });
    const status = await request<{ isPro: boolean }>('GET', '/v1/me/subscription', { token: user.accessToken });
    assert.equal(status.body.isPro, false);
  });

  it('says so rather than pretending when no payment provider is configured', async () => {
    const user = await createUser();
    const response = await request<{ action: { kind: string; reason: string } }>('POST', '/v1/subscription/checkout', {
      token: user.accessToken,
      body: { planCode: 'pro_monthly' },
    });
    assert.equal(response.body.action.kind, 'unavailable');
    assert.match(response.body.action.reason, /No payment provider is configured/);
  });

  it('refuses to process a webhook it cannot verify', async () => {
    const response = await request<{ error: { code: string } }>('POST', '/v1/subscription/webhook/stripe', {
      body: { type: 'checkout.session.completed' },
    });
    assert.equal(response.status, 501);
  });
});

describe('referrals', () => {
  it('issues a stable code and link, with counts derived from real signups', async () => {
    const user = await createUser({ username: 'referrer1' });
    const first = await request<{ code: string; link: string; signedUp: number; needed: number }>(
      'GET',
      '/v1/me/referrals',
      { token: user.accessToken },
    );
    assert.match(first.body.code, /^[A-Z2-9]{6}$/);
    assert.ok(first.body.link.includes(first.body.code));
    assert.equal(first.body.signedUp, 0, 'a new account has no invented referral count');
    assert.equal(first.body.needed, 3);

    const second = await request<{ code: string }>('GET', '/v1/me/referrals', { token: user.accessToken });
    assert.equal(second.body.code, first.body.code);
  });

  it('counts a signup that used the code, and rewards at three', async () => {
    const referrer = await createUser({ username: 'referrer2' });
    const summary = await request<{ code: string }>('GET', '/v1/me/referrals', { token: referrer.accessToken });

    for (let i = 0; i < 3; i++) {
      resetRateLimits();
      const response = await request('POST', '/v1/auth/register', {
        body: {
          email: `invited${i}@example.test`,
          password: 'StrongPass1',
          displayName: `Invited ${i}`,
          referralCode: summary.body.code,
        },
      });
      assert.equal(response.status, 201);
    }

    const after = await request<{ signedUp: number; rewardGranted: boolean; rewardDays: number }>(
      'GET',
      '/v1/me/referrals',
      { token: referrer.accessToken },
    );
    assert.equal(after.body.signedUp, 3);
    assert.equal(after.body.rewardGranted, true);

    const subscription = await request<{ isPro: boolean; provider: string }>('GET', '/v1/me/subscription', {
      token: referrer.accessToken,
    });
    assert.equal(subscription.body.isPro, true);
    assert.equal(subscription.body.provider, 'promo');
  });

  it('ignores an unknown code rather than failing the signup', async () => {
    resetRateLimits();
    const response = await request('POST', '/v1/auth/register', {
      body: { email: 'badcode@example.test', password: 'StrongPass1', referralCode: 'ZZZZZZ' },
    });
    assert.equal(response.status, 201);
  });
});

describe('share cards', () => {
  it('renders an SVG card for a PR', async () => {
    const user = await createUser({ username: 'sharer1', displayName: 'Muzz' });
    await logLift(user, 'bench-press', [{ weight: 90, reps: 1 }]);
    await logLift(user, 'bench-press', [{ weight: 95, reps: 1 }]);

    const { rows } = await query<{ id: string }>(
      `SELECT h.id FROM pr_history h
        WHERE h.user_id = $1 AND h.pr_type = 'weight'
        ORDER BY h.achieved_at DESC LIMIT 1`,
      [user.id],
    );

    const card = await request<{ data: { value: number }; caption: string; formats: { format: string }[] }>(
      'GET',
      `/v1/share/pr/${rows[0]!.id}`,
      { token: user.accessToken },
    );
    assert.match(card.body.caption, /New Bench Press PR: 95 kg \(\+5 kg\)/);
    assert.deepEqual(card.body.formats.map((f) => f.format), ['story', 'square', 'compact']);

    const svg = await request<string>('GET', `/v1/share/pr/${rows[0]!.id}.svg?format=story`, {
      token: user.accessToken,
    });
    assert.equal(svg.status, 200);
    assert.match(svg.body, /^<svg xmlns/);
    assert.match(svg.body, /width="1080" height="1920"/);
    assert.match(svg.body, />95</);
    assert.match(svg.body, />MUZZ</);
    assert.match(svg.body, />\+5 KG</);
  });

  it('will not render someone else PR card', async () => {
    const owner = await createUser({ username: 'cardowner' });
    const nosy = await createUser({ username: 'cardnosy' });
    await connect(owner, nosy);
    await logLift(owner, 'squat', [{ weight: 120, reps: 1 }]);

    const { rows } = await query<{ id: string }>('SELECT id FROM pr_history WHERE user_id = $1 LIMIT 1', [owner.id]);
    const response = await request('GET', `/v1/share/pr/${rows[0]!.id}`, { token: nosy.accessToken });
    assert.equal(response.status, 404);
  });
});

describe('empty states', () => {
  it('tells a brand new user there is nothing yet, with somewhere to go', async () => {
    const user = await createUser();
    const home = await request<{ cards: { kind: string; title: string; cta: { action: string } | null }[] }>(
      'GET',
      '/v1/home',
      { token: user.accessToken },
    );

    const empty = home.body.cards[0]!;
    assert.equal(empty.kind, 'no_rivals');
    assert.equal(empty.title, 'No rivals yet');
    assert.equal(empty.cta!.action, 'connections.search');

    assert.ok(home.body.cards.some((c) => c.kind === 'log_workout'));

    const workouts = await request<unknown[]>('GET', '/v1/workouts', { token: user.accessToken });
    assert.deepEqual(workouts.body, []);

    const rivals = await request<unknown[]>('GET', '/v1/rivals', { token: user.accessToken });
    assert.deepEqual(rivals.body, []);
  });
});
