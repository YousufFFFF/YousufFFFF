import {
  DEFAULT_PRIVACY,
  canView,
  levelForXp,
  currentStreak,
  projectProfile,
  type PrivacySettings,
  type Visibility,
  type WeightUnit,
} from '@rival/core';
import { many, one, query, transaction, type Queryable } from '../db/index.ts';
import { ApiError } from '../lib/errors.ts';
import { todayInTimezone } from '../lib/time.ts';

/**
 * Users, profiles and privacy.
 *
 * `loadViewerContext` is the gate every other module uses before showing one
 * user's numbers to another; nothing reads a foreign profile without it.
 */

export interface ProfileRow {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  birth_year: number | null;
  gender: string | null;
  height_cm: number | null;
  bodyweight_grams: number | null;
  experience_level: string | null;
  goals: string[];
  preferred_unit: WeightUnit;
  weekly_target: number;
  rest_weekdays: number[];
  timezone: string;
  competition_paused: boolean;
  xp: number;
  onboarding_step: string;
}

export interface PrivacyRow {
  prs: Visibility;
  workout_history: Visibility;
  attendance: Visibility;
  bodyweight: Visibility;
  progress: Visibility;
  activity_feed: Visibility;
  gym_location: Visibility;
}

export function toPrivacySettings(row: PrivacyRow | null): PrivacySettings {
  if (!row) return DEFAULT_PRIVACY;
  return {
    prs: row.prs,
    workoutHistory: row.workout_history,
    attendance: row.attendance,
    bodyweight: row.bodyweight,
    progress: row.progress,
    activityFeed: row.activity_feed,
    gymLocation: row.gym_location,
  };
}

export async function getProfile(userId: string): Promise<ProfileRow> {
  const row = await one<ProfileRow>('SELECT * FROM profiles WHERE user_id = $1', [userId]);
  if (!row) throw ApiError.notFound('Profile not found.');
  return row;
}

export async function getProfileByUsername(username: string): Promise<ProfileRow | null> {
  return one<ProfileRow>('SELECT * FROM profiles WHERE username = $1', [username]);
}

export async function getPrivacy(userId: string): Promise<PrivacySettings> {
  return toPrivacySettings(await one<PrivacyRow>('SELECT * FROM user_privacy WHERE user_id = $1', [userId]));
}

/** `true` when both users have an accepted, mutual connection. */
export async function areConnected(a: string, b: string): Promise<boolean> {
  const [low, high] = a < b ? [a, b] : [b, a];
  const row = await one('SELECT 1 FROM connections WHERE user_a_id = $1 AND user_b_id = $2', [low, high]);
  return row !== null;
}

/** `true` when either side has blocked the other. */
export async function isBlockedEitherWay(a: string, b: string): Promise<boolean> {
  const row = await one(
    `SELECT 1 FROM blocks
      WHERE (blocker_id = $1 AND blocked_id = $2)
         OR (blocker_id = $2 AND blocked_id = $1)`,
    [a, b],
  );
  return row !== null;
}

export interface ViewerContextWithSettings {
  viewerId: string;
  ownerId: string;
  connected: boolean;
  blocked: boolean;
  competitionPaused: boolean;
  ownerSettings: PrivacySettings;
}

export async function loadViewerContext(viewerId: string, ownerId: string): Promise<ViewerContextWithSettings> {
  if (viewerId === ownerId) {
    return {
      viewerId,
      ownerId,
      connected: true,
      blocked: false,
      competitionPaused: false,
      ownerSettings: await getPrivacy(ownerId),
    };
  }
  const [connected, blocked, ownerSettings, owner] = await Promise.all([
    areConnected(viewerId, ownerId),
    isBlockedEitherWay(viewerId, ownerId),
    getPrivacy(ownerId),
    one<{ competition_paused: boolean }>('SELECT competition_paused FROM profiles WHERE user_id = $1', [ownerId]),
  ]);
  return {
    viewerId,
    ownerId,
    connected,
    blocked,
    competitionPaused: owner?.competition_paused ?? false,
    ownerSettings,
  };
}

/** Throws unless `viewerId` may see `field` on `ownerId`. */
export async function assertCanView(
  viewerId: string,
  ownerId: string,
  field: keyof PrivacySettings,
): Promise<ViewerContextWithSettings> {
  const ctx = await loadViewerContext(viewerId, ownerId);
  if (!canView(ctx, field, ctx.ownerSettings)) {
    throw ApiError.forbidden('This is only visible to their connections.');
  }
  return ctx;
}

