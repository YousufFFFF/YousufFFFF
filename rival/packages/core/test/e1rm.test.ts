import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bestOneRepMax, estimateOneRepMax } from '../src/e1rm.ts';
import { fromGrams, toGrams } from '../src/units.ts';

describe('estimated 1RM', () => {
  it('returns the lift itself for a single', () => {
    assert.equal(estimateOneRepMax(toGrams(100, 'kg'), 1), toGrams(100, 'kg'));
  });

  it('applies Epley', () => {
    // 100 kg x 5 -> 100 * (1 + 5/30) = 116.67 kg
    const estimate = estimateOneRepMax(toGrams(100, 'kg'), 5, 'epley')!;
    assert.equal(fromGrams(estimate, 'kg'), 116.67);
  });

  it('applies Brzycki', () => {
    // 100 kg x 5 -> 100 * 36 / 32 = 112.5 kg
    const estimate = estimateOneRepMax(toGrams(100, 'kg'), 5, 'brzycki')!;
    assert.equal(fromGrams(estimate, 'kg'), 112.5);
  });

  it('refuses to extrapolate past 10 reps', () => {
    assert.equal(estimateOneRepMax(toGrams(60, 'kg'), 11), null);
  });

  it('rejects invalid sets', () => {
    assert.equal(estimateOneRepMax(0, 5), null);
    assert.equal(estimateOneRepMax(toGrams(60, 'kg'), 0), null);
    assert.equal(estimateOneRepMax(toGrams(60, 'kg'), 2.5), null);
  });

  it('picks the best estimate across a group of sets', () => {
    const best = bestOneRepMax([
      { weightGrams: toGrams(60, 'kg'), reps: 10 }, // 80 kg
      { weightGrams: toGrams(80, 'kg'), reps: 5 },  // 93.33 kg
      { weightGrams: toGrams(90, 'kg'), reps: 1 },  // 90 kg
    ])!;
    assert.equal(fromGrams(best, 'kg'), 93.33);
  });
});
