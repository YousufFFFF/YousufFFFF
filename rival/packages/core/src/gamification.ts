/**
 * XP and levels.
 *
 * Secondary to the real progress by design: XP is earned only as a by-product of
 * things that already mattered (a session, a PR, a challenge, a consistent week)
 * and never unlocks competitive advantage — it cannot move a rivalry score.
 */

export type XpEvent =
  | 'workout_completed'
  | 'new_pr'
  | 'challenge_won'
  | 'weekly_consistency'
  | 'rivalry_win'
  | 'first_connection';

export const XP_AWARDS: Record<XpEvent, number> = {
  workout_completed: 100,
  new_pr: 150,
  challenge_won: 250,
  weekly_consistency: 300,
  rivalry_win: 200,
  first_connection: 50,
};

/** One session per calendar day earns workout XP, matching attendance rules. */
export const XP_DAILY_WORKOUT_CAP = XP_AWARDS.workout_completed;

export interface Level {
  level: number;
  name: string;
  minXp: number;
}

export const LEVELS: ReadonlyArray<Level> = [
  { level: 1, name: 'Beginner', minXp: 0 },
  { level: 2, name: 'Consistent', minXp: 1_000 },
  { level: 3, name: 'Grinder', minXp: 3_000 },
  { level: 4, name: 'Beast', minXp: 7_500 },
  { level: 5, name: 'Elite', minXp: 15_000 },
];

export interface LevelProgress {
  level: number;
  name: string;
  xp: number;
  xpIntoLevel: number;
  xpForNextLevel: number | null;
  nextLevelName: string | null;
  /** 0–100; 100 at the top level. */
  progressPct: number;
}

export function levelForXp(xp: number): LevelProgress {
  const safeXp = Math.max(0, Math.floor(xp));
  let current = LEVELS[0]!;
  for (const level of LEVELS) if (safeXp >= level.minXp) current = level;

  const next = LEVELS.find((l) => l.level === current.level + 1) ?? null;
  const xpIntoLevel = safeXp - current.minXp;
  const span = next ? next.minXp - current.minXp : 0;

  return {
    level: current.level,
    name: current.name,
    xp: safeXp,
    xpIntoLevel,
    xpForNextLevel: next ? next.minXp - safeXp : null,
    nextLevelName: next ? next.name : null,
    progressPct: next ? Math.min(100, Math.round((xpIntoLevel / span) * 100)) : 100,
  };
}

export interface AchievementDefinition {
  code: string;
  icon: string;
  title: string;
  description: string;
  /** Evaluated against the user's rolled-up stats. */
  threshold: { stat: keyof AchievementStats; value: number };
}

export interface AchievementStats {
  prCount: number;
  currentStreak: number;
  longestStreak: number;
  totalWorkouts: number;
  rivalryWins: number;
  battlesWon: number;
  challengesWon: number;
  topExerciseRanks: number;
  connections: number;
}

export const ACHIEVEMENTS: ReadonlyArray<AchievementDefinition> = [
  { code: 'first_pr', icon: '🔥', title: 'First PR', description: 'Set your first personal record.', threshold: { stat: 'prCount', value: 1 } },
  { code: 'pr_machine', icon: '🔥', title: 'PR Machine', description: 'Set 25 personal records.', threshold: { stat: 'prCount', value: 25 } },
  { code: 'streak_7', icon: '🔥', title: '7-Day Streak', description: 'Stay on plan for a week.', threshold: { stat: 'longestStreak', value: 7 } },
  { code: 'streak_30', icon: '🔥', title: '30-Day Streak', description: 'Stay on plan for a month.', threshold: { stat: 'longestStreak', value: 30 } },
  { code: 'workouts_30', icon: '💪', title: '30 Workouts', description: 'Log 30 gym days.', threshold: { stat: 'totalWorkouts', value: 30 } },
  { code: 'workouts_100', icon: '💪', title: '100 Workouts', description: 'Log 100 gym days.', threshold: { stat: 'totalWorkouts', value: 100 } },
  { code: 'first_rivalry_win', icon: '👑', title: 'First Rivalry Win', description: 'Finish a month ahead in a rivalry.', threshold: { stat: 'rivalryWins', value: 1 } },
  { code: 'battles_10', icon: '⚔️', title: '10 Battles Won', description: 'Lead 10 PR battles.', threshold: { stat: 'battlesWon', value: 10 } },
  { code: 'challenge_winner', icon: '🏆', title: 'Challenge Winner', description: 'Win your first challenge.', threshold: { stat: 'challengesWon', value: 1 } },
  { code: 'number_one', icon: '🏆', title: '#1 In Your Circle', description: 'Top an exercise leaderboard.', threshold: { stat: 'topExerciseRanks', value: 1 } },
  { code: 'most_improved', icon: '🔥', title: 'Most Improved', description: 'Top the improvement board.', threshold: { stat: 'topExerciseRanks', value: 1 } },
  { code: 'crew_of_5', icon: '🤝', title: 'Crew Of Five', description: 'Connect with 5 gym friends.', threshold: { stat: 'connections', value: 5 } },
];

/** Achievement codes newly earned by `stats`, excluding ones already held. */
export function newlyEarnedAchievements(
  stats: AchievementStats,
  alreadyEarned: ReadonlyArray<string>,
): AchievementDefinition[] {
  const held = new Set(alreadyEarned);
  return ACHIEVEMENTS.filter(
    (a) => !held.has(a.code) && stats[a.threshold.stat] >= a.threshold.value,
  );
}
