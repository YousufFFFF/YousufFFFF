import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LB_PER_KG, formatWeight, fromGrams, toGrams, volumeGrams, weightDelta } from '../src/units.ts';

describe('units', () => {
  it('stores kilograms as exact grams', () => {
    assert.equal(toGrams(100, 'kg'), 100_000);
    assert.equal(toGrams(32.5, 'kg'), 32_500);
    assert.equal(toGrams(2.25, 'kg'), 2_250);
  });

  it('round-trips a kilogram value without drift', () => {
    for (const kg of [20, 32.5, 47.5, 97.5, 142.5, 220]) {
      assert.equal(fromGrams(toGrams(kg, 'kg'), 'kg'), kg);
    }
  });

  it('round-trips a pound value to display precision', () => {
    for (const lb of [45, 135, 225, 315]) {
      assert.equal(fromGrams(toGrams(lb, 'lb'), 'lb'), lb);
    }
  });

  it('uses the conversion factor from the spec', () => {
    assert.ok(Math.abs(LB_PER_KG - 2.20462) < 0.00001);
    assert.equal(fromGrams(toGrams(100, 'kg'), 'lb'), 220.46);
  });

  it('compares weights entered in different units', () => {
    const inKg = toGrams(100, 'kg');
    const inLb = toGrams(220.46, 'lb');
    // 220.46 lb is a hair under 100 kg, so kg must win.
    assert.ok(inKg > inLb);
  });

  it('reports a signed delta in the viewer unit', () => {
    assert.equal(weightDelta(toGrams(97.5, 'kg'), toGrams(95, 'kg'), 'kg'), 2.5);
    assert.equal(weightDelta(toGrams(90, 'kg'), toGrams(95, 'kg'), 'kg'), -5);
  });

  it('formats for display', () => {
    assert.equal(formatWeight(toGrams(95, 'kg'), 'kg'), '95 kg');
    assert.equal(formatWeight(toGrams(32.5, 'kg'), 'kg'), '32.5 kg');
  });

  it('rejects nonsense input', () => {
    assert.throws(() => toGrams(-5, 'kg'), RangeError);
    assert.throws(() => toGrams(Number.NaN, 'kg'), RangeError);
    assert.throws(() => volumeGrams(1000, 1.5), RangeError);
  });

  it('computes volume', () => {
    assert.equal(volumeGrams(toGrams(80, 'kg'), 10), 800_000);
  });
});
