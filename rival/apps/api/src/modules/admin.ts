import { many, one, query } from '../db/index.ts';
import { ApiError } from '../lib/errors.ts';
import type { RivalryScoringConfig } from '@rival/core';

/**
 * Admin dashboard.
 *
 * Every function here is behind `requireAdmin`, and every mutation writes an
 * `admin_audit_log` row — moderation actions on other people's accounts should
 * always be attributable.
 */

export interface AdminMetrics {
  users: { total: number; newToday: number; newThisWeek: number; newThisMonth: number };
  active: { daily: number; weekly: number; monthly: number };
  training: { workoutsLogged: number; workoutsToday: number; prsAchieved: number; prsToday: number };
  social: { connections: number; challengesCreated: number; challengesCompleted: number };
  revenue: { activeSubscriptions: number; revenueMinorThisMonth: number; currency: string };
  moderation: { openReports: number };
}

export async function getMetrics(): Promise<AdminMetrics> {
  const row = await one<Record<string, number | string>>(
    `SELECT
       (SELECT count(*) FROM users WHERE deleted_at IS NULL)::int                                   AS users_total,
       (SELECT count(*) FROM users WHERE created_at >= current_date)::int                           AS users_today,
       (SELECT count(*) FROM users WHERE created_at >= current_date - 7)::int                       AS users_week,
       (SELECT count(*) FROM users WHERE created_at >= current_date - 30)::int                      AS users_month,
       (SELECT count(*) FROM users WHERE last_seen_at >= now() - interval '1 day')::int             AS dau,
       (SELECT count(*) FROM users WHERE last_seen_at >= now() - interval '7 days')::int            AS wau,
       (SELECT count(*) FROM users WHERE last_seen_at >= now() - interval '30 days')::int           AS mau,
       (SELECT count(*) FROM workout_sessions WHERE is_counted AND deleted_at IS NULL)::int         AS workouts,
       (SELECT count(*) FROM workout_sessions
         WHERE is_counted AND deleted_at IS NULL AND session_date = current_date)::int              AS workouts_today,
       (SELECT count(*) FROM pr_history)::int                                                       AS prs,
       (SELECT count(*) FROM pr_history WHERE achieved_at >= current_date)::int                     AS prs_today,
       (SELECT count(*) FROM connections)::int                                                      AS connections,
       (SELECT count(*) FROM challenges)::int                                                       AS challenges_created,
       (SELECT count(*) FROM challenges WHERE status = 'completed')::int                            AS challenges_completed,
       (SELECT count(*) FROM subscriptions WHERE status IN ('active','trialing'))::int              AS subs_active,
       (SELECT coalesce(sum(amount_minor), 0) FROM payments
         WHERE status = 'succeeded' AND created_at >= date_trunc('month', current_date))::int       AS revenue_month,
       (SELECT count(*) FROM reports WHERE status = 'open')::int                                    AS open_reports`,
  );
  const m = row ?? {};
  const n = (key: string) => Number(m[key] ?? 0);

  return {
    users: {
      total: n('users_total'),
      newToday: n('users_today'),
      newThisWeek: n('users_week'),
      newThisMonth: n('users_month'),
    },
    active: { daily: n('dau'), weekly: n('wau'), monthly: n('mau') },
    training: {
      workoutsLogged: n('workouts'),
      workoutsToday: n('workouts_today'),
      prsAchieved: n('prs'),
      prsToday: n('prs_today'),
    },
    social: {
      connections: n('connections'),
      challengesCreated: n('challenges_created'),
      challengesCompleted: n('challenges_completed'),
    },
    revenue: {
      activeSubscriptions: n('subs_active'),
      revenueMinorThisMonth: n('revenue_month'),
      currency: 'INR',
    },
    moderation: { openReports: n('open_reports') },
  };
}

/** Daily signups and workouts for the dashboard's trend charts. */
export async function getTrends(days = 30) {
  return many<{ day: string; signups: number; workouts: number; prs: number }>(
    `WITH days AS (
        SELECT generate_series(current_date - ($1::int - 1), current_date, '1 day')::date AS day
     )
     SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
            (SELECT count(*)::int FROM users u WHERE u.created_at::date = d.day) AS signups,
            (SELECT count(*)::int FROM workout_sessions w
              WHERE w.session_date = d.day AND w.is_counted AND w.deleted_at IS NULL) AS workouts,
            (SELECT count(*)::int FROM pr_history h WHERE h.achieved_at::date = d.day) AS prs
       FROM days d ORDER BY d.day`,
    [days],
  );
}

