import { z } from 'zod';
import { ApiError } from './errors.ts';

/**
 * Request validation. One place turns a Zod failure into the API's error
 * shape, so no route hand-rolls a 400.
 */

export function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issues = result.error.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
  throw ApiError.badRequest(issues[0]?.message ?? 'Invalid request.', { issues });
}

export const uuid = z.string().uuid('Expected an id.');

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date as YYYY-MM-DD.')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Not a real date.');

export const weightUnit = z.enum(['kg', 'lb']);

export const username = z
  .string()
  .trim()
  .min(3, 'Usernames are at least 3 characters.')
  .max(24, 'Usernames are at most 24 characters.')
  .regex(/^[a-zA-Z0-9_]+$/, 'Usernames use letters, numbers and underscores only.');

export const email = z.string().trim().toLowerCase().email('Enter a valid email address.');

export const pagination = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export { z };
