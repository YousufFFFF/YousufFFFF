import type * as T from './types.ts';

/**
 * The RIVAL API client.
 *
 * One place handles the bits every caller would otherwise repeat: attaching the
 * access token, refreshing it exactly once when it expires, and turning an
 * error response into a typed `ApiError` the UI can branch on.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** The caller's plan does not include this — show the upgrade screen. */
  get requiresPro(): boolean {
    return this.status === 402;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

export interface TokenStore {
  getTokens(): Promise<{ accessToken: string; refreshToken: string } | null>;
  setTokens(tokens: { accessToken: string; refreshToken: string } | null): Promise<void>;
}

/** In-memory store; a real client swaps in secure storage. */
export class MemoryTokenStore implements TokenStore {
  private tokens: { accessToken: string; refreshToken: string } | null = null;

  async getTokens() {
    return this.tokens;
  }

  async setTokens(tokens: { accessToken: string; refreshToken: string } | null) {
    this.tokens = tokens;
  }
}

export interface ClientOptions {
  baseUrl: string;
  tokens?: TokenStore;
  /** Called when the refresh token is rejected — the app should sign out. */
  onSignedOut?: () => void;
  fetch?: typeof globalThis.fetch;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Skips the bearer token, for the endpoints that are public. */
  anonymous?: boolean;
  signal?: AbortSignal;
}

export class RivalClient {
  private readonly baseUrl: string;
  private readonly tokens: TokenStore;
  private readonly onSignedOut: (() => void) | undefined;
  private readonly fetchImpl: typeof globalThis.fetch;
  /** Shared so several concurrent 401s trigger one refresh, not several. */
  private refreshing: Promise<boolean> | null = null;

  constructor(options: ClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.tokens = options.tokens ?? new MemoryTokenStore();
    this.onSignedOut = options.onSignedOut;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private buildUrl(path: string, query?: RequestOptions['query']): string {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private async send<R>(path: string, options: RequestOptions = {}, retrying = false): Promise<R> {
    const stored = options.anonymous ? null : await this.tokens.getTokens();

    const response = await this.fetchImpl(this.buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers: {
        ...(stored ? { authorization: `Bearer ${stored.accessToken}` } : {}),
        ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });

    if (response.status === 204) return undefined as R;

    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (response.ok) return payload as R;

    // A 401 on a token we hold means it expired: refresh once and retry. A
    // second 401 means the session is genuinely over.
    if (response.status === 401 && stored && !retrying) {
      const refreshed = await this.refreshOnce();
      if (refreshed) return this.send<R>(path, options, true);
    }

    const error = payload as { error?: { code?: string; message?: string; details?: unknown } } | null;
    throw new ApiError(
      response.status,
      error?.error?.code ?? 'error',
      error?.error?.message ?? `Request failed (${response.status})`,
      error?.error?.details,
    );
  }

  private async refreshOnce(): Promise<boolean> {
    this.refreshing ??= (async () => {
      try {
        const stored = await this.tokens.getTokens();
        if (!stored) return false;
        const session = await this.send<T.Session>(
          '/v1/auth/refresh',
          { method: 'POST', body: { refreshToken: stored.refreshToken }, anonymous: true },
          true,
        );
        await this.tokens.setTokens({ accessToken: session.accessToken, refreshToken: session.refreshToken });
        return true;
      } catch {
        await this.tokens.setTokens(null);
        this.onSignedOut?.();
        return false;
      } finally {
        // Cleared on the next tick so concurrent callers share this attempt.
        queueMicrotask(() => {
          this.refreshing = null;
        });
      }
    })();
    return this.refreshing;
  }

  private async withSession(session: T.Session): Promise<T.Session> {
    await this.tokens.setTokens({ accessToken: session.accessToken, refreshToken: session.refreshToken });
    return session;
  }

  // ── auth ────────────────────────────────────────────────────────────────

  async register(input: {
    email: string;
    password: string;
    displayName?: string;
    username?: string;
    referralCode?: string;
  }): Promise<T.Session> {
    return this.withSession(await this.send<T.Session>('/v1/auth/register', { method: 'POST', body: input, anonymous: true }));
  }

  async login(email: string, password: string): Promise<T.Session> {
    return this.withSession(
      await this.send<T.Session>('/v1/auth/login', { method: 'POST', body: { email, password }, anonymous: true }),
    );
  }

  async loginWithProvider(provider: 'google' | 'apple', idToken: string, referralCode?: string): Promise<T.Session> {
    return this.withSession(
      await this.send<T.Session>(`/v1/auth/oauth/${provider}`, {
        method: 'POST',
        body: { idToken, referralCode },
        anonymous: true,
      }),
    );
  }

  async authProviders(): Promise<{ email: boolean; google: boolean; apple: boolean }> {
    return this.send('/v1/auth/providers', { anonymous: true });
  }

  async logout(): Promise<void> {
    const stored = await this.tokens.getTokens();
    if (stored) {
      await this.send('/v1/auth/logout', {
        method: 'POST',
        body: { refreshToken: stored.refreshToken },
        anonymous: true,
      }).catch(() => undefined);
    }
    await this.tokens.setTokens(null);
  }

  async verifyEmail(token: string): Promise<void> {
    return this.send('/v1/auth/verify-email', { method: 'POST', body: { token }, anonymous: true });
  }

  async resendVerification(): Promise<void> {
    return this.send('/v1/auth/resend-verification', { method: 'POST' });
  }

  async forgotPassword(email: string): Promise<void> {
    return this.send('/v1/auth/forgot-password', { method: 'POST', body: { email }, anonymous: true });
  }

  async resetPassword(token: string, password: string): Promise<void> {
    return this.send('/v1/auth/reset-password', { method: 'POST', body: { token, password }, anonymous: true });
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return this.send('/v1/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
  }

  async usernameAvailable(username: string): Promise<{ username: string; available: boolean }> {
    return this.send('/v1/auth/username-available', { query: { username } });
  }

  async deleteAccount(): Promise<void> {
    await this.send('/v1/auth/account', { method: 'DELETE', body: { confirm: 'DELETE' } });
    await this.tokens.setTokens(null);
  }

  // ── me ──────────────────────────────────────────────────────────────────

  async me(): Promise<T.Me> {
    return this.send('/v1/me');
  }

  async updateProfile(input: Record<string, unknown>): Promise<{ username: string; displayName: string; onboardingStep: string }> {
    return this.send('/v1/me/profile', { method: 'PATCH', body: input });
  }

  async updatePrivacy(input: Partial<T.PrivacySettings>): Promise<T.PrivacySettings> {
    return this.send('/v1/me/privacy', { method: 'PUT', body: input });
  }

  async updateNotificationSettings(input: Record<string, boolean>): Promise<unknown> {
    return this.send('/v1/me/notifications', { method: 'PUT', body: input });
  }

  async setCompetitionPaused(paused: boolean): Promise<{ competitionPaused: boolean }> {
    return this.send('/v1/me/competition', { method: 'POST', body: { paused } });
  }

  async stats(): Promise<T.UserStats> {
    return this.send('/v1/me/stats');
  }

  async favorites(): Promise<T.Exercise[]> {
    return this.send('/v1/me/favorites');
  }

  async setFavorites(exerciseIds: string[]): Promise<T.Exercise[]> {
    return this.send('/v1/me/favorites', { method: 'PUT', body: { exerciseIds } });
  }

  async personalRecords(exerciseId?: string): Promise<{ unit: T.WeightUnit; records: T.PersonalRecord[] }> {
    return this.send('/v1/me/prs', { query: { exerciseId } });
  }

  async prHistory(
    exerciseId: string,
    prType: T.PrType = 'weight',
  ): Promise<{
    unit: T.WeightUnit;
    prType: T.PrType;
    points: { value: number; previousValue: number | null; improvementPct: number | null; achievedAt: string }[];
    truncated: boolean;
    totalPoints: number;
  }> {
    return this.send(`/v1/me/prs/${exerciseId}/history`, { query: { prType } });
  }

  async achievements(): Promise<{ code: string; icon: string; title: string; description: string; earned_at: string | null }[]> {
    return this.send('/v1/me/achievements');
  }

  async calendar(from: string, to: string): Promise<T.CalendarDay[]> {
    return this.send('/v1/me/workouts/calendar', { query: { from, to } });
  }

  async analytics(days = 180): Promise<unknown> {
    return this.send('/v1/me/analytics', { query: { days } });
  }

  async registerPushToken(token: string, platform: 'ios' | 'android' | 'web'): Promise<void> {
    return this.send('/v1/me/push-tokens', { method: 'POST', body: { token, platform } });
  }

  // ── home ────────────────────────────────────────────────────────────────

  async home(): Promise<T.HomeView> {
    return this.send('/v1/home');
  }

  // ── exercises ───────────────────────────────────────────────────────────

  async exerciseCategories(): Promise<T.ExerciseCategory[]> {
    return this.send('/v1/exercises/categories', { anonymous: true });
  }

  async exercises(filters: { category?: string; q?: string; popular?: boolean } = {}): Promise<T.Exercise[]> {
    return this.send('/v1/exercises', { query: filters });
  }

  async createExercise(input: { name: string; categorySlug?: string; equipment?: string }): Promise<T.Exercise> {
    return this.send('/v1/exercises', { method: 'POST', body: input });
  }

  // ── workouts ────────────────────────────────────────────────────────────

  async startWorkout(input: { workoutType: T.WorkoutType; title?: string; sessionDate?: string }): Promise<T.WorkoutSession> {
    return this.send('/v1/workouts', { method: 'POST', body: input });
  }

  async addSet(
    sessionId: string,
    input: { exerciseId: string; weight: number; unit: T.WeightUnit; reps: number; rpe?: number | null; notes?: string | null },
  ): Promise<T.WorkoutSet> {
    return this.send(`/v1/workouts/${sessionId}/sets`, { method: 'POST', body: input });
  }

  async updateSet(
    sessionId: string,
    setId: string,
    input: { weight?: number; unit?: T.WeightUnit; reps?: number; rpe?: number | null; notes?: string | null },
  ): Promise<T.WorkoutSet> {
    return this.send(`/v1/workouts/${sessionId}/sets/${setId}`, { method: 'PATCH', body: input });
  }

  async deleteSet(sessionId: string, setId: string): Promise<void> {
    return this.send(`/v1/workouts/${sessionId}/sets/${setId}`, { method: 'DELETE' });
  }

  async finishWorkout(sessionId: string, input: { durationSeconds?: number; notes?: string } = {}): Promise<T.FinishResult> {
    return this.send(`/v1/workouts/${sessionId}/finish`, { method: 'POST', body: input });
  }

  async logCompleteWorkout(input: {
    workoutType: T.WorkoutType;
    title?: string;
    sessionDate?: string;
    durationSeconds?: number;
    notes?: string;
    exercises: { exerciseId: string; sets: { weight: number; unit: T.WeightUnit; reps: number; rpe?: number | null }[] }[];
  }): Promise<T.FinishResult> {
    return this.send('/v1/workouts/complete', { method: 'POST', body: input });
  }

  async workouts(filters: { from?: string; to?: string; limit?: number; userId?: string } = {}): Promise<T.WorkoutSession[]> {
    return this.send('/v1/workouts', { query: filters });
  }

  async workout(sessionId: string): Promise<T.WorkoutDetail> {
    return this.send(`/v1/workouts/${sessionId}`);
  }

  async todaysWorkout(): Promise<{ session: T.WorkoutSession | null }> {
    return this.send('/v1/workouts/today');
  }

  async deleteWorkout(sessionId: string): Promise<void> {
    return this.send(`/v1/workouts/${sessionId}`, { method: 'DELETE' });
  }

  // ── social ──────────────────────────────────────────────────────────────

  async searchUsers(q: string, limit = 20): Promise<T.SearchResult[]> {
    return this.send('/v1/users/search', { query: { q, limit } });
  }

  async userProfile(username: string): Promise<unknown> {
    return this.send(`/v1/users/${username}`);
  }

  async connections(): Promise<
    { user_id: string; username: string; display_name: string; avatar_url: string | null; connected_at: string }[]
  > {
    return this.send('/v1/connections');
  }

  async connectionRequests(): Promise<{ incoming: T.ConnectionRequest[]; outgoing: T.ConnectionRequest[] }> {
    return this.send('/v1/connections/requests');
  }

  async sendConnectionRequest(username: string, message?: string): Promise<{ id: string; status: string }> {
    return this.send('/v1/connections/requests', { method: 'POST', body: { username, message } });
  }

  async acceptConnectionRequest(id: string): Promise<{ rivalryId: string; rival: T.UserSummary }> {
    return this.send(`/v1/connections/requests/${id}/accept`, { method: 'POST' });
  }

  async rejectConnectionRequest(id: string): Promise<void> {
    return this.send(`/v1/connections/requests/${id}/reject`, { method: 'POST' });
  }

  async cancelConnectionRequest(id: string): Promise<void> {
    return this.send(`/v1/connections/requests/${id}/cancel`, { method: 'POST' });
  }

  async removeConnection(userId: string): Promise<void> {
    return this.send(`/v1/connections/${userId}`, { method: 'DELETE' });
  }

  async blockUser(userId: string): Promise<void> {
    return this.send(`/v1/blocks/${userId}`, { method: 'POST' });
  }

  async unblockUser(userId: string): Promise<void> {
    return this.send(`/v1/blocks/${userId}`, { method: 'DELETE' });
  }

  async muteUser(userId: string): Promise<void> {
    return this.send(`/v1/mutes/${userId}`, { method: 'POST' });
  }

  async reportUser(userId: string, reason: string, details?: string): Promise<{ id: string }> {
    return this.send('/v1/reports', { method: 'POST', body: { userId, reason, details } });
  }

  // ── competition ─────────────────────────────────────────────────────────

  async rivals(): Promise<T.RivalSummary[]> {
    return this.send('/v1/rivals');
  }

  async rivalry(userId: string): Promise<T.RivalryDetail> {
    return this.send(`/v1/rivals/${userId}`);
  }

  async rivalryTimeline(userId: string): Promise<
    { id: string; event_type: string; actor_name: string; exercise_name: string | null; payload: Record<string, unknown>; created_at: string }[]
  > {
    return this.send(`/v1/rivals/${userId}/timeline`);
  }

  async catchUp(userId: string): Promise<T.CatchUpView> {
    return this.send(`/v1/rivals/${userId}/catch-up`);
  }

  async leaderboard(board: T.LeaderboardName, days?: number): Promise<T.Leaderboard> {
    return this.send(`/v1/leaderboards/${board}`, { query: { days } });
  }

  async exerciseLeaderboard(exerciseId: string): Promise<{ exercise: { id: string; name: string }; entries: T.LeaderboardEntry[] }> {
    return this.send(`/v1/leaderboards/exercise/${exerciseId}`);
  }

  // ── challenges ──────────────────────────────────────────────────────────

  async challenges(status?: T.ChallengeStatus): Promise<T.Challenge[]> {
    return this.send('/v1/challenges', { query: { status } });
  }

  async challenge(id: string): Promise<T.Challenge> {
    return this.send(`/v1/challenges/${id}`);
  }

  async challengeTemplates(): Promise<T.ChallengeTemplate[]> {
    return this.send('/v1/challenges/templates', { anonymous: true });
  }

  async suggestChallengeTarget(
    opponentId: string,
    exerciseId: string,
  ): Promise<{ opponentBest: number | null; suggestedTarget: number | null }> {
    return this.send('/v1/challenges/suggest-target', { query: { opponentId, exerciseId } });
  }

  async createChallenge(input: {
    opponentId: string;
    type: T.ChallengeType;
    exerciseId?: string | null;
    templateCode?: string;
    title?: string;
    target?: number;
    targetUnit?: T.WeightUnit;
    deadline: string;
  }): Promise<{ id: string; status: string }> {
    return this.send('/v1/challenges', { method: 'POST', body: input });
  }

  async acceptChallenge(id: string): Promise<unknown> {
    return this.send(`/v1/challenges/${id}/accept`, { method: 'POST' });
  }

  async declineChallenge(id: string): Promise<unknown> {
    return this.send(`/v1/challenges/${id}/decline`, { method: 'POST' });
  }

  async cancelChallenge(id: string): Promise<void> {
    return this.send(`/v1/challenges/${id}/cancel`, { method: 'POST' });
  }

  // ── feed & notifications ────────────────────────────────────────────────

  async feed(limit = 30, before?: string): Promise<T.FeedItem[]> {
    return this.send('/v1/feed', { query: { limit, before } });
  }

  async react(activityId: string, reaction: 'fire' | 'muscle' | 'crown' | 'laugh'): Promise<void> {
    return this.send(`/v1/feed/${activityId}/reactions`, { method: 'POST', body: { reaction } });
  }

  async unreact(activityId: string, reaction: 'fire' | 'muscle' | 'crown' | 'laugh'): Promise<void> {
    return this.send(`/v1/feed/${activityId}/reactions/${reaction}`, { method: 'DELETE' });
  }

  async comments(activityId: string): Promise<{ id: string; body: string; username: string; created_at: string }[]> {
    return this.send(`/v1/feed/${activityId}/comments`);
  }

  async comment(activityId: string, body: string): Promise<{ id: string; created_at: string }> {
    return this.send(`/v1/feed/${activityId}/comments`, { method: 'POST', body: { body } });
  }

  async notifications(limit = 30, before?: string): Promise<{ unread: number; items: T.Notification[] }> {
    return this.send('/v1/notifications', { query: { limit, before } });
  }

  async markNotificationsRead(ids?: string[]): Promise<{ marked: number; unread: number }> {
    return this.send('/v1/notifications/read', { method: 'POST', body: { ids } });
  }

  // ── billing & sharing ───────────────────────────────────────────────────

  async plans(): Promise<{ plans: T.Plan[]; features: { key: string; label: string }[]; provider: string }> {
    return this.send('/v1/subscription/plans', { anonymous: true });
  }

  async subscription(): Promise<T.SubscriptionStatus> {
    return this.send('/v1/me/subscription');
  }

  async checkout(planCode: string): Promise<{ provider: string; planCode: string; action: Record<string, string> }> {
    return this.send('/v1/subscription/checkout', { method: 'POST', body: { planCode } });
  }

  async referrals(): Promise<T.ReferralSummary> {
    return this.send('/v1/me/referrals');
  }

  async shareCard(prHistoryId: string): Promise<{
    data: Record<string, unknown>;
    caption: string;
    formats: { format: string; width: number; height: number; url: string }[];
  }> {
    return this.send(`/v1/share/pr/${prHistoryId}`);
  }

  /** Absolute URL for a rendered card, for a share sheet or an <img>. */
  shareCardUrl(prHistoryId: string, format: 'story' | 'square' | 'compact' = 'story'): string {
    return this.buildUrl(`/v1/share/pr/${prHistoryId}.svg`, { format });
  }

  // ── admin ───────────────────────────────────────────────────────────────

  async adminDashboard(days = 30): Promise<T.AdminDashboard> {
    return this.send('/v1/admin/metrics', { query: { days } });
  }

  async adminUsers(filters: { search?: string; status?: string; limit?: number } = {}): Promise<
    {
      id: string;
      email: string | null;
      username: string | null;
      display_name: string | null;
      status: string;
      is_admin: boolean;
      created_at: string;
      last_seen_at: string | null;
      workouts: number;
      is_pro: boolean;
    }[]
  > {
    return this.send('/v1/admin/users', { query: filters });
  }

  async adminSetUserStatus(userId: string, status: 'active' | 'suspended'): Promise<void> {
    return this.send(`/v1/admin/users/${userId}`, { method: 'PATCH', body: { status } });
  }

  async adminReports(status = 'open'): Promise<
    {
      id: string;
      reason: string;
      details: string | null;
      status: string;
      created_at: string;
      reporter_username: string | null;
      reported_id: string;
      reported_username: string | null;
      reported_count: number;
    }[]
  > {
    return this.send('/v1/admin/reports', { query: { status } });
  }

  async adminResolveReport(id: string, status: 'reviewing' | 'resolved' | 'dismissed', resolution?: string): Promise<void> {
    return this.send(`/v1/admin/reports/${id}`, { method: 'PATCH', body: { status, resolution } });
  }

  async adminUpsertExercise(input: Record<string, unknown>): Promise<{ id: string }> {
    return this.send('/v1/admin/exercises', { method: 'PUT', body: input });
  }

  async adminUpsertChallengeTemplate(input: Record<string, unknown>): Promise<{ id: string }> {
    return this.send('/v1/admin/challenge-templates', { method: 'PUT', body: input });
  }

  async adminUpsertBadge(input: Record<string, unknown>): Promise<{ id: string }> {
    return this.send('/v1/admin/badges', { method: 'PUT', body: input });
  }

  async adminUpsertPlan(input: Record<string, unknown>): Promise<{ id: string }> {
    return this.send('/v1/admin/plans', { method: 'PUT', body: input });
  }

  async adminScoring(): Promise<Record<string, number>> {
    return this.send('/v1/admin/scoring');
  }

  async adminUpdateScoring(input: Record<string, number>): Promise<Record<string, number>> {
    return this.send('/v1/admin/scoring', { method: 'PUT', body: input });
  }

  async adminAuditLog(limit = 100): Promise<Record<string, unknown>[]> {
    return this.send('/v1/admin/audit-log', { query: { limit } });
  }
}
