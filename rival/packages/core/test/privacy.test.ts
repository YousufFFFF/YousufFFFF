import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canCompare, canView, projectProfile } from '../src/privacy.ts';
import { DEFAULT_PRIVACY } from '../src/types.ts';

const MUZZ = 'user-muzz';
const RAHUL = 'user-rahul';

const connected = { viewerId: MUZZ, ownerId: RAHUL, connected: true, blocked: false };
const stranger = { viewerId: MUZZ, ownerId: RAHUL, connected: false, blocked: false };

describe('default privacy', () => {
  it('keeps nothing sensitive public out of the box', () => {
    assert.equal(DEFAULT_PRIVACY.bodyweight, 'private');
    assert.equal(DEFAULT_PRIVACY.gymLocation, 'private');
    assert.equal(DEFAULT_PRIVACY.prs, 'connections');
  });
});

describe('canView', () => {
  it('hides connection-scoped data from a stranger', () => {
    assert.equal(canView(stranger, 'prs'), false);
    assert.equal(canView(stranger, 'attendance'), false);
  });

  it('shows it to an accepted connection', () => {
    assert.equal(canView(connected, 'prs'), true);
  });

  it('keeps bodyweight private even from a connection', () => {
    assert.equal(canView(connected, 'bodyweight'), false);
  });

  it('honours an explicit public setting', () => {
    assert.equal(canView(stranger, 'prs', { ...DEFAULT_PRIVACY, prs: 'public' }), true);
  });

  it('lets a block override everything', () => {
    const blocked = { ...connected, blocked: true };
    assert.equal(canView(blocked, 'prs', { ...DEFAULT_PRIVACY, prs: 'public' }), false);
  });

  it('always lets you see your own data', () => {
    const self = { viewerId: MUZZ, ownerId: MUZZ, connected: false, blocked: false };
    assert.equal(canView(self, 'bodyweight', { ...DEFAULT_PRIVACY, bodyweight: 'private' }), true);
  });
});

describe('canCompare', () => {
  it('requires a mutual connection even when both profiles are public', () => {
    const open = { ...DEFAULT_PRIVACY, prs: 'public' as const };
    assert.equal(canCompare(stranger, open, open), false);
  });

  it('allows comparison between connections', () => {
    assert.equal(canCompare(connected, DEFAULT_PRIVACY, DEFAULT_PRIVACY), true);
  });

  it('stops when either side hides their PRs', () => {
    const hidden = { ...DEFAULT_PRIVACY, prs: 'private' as const };
    assert.equal(canCompare(connected, hidden, DEFAULT_PRIVACY), false);
    assert.equal(canCompare(connected, DEFAULT_PRIVACY, hidden), false);
  });

  it('stops when the other side has paused competition', () => {
    assert.equal(canCompare({ ...connected, competitionPaused: true }, DEFAULT_PRIVACY, DEFAULT_PRIVACY), false);
  });
});

describe('projectProfile', () => {
  const profile = {
    id: RAHUL,
    username: 'rahul',
    displayName: 'Rahul',
    avatarUrl: null,
    bio: 'Chasing 200 kg.',
    totalWorkouts: 120,
    currentStreak: 8,
    prCount: 34,
  };

  it('gives a stranger the identity but none of the numbers', () => {
    const view = projectProfile(profile, stranger, DEFAULT_PRIVACY);
    assert.equal(view.username, 'rahul');
    assert.deepEqual(view.stats, {});
  });

  it('gives a connection the competitive stats', () => {
    const view = projectProfile(profile, connected, DEFAULT_PRIVACY);
    assert.equal(view.stats.prCount, 34);
    assert.equal(view.stats.totalWorkouts, 120);
  });
});
