import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import { connect, createUser, logLift, request, resetRateLimits, teardown } from './helpers.ts';

/**
 * The core product rule: competition is private and connection-based.
 * Nothing detailed is visible, comparable or leaderboarded between two people
 * who have not both accepted.
 */

beforeEach(resetRateLimits);
after(teardown);

describe('before a connection is accepted', () => {
  it('shows identity in search but no statistics', async () => {
    const muzz = await createUser({ username: 'privmuzz', displayName: 'Muzz' });
    const stranger = await createUser({ username: 'privstranger', displayName: 'Stranger' });
    await logLift(stranger, 'bench-press', [{ weight: 100, reps: 1 }]);

    const results = await request<{ username: string; connected: boolean }[]>(
      'GET',
      '/v1/users/search?q=privstranger',
      { token: muzz.accessToken },
    );
    assert.equal(results.body.length, 1);
    assert.equal(results.body[0]!.connected, false);

    const profile = await request<{ stats: Record<string, number>; connected: boolean }>(
      'GET',
      '/v1/users/privstranger',
      { token: muzz.accessToken },
    );
    assert.equal(profile.body.connected, false);
    assert.deepEqual(profile.body.stats, {}, 'a stranger sees no numbers at all');
  });

  it('has no rivalry to open', async () => {
    const muzz = await createUser({ username: 'norivmuzz' });
    const stranger = await createUser({ username: 'norivstranger' });
    const response = await request('GET', `/v1/rivals/${stranger.id}`, { token: muzz.accessToken });
    assert.equal(response.status, 404);
  });

  it('keeps them off every leaderboard', async () => {
    const muzz = await createUser({ username: 'lbmuzz' });
    const stranger = await createUser({ username: 'lbstranger' });
    await logLift(stranger, 'bench-press', [{ weight: 200, reps: 1 }]);
    await logLift(muzz, 'bench-press', [{ weight: 60, reps: 1 }]);

    const board = await request<{ entries: { username: string }[] }>('GET', '/v1/leaderboards/strength', {
      token: muzz.accessToken,
    });
    assert.equal(board.body.entries.some((e) => e.username === 'lbstranger'), false);
    assert.equal(board.body.entries.some((e) => e.username === 'lbmuzz'), true);
  });

  it('hides their workouts', async () => {
    const muzz = await createUser({ username: 'wkmuzz' });
    const stranger = await createUser({ username: 'wkstranger' });
    const session = await logLift(stranger, 'bench-press', [{ weight: 100, reps: 1 }]);

    const response = await request('GET', `/v1/workouts/${session.session.id}`, { token: muzz.accessToken });
    assert.equal(response.status, 403);
  });

  it('refuses a challenge', async () => {
    const muzz = await createUser({ username: 'chmuzz' });
    const stranger = await createUser({ username: 'chstranger' });
    const response = await request<{ error: { code: string } }>('POST', '/v1/challenges', {
      token: muzz.accessToken,
      body: { opponentId: stranger.id, type: 'consistency', deadline: '2030-01-01' },
    });
    assert.equal(response.status, 403);
  });
});

describe('after both accept', () => {
  it('opens the comparison', async () => {
    const muzz = await createUser({ username: 'conmuzz', displayName: 'Muzz' });
    const rahul = await createUser({ username: 'conrahul', displayName: 'Rahul' });
    await logLift(muzz, 'bench-press', [{ weight: 90, reps: 1 }]);
    await logLift(rahul, 'bench-press', [{ weight: 95, reps: 1 }]);
    await connect(muzz, rahul);

    const rivalry = await request<{ comparable: boolean; battles: { outcome: string }[] }>(
      'GET',
      `/v1/rivals/${rahul.id}`,
      { token: muzz.accessToken },
    );
    assert.equal(rivalry.body.comparable, true);
    assert.ok(rivalry.body.battles.some((b) => b.outcome === 'rival'));
  });

  it('needs the addressee to accept, not just the sender to ask', async () => {
    const muzz = await createUser({ username: 'pendmuzz' });
    const rahul = await createUser({ username: 'pendrahul' });

    const sent = await request<{ id: string; status: string }>('POST', '/v1/connections/requests', {
      token: muzz.accessToken,
      body: { username: rahul.username },
    });
    assert.equal(sent.body.status, 'pending');

    // Still nothing: a sent request is not a connection.
    const rivalry = await request('GET', `/v1/rivals/${rahul.id}`, { token: muzz.accessToken });
    assert.equal(rivalry.status, 404);

    const rivals = await request<unknown[]>('GET', '/v1/rivals', { token: muzz.accessToken });
    assert.equal(rivals.body.length, 0);
  });

  it('lets the addressee reject without creating anything', async () => {
    const muzz = await createUser({ username: 'rejmuzz' });
    const rahul = await createUser({ username: 'rejrahul' });
    const sent = await request<{ id: string }>('POST', '/v1/connections/requests', {
      token: muzz.accessToken,
      body: { username: rahul.username },
    });
    const rejected = await request('POST', `/v1/connections/requests/${sent.body.id}/reject`, {
      token: rahul.accessToken,
    });
    assert.equal(rejected.status, 204);
    const rivals = await request<unknown[]>('GET', '/v1/rivals', { token: muzz.accessToken });
    assert.equal(rivals.body.length, 0);
  });

  it('resolves a crossed pair of requests into one connection', async () => {
    const a = await createUser({ username: 'crossa' });
    const b = await createUser({ username: 'crossb' });

    await request('POST', '/v1/connections/requests', { token: a.accessToken, body: { username: b.username } });
    resetRateLimits();
    // B asking back accepts A's outstanding request rather than opening a second.
    const second = await request<{ rivalryId?: string }>('POST', '/v1/connections/requests', {
      token: b.accessToken,
      body: { username: a.username },
    });
    assert.ok(second.body.rivalryId, 'the crossed request should resolve to a rivalry');

    const rivals = await request<unknown[]>('GET', '/v1/rivals', { token: a.accessToken });
    assert.equal(rivals.body.length, 1);
  });
});

