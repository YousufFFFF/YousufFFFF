import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LEVELS, XP_AWARDS, levelForXp, newlyEarnedAchievements } from '../src/gamification.ts';
import type { AchievementStats } from '../src/gamification.ts';

const NONE: AchievementStats = {
  prCount: 0,
  currentStreak: 0,
  longestStreak: 0,
  totalWorkouts: 0,
  rivalryWins: 0,
  battlesWon: 0,
  challengesWon: 0,
  topExerciseRanks: 0,
  connections: 0,
};

describe('levels', () => {
  it('starts everyone at Beginner', () => {
    const progress = levelForXp(0);
    assert.equal(progress.level, 1);
    assert.equal(progress.name, 'Beginner');
    assert.equal(progress.xpForNextLevel, 1000);
  });

  it('moves up at each threshold', () => {
    assert.equal(levelForXp(1000).name, 'Consistent');
    assert.equal(levelForXp(3000).name, 'Grinder');
    assert.equal(levelForXp(7500).name, 'Beast');
    assert.equal(levelForXp(15000).name, 'Elite');
  });

  it('caps at the top level', () => {
    const top = levelForXp(999_999);
    assert.equal(top.level, LEVELS[LEVELS.length - 1]!.level);
    assert.equal(top.xpForNextLevel, null);
    assert.equal(top.progressPct, 100);
  });

  it('reports progress through the current level', () => {
    const progress = levelForXp(2000);
    assert.equal(progress.level, 2);
    assert.equal(progress.xpIntoLevel, 1000);
    assert.equal(progress.progressPct, 50);
  });

  it('treats negative XP as zero', () => {
    assert.equal(levelForXp(-500).xp, 0);
  });

  it('awards the values from the spec', () => {
    assert.equal(XP_AWARDS.workout_completed, 100);
    assert.equal(XP_AWARDS.new_pr, 150);
    assert.equal(XP_AWARDS.challenge_won, 250);
    assert.equal(XP_AWARDS.weekly_consistency, 300);
  });
});

describe('achievements', () => {
  it('unlocks the first PR badge', () => {
    const earned = newlyEarnedAchievements({ ...NONE, prCount: 1 }, []);
    assert.ok(earned.some((a) => a.code === 'first_pr'));
  });

  it('does not re-award something already held', () => {
    const earned = newlyEarnedAchievements({ ...NONE, prCount: 1 }, ['first_pr']);
    assert.equal(earned.some((a) => a.code === 'first_pr'), false);
  });

  it('unlocks nothing for a brand new user', () => {
    assert.deepEqual(newlyEarnedAchievements(NONE, []), []);
  });

  it('unlocks several at once when the stats jump', () => {
    const earned = newlyEarnedAchievements({ ...NONE, totalWorkouts: 100, longestStreak: 30 }, []);
    const codes = earned.map((a) => a.code);
    assert.ok(codes.includes('workouts_30'));
    assert.ok(codes.includes('workouts_100'));
    assert.ok(codes.includes('streak_30'));
  });
});
