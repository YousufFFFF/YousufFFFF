import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CHALLENGE_TEMPLATES, evaluateChallenge, suggestTarget } from '../src/challenges.ts';
import type { ChallengeDefinition } from '../src/challenges.ts';
import { fromGrams, toGrams } from '../src/units.ts';

const TODAY = '2026-09-20';

const deadliftBattle: ChallengeDefinition = {
  type: 'pr',
  exerciseId: 'ex-deadlift',
  target: toGrams(160, 'kg'),
  startDate: '2026-09-01',
  deadline: '2026-10-08',
};

describe('challenge evaluation', () => {
  it('reports days left and per-side progress', () => {
    const state = evaluateChallenge(
      deadliftBattle,
      [
        { userId: 'muzz', value: toGrams(140, 'kg') },
        { userId: 'rahul', value: toGrams(150, 'kg') },
      ],
      'active',
      TODAY,
    );
    assert.equal(state.daysRemaining, 18);
    assert.equal(state.status, 'active');
    assert.equal(state.progressPct.muzz, 88);
    assert.equal(state.progressPct.rahul, 94);
    assert.equal(state.leaderId, 'rahul');
    assert.equal(state.summary, '18 days left.');
  });

  it('completes as soon as someone clears the target', () => {
    const state = evaluateChallenge(
      deadliftBattle,
      [
        { userId: 'muzz', value: toGrams(162.5, 'kg') },
        { userId: 'rahul', value: toGrams(150, 'kg') },
      ],
      'active',
      TODAY,
    );
    assert.equal(state.targetMet, true);
    assert.equal(state.status, 'completed');
    assert.equal(state.winnerId, 'muzz');
  });

  it('expires with no winner when nobody hits the target', () => {
    const state = evaluateChallenge(
      { ...deadliftBattle, deadline: '2026-09-10' },
      [{ userId: 'muzz', value: toGrams(140, 'kg') }],
      'active',
      TODAY,
    );
    assert.equal(state.status, 'expired');
    assert.equal(state.winnerId, 'muzz'); // sole leader still takes it
    assert.equal(state.daysRemaining, 0);
  });

  it('declares no leader on a dead heat', () => {
    const state = evaluateChallenge(
      deadliftBattle,
      [
        { userId: 'muzz', value: toGrams(150, 'kg') },
        { userId: 'rahul', value: toGrams(150, 'kg') },
      ],
      'active',
      TODAY,
    );
    assert.equal(state.leaderId, null);
  });

  it('waits on acceptance before it starts', () => {
    const state = evaluateChallenge(deadliftBattle, [], 'pending', TODAY);
    assert.equal(state.status, 'pending');
    assert.match(state.summary, /Waiting for your rival/);
  });

  it('calls the final day out', () => {
    const state = evaluateChallenge({ ...deadliftBattle, deadline: TODAY }, [{ userId: 'muzz', value: 0 }], 'active', TODAY);
    assert.equal(state.summary, 'Last day.');
  });

  it('never resolves a volume challenge early on target alone', () => {
    const volume: ChallengeDefinition = { ...deadliftBattle, type: 'volume', target: toGrams(10_000, 'kg') };
    const state = evaluateChallenge(volume, [{ userId: 'muzz', value: toGrams(12_000, 'kg') }], 'active', TODAY);
    assert.equal(state.targetMet, false);
    assert.equal(state.status, 'active');
  });
});

describe('suggested targets', () => {
  it('rounds up to a real plate jump above the rival PR', () => {
    const template = CHALLENGE_TEMPLATES.find((t) => t.code === 'beat_my_pr')!;
    const target = suggestTarget(template, toGrams(150, 'kg'))!;
    assert.equal(fromGrams(target, 'kg'), 157.5);
  });

  it('has nothing to suggest without a rival PR', () => {
    const template = CHALLENGE_TEMPLATES.find((t) => t.code === 'beat_my_pr')!;
    assert.equal(suggestTarget(template, null), null);
  });

  it('has no target for a pure attendance challenge', () => {
    const template = CHALLENGE_TEMPLATES.find((t) => t.code === 'ten_this_month')!;
    assert.equal(suggestTarget(template, toGrams(150, 'kg')), null);
  });
});
