import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildHomeFeed, greeting, type HomeSignals } from '../src/home.ts';
import { toGrams } from '../src/units.ts';

const BASE: HomeSignals = {
  unit: 'kg',
  trainedToday: false,
  streakDays: 8,
  connectionCount: 3,
  threats: [],
  behind: [],
  recentLeads: [],
  pendingChallenges: [],
  closingChallenges: [],
  closestBattle: null,
  recoveryNotices: [],
};

describe('home feed', () => {
  it('leads with a PR under threat', () => {
    const feed = buildHomeFeed({
      ...BASE,
      threats: [
        {
          rivalId: 'rahul',
          rivalName: 'Rahul',
          exerciseId: 'bench',
          exerciseName: 'Bench Press',
          yourGrams: toGrams(97.5, 'kg'),
          rivalGrams: toGrams(95, 'kg'),
        },
      ],
    });
    assert.equal(feed[0]!.kind, 'pr_under_threat');
    assert.equal(feed[0]!.title, 'Rahul is 2.5 kg away from your PR');
  });

  it('ignores a rival who is nowhere near', () => {
    const feed = buildHomeFeed({
      ...BASE,
      threats: [
        {
          rivalId: 'arjun',
          rivalName: 'Arjun',
          exerciseId: 'bench',
          exerciseName: 'Bench Press',
          yourGrams: toGrams(100, 'kg'),
          rivalGrams: toGrams(60, 'kg'),
        },
      ],
    });
    assert.equal(feed.some((c) => c.kind === 'pr_under_threat'), false);
  });

  it('surfaces the widest attendance gap', () => {
    const feed = buildHomeFeed({
      ...BASE,
      behind: [
        { rivalId: 'a', rivalName: 'Arjun', yourSessions: 18, rivalSessions: 19 },
        { rivalId: 'r', rivalName: 'Rahul', yourSessions: 18, rivalSessions: 21 },
      ],
    });
    const card = feed.find((c) => c.kind === 'consistency_behind')!;
    assert.equal(card.title, 'Rahul is 3 days ahead');
    assert.equal(card.cta!.label, 'Catch up');
  });

  it('drops the catch-up CTA once the user has trained today', () => {
    const feed = buildHomeFeed({
      ...BASE,
      trainedToday: true,
      behind: [{ rivalId: 'r', rivalName: 'Rahul', yourSessions: 18, rivalSessions: 21 }],
    });
    assert.equal(feed.find((c) => c.kind === 'consistency_behind')!.cta, null);
    assert.ok(feed.some((c) => c.kind === 'workout_complete'));
  });

  it('prompts a workout when none is logged', () => {
    const feed = buildHomeFeed(BASE);
    const card = feed.find((c) => c.kind === 'log_workout')!;
    assert.equal(card.title, "You haven't trained today");
  });

  it('shows the empty state with no connections', () => {
    const feed = buildHomeFeed({ ...BASE, connectionCount: 0 });
    assert.equal(feed[0]!.kind, 'no_rivals');
    assert.equal(feed[0]!.cta!.action, 'connections.search');
  });

  it('puts recovery notices last and gives them no call to action', () => {
    const feed = buildHomeFeed({
      ...BASE,
      recoveryNotices: [{ title: 'Consistency matters, but recovery matters too', message: 'Seven days straight.' }],
    });
    const recovery = feed.filter((c) => c.kind === 'recovery');
    assert.equal(recovery.length, 1);
    assert.equal(recovery[0]!.cta, null);
    assert.equal(feed[feed.length - 1]!.kind, 'recovery');
  });

  it('celebrates a lead you just took', () => {
    const feed = buildHomeFeed({
      ...BASE,
      recentLeads: [
        { rivalId: 'r', rivalName: 'Rahul', exerciseId: 'bench', exerciseName: 'Bench Press', deltaGrams: toGrams(2.5, 'kg') },
      ],
    });
    const card = feed.find((c) => c.kind === 'took_the_lead')!;
    assert.equal(card.tone, 'positive');
    assert.match(card.body, /2\.5 kg above Rahul/);
  });

  it('sorts strictly by priority', () => {
    const feed = buildHomeFeed({
      ...BASE,
      pendingChallenges: [{ challengeId: 'c1', fromName: 'Rahul', title: 'Deadlift battle' }],
      behind: [{ rivalId: 'r', rivalName: 'Rahul', yourSessions: 1, rivalSessions: 9 }],
    });
    for (let i = 1; i < feed.length; i++) {
      assert.ok(feed[i - 1]!.priority >= feed[i]!.priority);
    }
  });
});

describe('greeting', () => {
  it('changes with the time of day', () => {
    assert.equal(greeting(new Date(2026, 8, 20, 8), 'Muzz'), 'Good morning, Muzz');
    assert.equal(greeting(new Date(2026, 8, 20, 14), 'Muzz'), 'Good afternoon, Muzz');
    assert.equal(greeting(new Date(2026, 8, 20, 21), 'Muzz'), 'Good evening, Muzz');
  });
});
