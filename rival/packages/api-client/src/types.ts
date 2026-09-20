import type { HomeCard, LeaderboardEntry, PrivacySettings, Visibility, WeightUnit } from '@rival/core';

/**
 * The shapes the API returns.
 *
 * Hand-written rather than generated so the clients depend on a stable, named
 * contract; the API's integration tests assert against the same field names.
 */

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; email: string | null; emailVerified: boolean; isAdmin: boolean };
  profile: { username: string; displayName: string; onboardingStep: string } | null;
}

export interface Me {
  id: string;
  email: string | null;
  emailVerified: boolean;
  isAdmin: boolean;
  profile: {
    username: string;
    displayName: string;
    avatarUrl: string | null;
    bio: string | null;
    birthYear: number | null;
    gender: string | null;
    heightCm: number | null;
    bodyweightGrams: number | null;
    experienceLevel: string | null;
    goals: string[];
    preferredUnit: WeightUnit;
    weeklyTarget: number;
    restWeekdays: number[];
    timezone: string;
    competitionPaused: boolean;
    onboardingStep: string;
  };
  privacy: PrivacySettings;
  stats: UserStats;
  subscription: SubscriptionStatus;
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
  level: {
    level: number;
    name: string;
    xp: number;
    xpIntoLevel: number;
    xpForNextLevel: number | null;
    nextLevelName: string | null;
    progressPct: number;
  };
}

