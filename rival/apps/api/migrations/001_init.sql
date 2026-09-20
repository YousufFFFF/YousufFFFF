-- RIVAL — initial schema.
--
-- Conventions used throughout:
--   * every weight is stored in integer GRAMS (see @rival/core units.ts)
--   * session dates are the user's LOCAL calendar day, stored as `date`
--   * soft-deletable rows carry `deleted_at`; everything else is hard deleted
--   * every foreign key that fans out from a user cascades on account deletion

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ─────────────────────────────── identity ───────────────────────────────

CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           citext,
  -- scrypt hash; null for accounts that only ever used an OAuth provider
  password_hash   text,
  email_verified  boolean NOT NULL DEFAULT false,
  is_admin        boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz,
  deleted_at      timestamptz
);
CREATE UNIQUE INDEX users_email_key ON users (email) WHERE deleted_at IS NULL;
CREATE INDEX users_last_seen_idx ON users (last_seen_at DESC NULLS LAST);
CREATE INDEX users_created_at_idx ON users (created_at DESC);

-- Third-party sign-in. Provider-agnostic on purpose: Google and Apple today,
-- anything else later, without a schema change.
CREATE TABLE oauth_accounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         text NOT NULL CHECK (provider IN ('google', 'apple')),
  provider_user_id text NOT NULL,
  email            citext,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id)
);
CREATE INDEX oauth_accounts_user_idx ON oauth_accounts (user_id);

-- Email verification and password reset both live here; the token column holds
-- a SHA-256 of the value mailed out, never the value itself.
CREATE TABLE auth_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     text NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_tokens_user_purpose_idx ON auth_tokens (user_id, purpose);

CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  device      text,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id) WHERE revoked_at IS NULL;

-- ─────────────────────────────── profile ────────────────────────────────

