import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import type { Exercise } from '@rival/api-client';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorState, Label, LoadingState, Row, Screen, Spacer, Type } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { Choice } from './profile';

/**
 * Screen 6: favourite exercises.
 *
 * These float to the top of the picker while logging. The library is bigger
 * than this — it is grouped by muscle here just to make the first pass quick.
 */

export default function FavouriteExercisesScreen() {
  const router = useRouter();
  const { refresh } = useSession();
  const exercises = useAsync<Exercise[]>(() => api.exercises({ popular: true }), []);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const groups = new Map<string, Exercise[]>();
    for (const exercise of exercises.data ?? []) {
      const key = exercise.category_name ?? 'Other';
      groups.set(key, [...(groups.get(key) ?? []), exercise]);
    }
    return [...groups.entries()];
  }, [exercises.data]);

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      if (selected.length > 0) await api.setFavorites(selected);
      await api.updateProfile({ onboardingStep: 'done' });
      await refresh();
      router.replace('/(tabs)');
    } catch {
      setError('Could not save your favourites. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (exercises.loading && !exercises.data) return <LoadingState label="Loading exercises" />;

  return (
    <Screen>
      <Type variant="title">Your go-to lifts</Type>
      <Type variant="caption" colour={colors.textSecondary}>
        These appear first when you log a workout. You can add anything else from the full library later.
      </Type>

      {error ? <ErrorState message={error} /> : null}

      {grouped.map(([category, list]) => (
        <Card key={category} style={{ gap: spacing.md }}>
          <Label>{category}</Label>
          <Row gap={spacing.sm} style={{ flexWrap: 'wrap' }}>
            {list.map((exercise) => (
              <Choice
                key={exercise.id}
                label={exercise.name}
                selected={selected.includes(exercise.id)}
                onPress={() => toggle(exercise.id)}
              />
            ))}
          </Row>
        </Card>
      ))}

      <Button
        label={selected.length > 0 ? `Finish with ${selected.length} selected` : 'Finish'}
        onPress={() => void finish()}
        loading={busy}
      />
      <Spacer />
    </Screen>
  );
}
