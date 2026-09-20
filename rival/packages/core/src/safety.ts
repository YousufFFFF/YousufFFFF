import { dayIndex, daysBetween } from './dates.ts';
import type { IsoDate } from './types.ts';
import { gymDays } from './consistency.ts';

/**
 * Anti-compulsive guard rails.
 *
 * Competition is the product, but it must never push someone into training they
 * shouldn't do. Two rules hold everywhere in the codebase:
 *
 *  1. RIVAL never suggests more than one gym day per calendar day to close a
 *     leaderboard gap (see `consistencyGap.earliestLevelDate`).
 *  2. When the logged pattern looks like too much, the app says so — neutrally,
 *     without shaming and without a competitive call to action.
 */

export type RecoveryFlag =
  | 'multiple_sessions_today'
  | 'no_rest_day_this_week'
  | 'long_unbroken_block'
  | 'very_long_session';

export interface RecoveryNotice {
  flag: RecoveryFlag;
  title: string;
  message: string;
}

/** Sessions logged on the same day before we mention recovery. */
const SAME_DAY_SESSION_LIMIT = 2;
/** Consecutive trained days before we mention a rest day. */
const CONSECUTIVE_DAYS_LIMIT = 7;
/** Trained days inside a rolling week before we mention a rest day. */
const WEEKLY_DAYS_LIMIT = 7;
/** A single session running longer than this is worth a gentle note. */
const LONG_SESSION_SECONDS = 4 * 60 * 60;

export interface TrainingLoad {
  /** Every session date logged, most recent included; duplicates allowed. */
  sessionDates: ReadonlyArray<IsoDate>;
  today: IsoDate;
  /** Duration of the session just logged, if known. */
  lastSessionSeconds?: number | null;
}

/**
 * Neutral recovery reminders for the pattern in `load`. Never returns advice to
 * train more, and never blocks logging — users keep full control of their data.
 */
export function recoveryNotices(load: TrainingLoad): RecoveryNotice[] {
  const notices: RecoveryNotice[] = [];

  const sessionsToday = load.sessionDates.filter((d) => d === load.today).length;
  if (sessionsToday >= SAME_DAY_SESSION_LIMIT) {
    notices.push({
      flag: 'multiple_sessions_today',
      title: 'Consistency matters, but recovery matters too',
      message:
        `That's ${sessionsToday} sessions logged today. Extra sessions don't add extra gym days ` +
        'to your streak or your rivalries — one day counts once.',
    });
  }

  const days = gymDays(load.sessionDates).filter((d) => dayIndex(d) <= dayIndex(load.today));

  // Consecutive trained days ending today.
  let consecutive = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const expected = daysBetween(days[i]!, load.today);
    if (expected === consecutive) consecutive++;
    else break;
  }
  if (consecutive >= CONSECUTIVE_DAYS_LIMIT) {
    notices.push({
      flag: 'long_unbroken_block',
      title: 'Consistency matters, but recovery matters too',
      message:
        `You've trained ${consecutive} days in a row. Rest days are part of getting stronger — ` +
        "a planned rest day won't cost you your streak.",
    });
  }

  const lastSeven = days.filter((d) => daysBetween(d, load.today) < 7).length;
  if (lastSeven >= WEEKLY_DAYS_LIMIT && consecutive < CONSECUTIVE_DAYS_LIMIT) {
    notices.push({
      flag: 'no_rest_day_this_week',
      title: 'No rest day this week',
      message: "You've trained every day this week. Recovery is when the progress actually lands.",
    });
  }

  if (load.lastSessionSeconds != null && load.lastSessionSeconds > LONG_SESSION_SECONDS) {
    const hours = Math.floor(load.lastSessionSeconds / 3600);
    notices.push({
      flag: 'very_long_session',
      title: 'That was a long one',
      message: `That session ran over ${hours} hours. Check it's logged right — and get some food and sleep in.`,
    });
  }

  return notices;
}

/**
 * Guard for anything that renders a "catch up" call to action. When the user has
 * already trained today, the honest answer is "tomorrow", not "again".
 */
export function catchUpCallToAction(
  trainedToday: boolean,
  sessionsBehind: number,
): { label: string; enabled: boolean; helper: string } {
  if (sessionsBehind <= 0) {
    return { label: 'You’re ahead', enabled: false, helper: 'Keep your schedule — no catching up needed.' };
  }
  if (trainedToday) {
    return {
      label: 'Logged for today',
      enabled: false,
      helper: 'Today is done. Your next session closes the gap by one — rest up until then.',
    };
  }
  return {
    label: 'Log workout',
    enabled: true,
    helper: `Your next session closes the gap to ${sessionsBehind - 1}.`,
  };
}

/**
 * Topics RIVAL will not generate coaching copy about. Anything matching here is
 * answered with a referral to a professional instead of advice.
 */
export const OUT_OF_SCOPE_TOPICS = [
  'training through pain or injury',
  'weight cutting',
  'calorie restriction targets',
  'supplement or drug protocols',
] as const;
