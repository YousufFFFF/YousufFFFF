import { addDays, dayIndex, daysBetween, eachDay, fromDayIndex } from './dates.ts';
import type { IsoDate } from './types.ts';

/**
 * Consistency & attendance.
 *
 * A gym day is a logged session that actually contains work (enforced at the
 * API boundary: >= 1 set). Two sessions on the same calendar day still count as
 * one gym day, so attendance cannot be inflated by splitting a workout.
 *
 * Rest days are never failures (see `currentStreak`): a streak survives any gap
 * the user's own training schedule allows for.
 */

/** How many days a week the user intends to train. */
export type WeeklyTarget = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const DEFAULT_WEEKLY_TARGET: WeeklyTarget = 4;

/**
 * Rest days a streak tolerates between sessions, derived from the user's own
 * schedule. Someone training twice a week is not less consistent than someone
 * training six times — they are consistent against a different plan.
 */
export function allowedRestDays(weeklyTarget: WeeklyTarget): number {
  return Math.min(3, Math.max(1, 7 - weeklyTarget));
}

/** Distinct, sorted gym days from raw session dates. */
export function gymDays(sessionDates: ReadonlyArray<IsoDate>): IsoDate[] {
  return [...new Set(sessionDates)].sort();
}

export function sessionsInRange(
  sessionDates: ReadonlyArray<IsoDate>,
  from: IsoDate,
  to: IsoDate,
): number {
  const lo = dayIndex(from);
  const hi = dayIndex(to);
  return gymDays(sessionDates).filter((d) => {
    const i = dayIndex(d);
    return i >= lo && i <= hi;
  }).length;
}

export interface StreakResult {
  /** Consecutive days of *staying on plan*, ending today. */
  currentDays: number;
  longestDays: number;
  lastSessionDate: IsoDate | null;
  /** Days since the last session — 0 when the user trained today. */
  daysSinceLastSession: number | null;
  /** True once the gap exceeds what the schedule allows. */
  atRisk: boolean;
}

/**
 * A streak runs from the first session of an unbroken chain to today, where
 * "unbroken" means no gap longer than `allowedRestDays` between sessions and
 * none between the last session and today.
 */
export function currentStreak(
  sessionDates: ReadonlyArray<IsoDate>,
  today: IsoDate,
  weeklyTarget: WeeklyTarget = DEFAULT_WEEKLY_TARGET,
): StreakResult {
  const days = gymDays(sessionDates).filter((d) => dayIndex(d) <= dayIndex(today));
  if (days.length === 0) {
    return { currentDays: 0, longestDays: 0, lastSessionDate: null, daysSinceLastSession: null, atRisk: false };
  }

  const tolerance = allowedRestDays(weeklyTarget);
  const last = days[days.length - 1]!;
  const sinceLast = daysBetween(last, today);

  // Longest chain ever recorded, measured in calendar days it covered.
  let longest = 1;
  let chainStart = days[0]!;
  for (let i = 1; i < days.length; i++) {
    const gap = daysBetween(days[i - 1]!, days[i]!);
    if (gap - 1 > tolerance) chainStart = days[i]!;
    longest = Math.max(longest, daysBetween(chainStart, days[i]!) + 1);
  }

  // Current chain: walk back from the last session while gaps stay legal.
  let current = 0;
  if (sinceLast <= tolerance) {
    let start = last;
    for (let i = days.length - 1; i > 0; i--) {
      const gap = daysBetween(days[i - 1]!, days[i]!);
      if (gap - 1 > tolerance) break;
      start = days[i - 1]!;
    }
    current = daysBetween(start, today) + 1;
    longest = Math.max(longest, current);
  }

  return {
    currentDays: current,
    longestDays: longest,
    lastSessionDate: last,
    daysSinceLastSession: sinceLast,
    atRisk: current > 0 && sinceLast === tolerance,
  };
}

export interface ConsistencyScore {
  sessions: number;
  /** Sessions the schedule asked for over the same window. */
  target: number;
  /** 0–100, capped: training *more* than planned never inflates the score. */
  score: number;
}

/**
 * Schedule adherence over a window. Capped at 100 on purpose — RIVAL should not
 * reward piling on extra sessions to win a number.
 */
export function consistencyScore(
  sessionDates: ReadonlyArray<IsoDate>,
  from: IsoDate,
  to: IsoDate,
  weeklyTarget: WeeklyTarget = DEFAULT_WEEKLY_TARGET,
): ConsistencyScore {
  const windowDays = daysBetween(from, to) + 1;
  const target = Math.max(1, Math.round((windowDays / 7) * weeklyTarget));
  const sessions = sessionsInRange(sessionDates, from, to);
  return { sessions, target, score: Math.min(100, Math.round((sessions / target) * 100)) };
}

export interface ConsistencyGap {
  you: number;
  rival: number;
  /** Positive when the rival is ahead, negative when you are. */
  gap: number;
  leader: 'you' | 'rival' | 'tie';
  /** Sessions you would need to draw level. */
  sessionsToCatchUp: number;
  /**
   * The earliest day you could be level, assuming at most one gym day per day.
   * RIVAL never suggests doubling up to close a gap.
   */
  earliestLevelDate: IsoDate | null;
  message: string;
}

export function consistencyGap(
  yourSessions: number,
  rivalSessions: number,
  today: IsoDate,
  names: { you: string; rival: string } = { you: 'You', rival: 'Your rival' },
): ConsistencyGap {
  const gap = rivalSessions - yourSessions;
  const leader: ConsistencyGap['leader'] = gap > 0 ? 'rival' : gap < 0 ? 'you' : 'tie';
  const sessionsToCatchUp = Math.max(0, gap);

  let message: string;
  if (leader === 'rival') {
    message = `You're ${gap} gym ${gap === 1 ? 'day' : 'days'} behind ${names.rival}.`;
  } else if (leader === 'you') {
    message = `You're ${-gap} gym ${-gap === 1 ? 'day' : 'days'} ahead of ${names.rival}.`;
  } else {
    message = `You and ${names.rival} are level on gym days.`;
  }

  return {
    you: yourSessions,
    rival: rivalSessions,
    gap,
    leader,
    sessionsToCatchUp,
    // One session per day, always — never "train twice today to catch up".
    earliestLevelDate: sessionsToCatchUp > 0 ? addDays(today, sessionsToCatchUp - 1) : null,
    message,
  };
}

/** Calendar cells for the workout history view. */
export interface CalendarDay {
  date: IsoDate;
  trained: boolean;
  /** A planned rest day is shown as rest, not as a miss. */
  rest: boolean;
}

export function attendanceCalendar(
  sessionDates: ReadonlyArray<IsoDate>,
  from: IsoDate,
  to: IsoDate,
  restWeekdays: ReadonlyArray<number> = [],
): CalendarDay[] {
  const trained = new Set(gymDays(sessionDates));
  return eachDay(from, to).map((date) => ({
    date,
    trained: trained.has(date),
    rest: !trained.has(date) && restWeekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay()),
  }));
}

/** Rolling window helper used by the rivalry and leaderboard services. */
export function rollingWindow(today: IsoDate, days: number): { from: IsoDate; to: IsoDate } {
  return { from: fromDayIndex(dayIndex(today) - (days - 1)), to: today };
}