CREATE TABLE profiles (
  user_id          uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username         citext NOT NULL,
  display_name     text NOT NULL,
  avatar_url       text,
  bio              text,
  birth_year       int CHECK (birth_year BETWEEN 1900 AND 2100),
  gender           text CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
  height_cm        numeric(5,1) CHECK (height_cm > 0 AND height_cm < 300),
  bodyweight_grams int CHECK (bodyweight_grams > 0),
  experience_level text CHECK (experience_level IN ('beginner', 'intermediate', 'advanced')),
  goals            text[] NOT NULL DEFAULT '{}',
  preferred_unit   text NOT NULL DEFAULT 'kg' CHECK (preferred_unit IN ('kg', 'lb')),
  weekly_target    smallint NOT NULL DEFAULT 4 CHECK (weekly_target BETWEEN 1 AND 7),
  -- ISO weekday numbers (0 = Sunday) the user plans to rest; never counted as misses
  rest_weekdays    smallint[] NOT NULL DEFAULT '{}',
  timezone         text NOT NULL DEFAULT 'UTC',
  -- when true the user drops out of every rivalry and leaderboard until they resume
  competition_paused boolean NOT NULL DEFAULT false,
  xp               int NOT NULL DEFAULT 0 CHECK (xp >= 0),
  onboarding_step  text NOT NULL DEFAULT 'profile',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX profiles_username_key ON profiles (username);
-- Search is username / display-name prefix only; nothing sensitive is indexed.
CREATE INDEX profiles_display_name_idx ON profiles (lower(display_name) text_pattern_ops);

-- One row per user, one column per data category. Defaults are conservative:
-- nothing sensitive is visible to anyone who is not a connection.
CREATE TABLE user_privacy (
  user_id         uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  prs             text NOT NULL DEFAULT 'connections' CHECK (prs IN ('public','connections','private')),
  workout_history text NOT NULL DEFAULT 'connections' CHECK (workout_history IN ('public','connections','private')),
  attendance      text NOT NULL DEFAULT 'connections' CHECK (attendance IN ('public','connections','private')),
  bodyweight      text NOT NULL DEFAULT 'private' CHECK (bodyweight IN ('public','connections','private')),
  progress        text NOT NULL DEFAULT 'connections' CHECK (progress IN ('public','connections','private')),
  activity_feed   text NOT NULL DEFAULT 'connections' CHECK (activity_feed IN ('public','connections','private')),
  gym_location    text NOT NULL DEFAULT 'private' CHECK (gym_location IN ('public','connections','private')),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_settings (
  user_id            uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  pr_beaten          boolean NOT NULL DEFAULT true,
  consistency_gap    boolean NOT NULL DEFAULT true,
  took_number_one    boolean NOT NULL DEFAULT true,
  challenge_activity boolean NOT NULL DEFAULT true,
  friend_prs         boolean NOT NULL DEFAULT true,
  connection_requests boolean NOT NULL DEFAULT true,
  push_enabled       boolean NOT NULL DEFAULT true,
  email_enabled      boolean NOT NULL DEFAULT false,
  -- local times; the worker respects the profile timezone
  quiet_hours_start  time,
  quiet_hours_end    time,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE push_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE,
  platform   text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ────────────────────────── social graph ────────────────────────────────

-- A request is the *intent*; `connections` is the accepted, mutual edge.
CREATE TABLE connection_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  message      text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CHECK (requester_id <> addressee_id)
);
-- Only one request may be in flight between a given pair at a time.
CREATE UNIQUE INDEX connection_requests_pending_key
  ON connection_requests (requester_id, addressee_id) WHERE status = 'pending';
CREATE INDEX connection_requests_addressee_idx ON connection_requests (addressee_id, status);
CREATE INDEX connection_requests_requester_idx ON connection_requests (requester_id, status);

-- Stored once per pair with user_a_id < user_b_id so the edge is canonical and
-- a rivalry can never be duplicated by approaching it from the other side.
CREATE TABLE connections (
  user_a_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_a_id, user_b_id),
  CHECK (user_a_id < user_b_id)
);
CREATE INDEX connections_b_idx ON connections (user_b_id);

CREATE TABLE blocks (
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX blocks_blocked_idx ON blocks (blocked_id);

CREATE TABLE mutes (
  muter_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  muted_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (muter_id, muted_id)
);

CREATE TABLE reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  reported_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason        text NOT NULL,
  details       text,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  resolution    text,
  handled_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz
);
CREATE INDEX reports_status_idx ON reports (status, created_at DESC);
CREATE INDEX reports_reported_idx ON reports (reported_id);

-- ──────────────────────────── exercises ─────────────────────────────────

CREATE TABLE exercise_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE,
  name       text NOT NULL,
  icon       text,
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE exercises (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  category_id uuid REFERENCES exercise_categories(id) ON DELETE SET NULL,
  equipment   text CHECK (equipment IN ('barbell','dumbbell','machine','cable','bodyweight','other')),
  is_compound boolean NOT NULL DEFAULT false,
  is_popular  boolean NOT NULL DEFAULT false,
  -- A user-created exercise is private to its author and never leaderboarded.
  created_by  uuid REFERENCES users(id) ON DELETE CASCADE,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exercises_category_idx ON exercises (category_id) WHERE is_active;
CREATE INDEX exercises_custom_idx ON exercises (created_by) WHERE created_by IS NOT NULL;
CREATE INDEX exercises_name_idx ON exercises (lower(name) text_pattern_ops);

CREATE TABLE favorite_exercises (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, exercise_id)
);

-- ───────────────────────────── training ─────────────────────────────────

CREATE TABLE workout_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workout_type   text NOT NULL CHECK (workout_type IN ('push','pull','legs','upper','lower','full_body','custom')),
  title          text,
  -- the user's LOCAL calendar day; this is what attendance counts
  session_date   date NOT NULL,
  started_at     timestamptz NOT NULL DEFAULT now(),
  ended_at       timestamptz,
  duration_seconds int CHECK (duration_seconds >= 0),
  notes          text,
  -- denormalised for cheap listing; kept in step by the workout service
  exercise_count int NOT NULL DEFAULT 0,
  set_count      int NOT NULL DEFAULT 0,
  total_volume_grams bigint NOT NULL DEFAULT 0,
  -- a session only counts towards attendance once it holds at least one set
  is_counted     boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);