export interface UserStats {
  totalWorkouts: number;
  currentStreak: number;
  longestStreak: number;
  prCount: number;
  rivalryWins: number;
  battlesWon: number;
  challengesWon: number;
  connections: number;
  xp: number;
  level: ReturnType<typeof levelForXp>;
}

export async function getUserStats(userId: string): Promise<UserStats> {
  const profile = await getProfile(userId);
  const today = todayInTimezone(profile.timezone);

  const [dates, counts] = await Promise.all([
    many<{ session_date: string }>(
      'SELECT session_date FROM attendance WHERE user_id = $1 ORDER BY session_date',
      [userId],
    ),
    one<{
      pr_count: number;
      challenges_won: number;
      connections: number;
      battles_won: number;
      rivalry_wins: number;
    }>(
      `SELECT
         (SELECT count(*) FROM personal_records WHERE user_id = $1)                          AS pr_count,
         (SELECT count(*) FROM challenges WHERE winner_id = $1)                              AS challenges_won,
         (SELECT count(*) FROM connections WHERE user_a_id = $1 OR user_b_id = $1)           AS connections,
         (SELECT coalesce(sum(CASE WHEN r.user_a_id = $1 THEN s.battles_won_a
                                   ELSE s.battles_won_b END), 0)
            FROM rivalry_scores s JOIN rivalries r ON r.id = s.rivalry_id
           WHERE r.user_a_id = $1 OR r.user_b_id = $1)                                       AS battles_won,
         (SELECT count(*)
            FROM rivalry_scores s JOIN rivalries r ON r.id = s.rivalry_id
           WHERE (r.user_a_id = $1 AND s.score_a > s.score_b)
              OR (r.user_b_id = $1 AND s.score_b > s.score_a))                               AS rivalry_wins`,
      [userId],
    ),
  ]);

  const streak = currentStreak(
    dates.map((d) => d.session_date),
    today,
    profile.weekly_target as 1 | 2 | 3 | 4 | 5 | 6 | 7,
  );

  return {
    totalWorkouts: dates.length,
    currentStreak: streak.currentDays,
    longestStreak: streak.longestDays,
    prCount: Number(counts?.pr_count ?? 0),
    rivalryWins: Number(counts?.rivalry_wins ?? 0),
    battlesWon: Number(counts?.battles_won ?? 0),
    challengesWon: Number(counts?.challenges_won ?? 0),
    connections: Number(counts?.connections ?? 0),
    xp: profile.xp,
    level: levelForXp(profile.xp),
  };
}

/**
 * Username / display-name search.
 *
 * Deliberately narrow: it never matches on email, and it returns only what
 * `projectProfile` allows, so searching cannot be used to harvest statistics.
 */
export async function searchUsers(viewerId: string, term: string, limit = 20) {
  const needle = term.trim().toLowerCase();
  if (needle.length < 2) return [];

  const rows = await many<{
    user_id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    bio: string | null;
    connected: boolean;
    request_status: string | null;
    request_direction: string | null;
  }>(
    `SELECT p.user_id, p.username, p.display_name, p.avatar_url, p.bio,
            EXISTS (SELECT 1 FROM connections c
                     WHERE (c.user_a_id = least($1::uuid, p.user_id) AND c.user_b_id = greatest($1::uuid, p.user_id)))
              AS connected,
            r.status AS request_status,
            CASE WHEN r.requester_id = $1 THEN 'outgoing'
                 WHEN r.addressee_id = $1 THEN 'incoming' END AS request_direction
       FROM profiles p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN connection_requests r
              ON r.status = 'pending'
             AND ((r.requester_id = $1 AND r.addressee_id = p.user_id)
               OR (r.addressee_id = $1 AND r.requester_id = p.user_id))
      WHERE p.user_id <> $1
        AND u.status = 'active'
        AND u.deleted_at IS NULL
        AND (lower(p.username) LIKE $2 OR lower(p.display_name) LIKE $2)
        AND NOT EXISTS (SELECT 1 FROM blocks b
                         WHERE (b.blocker_id = $1 AND b.blocked_id = p.user_id)
                            OR (b.blocker_id = p.user_id AND b.blocked_id = $1))
      ORDER BY (lower(p.username) = $3) DESC, p.username
      LIMIT $4`,
    [viewerId, `${needle}%`, needle, limit],
  );

  return rows.map((row) => ({
    id: row.user_id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    connected: row.connected,
    requestStatus: row.request_status,
    requestDirection: row.request_direction,
  }));
}

