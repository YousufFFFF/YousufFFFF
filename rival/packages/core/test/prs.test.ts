import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { candidatesFromSession, detectPrs, headlinePr, improvementPercent } from '../src/prs.ts';
import { fromGrams, toGrams } from '../src/units.ts';
import type { PersonalRecord, WorkoutSet } from '../src/types.ts';

const BENCH = '11111111-1111-1111-1111-111111111111';
const SQUAT = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';
const AT = new Date('2026-09-20T10:00:00Z');

function set(exerciseId: string, setNumber: number, kg: number, reps: number): WorkoutSet {
  return {
    exerciseId,
    setNumber,
    weightGrams: toGrams(kg, 'kg'),
    reps,
    enteredUnit: 'kg',
    performedAt: new Date(AT.getTime() + setNumber * 60_000),
  };
}

function record(exerciseId: string, prType: PersonalRecord['prType'], value: number, weightGrams: number | null = null): PersonalRecord {
  return { userId: USER, exerciseId, prType, value, weightGrams, reps: null, achievedAt: new Date('2026-01-01') };
}

describe('PR candidates', () => {
  it('takes the heaviest set as the weight candidate', () => {
    const candidates = candidatesFromSession([set(BENCH, 1, 60, 10), set(BENCH, 2, 70, 8), set(BENCH, 3, 80, 5)]);
    const weight = candidates.find((c) => c.prType === 'weight')!;
    assert.equal(fromGrams(weight.value, 'kg'), 80);
    assert.equal(weight.reps, 5);
  });

  it('tracks rep PRs per weight, not globally', () => {
    const candidates = candidatesFromSession([set(BENCH, 1, 80, 5), set(BENCH, 2, 80, 7), set(BENCH, 3, 60, 12)]);
    const repPrs = candidates.filter((c) => c.prType === 'reps');
    assert.equal(repPrs.length, 2);
    assert.equal(repPrs.find((c) => c.weightGrams === toGrams(80, 'kg'))!.value, 7);
    assert.equal(repPrs.find((c) => c.weightGrams === toGrams(60, 'kg'))!.value, 12);
  });

  it('sums session volume per exercise', () => {
    const candidates = candidatesFromSession([set(BENCH, 1, 60, 10), set(BENCH, 2, 70, 8), set(BENCH, 3, 80, 5)]);
    const volume = candidates.find((c) => c.prType === 'volume')!;
    // 600 + 560 + 400 = 1560 kg
    assert.equal(fromGrams(volume.value, 'kg'), 1560);
  });

  it('keeps exercises separate', () => {
    const candidates = candidatesFromSession([set(BENCH, 1, 80, 5), set(SQUAT, 2, 120, 5)]);
    const volumes = candidates.filter((c) => c.prType === 'volume');
    assert.equal(volumes.length, 2);
  });

  it('ignores sets with no load or no reps', () => {
    const candidates = candidatesFromSession([set(BENCH, 1, 0, 10), set(BENCH, 2, 80, 0)]);
    assert.equal(candidates.length, 0);
  });
});

describe('PR detection', () => {
  it('flags a heavier lift as a new PR with the previous value', () => {
    const candidates = candidatesFromSession([set(BENCH, 1, 85, 1)]);
    const detected = detectPrs(candidates, [record(BENCH, 'weight', toGrams(80, 'kg'))]);
    const weight = detected.find((d) => d.prType === 'weight')!;
    assert.equal(fromGrams(weight.value, 'kg'), 85);
    assert.equal(fromGrams(weight.previousValue!, 'kg'), 80);
    assert.equal(weight.improvementPct, 6.25);
  });

  it('does not count matching an existing PR', () => {
    const candidates = candidatesFromSession([set(BENCH, 1, 80, 1)]);
    const detected = detectPrs(candidates, [record(BENCH, 'weight', toGrams(80, 'kg'))]);
    assert.equal(detected.some((d) => d.prType === 'weight'), false);
  });

  it('treats a first-ever lift as a PR with no previous value', () => {
    const detected = detectPrs(candidatesFromSession([set(BENCH, 1, 60, 5)]), []);
    const weight = detected.find((d) => d.prType === 'weight')!;
    assert.equal(weight.previousValue, null);
    assert.equal(weight.improvementPct, null);
  });

  it('gives a rep PR at 80 kg without touching the 100 kg record', () => {
    const existing = [record(BENCH, 'weight', toGrams(100, 'kg')), record(BENCH, 'reps', 8, toGrams(80, 'kg'))];
    const detected = detectPrs(candidatesFromSession([set(BENCH, 1, 80, 10)]), existing);
    assert.equal(detected.some((d) => d.prType === 'weight'), false);
    const repPr = detected.find((d) => d.prType === 'reps')!;
    assert.equal(repPr.value, 10);
    assert.equal(repPr.previousValue, 8);
  });

  it('picks the heaviest lift as the headline when several PRs land at once', () => {
    const detected = detectPrs(candidatesFromSession([set(BENCH, 1, 95, 3)]), []);
    assert.equal(headlinePr(detected)!.prType, 'weight');
  });

  it('has no headline when nothing was beaten', () => {
    assert.equal(headlinePr([]), null);
  });
});

describe('improvementPercent', () => {
  it('matches the spec example', () => {
    assert.equal(improvementPercent(80, 95), 18.75);
    assert.equal(improvementPercent(100, 105), 5);
    assert.equal(improvementPercent(90, 95), 5.56);
  });

  it('is undefined without a baseline', () => {
    assert.equal(improvementPercent(0, 95), null);
  });
});
