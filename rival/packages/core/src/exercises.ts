/**
 * The starter exercise library.
 *
 * This is the seed set shipped with the app. The library is data, not code —
 * admins add to it from the dashboard and users can create custom exercises, so
 * nothing here is treated as a closed list.
 */

export type MuscleGroup = 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core' | 'full_body';

export type EquipmentType = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'other';

export interface SeedExercise {
  slug: string;
  name: string;
  category: MuscleGroup;
  equipment: EquipmentType;
  /** Compound lifts anchor the strength leaderboards. */
  isCompound: boolean;
  /** Shown in onboarding's favourite-exercise picker. */
  popular: boolean;
}

export const EXERCISE_CATEGORIES: ReadonlyArray<{ slug: MuscleGroup; name: string; icon: string }> = [
  { slug: 'chest', name: 'Chest', icon: '🫀' },
  { slug: 'back', name: 'Back', icon: '🔙' },
  { slug: 'legs', name: 'Legs', icon: '🦵' },
  { slug: 'shoulders', name: 'Shoulders', icon: '🏋️' },
  { slug: 'arms', name: 'Arms', icon: '💪' },
  { slug: 'core', name: 'Core', icon: '🧱' },
  { slug: 'full_body', name: 'Full Body', icon: '🔥' },
];

export const SEED_EXERCISES: ReadonlyArray<SeedExercise> = [
  // Chest
  { slug: 'bench-press', name: 'Bench Press', category: 'chest', equipment: 'barbell', isCompound: true, popular: true },
  { slug: 'incline-bench-press', name: 'Incline Bench Press', category: 'chest', equipment: 'barbell', isCompound: true, popular: true },
  { slug: 'dumbbell-bench-press', name: 'Dumbbell Bench Press', category: 'chest', equipment: 'dumbbell', isCompound: true, popular: true },
  { slug: 'incline-dumbbell-press', name: 'Incline Dumbbell Press', category: 'chest', equipment: 'dumbbell', isCompound: true, popular: true },
  { slug: 'chest-press', name: 'Chest Press', category: 'chest', equipment: 'machine', isCompound: true, popular: true },
  { slug: 'cable-fly', name: 'Cable Fly', category: 'chest', equipment: 'cable', isCompound: false, popular: false },
  { slug: 'dips', name: 'Dips', category: 'chest', equipment: 'bodyweight', isCompound: true, popular: false },

  // Back
  { slug: 'deadlift', name: 'Deadlift', category: 'back', equipment: 'barbell', isCompound: true, popular: true },
  { slug: 'lat-pulldown', name: 'Lat Pulldown', category: 'back', equipment: 'cable', isCompound: true, popular: true },
  { slug: 'pull-ups', name: 'Pull Ups', category: 'back', equipment: 'bodyweight', isCompound: true, popular: true },
  { slug: 'barbell-row', name: 'Barbell Row', category: 'back', equipment: 'barbell', isCompound: true, popular: true },
  { slug: 'seated-cable-row', name: 'Seated Cable Row', category: 'back', equipment: 'cable', isCompound: true, popular: true },
  { slug: 'dumbbell-row', name: 'Dumbbell Row', category: 'back', equipment: 'dumbbell', isCompound: true, popular: false },
  { slug: 'face-pull', name: 'Face Pull', category: 'back', equipment: 'cable', isCompound: false, popular: false },

  // Legs
  { slug: 'squat', name: 'Squat', category: 'legs', equipment: 'barbell', isCompound: true, popular: true },
  { slug: 'leg-press', name: 'Leg Press', category: 'legs', equipment: 'machine', isCompound: true, popular: true },
  { slug: 'romanian-deadlift', name: 'Romanian Deadlift', category: 'legs', equipment: 'barbell', isCompound: true, popular: true },
  { slug: 'leg-extension', name: 'Leg Extension', category: 'legs', equipment: 'machine', isCompound: false, popular: true },
  { slug: 'leg-curl', name: 'Leg Curl', category: 'legs', equipment: 'machine', isCompound: false, popular: true },
  { slug: 'front-squat', name: 'Front Squat', category: 'legs', equipment: 'barbell', isCompound: true, popular: false },
  { slug: 'bulgarian-split-squat', name: 'Bulgarian Split Squat', category: 'legs', equipment: 'dumbbell', isCompound: true, popular: false },
  { slug: 'calf-raise', name: 'Calf Raise', category: 'legs', equipment: 'machine', isCompound: false, popular: false },
  { slug: 'hip-thrust', name: 'Hip Thrust', category: 'legs', equipment: 'barbell', isCompound: true, popular: false },

  // Shoulders
  { slug: 'overhead-press', name: 'Overhead Press', category: 'shoulders', equipment: 'barbell', isCompound: true, popular: true },
  { slug: 'dumbbell-shoulder-press', name: 'Dumbbell Shoulder Press', category: 'shoulders', equipment: 'dumbbell', isCompound: true, popular: true },
  { slug: 'lateral-raise', name: 'Lateral Raise', category: 'shoulders', equipment: 'dumbbell', isCompound: false, popular: true },
  { slug: 'front-raise', name: 'Front Raise', category: 'shoulders', equipment: 'dumbbell', isCompound: false, popular: true },
  { slug: 'rear-delt-fly', name: 'Rear Delt Fly', category: 'shoulders', equipment: 'dumbbell', isCompound: false, popular: false },
  { slug: 'arnold-press', name: 'Arnold Press', category: 'shoulders', equipment: 'dumbbell', isCompound: true, popular: false },

  // Arms
  { slug: 'barbell-curl', name: 'Barbell Curl', category: 'arms', equipment: 'barbell', isCompound: false, popular: true },
  { slug: 'dumbbell-curl', name: 'Dumbbell Curl', category: 'arms', equipment: 'dumbbell', isCompound: false, popular: true },
  { slug: 'hammer-curl', name: 'Hammer Curl', category: 'arms', equipment: 'dumbbell', isCompound: false, popular: true },
  { slug: 'tricep-pushdown', name: 'Tricep Pushdown', category: 'arms', equipment: 'cable', isCompound: false, popular: true },
  { slug: 'skull-crushers', name: 'Skull Crushers', category: 'arms', equipment: 'barbell', isCompound: false, popular: true },
  { slug: 'preacher-curl', name: 'Preacher Curl', category: 'arms', equipment: 'barbell', isCompound: false, popular: false },
  { slug: 'close-grip-bench-press', name: 'Close Grip Bench Press', category: 'arms', equipment: 'barbell', isCompound: true, popular: false },

  // Core
  { slug: 'hanging-leg-raise', name: 'Hanging Leg Raise', category: 'core', equipment: 'bodyweight', isCompound: false, popular: false },
  { slug: 'cable-crunch', name: 'Cable Crunch', category: 'core', equipment: 'cable', isCompound: false, popular: false },
  { slug: 'plank', name: 'Plank', category: 'core', equipment: 'bodyweight', isCompound: false, popular: false },
];

/** The lifts the strength and overall boards anchor on. */
export const HEADLINE_LIFTS = ['squat', 'bench-press', 'deadlift', 'overhead-press'] as const;

export function popularExercises(): ReadonlyArray<SeedExercise> {
  return SEED_EXERCISES.filter((e) => e.popular);
}

export function exercisesByCategory(category: MuscleGroup): ReadonlyArray<SeedExercise> {
  return SEED_EXERCISES.filter((e) => e.category === category);
}
