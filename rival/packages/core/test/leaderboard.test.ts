import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { consistencyLeaderboard, improvementLeaderboard, strengthLeaderboard } from '../src/leaderboard.ts';
import { toGrams } from '../src/units.ts';

const rows = [
  { userId: 'muzz', username: 'muzz', displayName: 'Muzz', avatarUrl: null, bestGrams: toGrams(97.5, 'kg') },
  { userId: 'rahul', username: 'rahul', displayName: 'Rahul', avatarUrl: null, bestGrams: toGrams(100, 'kg') },
  { userId: 'arjun', username: 'arjun', displayName: 'Arjun', avatarUrl: null, bestGrams: toGrams(90, 'kg') },
];

describe('strength leaderboard', () => {
  it('ranks heaviest first with medals', () => {
    const board = strengthLeaderboard(rows, 'muzz', 'kg');
    assert.deepEqual(board.map((e) => e.username), ['rahul', 'muzz', 'arjun']);
    assert.deepEqual(board.map((e) => e.medal), ['🥇', '🥈', '🥉']);
    assert.equal(board[0]!.display, '100 kg');
  });

  it('marks the viewer row', () => {
    const board = strengthLeaderboard(rows, 'muzz', 'kg');
    assert.equal(board.find((e) => e.isYou)!.username, 'muzz');
  });

  it('renders in the viewer unit', () => {
    const board = strengthLeaderboard(rows, 'muzz', 'lb');
    assert.equal(board[0]!.display, '220.46 lb');
  });

  it('shares a rank on a tie and skips the next', () => {
    const tied = [
      { userId: 'a', username: 'a', displayName: 'A', avatarUrl: null, bestGrams: toGrams(100, 'kg') },
      { userId: 'b', username: 'b', displayName: 'B', avatarUrl: null, bestGrams: toGrams(100, 'kg') },
      { userId: 'c', username: 'c', displayName: 'C', avatarUrl: null, bestGrams: toGrams(90, 'kg') },
    ];
    assert.deepEqual(strengthLeaderboard(tied, 'a', 'kg').map((e) => e.rank), [1, 1, 3]);
  });
});

describe('consistency leaderboard', () => {
  it('ranks by sessions', () => {
    const board = consistencyLeaderboard(
      [
        { userId: 'muzz', username: 'muzz', displayName: 'Muzz', avatarUrl: null, sessions: 18 },
        { userId: 'rahul', username: 'rahul', displayName: 'Rahul', avatarUrl: null, sessions: 21 },
      ],
      'muzz',
    );
    assert.equal(board[0]!.username, 'rahul');
    assert.equal(board[0]!.display, '21 sessions');
  });
});

describe('improvement leaderboard', () => {
  it('lets a beginner out-rank the strongest lifter', () => {
    // Straight from the spec: Muzz 80 -> 95 (+18.75%) beats Rahul 100 -> 105 (+5%).
    const board = improvementLeaderboard(
      [
        { userId: 'muzz', username: 'muzz', displayName: 'Muzz', avatarUrl: null, baseline: 80, current: 95 },
        { userId: 'rahul', username: 'rahul', displayName: 'Rahul', avatarUrl: null, baseline: 100, current: 105 },
      ],
      'muzz',
    );
    assert.equal(board[0]!.username, 'muzz');
    assert.equal(board[0]!.improvementPct, 18.75);
    assert.equal(board[0]!.display, '+18.75%');
    assert.equal(board[1]!.improvementPct, 5);
  });

  it('drops users with no baseline to measure against', () => {
    const board = improvementLeaderboard(
      [{ userId: 'new', username: 'new', displayName: 'New', avatarUrl: null, baseline: 0, current: 60 }],
      'new',
    );
    assert.equal(board.length, 0);
  });
});
