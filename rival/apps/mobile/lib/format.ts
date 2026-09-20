import { fromGrams, type WeightUnit } from '@rival/core';

/** Display helpers shared across screens. */

export function weight(grams: number | null | undefined, unit: WeightUnit): string {
  if (grams === null || grams === undefined) return '—';
  return `${fromGrams(grams, unit)}`;
}

export function weightWithUnit(grams: number | null | undefined, unit: WeightUnit): string {
  if (grams === null || grams === undefined) return '—';
  return `${fromGrams(grams, unit)} ${unit}`;
}

/** Session volume runs into the tens of thousands; abbreviate past 1,000. */
export function volume(grams: number, unit: WeightUnit): string {
  const value = fromGrams(grams, unit);
  if (value >= 10_000) return `${Math.round(value / 1000)}k ${unit}`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k ${unit}`;
  return `${Math.round(value)} ${unit}`;
}

export function relativeTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function duration(seconds: number | null): string {
  if (!seconds) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function titleCase(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const WORKOUT_LABELS: Record<string, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  upper: 'Upper',
  lower: 'Lower',
  full_body: 'Full body',
  custom: 'Custom',
};

export function workoutLabel(type: string): string {
  return WORKOUT_LABELS[type] ?? titleCase(type);
}
