import type { Uuid, WeightUnit } from './types.ts';
import { fromGrams, weightDelta } from './units.ts';

/**
 * Home screen personalisation.
 *
 * The home screen has one job: surface the single most relevant piece of
 * competition right now. This module turns raw signals into ranked cards so the
 * client renders a feed that changes as the rivalries do, rather than a fixed
 * dashboard.
 */

export type HomeCardKind =
  | 'pr_under_threat'
  | 'consistency_behind'
  | 'took_the_lead'
  | 'challenge_incoming'
  | 'challenge_deadline'
  | 'pr_battle'
  | 'log_workout'
  | 'workout_complete'
  | 'streak'
  | 'recovery'
  | 'no_rivals';

export interface HomeCard {
  kind: HomeCardKind;
  /** Higher sorts first. */
  priority: number;
  title: string;
  body: string;
  cta: { label: string; action: string; params?: Record<string, string> } | null;
  tone: 'alert' | 'urgent' | 'positive' | 'neutral';
  rivalId?: Uuid;
  exerciseId?: Uuid;
}

export interface HomeSignals {
  unit: WeightUnit;
  trainedToday: boolean;
  streakDays: number;
  connectionCount: number;
  /** A rival within striking distance of one of your records. */
  threats: ReadonlyArray<{
    rivalId: Uuid;
    rivalName: string;
    exerciseId: Uuid;
    exerciseName: string;
    yourGrams: number;
    rivalGrams: number;
  }>;
  /** Rivals ahead of you on gym days in the active window. */
  behind: ReadonlyArray<{ rivalId: Uuid; rivalName: string; yourSessions: number; rivalSessions: number }>;
  /** Leads you have taken since you last opened the app. */
  recentLeads: ReadonlyArray<{ rivalId: Uuid; rivalName: string; exerciseId: Uuid; exerciseName: string; deltaGrams: number }>;
  /** Challenges waiting on your answer. */
  pendingChallenges: ReadonlyArray<{ challengeId: Uuid; fromName: string; title: string }>;
  /** Active challenges closing soon. */
  closingChallenges: ReadonlyArray<{ challengeId: Uuid; title: string; daysRemaining: number }>;
  /** The closest ongoing PR battle, if any. */
  closestBattle: {
    rivalId: Uuid;
    rivalName: string;
    exerciseId: Uuid;
    exerciseName: string;
    yourGrams: number;
    rivalGrams: number;
  } | null;
  recoveryNotices: ReadonlyArray<{ title: string; message: string }>;
}

/** A rival this close to your record is worth shouting about. */
const THREAT_MARGIN_GRAMS = 5_000; // 5 kg

