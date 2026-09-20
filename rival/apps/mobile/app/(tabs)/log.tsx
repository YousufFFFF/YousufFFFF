import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { WorkoutSession, WorkoutType } from '@rival/api-client';
import { ApiError } from '@rival/api-client';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { workoutLabel } from '@/lib/format';
import { Button, Card, ErrorState, Label, Screen, SkeletonCard, Spacer, Type } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

/**
 * Start a workout.
 *
 * Pick a split, and you are in. If a session is already open for today, this
 * offers to resume it rather than silently starting a second one — two open
 * drafts is the fastest way to lose a set.
 */

const SPLITS: { type: WorkoutType; icon: string; blurb: string }[] = [
  { type: 'push', icon: '🫸', blurb: 'Chest, shoulders, triceps' },
  { type: 'pull', icon: '🫷', blurb: 'Back and biceps' },
  { type: 'legs', icon: '🦵', blurb: 'Quads, hamstrings, calves' },
  { type: 'upper', icon: '💪', blurb: 'Everything above the waist' },
  { type: 'lower', icon: '🏋️', blurb: 'Everything below it' },
  { type: 'full_body', icon: '🔥', blurb: 'The whole lot' },
  { type: 'custom', icon: '✏️', blurb: 'Your own split' },
];

export default function LogScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [starting, setStarting] = useState<WorkoutType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const today = useAsync<{ session: WorkoutSession | null }>(() => api.todaysWorkout(), []);

  useFocusEffect(
    useCallback(() => {
      void today.refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  async function start(type: WorkoutType) {
    setStarting(type);
    setError(null);
    try {
      const session = await api.startWorkout({ workoutType: type });
      router.push({ pathname: '/workout/active', params: { id: session.id } });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not start that workout.');
    } finally {
      setStarting(null);
    }
  }

  if (today.loading && !today.data) {
    return (
      <Screen contentStyle={{ paddingTop: insets.top + spacing.md }}>
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
      </Screen>
    );
  }

  const open = today.data?.session && !today.data.session.ended_at ? today.data.session : null;
  const done = today.data?.session?.ended_at ? today.data.session : null;

  return (
    <Screen contentStyle={{ paddingTop: insets.top + spacing.md }}>
      <Type variant="title">Log workout</Type>

      {error ? <ErrorState message={error} /> : null}

      {open ? (
        <Card glow style={styles.resume}>
          <Label colour={colors.flameLight}>In progress</Label>
          <Type variant="heading">{workoutLabel(open.workout_type)}</Type>
          <Type variant="caption" colour={colors.textSecondary}>
            {open.set_count} {open.set_count === 1 ? 'set' : 'sets'} across {open.exercise_count}{' '}
            {open.exercise_count === 1 ? 'exercise' : 'exercises'}
          </Type>
          <Button
            label="Resume workout"
            onPress={() => router.push({ pathname: '/workout/active', params: { id: open.id } })}
          />
        </Card>
      ) : null}

      {done ? (
        <Card style={styles.done}>
          <Label colour={colors.ahead}>🔥 Workout complete</Label>
          <Type variant="caption" colour={colors.textSecondary}>
            You logged {workoutLabel(done.workout_type)} today. Starting another session will not add a second gym
            day — one day counts once.
          </Type>
          <Button
            label="View today's workout"
            tone="secondary"
            onPress={() => router.push({ pathname: '/workout/[id]', params: { id: done.id } })}
          />
        </Card>
      ) : null}

      <Spacer size={spacing.xs} />
      <Label>{open ? 'Or start something else' : 'Choose a split'}</Label>

      <View style={styles.grid}>
        {SPLITS.map((split) => (
          <Pressable
            key={split.type}
            onPress={() => void start(split.type)}
            disabled={starting !== null}
            accessibilityRole="button"
            accessibilityLabel={`Start a ${workoutLabel(split.type)} workout`}
            style={({ pressed }) => [styles.tile, pressed && styles.tilePressed, starting === split.type && styles.tileBusy]}
          >
            <Type variant="heading" style={styles.tileIcon}>
              {split.icon}
            </Type>
            <Type variant="body" style={{ fontWeight: '800' }}>
              {workoutLabel(split.type)}
            </Type>
            <Type variant="caption" colour={colors.textTertiary} style={styles.tileBlurb}>
              {split.blurb}
            </Type>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  resume: { gap: spacing.sm },
  done: { gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 112,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.ink800,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  tilePressed: { opacity: 0.8, borderColor: colors.borderStrong },
  tileBusy: { borderColor: colors.flame },
  tileIcon: { fontSize: 22, marginBottom: 2 },
  tileBlurb: { lineHeight: 16 },
});
