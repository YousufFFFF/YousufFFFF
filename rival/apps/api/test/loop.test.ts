import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import { addDays, fromGrams, toGrams, toIsoDate } from '@rival/core';
import {
  connect,
  createUser,
  exerciseId,
  logLift,
  request,
  resetRateLimits,
  teardown,
  type TestUser,
} from './helpers.ts';

/**
 * The product loop, end to end:
 *
 *   CONNECT → TRAIN → TRACK → COMPARE → COMPETE → IMPROVE
 *
 * This is the journey from the spec, run against a real database through the
 * real HTTP routes.
 */

beforeEach(resetRateLimits);
after(teardown);

const TODAY = toIsoDate(new Date());

describe('the full journey', () => {
  it('runs sign up → connect → log → PR → compare → overtake → notify', async () => {
    // ── CONNECT ───────────────────────────────────────────────────────────
    const muzz = await createUser({ username: 'loopmuzz', displayName: 'Muzz' });
    const rahul = await createUser({ username: 'looprahul', displayName: 'Rahul' });

    // Before they connect, there is no rivalry and nothing to compare.
    const beforeConnect = await request('GET', `/v1/rivals/${rahul.id}`, { token: muzz.accessToken });
    assert.equal(beforeConnect.status, 404);

    await connect(muzz, rahul);

    const rivals = await request<{ rival: { username: string } }[]>('GET', '/v1/rivals', {
      token: muzz.accessToken,
    });
    assert.equal(rivals.body.length, 1);
    assert.equal(rivals.body[0]!.rival.username, 'looprahul');

    // ── TRAIN ─────────────────────────────────────────────────────────────
    const firstSession = await logLift(muzz, 'bench-press', [
      { weight: 60, reps: 10 },
      { weight: 70, reps: 8 },
      { weight: 80, reps: 5 },
    ]);

    // ── TRACK: a first lift is a PR of every kind ─────────────────────────
    const weightPr = firstSession.prs.find((pr) => pr.prType === 'weight')!;
    assert.equal(fromGrams(weightPr.value, 'kg'), 80);
    assert.equal(weightPr.previousValue, null);
    assert.equal(firstSession.session.session_date, TODAY);

    // Attendance counted, XP awarded.
    assert.equal(firstSession.xpAwarded, 100 + firstSession.prs.length * 150);
    assert.equal(firstSession.streak.currentDays, 1);

    // ── COMPARE: Rahul logs heavier and leads ─────────────────────────────
    await logLift(rahul, 'bench-press', [{ weight: 95, reps: 3 }]);

    const behind = await request<{
      battles: { exerciseName: string; outcome: string; status: string }[];
      score: { leader: string };
    }>('GET', `/v1/rivals/${rahul.id}`, { token: muzz.accessToken });

    const benchBattle = behind.body.battles.find((b) => b.exerciseName === 'Bench Press')!;
    assert.equal(benchBattle.outcome, 'rival');
    assert.equal(benchBattle.status, 'Rahul leads by 15 kg');

    // ── COMPETE: Muzz takes the lead back ─────────────────────────────────
    const overtake = await logLift(
      muzz,
      'bench-press',
      [{ weight: 97.5, reps: 1 }],
      { sessionDate: addDays(TODAY, -1) },
    );

    assert.equal(overtake.leadsTaken.length, 1);
    assert.equal(overtake.leadsTaken[0]!.rivalName, 'Rahul');
    assert.equal(fromGrams(overtake.leadsTaken[0]!.deltaGrams, 'kg'), 2.5);

    const ahead = await request<{ battles: { exerciseName: string; outcome: string; status: string }[] }>(
      'GET',
      `/v1/rivals/${rahul.id}`,
      { token: muzz.accessToken },
    );
    const nowLeading = ahead.body.battles.find((b) => b.exerciseName === 'Bench Press')!;
    assert.equal(nowLeading.outcome, 'you');
    assert.equal(nowLeading.status, 'You lead by 2.5 kg');

    // ── NOTIFY: Rahul is told he lost the spot ────────────────────────────
    const rahulInbox = await request<{ items: { type: string; title: string }[] }>('GET', '/v1/notifications', {
      token: rahul.accessToken,
    });
    const lostIt = rahulInbox.body.items.find((n) => n.type === 'pr_beaten');
    assert.ok(lostIt, 'Rahul should be told his PR was beaten');
    assert.match(lostIt!.title, /Muzz just took your Bench Press spot/);

    // ...and Muzz is told he took it.
    const muzzInbox = await request<{ items: { type: string; title: string }[] }>('GET', '/v1/notifications', {
      token: muzz.accessToken,
    });
    assert.ok(muzzInbox.body.items.some((n) => n.type === 'took_number_one'));

    // ── The home screen leads with it ─────────────────────────────────────
    const home = await request<{ cards: { kind: string; title: string }[] }>('GET', '/v1/home', {
      token: muzz.accessToken,
    });
    assert.ok(home.body.cards.some((c) => c.kind === 'took_the_lead'));
  });
});