export function buildHomeFeed(signals: HomeSignals): HomeCard[] {
  const cards: HomeCard[] = [];
  const { unit } = signals;

  if (signals.connectionCount === 0) {
    cards.push({
      kind: 'no_rivals',
      priority: 100,
      title: 'No rivals yet',
      body: 'Connect with your gym friends and start your first rivalry.',
      cta: { label: 'Find friends', action: 'connections.search' },
      tone: 'neutral',
    });
  }

  for (const threat of signals.threats) {
    const margin = threat.yourGrams - threat.rivalGrams;
    if (margin <= 0 || margin > THREAT_MARGIN_GRAMS) continue;
    cards.push({
      kind: 'pr_under_threat',
      priority: 95,
      title: `${threat.rivalName} is ${fromGrams(margin, unit)} ${unit} away from your PR`,
      body: `Your ${threat.exerciseName} is ${fromGrams(threat.yourGrams, unit)} ${unit}. ${threat.rivalName} is at ${fromGrams(threat.rivalGrams, unit)} ${unit}.`,
      cta: { label: 'Defend it', action: 'workout.start', params: { exerciseId: threat.exerciseId } },
      tone: 'alert',
      rivalId: threat.rivalId,
      exerciseId: threat.exerciseId,
    });
  }

  // Several leads collapse into one card. Three identical "you took the lead"
  // banners in a row reads as noise and buries whatever is actually urgent.
  if (signals.recentLeads.length > 0) {
    const [first, ...rest] = signals.recentLeads;
    const lead = first!;
    cards.push({
      kind: 'took_the_lead',
      priority: 90,
      title: rest.length === 0 ? 'You took the lead' : `You took the lead on ${signals.recentLeads.length} lifts`,
      body:
        rest.length === 0
          ? `Your ${lead.exerciseName} PR is now ${fromGrams(lead.deltaGrams, unit)} ${unit} above ${lead.rivalName}'s.`
          : `${lead.exerciseName} and ${rest.map((l) => l.exerciseName).join(', ')} — you're ahead on all of them now.`,
      cta: { label: 'Share it', action: 'share.pr', params: { exerciseId: lead.exerciseId } },
      tone: 'positive',
      rivalId: lead.rivalId,
      exerciseId: lead.exerciseId,
    });
  }

  for (const challenge of signals.pendingChallenges) {
    cards.push({
      kind: 'challenge_incoming',
      priority: 88,
      title: `${challenge.fromName} challenged you`,
      body: challenge.title,
      cta: { label: 'View challenge', action: 'challenge.open', params: { challengeId: challenge.challengeId } },
      tone: 'urgent',
    });
  }

  const worstGap = [...signals.behind].sort(
    (a, b) => b.rivalSessions - b.yourSessions - (a.rivalSessions - a.yourSessions),
  )[0];
  if (worstGap) {
    const gap = worstGap.rivalSessions - worstGap.yourSessions;
    cards.push({
      kind: 'consistency_behind',
      priority: 85,
      title: `${worstGap.rivalName} is ${gap} ${gap === 1 ? 'day' : 'days'} ahead`,
      body: `Gym days: you ${worstGap.yourSessions}, ${worstGap.rivalName} ${worstGap.rivalSessions}.`,
      cta: signals.trainedToday
        ? null
        : { label: 'Catch up', action: 'catchup.open', params: { rivalId: worstGap.rivalId } },
      tone: 'alert',
      rivalId: worstGap.rivalId,
    });
  }

  for (const challenge of signals.closingChallenges) {
    if (challenge.daysRemaining > 3) continue;
    cards.push({
      kind: 'challenge_deadline',
      priority: 80,
      title: `${challenge.daysRemaining === 0 ? 'Last day' : `${challenge.daysRemaining} days left`}`,
      body: challenge.title,
      cta: { label: 'View challenge', action: 'challenge.open', params: { challengeId: challenge.challengeId } },
      tone: 'urgent',
    });
  }

  if (signals.closestBattle) {
    const battle = signals.closestBattle;
    const delta = weightDelta(battle.yourGrams, battle.rivalGrams, unit);
    cards.push({
      kind: 'pr_battle',
      priority: 70,
      title: battle.exerciseName,
      body:
        delta >= 0
          ? `You lead ${battle.rivalName} by ${delta} ${unit}.`
          : `${battle.rivalName} leads by ${Math.abs(delta)} ${unit}.`,
      cta: { label: delta >= 0 ? 'Hold the lead' : 'Take the lead', action: 'rivalry.open', params: { rivalId: battle.rivalId } },
      tone: delta >= 0 ? 'positive' : 'alert',
      rivalId: battle.rivalId,
      exerciseId: battle.exerciseId,
    });
  }

  cards.push(
    signals.trainedToday
      ? {
          kind: 'workout_complete',
          priority: 60,
          title: 'Workout complete',
          body: 'Logged for today. Your gym day is counted.',
          cta: { label: 'View workout', action: 'workout.today' },
          tone: 'positive',
        }
      : {
          kind: 'log_workout',
          priority: 65,
          title: "You haven't trained today",
          body: 'Log your session to keep your streak and your rivalries moving.',
          cta: { label: 'Log workout', action: 'workout.start' },
          tone: 'neutral',
        },
  );

  if (signals.streakDays > 0) {
    cards.push({
      kind: 'streak',
      priority: 40,
      title: `${signals.streakDays}-day streak`,
      body: 'Rest days are part of the plan — they never break your streak.',
      cta: null,
      tone: 'positive',
    });
  }

  // Recovery notices always render, and always last: they must never compete
  // with a call to action that would push more training.
  for (const notice of signals.recoveryNotices) {
    cards.push({
      kind: 'recovery',
      priority: 30,
      title: notice.title,
      body: notice.message,
      cta: null,
      tone: 'neutral',
    });
  }

  return cards.sort((a, b) => b.priority - a.priority);
}

export function greeting(date: Date, name: string): string {
  const hour = date.getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return `${part}, ${name}`;
}