export async function listUsers(filters: { search?: string; status?: string; limit?: number } = {}) {
  return many<{
    id: string;
    email: string | null;
    username: string | null;
    display_name: string | null;
    status: string;
    is_admin: boolean;
    created_at: Date;
    last_seen_at: Date | null;
    workouts: number;
    is_pro: boolean;
  }>(
    `SELECT u.id, u.email, p.username, p.display_name, u.status, u.is_admin,
            u.created_at, u.last_seen_at,
            (SELECT count(*)::int FROM attendance a WHERE a.user_id = u.id) AS workouts,
            EXISTS (SELECT 1 FROM subscriptions s
                     WHERE s.user_id = u.id AND s.status IN ('active','trialing')) AS is_pro
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id
      WHERE u.deleted_at IS NULL
        AND ($1::text IS NULL OR p.username ILIKE '%' || $1 || '%'
                              OR p.display_name ILIKE '%' || $1 || '%'
                              OR u.email::text ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR u.status = $2)
      ORDER BY u.created_at DESC
      LIMIT $3`,
    [filters.search ?? null, filters.status ?? null, filters.limit ?? 50],
  );
}

export async function setUserStatus(adminId: string, userId: string, status: 'active' | 'suspended'): Promise<void> {
  const result = await query('UPDATE users SET status = $2, updated_at = now() WHERE id = $1', [userId, status]);
  if (result.rowCount === 0) throw ApiError.notFound('User not found.');
  await audit(adminId, 'user.status', 'user', userId, { status });
}

export async function listReports(status = 'open') {
  return many<{
    id: string;
    reason: string;
    details: string | null;
    status: string;
    created_at: Date;
    reporter_username: string | null;
    reported_id: string;
    reported_username: string | null;
    reported_count: number;
  }>(
    `SELECT r.id, r.reason, r.details, r.status, r.created_at,
            rp.username AS reporter_username,
            r.reported_id, tp.username AS reported_username,
            (SELECT count(*)::int FROM reports r2 WHERE r2.reported_id = r.reported_id) AS reported_count
       FROM reports r
       LEFT JOIN profiles rp ON rp.user_id = r.reporter_id
       LEFT JOIN profiles tp ON tp.user_id = r.reported_id
      WHERE ($1::text = 'all' OR r.status = $1)
      ORDER BY r.created_at DESC LIMIT 100`,
    [status],
  );
}

export async function resolveReport(
  adminId: string,
  reportId: string,
  status: 'reviewing' | 'resolved' | 'dismissed',
  resolution?: string,
): Promise<void> {
  const result = await query(
    `UPDATE reports SET status = $2, resolution = $3, handled_by = $4,
            resolved_at = CASE WHEN $2 IN ('resolved','dismissed') THEN now() ELSE NULL END
      WHERE id = $1`,
    [reportId, status, resolution ?? null, adminId],
  );
  if (result.rowCount === 0) throw ApiError.notFound('Report not found.');
  await audit(adminId, 'report.resolve', 'report', reportId, { status, resolution });
}

export async function upsertExercise(
  adminId: string,
  input: {
    id?: string;
    slug: string;
    name: string;
    categorySlug?: string;
    equipment?: string;
    isCompound?: boolean;
    isPopular?: boolean;
    isActive?: boolean;
  },
) {
  const category = input.categorySlug
    ? await one<{ id: string }>('SELECT id FROM exercise_categories WHERE slug = $1', [input.categorySlug])
    : null;

  const row = await one<{ id: string }>(
    `INSERT INTO exercises (slug, name, category_id, equipment, is_compound, is_popular, is_active)
     VALUES ($1, $2, $3, $4, coalesce($5, false), coalesce($6, false), coalesce($7, true))
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name, category_id = EXCLUDED.category_id, equipment = EXCLUDED.equipment,
       is_compound = EXCLUDED.is_compound, is_popular = EXCLUDED.is_popular, is_active = EXCLUDED.is_active
     RETURNING id`,
    [
      input.slug,
      input.name,
      category?.id ?? null,
      input.equipment ?? null,
      input.isCompound ?? null,
      input.isPopular ?? null,
      input.isActive ?? null,
    ],
  );
  await audit(adminId, 'exercise.upsert', 'exercise', row!.id, { slug: input.slug });
  return row!;
}

export async function upsertChallengeTemplate(
  adminId: string,
  input: {
    code: string;
    challengeType: string;
    title: string;
    description: string;
    defaultDurationDays: number;
    suggestedTargetPct?: number | null;
    requiresPro?: boolean;
    isActive?: boolean;
  },
) {
  const row = await one<{ id: string }>(
    `INSERT INTO challenge_templates
       (code, challenge_type, title, description, default_duration_days, suggested_target_pct, requires_pro, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, coalesce($7, false), coalesce($8, true))
     ON CONFLICT (code) DO UPDATE SET
       challenge_type = EXCLUDED.challenge_type, title = EXCLUDED.title, description = EXCLUDED.description,
       default_duration_days = EXCLUDED.default_duration_days, suggested_target_pct = EXCLUDED.suggested_target_pct,
       requires_pro = EXCLUDED.requires_pro, is_active = EXCLUDED.is_active
     RETURNING id`,
    [
      input.code,
      input.challengeType,
      input.title,
      input.description,
      input.defaultDurationDays,
      input.suggestedTargetPct ?? null,
      input.requiresPro ?? null,
      input.isActive ?? null,
    ],
  );
  await audit(adminId, 'challenge_template.upsert', 'challenge_template', row!.id, { code: input.code });
  return row!;
}

