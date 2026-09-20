import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_SCORING, computeRivalryScore, resolveBattle, rivalryPair } from '../src/rivalry.ts';
import { toGrams } from '../src/units.ts';

const BENCH = { exerciseId: 'ex-bench', exerciseName: 'Bench Press' };
const NAMES = { you: 'Muzz', rival: 'Rahul' };

describe('PR battles', () => {
  it('reports the leader and the margin', () => {
    const result = resolveBattle(
      { ...BENCH, youGrams: toGrams(90, 'kg'), rivalGrams: toGrams(95, 'kg'), yourEntries: 4, rivalEntries: 6 },
      'kg',
      DEFAULT_SCORING,
      NAMES,
    );
    assert.equal(result.outcome, 'rival');
    assert.equal(result.deltaDisplay, -5);
    assert.equal(result.status, 'Rahul leads by 5 kg');
  });

  it('flips once you out-lift them', () => {
    const result = resolveBattle(
      { ...BENCH, youGrams: toGrams(97.5, 'kg'), rivalGrams: toGrams(95, 'kg'), yourEntries: 5, rivalEntries: 6 },
      'kg',
      DEFAULT_SCORING,
      NAMES,
    );
    assert.equal(result.outcome, 'you');
    assert.equal(result.status, 'You lead by 2.5 kg');
  });

  it('compares correctly for a pound user', () => {
    const result = resolveBattle(
      { ...BENCH, youGrams: toGrams(225, 'lb'), rivalGrams: toGrams(100, 'kg'), yourEntries: 3, rivalEntries: 3 },
      'lb',
      DEFAULT_SCORING,
      NAMES,
    );
    // 225 lb = 102.06 kg, so the pound user leads.
    assert.equal(result.outcome, 'you');
  });

  it('refuses to compare an exercise only one side has logged', () => {
    const result = resolveBattle(
      { ...BENCH, youGrams: toGrams(90, 'kg'), rivalGrams: null, yourEntries: 4, rivalEntries: 0 },
      'kg',
      DEFAULT_SCORING,
      NAMES,
    );
    assert.equal(result.outcome, 'not_comparable');
    assert.equal(result.deltaDisplay, null);
    assert.match(result.status, /Rahul hasn't logged/);
  });

  it('respects a higher minimum-entries threshold', () => {
    const config = { ...DEFAULT_SCORING, minSessionsPerExercise: 3 };
    const result = resolveBattle(
      { ...BENCH, youGrams: toGrams(90, 'kg'), rivalGrams: toGrams(95, 'kg'), yourEntries: 1, rivalEntries: 8 },
      'kg',
      config,
      NAMES,
    );
    assert.equal(result.outcome, 'not_comparable');
  });
});

describe('rivalry score', () => {
  const battles = [
    resolveBattle({ exerciseId: 'a', exerciseName: 'Bench Press', youGrams: toGrams(90, 'kg'), rivalGrams: toGrams(95, 'kg'), yourEntries: 3, rivalEntries: 3 }, 'kg'),
    resolveBattle({ exerciseId: 'b', exerciseName: 'Deadlift', youGrams: toGrams(140, 'kg'), rivalGrams: toGrams(150, 'kg'), yourEntries: 3, rivalEntries: 3 }, 'kg'),
    resolveBattle({ exerciseId: 'c', exerciseName: 'Squat', youGrams: toGrams(110, 'kg'), rivalGrams: toGrams(105, 'kg'), yourEntries: 3, rivalEntries: 3 }, 'kg'),
    resolveBattle({ exerciseId: 'd', exerciseName: 'Row', youGrams: toGrams(70, 'kg'), rivalGrams: null, yourEntries: 3, rivalEntries: 0 }, 'kg'),
  ];

  it('adds a point per battle, consistency win and challenge win', () => {
    const score = computeRivalryScore(
      { battles, consistency: { you: 18, rival: 21 }, challenges: { youWon: 6, rivalWon: 6 } },
      DEFAULT_SCORING,
      NAMES,
    );
    assert.equal(score.you, 1 + 6); // squat + six challenges
    assert.equal(score.rival, 2 + 1 + 6); // bench + deadlift + consistency + six challenges
    assert.equal(score.leader, 'rival');
    assert.equal(score.headline, 'Rahul leads 9–7');
  });

  it('excludes non-comparable exercises from the tally', () => {
    const score = computeRivalryScore(
      { battles, consistency: { you: 21, rival: 21 }, challenges: { youWon: 0, rivalWon: 0 } },
      DEFAULT_SCORING,
      NAMES,
    );
    assert.equal(score.breakdown.prBattles.comparable, 3);
  });

  it('gives neither side the consistency point on a tie', () => {
    const score = computeRivalryScore(
      { battles: [], consistency: { you: 10, rival: 10 }, challenges: { youWon: 0, rivalWon: 0 } },
      DEFAULT_SCORING,
      NAMES,
    );
    assert.equal(score.breakdown.consistency.winner, 'tie');
    assert.equal(score.you, 0);
    assert.equal(score.rival, 0);
    assert.equal(score.headline, 'Draw 0–0');
  });

  it('is re-weightable from config without touching code', () => {
    const score = computeRivalryScore(
      { battles, consistency: { you: 30, rival: 10 }, challenges: { youWon: 0, rivalWon: 0 } },
      { ...DEFAULT_SCORING, prBattleWin: 1, consistencyWin: 5 },
      NAMES,
    );
    assert.equal(score.you, 1 + 5);
    assert.equal(score.rival, 2);
  });
});

describe('rivalryPair', () => {
  it('orders a pair the same way from either side', () => {
    assert.deepEqual(rivalryPair('b', 'a'), ['a', 'b']);
    assert.deepEqual(rivalryPair('a', 'b'), ['a', 'b']);
  });
});
