import { many, one } from '../db/index.ts';
import { ApiError } from '../lib/errors.ts';

/**
 * The exercise library.
 *
 * Shared exercises are admin-managed; a user may add their own, which stays
 * private to them and never appears on a leaderboard (a custom "Bench Press"
 * would otherwise compete against the real one).
 */

export interface ExerciseRow {
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

const SELECT_EXERCISE = `
  SELECT e.id, e.slug, e.name, e.category_id,
         c.name AS category_name, c.slug AS category_slug,
         e.equipment, e.is_compound, e.is_popular, e.created_by
    FROM exercises e
    LEFT JOIN exercise_categories c ON c.id = e.category_id`;

export async function listCategories() {
  return many<{ id: string; slug: string; name: string; icon: string | null }>(
    'SELECT id, slug, name, icon FROM exercise_categories ORDER BY sort_order, name',
  );
}

export interface ExerciseFilters {
  categorySlug?: string;
  search?: string;
  popularOnly?: boolean;
}

export async function listExercises(userId: string, filters: ExerciseFilters = {}) {
  const conditions = ['e.is_active', '(e.created_by IS NULL OR e.created_by = $1)'];
  const values: unknown[] = [userId];

  if (filters.categorySlug) {
    values.push(filters.categorySlug);
    conditions.push(`c.slug = $${values.length}`);
  }
  if (filters.search) {
    values.push(`%${filters.search.trim().toLowerCase()}%`);
    conditions.push(`lower(e.name) LIKE $${values.length}`);
  }
  if (filters.popularOnly) conditions.push('e.is_popular');

  return many<ExerciseRow>(
    `${SELECT_EXERCISE} WHERE ${conditions.join(' AND ')} ORDER BY e.is_popular DESC, e.name`,
    values,
  );
}

export async function getExercise(userId: string, exerciseId: string): Promise<ExerciseRow> {
  const row = await one<ExerciseRow>(
    `${SELECT_EXERCISE} WHERE e.id = $2 AND e.is_active AND (e.created_by IS NULL OR e.created_by = $1)`,
    [userId, exerciseId],
  );
  if (!row) throw ApiError.notFound('Exercise not found.');
  return row;
}

export async function getExerciseBySlug(slug: string): Promise<ExerciseRow | null> {
  return one<ExerciseRow>(`${SELECT_EXERCISE} WHERE e.slug = $1`, [slug]);
}

function slugify(name: string, userId: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  // Namespaced by user so two people can both add "Landmine Press".
  return `custom-${userId.slice(0, 8)}-${base}`.slice(0, 80);
}

export async function createCustomExercise(
  userId: string,
  input: { name: string; categorySlug?: string; equipment?: string },
): Promise<ExerciseRow> {
  const category = input.categorySlug
    ? await one<{ id: string }>('SELECT id FROM exercise_categories WHERE slug = $1', [input.categorySlug])
    : null;

  const existing = await one<{ id: string }>(
    'SELECT id FROM exercises WHERE created_by = $1 AND lower(name) = lower($2)',
    [userId, input.name],
  );
  if (existing) throw ApiError.conflict('exercise_exists', 'You already have an exercise with that name.');

  const row = await one<{ id: string }>(
    `INSERT INTO exercises (slug, name, category_id, equipment, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [slugify(input.name, userId), input.name.trim(), category?.id ?? null, input.equipment ?? 'other', userId],
  );
  return getExercise(userId, row!.id);
}

export async function listFavorites(userId: string) {
  return many<ExerciseRow>(
    `${SELECT_EXERCISE}
      JOIN favorite_exercises f ON f.exercise_id = e.id AND f.user_id = $1
     WHERE e.is_active ORDER BY e.name`,
    [userId],
  );
}

export async function setFavorites(userId: string, exerciseIds: string[]): Promise<void> {
  await one('DELETE FROM favorite_exercises WHERE user_id = $1', [userId]);
  if (exerciseIds.length === 0) return;
  await one(
    `INSERT INTO favorite_exercises (user_id, exercise_id)
     SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING`,
    [userId, exerciseIds],
  );
}
