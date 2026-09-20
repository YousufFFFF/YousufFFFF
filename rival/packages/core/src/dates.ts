import type { IsoDate } from './types.ts';

/**
 * Calendar-day helpers.
 *
 * Session dates are stored as the user's *local* calendar day (`YYYY-MM-DD`),
 * so all arithmetic here is plain day counting with no timezone maths — the
 * timezone was already resolved when the session was written.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function assertIsoDate(date: string): asserts date is IsoDate {
  if (!ISO_DATE.test(date)) throw new RangeError(`expected YYYY-MM-DD, got "${date}"`);
}

/** Days since the Unix epoch — a stable integer index for a calendar day. */
export function dayIndex(date: IsoDate): number {
  assertIsoDate(date);
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

export function fromDayIndex(index: number): IsoDate {
  return new Date(index * 86_400_000).toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromDayIndex(dayIndex(date) + days);
}

/** Whole days from `a` to `b`; negative when `b` is earlier. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return dayIndex(b) - dayIndex(a);
}

export function toIsoDate(value: Date): IsoDate {
  return value.toISOString().slice(0, 10);
}

/** Monday-based start of the ISO week containing `date`. */
export function startOfWeek(date: IsoDate): IsoDate {
  const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7; // Mon = 0
  return addDays(date, -weekday);
}

export function startOfMonth(date: IsoDate): IsoDate {
  return `${date.slice(0, 7)}-01`;
}

/** Inclusive list of days in `[from, to]`. */
export function eachDay(from: IsoDate, to: IsoDate): IsoDate[] {
  const days: IsoDate[] = [];
  for (let i = dayIndex(from); i <= dayIndex(to); i++) days.push(fromDayIndex(i));
  return days;
}