CREATE INDEX workout_sessions_user_date_idx
  ON workout_sessions (user_id, session_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX workout_sessions_counted_idx
  ON workout_sessions (user_id, session_date) WHERE is_counted AND deleted_at IS NULL;
CREATE INDEX workout_sessions_created_idx ON workout_sessions (created_at DESC);

CREATE TABLE workout_exercises (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  position    int NOT NULL DEFAULT 0,
  notes       text,
  UNIQUE (session_id, exercise_id)
);
CREATE INDEX workout_exercises_session_idx ON workout_exercises (session_id);
CREATE INDEX workout_exercises_exercise_idx ON workout_exercises (exercise_id);

CREATE TABLE workout_sets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_exercise_id uuid NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
  -- denormalised so PR queries never need three joins
  session_id          uuid NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id         uuid NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  set_number          int NOT NULL CHECK (set_number > 0),
  weight_grams        int NOT NULL CHECK (weight_grams >= 0),
  reps                int NOT NULL CHECK (reps >= 0 AND reps <= 1000),
  -- what the user typed it in, so the set redisplays faithfully
  entered_unit        text NOT NULL DEFAULT 'kg' CHECK (entered_unit IN ('kg','lb')),
  rpe                 numeric(3,1) CHECK (rpe >= 1 AND rpe <= 10),
  notes               text,
  performed_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workout_exercise_id, set_number)
);
CREATE INDEX workout_sets_user_exercise_idx ON workout_sets (user_id, exercise_id, weight_grams DESC);
CREATE INDEX workout_sets_session_idx ON workout_sets (session_id);
CREATE INDEX workout_sets_performed_idx ON workout_sets (user_id, performed_at DESC);

-- One row per user per gym day. The unique key is what stops attendance being
-- inflated by logging several sessions in a day.
CREATE TABLE attendance (
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_date  date NOT NULL,
  session_count int NOT NULL DEFAULT 1 CHECK (session_count > 0),
  first_session_id uuid REFERENCES workout_sessions(id) ON DELETE SET NULL,
  total_duration_seconds int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, session_date)
);
CREATE INDEX attendance_date_idx ON attendance (session_date DESC);

-- ──────────────────────── personal records ──────────────────────────────

-- The user's *standing* record per (exercise, type). For rep PRs the weight is
-- part of the key: "most reps at 80 kg" is its own record.
CREATE TABLE personal_records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id  uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  pr_type      text NOT NULL CHECK (pr_type IN ('weight','reps','volume','e1rm')),
  -- grams for weight/volume/e1rm; a rep count for 'reps'
  value        bigint NOT NULL,
  weight_grams int,
  reps         int,
  set_id       uuid REFERENCES workout_sets(id) ON DELETE SET NULL,
  session_id   uuid REFERENCES workout_sessions(id) ON DELETE SET NULL,
  achieved_at  timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
-- Non-rep records are one per (user, exercise, type)...
CREATE UNIQUE INDEX personal_records_key
  ON personal_records (user_id, exercise_id, pr_type)
  WHERE pr_type <> 'reps';
-- ...rep records are one per (user, exercise, weight).
CREATE UNIQUE INDEX personal_records_reps_key
  ON personal_records (user_id, exercise_id, weight_grams)
  WHERE pr_type = 'reps';
CREATE INDEX personal_records_exercise_leaderboard_idx
  ON personal_records (exercise_id, pr_type, value DESC);
CREATE INDEX personal_records_user_idx ON personal_records (user_id, achieved_at DESC);

-- Append-only: every record ever set, so PR history and the improvement board
-- have a real timeline to read rather than a single current value.
CREATE TABLE pr_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id     uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  pr_type         text NOT NULL CHECK (pr_type IN ('weight','reps','volume','e1rm')),
  value           bigint NOT NULL,
  previous_value  bigint,
  improvement_pct numeric(8,2),
  weight_grams    int,
  reps            int,
  session_id      uuid REFERENCES workout_sessions(id) ON DELETE SET NULL,
  achieved_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pr_history_user_exercise_idx ON pr_history (user_id, exercise_id, achieved_at DESC);
CREATE INDEX pr_history_achieved_idx ON pr_history (achieved_at DESC);

-- ───────────────────────────── rivalries ────────────────────────────────