/** A profile as `viewerId` is allowed to see it. */
export async function getPublicProfile(viewerId: string, username: string) {
  const profile = await getProfileByUsername(username);
  if (!profile) throw ApiError.notFound('No such user.');

  const ctx = await loadViewerContext(viewerId, profile.user_id);
  if (ctx.blocked) throw ApiError.notFound('No such user.');

  const stats = await getUserStats(profile.user_id);
  const view = projectProfile(
    {
      id: profile.user_id,
      username: profile.username,
      displayName: profile.display_name,
      avatarUrl: profile.avatar_url,
      bio: profile.bio,
      totalWorkouts: stats.totalWorkouts,
      currentStreak: stats.currentStreak,
      prCount: stats.prCount,
    },
    ctx,
    ctx.ownerSettings,
  );

  return {
    ...view,
    isSelf: viewerId === profile.user_id,
    competitionPaused: ctx.competitionPaused,
    level: canView(ctx, 'progress', ctx.ownerSettings) ? stats.level : null,
  };
}

export interface ProfileUpdate {
  displayName?: string;
  username?: string;
  avatarUrl?: string | null;
  bio?: string | null;
  birthYear?: number | null;
  gender?: string | null;
  heightCm?: number | null;
  bodyweightGrams?: number | null;
  experienceLevel?: string | null;
  goals?: string[];
  preferredUnit?: WeightUnit;
  weeklyTarget?: number;
  restWeekdays?: number[];
  timezone?: string;
  competitionPaused?: boolean;
  onboardingStep?: string;
}

const PROFILE_COLUMNS: Record<keyof ProfileUpdate, string> = {
  displayName: 'display_name',
  username: 'username',
  avatarUrl: 'avatar_url',
  bio: 'bio',
  birthYear: 'birth_year',
  gender: 'gender',
  heightCm: 'height_cm',
  bodyweightGrams: 'bodyweight_grams',
  experienceLevel: 'experience_level',
  goals: 'goals',
  preferredUnit: 'preferred_unit',
  weeklyTarget: 'weekly_target',
  restWeekdays: 'rest_weekdays',
  timezone: 'timezone',
  competitionPaused: 'competition_paused',
  onboardingStep: 'onboarding_step',
};

export async function updateProfile(userId: string, update: ProfileUpdate): Promise<ProfileRow> {
  const sets: string[] = [];
  const values: unknown[] = [userId];

  for (const [key, column] of Object.entries(PROFILE_COLUMNS) as [keyof ProfileUpdate, string][]) {
    const value = update[key];
    if (value === undefined) continue;
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  }
  if (sets.length === 0) return getProfile(userId);

  sets.push('updated_at = now()');
  const row = await one<ProfileRow>(
    `UPDATE profiles SET ${sets.join(', ')} WHERE user_id = $1 RETURNING *`,
    values,
  );
  if (!row) throw ApiError.notFound('Profile not found.');
  return row;
}

export async function updatePrivacy(userId: string, update: Partial<PrivacySettings>): Promise<PrivacySettings> {
  const columns: Record<keyof PrivacySettings, string> = {
    prs: 'prs',
    workoutHistory: 'workout_history',
    attendance: 'attendance',
    bodyweight: 'bodyweight',
    progress: 'progress',
    activityFeed: 'activity_feed',
    gymLocation: 'gym_location',
  };

  const sets: string[] = [];
  const values: unknown[] = [userId];
  for (const [key, column] of Object.entries(columns) as [keyof PrivacySettings, string][]) {
    const value = update[key];
    if (value === undefined) continue;
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  }
  if (sets.length === 0) return getPrivacy(userId);

  sets.push('updated_at = now()');
  const row = await one<PrivacyRow>(
    `UPDATE user_privacy SET ${sets.join(', ')} WHERE user_id = $1 RETURNING *`,
    values,
  );
  return toPrivacySettings(row);
}

export async function awardXp(client: Queryable, userId: string, amount: number): Promise<number> {
  const result = await client.query<{ xp: number }>(
    'UPDATE profiles SET xp = xp + $2, updated_at = now() WHERE user_id = $1 RETURNING xp',
    [userId, amount],
  );
  return result.rows[0]?.xp ?? 0;
}

/**
 * Account deletion. Every table fans out from `users` with ON DELETE CASCADE,
 * so one statement removes the lot — no orphaned PRs, rivalries or feed rows.
 */
export async function deleteAccount(userId: string): Promise<void> {
  await transaction(async (client) => {
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
  });
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const row = await one('SELECT 1 FROM profiles WHERE username = $1', [username]);
  return row === null;
}

export async function touchLastSeen(userId: string): Promise<void> {
  await query('UPDATE users SET last_seen_at = now() WHERE id = $1', [userId]);
}