describe('privacy settings', () => {
  it('takes a user who hides their PRs out of the comparison', async () => {
    const muzz = await createUser({ username: 'hidemuzz', displayName: 'Muzz' });
    const rahul = await createUser({ username: 'hiderahul', displayName: 'Rahul' });
    await logLift(muzz, 'bench-press', [{ weight: 90, reps: 1 }]);
    await logLift(rahul, 'bench-press', [{ weight: 95, reps: 1 }]);
    await connect(muzz, rahul);

    await request('PUT', '/v1/me/privacy', { token: rahul.accessToken, body: { prs: 'private' } });

    const rivalry = await request<{ comparable: boolean; reason: string; battles: unknown[] }>(
      'GET',
      `/v1/rivals/${rahul.id}`,
      { token: muzz.accessToken },
    );
    assert.equal(rivalry.body.comparable, false);
    assert.match(rivalry.body.reason, /keeps their records private/);
    assert.equal(rivalry.body.battles.length, 0);
  });

  it('takes a paused user out of competition without deleting anything', async () => {
    const muzz = await createUser({ username: 'pausemuzz', displayName: 'Muzz' });
    const rahul = await createUser({ username: 'pauserahul', displayName: 'Rahul' });
    await logLift(muzz, 'bench-press', [{ weight: 90, reps: 1 }]);
    await logLift(rahul, 'bench-press', [{ weight: 95, reps: 1 }]);
    await connect(muzz, rahul);

    await request('POST', '/v1/me/competition', { token: rahul.accessToken, body: { paused: true } });

    const rivalry = await request<{ comparable: boolean; reason: string }>('GET', `/v1/rivals/${rahul.id}`, {
      token: muzz.accessToken,
    });
    assert.equal(rivalry.body.comparable, false);
    assert.match(rivalry.body.reason, /paused competition/);

    // Resuming brings it straight back — nothing was lost.
    await request('POST', '/v1/me/competition', { token: rahul.accessToken, body: { paused: false } });
    const resumed = await request<{ comparable: boolean }>('GET', `/v1/rivals/${rahul.id}`, {
      token: muzz.accessToken,
    });
    assert.equal(resumed.body.comparable, true);
  });

  it('never exposes bodyweight to a connection', async () => {
    const muzz = await createUser({ username: 'bwmuzz' });
    const rahul = await createUser({ username: 'bwrahul' });
    await connect(muzz, rahul);

    await request('PATCH', '/v1/me/profile', {
      token: rahul.accessToken,
      body: { bodyweight: 82.5, bodyweightUnit: 'kg' },
    });

    const profile = await request<Record<string, unknown>>('GET', `/v1/users/bwrahul`, { token: muzz.accessToken });
    assert.equal(JSON.stringify(profile.body).includes('82500'), false);
    assert.equal('bodyweightGrams' in profile.body, false);
  });
});

describe('blocking', () => {
  it('ends the connection and hides both users from each other', async () => {
    const muzz = await createUser({ username: 'blockmuzz' });
    const pest = await createUser({ username: 'blockpest' });
    await connect(muzz, pest);

    const blocked = await request('POST', `/v1/blocks/${pest.id}`, { token: muzz.accessToken });
    assert.equal(blocked.status, 204);

    const rivals = await request<unknown[]>('GET', '/v1/rivals', { token: muzz.accessToken });
    assert.equal(rivals.body.length, 0);

    const search = await request<unknown[]>('GET', '/v1/users/search?q=blockpest', { token: muzz.accessToken });
    assert.equal(search.body.length, 0);

    // And the blocked user cannot find their way back in.
    const retry = await request<{ error: { code: string } }>('POST', '/v1/connections/requests', {
      token: pest.accessToken,
      body: { username: 'blockmuzz' },
    });
    assert.equal(retry.status, 404);
  });

  it('records a report for the admin dashboard', async () => {
    const muzz = await createUser({ username: 'repmuzz' });
    const pest = await createUser({ username: 'reppest' });
    const response = await request<{ id: string }>('POST', '/v1/reports', {
      token: muzz.accessToken,
      body: { userId: pest.id, reason: 'fake_records', details: 'Logged a 400 kg squat.' },
    });
    assert.equal(response.status, 201);
    assert.ok(response.body.id);
  });
});