export async function upsertBadge(
  adminId: string,
  input: {
    code: string;
    icon: string;
    title: string;
    description: string;
    thresholdStat: string;
    thresholdValue: number;
    isActive?: boolean;
  },
) {
  const row = await one<{ id: string }>(
    `INSERT INTO achievements (code, icon, title, description, threshold_stat, threshold_value, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, coalesce($7, true))
     ON CONFLICT (code) DO UPDATE SET
       icon = EXCLUDED.icon, title = EXCLUDED.title, description = EXCLUDED.description,
       threshold_stat = EXCLUDED.threshold_stat, threshold_value = EXCLUDED.threshold_value,
       is_active = EXCLUDED.is_active
     RETURNING id`,
    [
      input.code,
      input.icon,
      input.title,
      input.description,
      input.thresholdStat,
      input.thresholdValue,
      input.isActive ?? null,
    ],
  );
  await audit(adminId, 'badge.upsert', 'achievement', row!.id, { code: input.code });
  return row!;
}

export async function upsertPlan(
  adminId: string,
  input: {
    code: string;
    name: string;
    description?: string;
    priceMinor: number;
    currency: string;
    interval: 'month' | 'year' | 'lifetime';
    features?: string[];
    isActive?: boolean;
  },
) {
  const row = await one<{ id: string }>(
    `INSERT INTO subscription_plans (code, name, description, price_minor, currency, interval, features, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, coalesce($7, '[]'::jsonb), coalesce($8, true))
     ON CONFLICT (code) DO UPDATE SET
       name = EXCLUDED.name, description = EXCLUDED.description, price_minor = EXCLUDED.price_minor,
       currency = EXCLUDED.currency, interval = EXCLUDED.interval, features = EXCLUDED.features,
       is_active = EXCLUDED.is_active
     RETURNING id`,
    [
      input.code,
      input.name,
      input.description ?? null,
      input.priceMinor,
      input.currency,
      input.interval,
      JSON.stringify(input.features ?? []),
      input.isActive ?? null,
    ],
  );
  await audit(adminId, 'plan.upsert', 'subscription_plan', row!.id, { code: input.code });
  return row!;
}

/** Retuning the competition without a release — see rivalry_scoring_config. */
export async function updateScoringConfig(
  adminId: string,
  input: Partial<RivalryScoringConfig>,
): Promise<RivalryScoringConfig> {
  const row = await one<{
    pr_battle_win: number;
    consistency_win: number;
    challenge_win: number;
    consistency_window_days: number;
    min_sessions_per_exercise: number;
  }>(
    `UPDATE rivalry_scoring_config SET
       pr_battle_win = coalesce($2, pr_battle_win),
       consistency_win = coalesce($3, consistency_win),
       challenge_win = coalesce($4, challenge_win),
       consistency_window_days = coalesce($5, consistency_window_days),
       min_sessions_per_exercise = coalesce($6, min_sessions_per_exercise),
       updated_at = now(), updated_by = $1
     WHERE id = 1 RETURNING *`,
    [
      adminId,
      input.prBattleWin ?? null,
      input.consistencyWin ?? null,
      input.challengeWin ?? null,
      input.consistencyWindowDays ?? null,
      input.minSessionsPerExercise ?? null,
    ],
  );
  await audit(adminId, 'scoring.update', 'rivalry_scoring_config', null, input as Record<string, unknown>);
  return {
    prBattleWin: row!.pr_battle_win,
    consistencyWin: row!.consistency_win,
    challengeWin: row!.challenge_win,
    consistencyWindowDays: row!.consistency_window_days,
    minSessionsPerExercise: row!.min_sessions_per_exercise,
  };
}

export async function audit(
  adminId: string,
  action: string,
  targetType: string | null,
  targetId: string | null,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await query(
    'INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, payload) VALUES ($1, $2, $3, $4, $5)',
    [adminId, action, targetType, targetId, payload],
  );
}

export async function listAuditLog(limit = 100) {
  return many(
    `SELECT l.id, l.action, l.target_type, l.target_id, l.payload, l.created_at, p.username AS admin_username
       FROM admin_audit_log l LEFT JOIN profiles p ON p.user_id = l.admin_id
      ORDER BY l.created_at DESC LIMIT $1`,
    [limit],
  );
}