describe('PR detection through the API', () => {
  let user: TestUser;

  beforeEach(async () => {
    user = await createUser();
  });

  it('reports the previous best and the improvement', async () => {
    await logLift(user, 'squat', [{ weight: 100, reps: 1 }]);
    const better = await logLift(user, 'squat', [{ weight: 110, reps: 1 }], { sessionDate: addDays(TODAY, -1) });

    const pr = better.prs.find((p) => p.prType === 'weight')!;
    assert.equal(fromGrams(pr.value, 'kg'), 110);
    assert.equal(fromGrams(pr.previousValue!, 'kg'), 100);
  });

  it('does not call matching an old PR a new one', async () => {
    await logLift(user, 'squat', [{ weight: 100, reps: 5 }]);
    const same = await logLift(user, 'squat', [{ weight: 100, reps: 5 }], { sessionDate: addDays(TODAY, -1) });
    assert.equal(same.prs.some((p) => p.prType === 'weight'), false);
    assert.equal(same.prs.some((p) => p.prType === 'reps'), false);
  });

  it('credits extra reps at the same weight', async () => {
    await logLift(user, 'squat', [{ weight: 100, reps: 5 }]);
    const moreReps = await logLift(user, 'squat', [{ weight: 100, reps: 8 }], { sessionDate: addDays(TODAY, -1) });
    const repPr = moreReps.prs.find((p) => p.prType === 'reps')!;
    assert.equal(repPr.value, 8);
    assert.equal(repPr.previousValue, 5);
  });

  it('stores an estimated 1RM separately from the tested lift', async () => {
    const session = await logLift(user, 'deadlift', [{ weight: 140, reps: 5 }]);
    const weight = session.prs.find((p) => p.prType === 'weight')!;
    const estimate = session.prs.find((p) => p.prType === 'e1rm')!;
    assert.equal(fromGrams(weight.value, 'kg'), 140);
    // Epley: 140 * (1 + 5/30) = 163.33
    assert.equal(fromGrams(estimate.value, 'kg'), 163.33);
    assert.ok(estimate.value > weight.value);
  });

  it('keeps a PR history the profile can chart', async () => {
    const bench = await exerciseId('bench-press');
    await logLift(user, 'bench-press', [{ weight: 80, reps: 1 }], { sessionDate: addDays(TODAY, -20) });
    await logLift(user, 'bench-press', [{ weight: 90, reps: 1 }], { sessionDate: addDays(TODAY, -10) });
    await logLift(user, 'bench-press', [{ weight: 95, reps: 1 }]);

    const history = await request<{ points: { value: number; improvementPct: number | null }[] }>(
      'GET',
      `/v1/me/prs/${bench}/history`,
      { token: user.accessToken },
    );
    assert.equal(history.body.points.length, 3);
    assert.equal(fromGrams(history.body.points[2]!.value, 'kg'), 95);
    assert.equal(history.body.points[2]!.improvementPct, 5.56);
  });

  it('accepts pounds and compares them against kilograms correctly', async () => {
    const bench = await exerciseId('bench-press');
    const response = await request<{ prs: { prType: string; value: number }[] }>('POST', '/v1/workouts/complete', {
      token: user.accessToken,
      body: {
        workoutType: 'push',
        exercises: [{ exerciseId: bench, sets: [{ weight: 225, unit: 'lb', reps: 1 }] }],
      },
    });
    const pr = response.body.prs.find((p) => p.prType === 'weight')!;
    // 225 lb is 102.06 kg, and it is stored as such.
    assert.equal(fromGrams(pr.value, 'kg'), 102.06);
    assert.equal(pr.value, toGrams(225, 'lb'));
  });
});

