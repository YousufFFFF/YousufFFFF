import { daysBetween } from './dates.ts';
import type { IsoDate, Uuid } from './types.ts';

/**
 * Challenges: a head-to-head with a target and a deadline, always between two
 * connected users.
 */

export type ChallengeType = 'pr' | 'consistency' | 'exercise' | 'volume' | 'workout_count';

export type ChallengeStatus = 'pending' | 'active' | 'completed' | 'declined' | 'cancelled' | 'expired';

export interface ChallengeDefinition {
  type: ChallengeType;
  exerciseId: Uuid | null;
  /** grams for pr/exercise/volume challenges; a plain count otherwise. */
  target: number | null;
  startDate: IsoDate;
  deadline: IsoDate;
}

export interface ChallengeProgress {
  userId: Uuid;
  /** Same unit as `ChallengeDefinition.target`. */
  value: number;
}

export interface ChallengeState {
  status: ChallengeStatus;
  daysRemaining: number;
  /** 0–100 per participant against the target. */
  progressPct: Record<Uuid, number>;
  leaderId: Uuid | null;
  /** Set once the challenge resolves; `null` on a draw. */
  winnerId: Uuid | null;
  /** True when someone has met the target outright. */
  targetMet: boolean;
  summary: string;
}

/** Challenge types where the target is a threshold anyone can clear outright. */
const THRESHOLD_TYPES: ReadonlySet<ChallengeType> = new Set(['pr', 'exercise', 'consistency', 'workout_count']);

export function evaluateChallenge(
  definition: ChallengeDefinition,
  progress: ReadonlyArray<ChallengeProgress>,
  status: ChallengeStatus,
  today: IsoDate,
): ChallengeState {
  const daysRemaining = Math.max(0, daysBetween(today, definition.deadline));
  const expired = daysBetween(today, definition.deadline) < 0;

  const progressPct: Record<Uuid, number> = {};
  for (const p of progress) {
    progressPct[p.userId] =
      definition.target && definition.target > 0
        ? Math.min(100, Math.round((p.value / definition.target) * 100))
        : 0;
  }

  const ordered = [...progress].sort((a, b) => b.value - a.value);
  const best = ordered[0] ?? null;
  const tied = best !== null && ordered.filter((p) => p.value === best.value).length > 1;
  const leaderId = best && !tied ? best.userId : null;

  const targetMet =
    definition.target !== null &&
    THRESHOLD_TYPES.has(definition.type) &&
    progress.some((p) => p.value >= definition.target!);

  let resolvedStatus = status;
  if (status === 'active' && (expired || targetMet)) resolvedStatus = expired && !targetMet ? 'expired' : 'completed';

  const winnerId = resolvedStatus === 'completed' || resolvedStatus === 'expired' ? leaderId : null;

  let summary: string;
  if (resolvedStatus === 'pending') summary = 'Waiting for your rival to accept.';
  else if (resolvedStatus === 'declined') summary = 'Challenge declined.';
  else if (resolvedStatus === 'cancelled') summary = 'Challenge cancelled.';
  else if (resolvedStatus === 'expired' && !winnerId) summary = 'Deadline passed — nobody hit the target.';
  else if (resolvedStatus === 'completed' || resolvedStatus === 'expired') summary = 'Challenge finished.';
  else if (daysRemaining === 0) summary = 'Last day.';
  else summary = `${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} left.`;

  return { status: resolvedStatus, daysRemaining, progressPct, leaderId, winnerId, targetMet, summary };
}

export interface ChallengeTemplate {
  code: string;
  type: ChallengeType;
  title: string;
  description: string;
  /** Default length in days; the creator can override it. */
  defaultDurationDays: number;
  /** For threshold challenges, a default target relative to the rival's best. */
  suggestedTargetPct?: number;
}

export const CHALLENGE_TEMPLATES: ReadonlyArray<ChallengeTemplate> = [
  { code: 'beat_my_pr', type: 'pr', title: 'Beat my PR', description: 'Out-lift your rival on one exercise before the deadline.', defaultDurationDays: 30, suggestedTargetPct: 105 },
  { code: 'highest_pr_by', type: 'exercise', title: 'Highest PR by a date', description: 'Whoever holds the heaviest lift on the deadline takes it.', defaultDurationDays: 45, suggestedTargetPct: 107 },
  { code: 'ten_this_month', type: 'consistency', title: '10 workouts this month', description: 'Consistency, not load. First to the target wins.', defaultDurationDays: 30 },
  { code: 'five_this_week', type: 'workout_count', title: '5 workouts this week', description: 'A short sprint on attendance.', defaultDurationDays: 7 },
  { code: 'volume_war', type: 'volume', title: 'Volume war', description: 'Highest total training volume over the window.', defaultDurationDays: 14 },
];

/** Suggested target for a threshold challenge, given the rival's current best. */
export function suggestTarget(template: ChallengeTemplate, rivalBest: number | null): number | null {
  if (!template.suggestedTargetPct || rivalBest === null) return null;
  // Round up to the nearest 2.5 kg so the number looks like a real plate jump.
  const raw = (rivalBest * template.suggestedTargetPct) / 100;
  return Math.ceil(raw / 2500) * 2500;
}
