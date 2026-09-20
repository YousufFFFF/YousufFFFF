/**
 * Timezone helpers.
 *
 * "Today" is the user's local day, not the server's. Attendance, streaks and
 * catch-up gaps all hinge on this, so it is resolved once per request from the
 * profile timezone rather than assumed.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatters.set(timezone, formatter);
  }
  return formatter;
}

/** `YYYY-MM-DD` for `at` as seen in `timezone`; falls back to UTC if unknown. */
export function todayInTimezone(timezone: string, at: Date = new Date()): string {
  try {
    // en-CA formats as YYYY-MM-DD, which is exactly the shape we store.
    return formatterFor(timezone).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