describe('attendance and consistency', () => {
  it('counts one gym day however many times you log', async () => {
    const user = await createUser();
    await logLift(user, 'bench-press', [{ weight: 60, reps: 10 }]);
    const second = await logLift(user, 'squat', [{ weight: 80, reps: 10 }]);

    // Second session, same day: no extra gym day, and no extra workout XP.
    assert.equal(second.xpAwarded, second.prs.length * 150);
    assert.equal(second.streak.currentDays, 1);
  });

  it('shows the gap and shrinks it as the user trains', async () => {
    const muzz = await createUser({ username: 'gapmuzz', displayName: 'Muzz' });
    const rahul = await createUser({ username: 'gaprahul', displayName: 'Rahul' });
    await connect(muzz, rahul);

    for (let day = 1; day <= 6; day++) {
      await logLift(rahul, 'bench-press', [{ weight: 60, reps: 8 }], { sessionDate: addDays(TODAY, -day) });
    }
    for (let day = 1; day <= 3; day++) {
      await logLift(muzz, 'bench-press', [{ weight: 60, reps: 8 }], { sessionDate: addDays(TODAY, -day) });
    }

    const before = await request<{ gap: number; message: string; cta: { enabled: boolean } }>(
      'GET',
      `/v1/rivals/${rahul.id}/catch-up`,
      { token: muzz.accessToken },
    );
    assert.equal(before.body.gap, 3);
    assert.equal(before.body.message, "You're 3 gym days behind Rahul.");
    assert.equal(before.body.cta.enabled, true);

    await logLift(muzz, 'bench-press', [{ weight: 60, reps: 8 }]);

    const after = await request<{ gap: number; cta: { enabled: boolean; helper: string } }>(
      'GET',
      `/v1/rivals/${rahul.id}/catch-up`,
      { token: muzz.accessToken },
    );
    assert.equal(after.body.gap, 2);
    // Already trained today: the app does not ask for a second session.
    assert.equal(after.body.cta.enabled, false);
    assert.match(after.body.cta.helper, /rest up/);
  });

  it('gives a neutral recovery note for a week with no rest day', async () => {
    const user = await createUser();
    let last;
    for (let day = 7; day >= 0; day--) {
      last = await logLift(user, 'bench-press', [{ weight: 60, reps: 8 }], { sessionDate: addDays(TODAY, -day) });
    }
    const notice = last!.recovery.find((r) => r.flag === 'long_unbroken_block');
    assert.ok(notice, 'expected a recovery notice after 8 straight days');
    assert.match(notice!.message, /Rest days are part of getting stronger/);
  });

  it('does not break a streak on a planned rest day', async () => {
    const user = await createUser();
    for (const day of [6, 4, 2, 0]) {
      await logLift(user, 'bench-press', [{ weight: 60, reps: 8 }], { sessionDate: addDays(TODAY, -day) });
    }
    const stats = await request<{ currentStreak: number }>('GET', '/v1/me/stats', { token: user.accessToken });
    assert.equal(stats.body.currentStreak, 7);
  });
});