-- Created automatically when a connection is accepted; dropped with it.
CREATE TABLE rivalries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at  timestamptz NOT NULL DEFAULT now(),
  is_active   boolean NOT NULL DEFAULT true,
  UNIQUE (user_a_id, user_b_id),
  CHECK (user_a_id < user_b_id)
);
CREATE INDEX rivalries_b_idx ON rivalries (user_b_id) WHERE is_active;

-- Cached score, recomputed whenever either side logs. Kept as a cache rather
-- than a source of truth so the scoring rules stay re-runnable.
CREATE TABLE rivalry_scores (
  rivalry_id      uuid PRIMARY KEY REFERENCES rivalries(id) ON DELETE CASCADE,
  score_a         int NOT NULL DEFAULT 0,
  score_b         int NOT NULL DEFAULT 0,
  battles_won_a   int NOT NULL DEFAULT 0,
  battles_won_b   int NOT NULL DEFAULT 0,
  sessions_a      int NOT NULL DEFAULT 0,
  sessions_b      int NOT NULL DEFAULT 0,
  challenges_won_a int NOT NULL DEFAULT 0,
  challenges_won_b int NOT NULL DEFAULT 0,
  computed_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rivalry_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rivalry_id  uuid NOT NULL REFERENCES rivalries(id) ON DELETE CASCADE,
  actor_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type  text NOT NULL CHECK (event_type IN
                ('rivalry_started','pr_beaten','lead_taken','lead_lost',
                 'consistency_lead','challenge_sent','challenge_won','challenge_lost')),
  exercise_id uuid REFERENCES exercises(id) ON DELETE SET NULL,
  payload     jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rivalry_events_rivalry_idx ON rivalry_events (rivalry_id, created_at DESC);

-- Scoring weights live in the database so the admin dashboard can retune the
-- competition without a release.
CREATE TABLE rivalry_scoring_config (
  id                       int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  pr_battle_win            int NOT NULL DEFAULT 1,
  consistency_win          int NOT NULL DEFAULT 1,
  challenge_win            int NOT NULL DEFAULT 1,
  consistency_window_days  int NOT NULL DEFAULT 30,
  min_sessions_per_exercise int NOT NULL DEFAULT 1,
  updated_at               timestamptz NOT NULL DEFAULT now(),
  updated_by               uuid REFERENCES users(id) ON DELETE SET NULL
);

-- ───────────────────────────── challenges ───────────────────────────────

CREATE TABLE challenge_templates (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 text NOT NULL UNIQUE,
  challenge_type       text NOT NULL CHECK (challenge_type IN ('pr','consistency','exercise','volume','workout_count')),
  title                text NOT NULL,
  description          text NOT NULL,
  default_duration_days int NOT NULL DEFAULT 30,
  suggested_target_pct int,
  is_active            boolean NOT NULL DEFAULT true,
  -- templates beyond the free set are a Pro feature
  requires_pro         boolean NOT NULL DEFAULT false
);

CREATE TABLE challenges (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opponent_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id    uuid REFERENCES challenge_templates(id) ON DELETE SET NULL,
  challenge_type text NOT NULL CHECK (challenge_type IN ('pr','consistency','exercise','volume','workout_count')),
  exercise_id    uuid REFERENCES exercises(id) ON DELETE SET NULL,
  title          text NOT NULL,
  -- grams for pr/exercise/volume, a plain count for consistency/workout_count
  target_value   bigint,
  start_date     date NOT NULL DEFAULT CURRENT_DATE,
  deadline       date NOT NULL,
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','active','completed','declined','cancelled','expired')),
  winner_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  responded_at   timestamptz,
  resolved_at    timestamptz,
  CHECK (creator_id <> opponent_id),
  CHECK (deadline >= start_date)
);
CREATE INDEX challenges_creator_idx ON challenges (creator_id, status);
CREATE INDEX challenges_opponent_idx ON challenges (opponent_id, status);
CREATE INDEX challenges_active_deadline_idx ON challenges (deadline) WHERE status = 'active';

CREATE TABLE challenge_members (
  challenge_id  uuid NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- snapshot at acceptance, so progress is measured from a fair starting line
  baseline_value bigint NOT NULL DEFAULT 0,
  current_value  bigint NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (challenge_id, user_id)
);

-- ──────────────────────── achievements & feed ───────────────────────────

CREATE TABLE achievements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  icon        text NOT NULL,
  title       text NOT NULL,
  description text NOT NULL,
  threshold_stat  text NOT NULL,
  threshold_value int NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  int NOT NULL DEFAULT 0
);

