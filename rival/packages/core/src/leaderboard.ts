import type { Uuid, WeightUnit } from './types.ts';
import { fromGrams } from './units.ts';
import { improvementPercent } from './prs.ts';

/**
 * Private leaderboards.
 *
 * Every entry passed in here has already been filtered to the viewer's accepted
 * connections by the API — this module only ranks. It never receives, and so can
 * never leak, a non-connected user's numbers.
 */

export interface LeaderboardEntry {
  userId: Uuid;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  value: number;
  /** Rendered figure for the row, already unit-converted. */
  display: string;
  rank: number;
  isYou: boolean;
  medal: '🥇' | '🥈' | '🥉' | null;
}

function medalFor(rank: number): LeaderboardEntry['medal'] {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
}

/**
 * Standard competition ranking: equal values share a rank and the next rank
 * skips accordingly (1, 2, 2, 4).
 */
export function rank<T extends { userId: Uuid; value: number }>(
  rows: ReadonlyArray<T>,
  viewerId: Uuid,
  format: (value: number) => string,
  meta: (row: T) => { username: string; displayName: string; avatarUrl: string | null },
): LeaderboardEntry[] {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const entries: LeaderboardEntry[] = [];
  let lastValue: number | null = null;
  let lastRank = 0;

  sorted.forEach((row, index) => {
    const position = lastValue !== null && row.value === lastValue ? lastRank : index + 1;
    lastValue = row.value;
    lastRank = position;
    const info = meta(row);
    entries.push({
      userId: row.userId,
      username: info.username,
      displayName: info.displayName,
      avatarUrl: info.avatarUrl,
      value: row.value,
      display: format(row.value),
      rank: position,
      isYou: row.userId === viewerId,
      medal: medalFor(position),
    });
  });

  return entries;
}

export function strengthLeaderboard(
  rows: ReadonlyArray<{ userId: Uuid; username: string; displayName: string; avatarUrl: string | null; bestGrams: number }>,
  viewerId: Uuid,
  unit: WeightUnit,
): LeaderboardEntry[] {
  return rank(
    rows.map((r) => ({ ...r, value: r.bestGrams })),
    viewerId,
    (value) => `${fromGrams(value, unit)} ${unit}`,
    (r) => ({ username: r.username, displayName: r.displayName, avatarUrl: r.avatarUrl }),
  );
}

export function consistencyLeaderboard(
  rows: ReadonlyArray<{ userId: Uuid; username: string; displayName: string; avatarUrl: string | null; sessions: number }>,
  viewerId: Uuid,
): LeaderboardEntry[] {
  return rank(
    rows.map((r) => ({ ...r, value: r.sessions })),
    viewerId,
    (value) => `${value} ${value === 1 ? 'session' : 'sessions'}`,
    (r) => ({ username: r.username, displayName: r.displayName, avatarUrl: r.avatarUrl }),
  );
}

export interface ImprovementRow {
  userId: Uuid;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  /** Best figure at the start of the window. */
  baseline: number;
  /** Best figure now. */
  current: number;
}

export interface ImprovementEntry extends LeaderboardEntry {
  baseline: number;
  current: number;
  improvementPct: number;
}

/**
 * Most-improved board.
 *
 * Ranking by percentage gain rather than absolute load is what lets a beginner
 * out-rank the strongest person in the group — deliberately, so that the person
 * with the least to show still has a reason to compete.
 */
export function improvementLeaderboard(
  rows: ReadonlyArray<ImprovementRow>,
  viewerId: Uuid,
): ImprovementEntry[] {
  const scored = rows
    .map((row) => ({ row, pct: improvementPercent(row.baseline, row.current) }))
    .filter((x): x is { row: ImprovementRow; pct: number } => x.pct !== null);

  const ranked = rank(
    scored.map(({ row, pct }) => ({ ...row, value: pct })),
    viewerId,
    (value) => `${value > 0 ? '+' : ''}${value}%`,
    (r) => ({ username: r.username, displayName: r.displayName, avatarUrl: r.avatarUrl }),
  );

  return ranked.map((entry) => {
    const source = scored.find((s) => s.row.userId === entry.userId)!;
    return {
      ...entry,
      baseline: source.row.baseline,
      current: source.row.current,
      improvementPct: source.pct,
    };
  });
}

/** Overall board: rivalry points won across all of the viewer's rivalries. */
export function overallLeaderboard(
  rows: ReadonlyArray<{ userId: Uuid; username: string; displayName: string; avatarUrl: string | null; points: number }>,
  viewerId: Uuid,
): LeaderboardEntry[] {
  return rank(
    rows.map((r) => ({ ...r, value: r.points })),
    viewerId,
    (value) => `${value} ${value === 1 ? 'pt' : 'pts'}`,
    (r) => ({ username: r.username, displayName: r.displayName, avatarUrl: r.avatarUrl }),
  );
}
