/**
 * Weight units.
 *
 * Every weight in RIVAL is stored internally in **grams** (integer) so that
 * comparisons between users are exact and unit-independent. Conversion happens
 * only at the display boundary.
 *
 *   1 kg = 1000 g            (exact)
 *   1 lb = 453.59237 g       (exact, international avoirdupois pound)
 *   1 kg = 2.2046226... lb
 */

export type WeightUnit = 'kg' | 'lb';

export const GRAMS_PER_KG = 1000;
export const GRAMS_PER_LB = 453.59237;
export const LB_PER_KG = GRAMS_PER_KG / GRAMS_PER_LB; // 2.20462262...

/** Gym plates go in 0.25 kg steps at the finest; round display to 2 decimals. */
const DISPLAY_DECIMALS = 2;

function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  // `Number.EPSILON` nudge avoids 32.499999999999996 -> 32.49
  return Math.round((value + Number.EPSILON) * f) / f;
}

/** Convert a user-entered weight into the internal integer gram representation. */
export function toGrams(value: number, unit: WeightUnit): number {
  if (!Number.isFinite(value)) throw new RangeError('weight must be a finite number');
  if (value < 0) throw new RangeError('weight must not be negative');
  const grams = unit === 'kg' ? value * GRAMS_PER_KG : value * GRAMS_PER_LB;
  return Math.round(grams);
}

/** Convert internal grams back to a display value in the requested unit. */
export function fromGrams(grams: number, unit: WeightUnit): number {
  const value = unit === 'kg' ? grams / GRAMS_PER_KG : grams / GRAMS_PER_LB;
  return roundTo(value, DISPLAY_DECIMALS);
}

/** "95 kg" / "209.44 lb" — trailing zeros trimmed. */
export function formatWeight(grams: number, unit: WeightUnit): string {
  const n = fromGrams(grams, unit);
  const text = Number.isInteger(n) ? String(n) : String(n);
  return `${text} ${unit}`;
}

/**
 * Signed difference between two weights, expressed in the viewer's unit.
 * Positive means `a` is heavier than `b`.
 */
export function weightDelta(aGrams: number, bGrams: number, unit: WeightUnit): number {
  return roundTo(fromGrams(aGrams, unit) - fromGrams(bGrams, unit), DISPLAY_DECIMALS);
}

/** Volume (weight x reps) is stored in grams too, but can be large — keep it a number. */
export function volumeGrams(weightGrams: number, reps: number): number {
  if (!Number.isInteger(reps) || reps < 0) throw new RangeError('reps must be a non-negative integer');
  return weightGrams * reps;
}
