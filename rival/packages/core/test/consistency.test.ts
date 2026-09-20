import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  allowedRestDays,
  attendanceCalendar,
  consistencyGap,
  consistencyScore,
  currentStreak,
  gymDays,
  rollingWindow,
  sessionsInRange,
} from '../src/consistency.ts';
import { addDays, daysBetween, startOfWeek } from '../src/dates.ts';

const TODAY = '2026-09-20';

describe('gym days', () => {
  it('counts a day once however many sessions were logged', () => {
    assert.deepEqual(gymDays(['2026-09-18', '2026-09-18', '2026-09-19']), ['2026-09-18', '2026-09-19']);
  });

  it('counts sessions inside a window only', () => {
    const dates = ['2026-09-01', '2026-09-15', '2026-09-20'];
    assert.equal(sessionsInRange(dates, '2026-09-10', '2026-09-20'), 2);
  });
});

describe('streaks', () => {
  it('tolerates more rest for a lighter schedule', () => {
    assert.equal(allowedRestDays(6), 1);
    assert.equal(allowedRestDays(4), 3);
    assert.equal(allowedRestDays(2), 3);
  });

  it('does not break a streak on a planned rest day', () => {
    // Trained Mon, Wed, Fri, Sun on a 4-day plan (3 rest days tolerated).
    const dates = ['2026-09-14', '2026-09-16', '2026-09-18', '2026-09-20'];
    const streak = currentStreak(dates, TODAY, 4);
    assert.equal(streak.currentDays, 7); // 14th -> 20th inclusive
    assert.equal(streak.daysSinceLastSession, 0);
  });

  it('breaks once the gap exceeds the schedule', () => {
    const dates = ['2026-09-01', '2026-09-02'];
    const streak = currentStreak(dates, TODAY, 4);
    assert.equal(streak.currentDays, 0);
    assert.equal(streak.lastSessionDate, '2026-09-02');
    assert.equal(streak.daysSinceLastSession, 18);
  });

  it('keeps the streak alive on a rest day within tolerance', () => {
    const dates = ['2026-09-17', '2026-09-19'];
    const streak = currentStreak(dates, TODAY, 4); // last session yesterday
    assert.equal(streak.currentDays, 4);
  });

  it('remembers the longest streak even after it ends', () => {
    const dates = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-09-20'];
    const streak = currentStreak(dates, TODAY, 6);
    assert.equal(streak.longestDays, 4);
    assert.equal(streak.currentDays, 1);
  });

  it('reports nothing for a user who has never trained', () => {
    const streak = currentStreak([], TODAY);
    assert.deepEqual(streak, {
      currentDays: 0,
      longestDays: 0,
      lastSessionDate: null,
      daysSinceLastSession: null,
      atRisk: false,
    });
  });
});

describe('consistency score', () => {
  it('scores against the user own schedule, not a global one', () => {
    const fourWeeks = { from: '2026-08-24', to: '2026-09-20' };
    const dates = Array.from({ length: 8 }, (_, i) => addDays('2026-08-24', i * 3));
    const light = consistencyScore(dates, fourWeeks.from, fourWeeks.to, 2);
    assert.equal(light.target, 8);
    assert.equal(light.score, 100);

    const heavy = consistencyScore(dates, fourWeeks.from, fourWeeks.to, 6);
    assert.equal(heavy.target, 24);
    assert.ok(heavy.score < 50);
  });

  it('caps at 100 so extra sessions cannot inflate it', () => {
    const daily = Array.from({ length: 28 }, (_, i) => addDays('2026-08-24', i));
    const score = consistencyScore(daily, '2026-08-24', '2026-09-20', 3);
    assert.equal(score.score, 100);
  });
});

describe('consistency gap', () => {
  it('matches the spec example', () => {
    const gap = consistencyGap(18, 21, TODAY, { you: 'Muzz', rival: 'Rahul' });
    assert.equal(gap.gap, 3);
    assert.equal(gap.leader, 'rival');
    assert.equal(gap.sessionsToCatchUp, 3);
    assert.equal(gap.message, "You're 3 gym days behind Rahul.");
  });

  it('never asks for more than one session a day to close the gap', () => {
    const gap = consistencyGap(18, 21, TODAY);
    // Three sessions behind -> level three days from now at the earliest.
    assert.equal(daysBetween(TODAY, gap.earliestLevelDate!), 2);
  });

  it('shrinks the gap as sessions land', () => {
    assert.equal(consistencyGap(19, 21, TODAY).gap, 2);
    assert.equal(consistencyGap(20, 21, TODAY).gap, 1);
    assert.equal(consistencyGap(21, 21, TODAY).leader, 'tie');
    assert.equal(consistencyGap(22, 21, TODAY).leader, 'you');
  });

  it('has nothing to catch up when ahead', () => {
    const gap = consistencyGap(25, 21, TODAY);
    assert.equal(gap.sessionsToCatchUp, 0);
    assert.equal(gap.earliestLevelDate, null);
  });
});

describe('calendar', () => {
  it('marks trained days, planned rest and misses apart', () => {
    const week = startOfWeek(TODAY); // Monday 2026-09-14
    const days = attendanceCalendar(['2026-09-14', '2026-09-15', '2026-09-17'], week, addDays(week, 6), [0]);
    assert.equal(days.length, 7);
    assert.equal(days[0]!.trained, true);
    assert.equal(days[2]!.trained, false);
    assert.equal(days[2]!.rest, false); // Wednesday is a miss
    assert.equal(days[6]!.rest, true); // Sunday is planned rest
  });
});

describe('rolling window', () => {
  it('spans the requested number of days inclusive', () => {
    const window = rollingWindow(TODAY, 30);
    assert.equal(window.to, TODAY);
    assert.equal(daysBetween(window.from, window.to), 29);
  });
});