CREATE TABLE user_achievements (
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  earned_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

-- Fitness activity only — this is not a general purpose social feed.
CREATE TABLE activity_feed (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_type text NOT NULL CHECK (activity_type IN
                 ('workout_completed','new_pr','took_number_one','challenge_sent',
                  'challenge_won','streak_milestone','achievement_earned','rivalry_started')),
  exercise_id uuid REFERENCES exercises(id) ON DELETE SET NULL,
  session_id  uuid REFERENCES workout_sessions(id) ON DELETE CASCADE,
  -- the other party, for "challenged X" / "took #1 from X"
  subject_id  uuid REFERENCES users(id) ON DELETE CASCADE,
  payload     jsonb NOT NULL DEFAULT '{}',
  -- copied from the actor's privacy setting at write time so the feed query
  -- never has to join privacy to filter
  visibility  text NOT NULL DEFAULT 'connections' CHECK (visibility IN ('public','connections','private')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_feed_actor_idx ON activity_feed (actor_id, created_at DESC);
CREATE INDEX activity_feed_created_idx ON activity_feed (created_at DESC);

CREATE TABLE activity_reactions (
  activity_id uuid NOT NULL REFERENCES activity_feed(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction    text NOT NULL CHECK (reaction IN ('fire','muscle','crown','laugh')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_id, user_id, reaction)
);

CREATE TABLE activity_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES activity_feed(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        text NOT NULL CHECK (length(body) BETWEEN 1 AND 500),
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX activity_comments_activity_idx ON activity_comments (activity_id, created_at);

CREATE TABLE notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  title        text NOT NULL,
  body         text NOT NULL,
  actor_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  payload      jsonb NOT NULL DEFAULT '{}',
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

-- ────────────────── subscriptions, payments, referrals ──────────────────

-- Plans and prices are data, and the provider is a column rather than a
-- hard-coded integration, so Stripe / RevenueCat / Apple IAP / Play Billing can
-- each be wired up per deployment platform.
CREATE TABLE subscription_plans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,
  name          text NOT NULL,
  description   text,
  -- minor units (paise for INR, cents for USD)
  price_minor   int NOT NULL,
  currency      text NOT NULL DEFAULT 'INR',
  interval      text NOT NULL CHECK (interval IN ('month','year','lifetime')),
  features      jsonb NOT NULL DEFAULT '[]',
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    int NOT NULL DEFAULT 0
);

CREATE TABLE subscriptions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id           uuid REFERENCES subscription_plans(id) ON DELETE SET NULL,
  status            text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('trialing','active','past_due','cancelled','expired')),
  -- 'stripe' | 'revenuecat' | 'apple' | 'google' | 'promo' — never hard-coded in app code
  provider          text NOT NULL DEFAULT 'promo',
  provider_ref      text,
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end   timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subscriptions_user_idx ON subscriptions (user_id, status);
CREATE UNIQUE INDEX subscriptions_active_key ON subscriptions (user_id)
  WHERE status IN ('trialing', 'active');

CREATE TABLE payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  provider        text NOT NULL,
  provider_ref    text,
  amount_minor    int NOT NULL,
  currency        text NOT NULL DEFAULT 'INR',
  status          text NOT NULL CHECK (status IN ('pending','succeeded','failed','refunded')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_user_idx ON payments (user_id, created_at DESC);
CREATE INDEX payments_created_idx ON payments (created_at DESC) WHERE status = 'succeeded';

CREATE TABLE referrals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- set once the invited account actually exists; counts are derived from rows,
  -- never from a stored tally
  referred_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  code         text NOT NULL,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','signed_up','qualified')),
  rewarded_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referred_id)
);
CREATE INDEX referrals_referrer_idx ON referrals (referrer_id, status);

CREATE TABLE referral_codes (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────── admin ──────────────────────────────────

CREATE TABLE admin_audit_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  action     text NOT NULL,
  target_type text,
  target_id  uuid,
  payload    jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_log_created_idx ON admin_audit_log (created_at DESC);
