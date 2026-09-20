import { DEFAULT_PRIVACY, type PrivacySettings, type Uuid, type Visibility } from './types.ts';

/**
 * Visibility resolution.
 *
 * The product rule from day one: **competition is connection-based**. Detailed
 * PRs, attendance and rivalry statistics are only ever computed between two
 * users who have both accepted the connection. This module is the single place
 * that decides, and every read path in the API goes through it.
 */

export type PrivacyField = keyof PrivacySettings;

export interface ViewerContext {
  viewerId: Uuid;
  ownerId: Uuid;
  /** Both sides accepted a connection request. */
  connected: boolean;
  /** Either side blocked the other — beats everything else. */
  blocked: boolean;
  /** Owner paused competition: they stay visible but drop out of rivalries. */
  competitionPaused?: boolean;
}

export function canView(
  ctx: ViewerContext,
  field: PrivacyField,
  settings: PrivacySettings = DEFAULT_PRIVACY,
): boolean {
  if (ctx.blocked) return false;
  if (ctx.viewerId === ctx.ownerId) return true; // you always see your own data
  const visibility: Visibility = settings[field] ?? DEFAULT_PRIVACY[field];
  if (visibility === 'private') return false;
  if (visibility === 'public') return true;
  return ctx.connected;
}

/**
 * Competing is stricter than viewing: a public profile still does not create a
 * rivalry. Rivalries require a mutual connection, both sides' PRs visible, and
 * neither side having paused competition.
 */
export function canCompare(ctx: ViewerContext, ownerSettings: PrivacySettings, viewerSettings: PrivacySettings): boolean {
  if (ctx.blocked || !ctx.connected) return false;
  if (ctx.competitionPaused) return false;
  return (
    canView(ctx, 'prs', ownerSettings) &&
    canView({ ...ctx, viewerId: ctx.ownerId, ownerId: ctx.viewerId }, 'prs', viewerSettings)
  );
}

/** Fields that are never public by default, whatever the profile setting says. */
export const SENSITIVE_FIELDS: ReadonlyArray<PrivacyField> = ['bodyweight', 'gymLocation'];

/**
 * Strip a profile down to what `ctx` is allowed to see. Search results and any
 * non-connected view go through this.
 */
export interface PublicProfileView {
  id: Uuid;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  connected: boolean;
  stats: {
    totalWorkouts?: number;
    currentStreak?: number;
    prCount?: number;
  };
}

export function projectProfile(
  profile: {
    id: Uuid;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    bio: string | null;
    totalWorkouts: number;
    currentStreak: number;
    prCount: number;
  },
  ctx: ViewerContext,
  settings: PrivacySettings,
): PublicProfileView {
  const view: PublicProfileView = {
    id: profile.id,
    username: profile.username,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    bio: profile.bio,
    connected: ctx.connected,
    stats: {},
  };
  if (canView(ctx, 'attendance', settings)) {
    view.stats.totalWorkouts = profile.totalWorkouts;
    view.stats.currentStreak = profile.currentStreak;
  }
  if (canView(ctx, 'prs', settings)) {
    view.stats.prCount = profile.prCount;
  }
  return view;
}
