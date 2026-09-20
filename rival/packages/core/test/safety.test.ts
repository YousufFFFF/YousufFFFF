import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { catchUpCallToAction, recoveryNotices } from '../src/safety.ts';
import { addDays } from '../src/dates.ts';

const TODAY = '2026-09-20';

describe('recovery notices', () => {
  it('says nothing about a normal week', () => {
    const dates = ['2026-09-14', '2026-09-16', '2026-09-18', TODAY];
    assert.deepEqual(recoveryNotices({ sessionDates: dates, today: TODAY }), []);
  });

  it('flags a second session on the same day without blocking it', () => {
    const notices = recoveryNotices({ sessionDates: [TODAY, TODAY], today: TODAY });
    assert.equal(notices[0]!.flag, 'multiple_sessions_today');
    assert.match(notices[0]!.title, /recovery matters too/);
  });

  it('flags a week with no rest day', () => {
    const dates = Array.from({ length: 8 }, (_, i) => addDays(TODAY, -i));
    const notices = recoveryNotices({ sessionDates: dates, today: TODAY });
    assert.ok(notices.some((n) => n.flag === 'long_unbroken_block'));
  });

  it('flags an implausibly long session', () => {
    const notices = recoveryNotices({ sessionDates: [TODAY], today: TODAY, lastSessionSeconds: 5 * 3600 });
    assert.ok(notices.some((n) => n.flag === 'very_long_session'));
  });

  it('never tells the user to train more', () => {
    const dates = Array.from({ length: 10 }, (_, i) => addDays(TODAY, -i));
    for (const notice of recoveryNotices({ sessionDates: [...dates, TODAY], today: TODAY })) {
      assert.doesNotMatch(notice.message, /train (more|harder|again)/i);
    }
  });
});

describe('catch-up call to action', () => {
  it('offers the next session when the user has not trained today', () => {
    const cta = catchUpCallToAction(false, 3);
    assert.equal(cta.enabled, true);
    assert.equal(cta.label, 'Log workout');
    assert.match(cta.helper, /closes the gap to 2/);
  });

  it('refuses to push a second session on the same day', () => {
    const cta = catchUpCallToAction(true, 3);
    assert.equal(cta.enabled, false);
    assert.match(cta.helper, /rest up/);
  });

  it('is inert when the user is already ahead', () => {
    assert.equal(catchUpCallToAction(false, 0).enabled, false);
  });
});
