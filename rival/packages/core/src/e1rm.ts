/**
 * Estimated one-rep max.
 *
 * IMPORTANT: this is an *estimate* derived from a submaximal set, not a tested
 * maximum. Everything surfaced from here is labelled as an estimate in the UI
 * (see `E1RM_DISCLAIMER`) and RIVAL never presents it as a lift the user has
 * actually performed.
 */

export type E1rmFormula = 'epley' | 'brzycki';

export const E1RM_DISCLAIMER =
  'Estimated from your logged set — not a tested 1-rep max.';

/**
 * Formulas lose accuracy fast past ~10 reps, so we refuse to extrapolate
 * beyond that rather than publishing a confident-looking wrong number.
 */
export const MAX_REPS_FOR_ESTIMATE = 10;

/** Epley: `w * (1 + r/30)`. */
function epley(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

/** Brzycki: `w * 36 / (37 - r)`. */
function brzycki(weight: number, reps: number): number {
  return (weight * 36) / (37 - reps);
}

/**
 * Estimated 1RM in the same unit as `weightGrams` (i.e. grams).
 * Returns `null` when the set cannot support a meaningful estimate.
 */
export function estimateOneRepMax(
  weightGrams: number,
  reps: number,
  formula: E1rmFormula = 'epley',
): number | null {
  if (!Number.isFinite(weightGrams) || weightGrams <= 0) return null;
  if (!Number.isInteger(reps) || reps < 1) return null;
  if (reps === 1) return Math.round(weightGrams);
  if (reps > MAX_REPS_FOR_ESTIMATE) return null;
  const raw = formula === 'brzycki' ? brzycki(weightGrams, reps) : epley(weightGrams, reps);
  return Math.round(raw);
}

/** Best estimate across a group of sets (e.g. one exercise inside a session). */
export function bestOneRepMax(
  sets: ReadonlyArray<{ weightGrams: number; reps: number }>,
  formula: E1rmFormula = 'epley',
): number | null {
  let best: number | null = null;
  for (const set of sets) {
    const estimate = estimateOneRepMax(set.weightGrams, set.reps, formula);
    if (estimate !== null && (best === null || estimate > best)) best = estimate;
  }
  return best;
}
