import { estimateOneRepMax, type E1rmFormula } from './e1rm.ts';
import type { PersonalRecord, PrType, Uuid, WorkoutSet } from './types.ts';
import { volumeGrams } from './units.ts';

/**
 * PR detection.
 *
 * RIVAL tracks four independent record types per exercise, so a beginner adding
 * reps and a lifter adding plates both get credit:
 *
 *  - `weight`  heaviest single set
 *  - `reps`    most reps at a given weight (tracked per weight, not globally)
 *  - `volume`  highest total weight x reps for the exercise in one session
 *  - `e1rm`    highest estimated 1RM (clearly labelled as an estimate)
 */

export interface PrCandidate {
  exerciseId: Uuid;
  prType: PrType;
  value: number;
  weightGrams: number | null;
  reps: number | null;
  achievedAt: Date;
}

export interface DetectedPr extends PrCandidate {
  /** The record this beat, or `null` when it is the first of its kind. */
  previousValue: number | null;
  /** Percentage improvement over the previous record; `null` for a first PR. */
  improvementPct: number | null;
}

/** Key a rep PR by exercise *and* weight — "most reps at 80 kg" is its own record. */
export function prKey(c: { exerciseId: Uuid; prType: PrType; weightGrams: number | null }): string {
  return c.prType === 'reps'
    ? `${c.exerciseId}:reps:${c.weightGrams ?? 0}`
    : `${c.exerciseId}:${c.prType}`;
}

export function existingPrKey(pr: PersonalRecord): string {
  return prKey({ exerciseId: pr.exerciseId, prType: pr.prType, weightGrams: pr.weightGrams ?? null });
}

/**
 * Reduce the sets of a single session into the best candidate of each PR type.
 *
 * Warm-up sets are not special-cased: a set only becomes a candidate by being
 * the best of its kind, so lighter sets simply never win.
 */
export function candidatesFromSession(
  sets: ReadonlyArray<WorkoutSet>,
  formula: E1rmFormula = 'epley',
): PrCandidate[] {
  const byExercise = new Map<Uuid, WorkoutSet[]>();
  for (const set of sets) {
    if (set.reps <= 0 || set.weightGrams <= 0) continue; // bodyweight/empty sets carry no weight PR
    const list = byExercise.get(set.exerciseId);
    if (list) list.push(set);
    else byExercise.set(set.exerciseId, [set]);
  }

  const candidates: PrCandidate[] = [];

  for (const [exerciseId, exerciseSets] of byExercise) {
    const latestAt = exerciseSets.reduce(
      (acc, s) => (s.performedAt > acc ? s.performedAt : acc),
      exerciseSets[0]!.performedAt,
    );

    // --- weight PR: heaviest set ---
    let heaviest = exerciseSets[0]!;
    for (const set of exerciseSets) {
      if (set.weightGrams > heaviest.weightGrams) heaviest = set;
      // same weight, more reps is the better representative of that weight
      else if (set.weightGrams === heaviest.weightGrams && set.reps > heaviest.reps) heaviest = set;
    }
    candidates.push({
      exerciseId,
      prType: 'weight',
      value: heaviest.weightGrams,
      weightGrams: heaviest.weightGrams,
      reps: heaviest.reps,
      achievedAt: heaviest.performedAt,
    });

    // --- rep PRs: best rep count per distinct weight ---
    const bestRepsAtWeight = new Map<number, WorkoutSet>();
    for (const set of exerciseSets) {
      const current = bestRepsAtWeight.get(set.weightGrams);
      if (!current || set.reps > current.reps) bestRepsAtWeight.set(set.weightGrams, set);
    }
    for (const [weight, set] of bestRepsAtWeight) {
      candidates.push({
        exerciseId,
        prType: 'reps',
        value: set.reps,
        weightGrams: weight,
        reps: set.reps,
        achievedAt: set.performedAt,
      });
    }

    // --- volume PR: total weight x reps for this exercise this session ---
    const total = exerciseSets.reduce((sum, s) => sum + volumeGrams(s.weightGrams, s.reps), 0);
    candidates.push({
      exerciseId,
      prType: 'volume',
      value: total,
      weightGrams: null,
      reps: null,
      achievedAt: latestAt,
    });

    // --- estimated 1RM PR ---
    let bestE1rm: { value: number; set: WorkoutSet } | null = null;
    for (const set of exerciseSets) {
      const estimate = estimateOneRepMax(set.weightGrams, set.reps, formula);
      if (estimate !== null && (bestE1rm === null || estimate > bestE1rm.value)) {
        bestE1rm = { value: estimate, set };
      }
    }
    if (bestE1rm) {
      candidates.push({
        exerciseId,
        prType: 'e1rm',
        value: bestE1rm.value,
        weightGrams: bestE1rm.set.weightGrams,
        reps: bestE1rm.set.reps,
        achievedAt: bestE1rm.set.performedAt,
      });
    }
  }

  return candidates;
}

/**
 * Compare this session's candidates against the user's standing records.
 * Only strict improvements count — matching a PR is not beating it.
 */
export function detectPrs(
  candidates: ReadonlyArray<PrCandidate>,
  existing: ReadonlyArray<PersonalRecord>,
): DetectedPr[] {
  const standing = new Map<string, PersonalRecord>();
  for (const pr of existing) standing.set(existingPrKey(pr), pr);

  const detected: DetectedPr[] = [];
  for (const candidate of candidates) {
    const previous = standing.get(prKey(candidate));
    if (previous && candidate.value <= previous.value) continue;
    detected.push({
      ...candidate,
      previousValue: previous ? previous.value : null,
      improvementPct: previous ? improvementPercent(previous.value, candidate.value) : null,
    });
  }
  return detected;
}

/** Percentage change from `previous` to `current`, rounded to 2 decimals. */
export function improvementPercent(previous: number, current: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

/**
 * Which PR to celebrate when one session breaks several at once.
 * A heavier top set is the headline; volume is the quietest win.
 */
const HEADLINE_ORDER: Record<PrType, number> = { weight: 0, e1rm: 1, reps: 2, volume: 3 };

export function headlinePr(detected: ReadonlyArray<DetectedPr>): DetectedPr | null {
  if (detected.length === 0) return null;
  return [...detected].sort((a, b) => HEADLINE_ORDER[a.prType] - HEADLINE_ORDER[b.prType])[0]!;
}
