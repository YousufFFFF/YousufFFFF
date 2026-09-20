import type { WeightUnit } from './units.ts';

export type Uuid = string;
/** Calendar date in the user's local timezone, `YYYY-MM-DD`. */
export type IsoDate = string;

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

export type TrainingGoal =
  | 'strength'
  | 'muscle_building'
  | 'fitness'
  | 'fat_loss'
  | 'general_health'
  | 'powerlifting'
  | 'bodybuilding';

export type WorkoutType = 'push' | 'pull' | 'legs' | 'upper' | 'lower' | 'full_body' | 'custom';

/** A single logged set. `weightGrams` is always the internal unit (see units.ts). */
export interface WorkoutSet {
  id?: Uuid;
  exerciseId: Uuid;
  setNumber: number;
  weightGrams: number;
  reps: number;
  /** The unit the user typed it in — kept for faithful re-display, never for maths. */
  enteredUnit: WeightUnit;
  rpe?: number | null;
  notes?: string | null;
  performedAt: Date;
}

export interface WorkoutSession {
  id: Uuid;
  userId: Uuid;
  workoutType: WorkoutType;
  /** Local calendar day the session counts towards for attendance. */
  sessionDate: IsoDate;
  startedAt: Date;
  endedAt?: Date | null;
  durationSeconds?: number | null;
  sets: WorkoutSet[];
}

export type PrType = 'weight' | 'reps' | 'volume' | 'e1rm';

export interface PersonalRecord {
  userId: Uuid;
  exerciseId: Uuid;
  prType: PrType;
  /** grams for `weight`/`e1rm`/`volume`; plain count for `reps`. */
  value: number;
  /** For a rep PR this is the weight the reps were performed at. */
  weightGrams?: number | null;
  reps?: number | null;
  achievedAt: Date;
}

/** What a user allows others to see, per data category. */
export type Visibility = 'public' | 'connections' | 'private';

export interface PrivacySettings {
  prs: Visibility;
  workoutHistory: Visibility;
  attendance: Visibility;
  bodyweight: Visibility;
  progress: Visibility;
  activityFeed: Visibility;
  /** Opt-in only — never defaulted on. */
  gymLocation: Visibility;
}

/** Defaults are deliberately conservative: nothing sensitive is public. */
export const DEFAULT_PRIVACY: PrivacySettings = {
  prs: 'connections',
  workoutHistory: 'connections',
  attendance: 'connections',
  bodyweight: 'private',
  progress: 'connections',
  activityFeed: 'connections',
  gymLocation: 'private',
};

export type ConnectionStatus = 'pending' | 'accepted' | 'rejected' | 'removed' | 'blocked';

export interface Connection {
  userAId: Uuid;
  userBId: Uuid;
  status: ConnectionStatus;
}

export type { WeightUnit };
