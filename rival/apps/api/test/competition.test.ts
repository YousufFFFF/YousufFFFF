import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import { addDays, fromGrams, toIsoDate } from '@rival/core';
import {
  connect,
  createUser,
  exerciseId,
  logLift,
  makeAdmin,
  request,
  resetRateLimits,
  teardown,
  type TestUser,
} from './helpers.ts';

beforeEach(resetRateLimits);
after(teardown);

const TODAY = toIsoDate(new Date());

/** A connected group, so the leaderboard tests have a real network to rank. */
async function crew(): Promise<{ muzz: TestUser; rahul: TestUser; arjun: TestUser }> {
  const stamp = Math.random().toString(36).slice(2, 7);
  const muzz = await createUser({ username: `cm${stamp}`, displayName: 'Muzz' });
  const rahul = await createUser({ username: `cr${stamp}`, displayName: 'Rahul' });
  const arjun = await createUser({ username: `ca${stamp}`, displayName: 'Arjun' });
  await connect(muzz, rahul);
  await connect(muzz, arjun);
  return { muzz, rahul, arjun };
}

describe('rivalry score', () => {
  it('adds up battles, consistency and challenges', async () => {
    const muzz = await createUser({ username: 'scoremuzz', displayName: 'Muzz' });
    const rahul = await createUser({ username: 'scorerahul', displayName: 'Rahul' });
    await connect(muzz, rahul);

    // Rahul leads bench and deadlift; Muzz leads squat.
    await logLift(muzz, 'bench-press', [{ weight: 90, reps: 1 }], { sessionDate: addDays(TODAY, -5) });
    await logLift(rahul, 'bench-press', [{ weight: 95, reps: 1 }], { sessionDate: addDays(TODAY, -5) });
    await logLift(muzz, 'deadlift', [{ weight: 140, reps: 1 }], { sessionDate: addDays(TODAY, -4) });
    await logLift(rahul, 'deadlift', [{ weight: 150, reps: 1 }], { sessionDate: addDays(TODAY, -4) });
    await logLift(muzz, 'squat', [{ weight: 110, reps: 1 }], { sessionDate: addDays(TODAY, -3) });
    await logLift(rahul, 'squat', [{ weight: 105, reps: 1 }], { sessionDate: addDays(TODAY, -3) });

    // Rahul also has one more gym day.
    await logLift(rahul, 'barbell-row', [{ weight: 60, reps: 10 }], { sessionDate: addDays(TODAY, -2) });

    const rivalry = await request<{
      score: { you: number; rival: number; leader: string; headline: string; breakdown: { prBattles: { you: number; rival: number } } };
    }>('GET', `/v1/rivals/${rahul.id}`, { token: muzz.accessToken });

    assert.equal(rivalry.body.score.breakdown.prBattles.you, 1); // squat
    assert.equal(rivalry.body.score.breakdown.prBattles.rival, 2); // bench + deadlift
    assert.equal(rivalry.body.score.you, 1);
    assert.equal(rivalry.body.score.rival, 3); // two battles + the consistency point
    assert.equal(rivalry.body.score.leader, 'rival');
    assert.equal(rivalry.body.score.headline, 'Rahul leads 3–1');
  });

  it('shows the rivals list the same numbers as the rivalry screen', async () => {
    const muzz = await createUser({ username: 'freshmuzz', displayName: 'Muzz' });
    const rahul = await createUser({ username: 'freshrahul', displayName: 'Rahul' });
    await connect(muzz, rahul);

    await logLift(muzz, 'bench-press', [{ weight: 90, reps: 1 }], { sessionDate: addDays(TODAY, -2) });
    await logLift(rahul, 'bench-press', [{ weight: 95, reps: 1 }], { sessionDate: addDays(TODAY, -2) });

    // Warm the cache, then let Rahul train again. The list must not keep
    // serving the figures from before his session.
    await request('GET', `/v1/rivals/${rahul.id}`, { token: muzz.accessToken });
    await logLift(rahul, 'squat', [{ weight: 120, reps: 1 }], { sessionDate: addDays(TODAY, -1) });

    const [list, detail] = await Promise.all([
      request<{ rival: { id: string }; you: number; them: number; sessionsThem: number }[]>('GET', '/v1/rivals', {
        token: muzz.accessToken,
      }),
      request<{ score: { you: number; rival: number }; consistency: { rival: number } }>(
        'GET',
        `/v1/rivals/${rahul.id}`,
        { token: muzz.accessToken },
      ),
    ]);

    const row = list.body.find((r) => r.rival.id === rahul.id)!;
    assert.equal(row.you, detail.body.score.you);
    assert.equal(row.them, detail.body.score.rival);
    assert.equal(row.sessionsThem, detail.body.consistency.rival);
    assert.equal(row.sessionsThem, 2, "Rahul's second session should be counted");
  });

  it('only compares exercises both have logged', async () => {
    const muzz = await createUser({ username: 'cmpmuzz', displayName: 'Muzz' });
    const rahul = await createUser({ username: 'cmprahul', displayName: 'Rahul' });
    await connect(muzz, rahul);

    await logLift(muzz, 'bench-press', [{ weight: 90, reps: 1 }]);
    await logLift(muzz, 'leg-press', [{ weight: 200, reps: 10 }], { sessionDate: addDays(TODAY, -1) });
    await logLift(rahul, 'bench-press', [{ weight: 95, reps: 1 }]);

    const rivalry = await request<{ battles: { exerciseName: string; outcome: string; status: string }[] }>(
      'GET',
      `/v1/rivals/${rahul.id}`,
      { token: muzz.accessToken },
    );

    const legPress = rivalry.body.battles.find((b) => b.exerciseName === 'Leg Press')!;
    assert.equal(legPress.outcome, 'not_comparable');
    assert.match(legPress.status, /Rahul hasn't logged/);

    const bench = rivalry.body.battles.find((b) => b.exerciseName === 'Bench Press')!;
    assert.equal(bench.outcome, 'rival');
  });

  it('respects the scoring weights an admin sets', async () => {
    const admin = await createUser({ username: 'scoreadmin' });
    const adminToken = await makeAdmin(admin);

    const updated = await request<{ consistencyWin: number }>('PUT', '/v1/admin/scoring', {
      token: adminToken,
      body: { consistencyWin: 5 },
    });
    assert.equal(updated.body.consistencyWin, 5);

    const muzz = await createUser({ username: 'weightmuzz', displayName: 'Muzz' });
    const rahul = await createUser({ username: 'weightrahul', displayName: 'Rahul' });
    await connect(muzz, rahul);
    await logLift(muzz, 'bench-press', [{ weight: 60, reps: 8 }], { sessionDate: addDays(TODAY, -2) });
    await logLift(muzz, 'squat', [{ weight: 60, reps: 8 }], { sessionDate: addDays(TODAY, -1) });

    const rivalry = await request<{ score: { you: number } }>('GET', `/v1/rivals/${rahul.id}`, {
      token: muzz.accessToken,
    });
    assert.equal(rivalry.body.score.you, 5, 'the consistency point should now be worth five');

    // Put it back so later tests see the default.
    await request('PUT', '/v1/admin/scoring', { token: adminToken, body: { consistencyWin: 1 } });
  });
});

describe('leaderboards', () => {
  it('ranks an exercise within the connected network only', async () => {
    const { muzz, rahul, arjun } = await crew();
    const outsider = await createUser({ username: 'outsider9', displayName: 'Outsider' });

    await logLift(rahul, 'bench-press', [{ weight: 100, reps: 1 }]);
    await logLift(muzz, 'bench-press', [{ weight: 97.5, reps: 1 }]);
    await logLift(arjun, 'bench-press', [{ weight: 90, reps: 1 }]);
    await logLift(outsider, 'bench-press', [{ weight: 200, reps: 1 }]);

    const bench = await exerciseId('bench-press');
    const board = await request<{ entries: { displayName: string; display: string; medal: string | null; isYou: boolean }[] }>(
      'GET',
      `/v1/leaderboards/exercise/${bench}`,
      { token: muzz.accessToken },
    );

    assert.deepEqual(board.body.entries.map((e) => e.displayName), ['Rahul', 'Muzz', 'Arjun']);
    assert.deepEqual(board.body.entries.map((e) => e.medal), ['🥇', '🥈', '🥉']);
    assert.equal(board.body.entries[0]!.display, '100 kg');
    assert.equal(board.body.entries[1]!.isYou, true);
  });

  it('ranks the improvement board by percentage, not by load', async () => {
    const { muzz, rahul } = await crew();

    // Muzz: 80 -> 95 (+18.75%). Rahul: 100 -> 105 (+5%).
    await logLift(muzz, 'bench-press', [{ weight: 80, reps: 1 }], { sessionDate: addDays(TODAY, -120) });
    await logLift(rahul, 'bench-press', [{ weight: 100, reps: 1 }], { sessionDate: addDays(TODAY, -120) });
    await logLift(muzz, 'bench-press', [{ weight: 95, reps: 1 }], { sessionDate: addDays(TODAY, -1) });
    await logLift(rahul, 'bench-press', [{ weight: 105, reps: 1 }], { sessionDate: addDays(TODAY, -1) });

    const board = await request<{ entries: { displayName: string; improvementPct: number }[] }>(
      'GET',
      '/v1/leaderboards/improvement',
      { token: muzz.accessToken },
    );

    // The weaker lifter tops the board — the whole point of this leaderboard.
    assert.equal(board.body.entries[0]!.displayName, 'Muzz');
    assert.equal(board.body.entries[0]!.improvementPct, 18.75);
    assert.equal(board.body.entries[1]!.improvementPct, 5);
  });

  it('ranks consistency by gym days', async () => {
    const { muzz, rahul } = await crew();
    for (let day = 1; day <= 4; day++) {
      await logLift(rahul, 'bench-press', [{ weight: 60, reps: 8 }], { sessionDate: addDays(TODAY, -day) });
    }
    for (let day = 1; day <= 2; day++) {
      await logLift(muzz, 'bench-press', [{ weight: 60, reps: 8 }], { sessionDate: addDays(TODAY, -day) });
    }

    const board = await request<{ entries: { displayName: string; display: string }[] }>(
      'GET',
      '/v1/leaderboards/consistency',
      { token: muzz.accessToken },
    );
    assert.equal(board.body.entries[0]!.displayName, 'Rahul');
    assert.equal(board.body.entries[0]!.display, '4 sessions');
  });
});

describe('challenges', () => {
  it('runs a PR challenge from invite to win', async () => {
    const muzz = await createUser({ username: 'chalmuzz', displayName: 'Muzz' });
    const rahul = await createUser({ username: 'chalrahul', displayName: 'Rahul' });
    await connect(muzz, rahul);

    await logLift(muzz, 'deadlift', [{ weight: 140, reps: 1 }], { sessionDate: addDays(TODAY, -3) });
    await logLift(rahul, 'deadlift', [{ weight: 150, reps: 1 }], { sessionDate: addDays(TODAY, -3) });

    const deadlift = await exerciseId('deadlift');
    const created = await request<{ id: string; status: string }>('POST', '/v1/challenges', {
      token: rahul.accessToken,
      body: {
        opponentId: muzz.id,
        type: 'pr',
        exerciseId: deadlift,
        title: 'Deadlift battle',
        target: 160,
        targetUnit: 'kg',
        deadline: addDays(TODAY, 18),
      },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.status, 'pending');

    // Muzz is told about it.
    const inbox = await request<{ items: { type: string; title: string }[] }>('GET', '/v1/notifications', {
      token: muzz.accessToken,
    });
    assert.ok(inbox.body.items.some((n) => n.type === 'challenge_received'));

    // Pending means pending: no progress until it is accepted.
    const pending = await request<{ status: string; summary: string }>('GET', `/v1/challenges/${created.body.id}`, {
      token: muzz.accessToken,
    });
    assert.equal(pending.body.status, 'pending');
    assert.match(pending.body.summary, /Waiting for your rival/);

    await request('POST', `/v1/challenges/${created.body.id}/accept`, { token: muzz.accessToken });

    const active = await request<{
      status: string;
      daysRemaining: number;
      you: { value: number; progressPct: number };
      opponent: { value: number; progressPct: number };
    }>('GET', `/v1/challenges/${created.body.id}`, { token: muzz.accessToken });

    assert.equal(active.body.status, 'active');
    assert.equal(active.body.daysRemaining, 18);
    assert.equal(fromGrams(active.body.you.value, 'kg'), 140);
    assert.equal(active.body.you.progressPct, 88);
    assert.equal(active.body.opponent.progressPct, 94);

    // Muzz clears the target and takes it.
    await logLift(muzz, 'deadlift', [{ weight: 162.5, reps: 1 }]);

    const finished = await request<{ status: string; winnerId: string }>('GET', `/v1/challenges/${created.body.id}`, {
      token: muzz.accessToken,
    });
    assert.equal(finished.body.status, 'completed');
    assert.equal(finished.body.winnerId, muzz.id);

    const won = await request<{ items: { type: string }[] }>('GET', '/v1/notifications', { token: muzz.accessToken });
    assert.ok(won.body.items.some((n) => n.type === 'challenge_won'));
  });

  it('tracks an attendance challenge from zero', async () => {
    const muzz = await createUser({ username: 'attmuzz', displayName: 'Muzz' });
    const rahul = await createUser({ username: 'attrahul', displayName: 'Rahul' });
    await connect(muzz, rahul);

    // Gym days banked before the challenge should not count towards it.
    await logLift(muzz, 'bench-press', [{ weight: 60, reps: 8 }], { sessionDate: addDays(TODAY, -5) });

    const created = await request<{ id: string }>('POST', '/v1/challenges', {
      token: muzz.accessToken,
      body: {
        opponentId: rahul.id,
        type: 'workout_count',
        title: '5 workouts this week',
        target: 5,
        deadline: addDays(TODAY, 7),
      },
    });
    await request('POST', `/v1/challenges/${created.body.id}/accept`, { token: rahul.accessToken });

    await logLift(muzz, 'squat', [{ weight: 80, reps: 8 }]);

    const view = await request<{ you: { value: number } }>('GET', `/v1/challenges/${created.body.id}`, {
      token: muzz.accessToken,
    });
    assert.equal(view.body.you.value, 1, 'only sessions inside the challenge window count');
  });

  it('lets the opponent decline', async () => {
    const muzz = await createUser({ username: 'decmuzz' });
    const rahul = await createUser({ username: 'decrahul' });
    await connect(muzz, rahul);

    const created = await request<{ id: string }>('POST', '/v1/challenges', {
      token: muzz.accessToken,
      body: { opponentId: rahul.id, type: 'consistency', target: 10, deadline: addDays(TODAY, 30) },
    });
    const declined = await request<{ status: string }>('POST', `/v1/challenges/${created.body.id}/decline`, {
      token: rahul.accessToken,
    });
    assert.equal(declined.body.status, 'declined');
  });

  it('refuses a deadline in the past', async () => {
    const muzz = await createUser({ username: 'pastmuzz' });
    const rahul = await createUser({ username: 'pastrahul' });
    await connect(muzz, rahul);

    const response = await request('POST', '/v1/challenges', {
      token: muzz.accessToken,
      body: { opponentId: rahul.id, type: 'consistency', target: 10, deadline: addDays(TODAY, -1) },
    });
    assert.equal(response.status, 400);
  });

  it('suggests a target above the rival PR, rounded to real plates', async () => {
    const muzz = await createUser({ username: 'sugmuzz' });
    const rahul = await createUser({ username: 'sugrahul' });
    await connect(muzz, rahul);
    await logLift(rahul, 'deadlift', [{ weight: 150, reps: 1 }]);

    const deadlift = await exerciseId('deadlift');
    const suggestion = await request<{ opponentBest: number; suggestedTarget: number }>(
      'GET',
      `/v1/challenges/suggest-target?opponentId=${rahul.id}&exerciseId=${deadlift}`,
      { token: muzz.accessToken },
    );
    assert.equal(fromGrams(suggestion.body.opponentBest, 'kg'), 150);
    assert.equal(fromGrams(suggestion.body.suggestedTarget, 'kg'), 157.5);
  });

  it('caps custom challenges on a free account', async () => {
    const muzz = await createUser({ username: 'capmuzz' });
    const rahul = await createUser({ username: 'caprahul' });
    await connect(muzz, rahul);

    for (let i = 0; i < 3; i++) {
      const created = await request('POST', '/v1/challenges', {
        token: muzz.accessToken,
        body: { opponentId: rahul.id, type: 'consistency', target: 10, deadline: addDays(TODAY, 30) },
      });
      assert.equal(created.status, 201);
    }

    const fourth = await request<{ error: { code: string; message: string } }>('POST', '/v1/challenges', {
      token: muzz.accessToken,
      body: { opponentId: rahul.id, type: 'consistency', target: 10, deadline: addDays(TODAY, 30) },
    });
    assert.equal(fourth.status, 402);
    assert.equal(fourth.body.error.code, 'requires_pro');
  });
});

describe('the activity feed', () => {
  it('shows a connection PR and accepts a reaction', async () => {
    const muzz = await createUser({ username: 'feedmuzz', displayName: 'Muzz' });
    const rahul = await createUser({ username: 'feedrahul', displayName: 'Rahul' });
    await connect(muzz, rahul);

    await logLift(rahul, 'deadlift', [{ weight: 150, reps: 1 }]);

    const feed = await request<{ id: string; type: string; actor: { displayName: string } }[]>('GET', '/v1/feed', {
      token: muzz.accessToken,
    });
    const pr = feed.body.find((item) => item.type === 'new_pr')!;
    assert.equal(pr.actor.displayName, 'Rahul');

    const reacted = await request('POST', `/v1/feed/${pr.id}/reactions`, {
      token: muzz.accessToken,
      body: { reaction: 'fire' },
    });
    assert.equal(reacted.status, 204);

    const again = await request<{ id: string; reactions: Record<string, number>; yourReactions: string[] }[]>(
      'GET',
      '/v1/feed',
      { token: muzz.accessToken },
    );
    const updated = again.body.find((item) => item.id === pr.id)!;
    assert.equal(updated.reactions.fire, 1);
    assert.deepEqual(updated.yourReactions, ['fire']);
  });

  it('keeps a stranger out of the feed', async () => {
    const muzz = await createUser({ username: 'ffmuzz' });
    const stranger = await createUser({ username: 'ffstranger' });
    await logLift(stranger, 'deadlift', [{ weight: 200, reps: 1 }]);

    const feed = await request<{ actor: { username: string } }[]>('GET', '/v1/feed', { token: muzz.accessToken });
    assert.equal(feed.body.some((item) => item.actor.username === 'ffstranger'), false);
  });

  it('publishes nothing for a user who hid their feed', async () => {
    const muzz = await createUser({ username: 'hfmuzz' });
    const rahul = await createUser({ username: 'hfrahul' });
    await connect(muzz, rahul);
    await request('PUT', '/v1/me/privacy', { token: rahul.accessToken, body: { activityFeed: 'private' } });

    await logLift(rahul, 'deadlift', [{ weight: 150, reps: 1 }]);

    const feed = await request<{ actor: { username: string } }[]>('GET', '/v1/feed', { token: muzz.accessToken });
    assert.equal(feed.body.some((item) => item.actor.username === 'hfrahul'), false);
  });
});