export interface SubscriptionStatus {
  isPro: boolean;
  plan: { code: string; name: string; interval: string } | null;
  status: string | null;
  provider: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface HomeView {
  greeting: string;
  streakDays: number;
  trainedToday: boolean;
  unit: WeightUnit;
  connectionCount: number;
  cards: HomeCard[];
  today: { sessionId: string; workoutType: string; setCount: number } | null;
}

export interface Exercise {
  id: string;
  slug: string;
  name: string;
  category_id: string | null;
  category_name: string | null;
  category_slug: string | null;
  equipment: string | null;
  is_compound: boolean;
  is_popular: boolean;
  created_by: string | null;
}

export interface ExerciseCategory {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
}

export type WorkoutType = 'push' | 'pull' | 'legs' | 'upper' | 'lower' | 'full_body' | 'custom';

export interface WorkoutSession {
  id: string;
  user_id: string;
  workout_type: WorkoutType;
  title: string | null;
  session_date: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  exercise_count: number;
  set_count: number;
  total_volume_grams: number;
  is_counted: boolean;
}

export interface WorkoutSet {
  id: string;
  exercise_id: string;
  exercise_name: string;
  set_number: number;
  weight_grams: number;
  reps: number;
  entered_unit: WeightUnit;
  rpe: number | null;
  notes: string | null;
  performed_at: string;
}

export interface WorkoutDetail {
  session: WorkoutSession;
  exercises: { exerciseId: string; exerciseName: string; sets: WorkoutSet[] }[];
}

export type PrType = 'weight' | 'reps' | 'volume' | 'e1rm';

export interface DetectedPr {
  exerciseId: string;
  exerciseName: string;
  prType: PrType;
  value: number;
  previousValue: number | null;
  improvementPct: number | null;
  weightGrams: number | null;
  reps: number | null;
  achievedAt: string;
}

export interface FinishResult {
  session: WorkoutSession;
  prs: DetectedPr[];
  headlinePr: DetectedPr | null;
  xpAwarded: number;
  totalXp: number;
  newAchievements: { code: string; icon: string; title: string; description: string }[];
  recovery: { flag: string; title: string; message: string }[];
  streak: { currentDays: number; longestDays: number };
  leadsTaken: { rivalId: string; rivalName: string; exerciseId: string; exerciseName: string; deltaGrams: number }[];
}

export interface PersonalRecord {
  id: string;
  exercise_id: string;
  exercise_name: string;
  pr_type: PrType;
  value: number;
  weight_grams: number | null;
  reps: number | null;
  achieved_at: string;
}

export interface UserSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface SearchResult extends UserSummary {
  bio: string | null;
  connected: boolean;
  requestStatus: string | null;
  requestDirection: 'incoming' | 'outgoing' | null;
}

export interface ConnectionRequest {
  id: string;
  user: UserSummary;
  message: string | null;
  createdAt: string;
}

export interface RivalSummary {
  rivalryId: string;
  rival: UserSummary;
  you: number;
  them: number;
  leader: 'you' | 'rival' | 'tie';
  headline: string;
  sessionsYou: number;
  sessionsThem: number;
  recentPr: { exerciseName: string; value: number; achievedAt: string } | null;
  competitionPaused: boolean;
}

export interface PrBattle {
  exerciseId: string;
  exerciseName: string;
  youGrams: number | null;
  rivalGrams: number | null;
  outcome: 'you' | 'rival' | 'tie' | 'not_comparable';
  deltaDisplay: number | null;
  status: string;
}

export interface RivalryDetail {
  rivalryId: string;
  rival: UserSummary;
  comparable: boolean;
  reason: string | null;
  score: {
    you: number;
    rival: number;
    leader: 'you' | 'rival' | 'tie';
    headline: string;
    breakdown: {
      prBattles: { you: number; rival: number; comparable: number };
      consistency: { you: number; rival: number; winner: 'you' | 'rival' | 'tie' };
      challenges: { you: number; rival: number };
    };
  };
  battles: PrBattle[];
  consistency: { you: number; rival: number; gap: number; message: string; windowDays: number };
  challenges: { youWon: number; rivalWon: number; active: number };
  unit: WeightUnit;
}

export interface CatchUpView {
  rival: UserSummary;
  you: number;
  them: number;
  gap: number;
  windowDays: number;
  message: string;
  trainedToday: boolean;
  cta: { label: string; enabled: boolean; helper: string };
  earliestLevelDate: string | null;
}

export type LeaderboardName = 'overall' | 'strength' | 'consistency' | 'improvement' | 'challenges';

export interface Leaderboard {
  board: LeaderboardName;
  entries: LeaderboardEntry[];
}

export type ChallengeType = 'pr' | 'consistency' | 'exercise' | 'volume' | 'workout_count';
export type ChallengeStatus = 'pending' | 'active' | 'completed' | 'declined' | 'cancelled' | 'expired';

export interface Challenge {
  id: string;
  type: ChallengeType;
  title: string;
  status: ChallengeStatus;
  exercise: { id: string; name: string } | null;
  target: number | null;
  startDate: string;
  deadline: string;
  daysRemaining: number;
  summary: string;
  you: { id: string; displayName: string; value: number; progressPct: number };
  opponent: UserSummary & { value: number; progressPct: number };
  leaderId: string | null;
  winnerId: string | null;
  isCreator: boolean;
  unit: WeightUnit;
  targetIsWeight: boolean;
}

export interface ChallengeTemplate {
  id: string;
  code: string;
  challenge_type: ChallengeType;
  title: string;
  description: string;
  default_duration_days: number;
  suggested_target_pct: number | null;
  requires_pro: boolean;
}

export interface FeedItem {
  id: string;
  type: string;
  actor: UserSummary;
  subject: { id: string; username: string; displayName: string } | null;
  exercise: { id: string; name: string } | null;
  payload: Record<string, unknown>;
  createdAt: string;
  reactions: Record<string, number>;
  yourReactions: string[];
  commentCount: number;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  actor: { id: string; username: string | null; avatarUrl: string | null } | null;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface CalendarDay {
  date: string;
  trained: boolean;
  rest: boolean;
}

export interface AdminMetrics {
  users: { total: number; newToday: number; newThisWeek: number; newThisMonth: number };
  active: { daily: number; weekly: number; monthly: number };
  training: { workoutsLogged: number; workoutsToday: number; prsAchieved: number; prsToday: number };
  social: { connections: number; challengesCreated: number; challengesCompleted: number };
  revenue: { activeSubscriptions: number; revenueMinorThisMonth: number; currency: string };
  moderation: { openReports: number };
}

export interface AdminDashboard {
  metrics: AdminMetrics;
  trends: { day: string; signups: number; workouts: number; prs: number }[];
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_minor: number;
  currency: string;
  interval: 'month' | 'year' | 'lifetime';
  features: string[];
}

export interface ReferralSummary {
  code: string;
  link: string;
  signedUp: number;
  qualified: number;
  needed: number;
  rewardGranted: boolean;
  rewardDays: number;
  invites: { username: string | null; display_name: string | null; status: string; created_at: string }[];
}

export type { HomeCard, LeaderboardEntry, PrivacySettings, Visibility, WeightUnit };
