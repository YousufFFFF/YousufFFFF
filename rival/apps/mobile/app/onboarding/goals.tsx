import { useState } from 'react';
import { useRouter } from 'expo-router';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorState, Row, Screen, Spacer, Type } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { Choice } from './profile';

/** Screen 5: training goals. Several may be chosen. */

const GOALS = [
  { value: 'strength', label: 'Strength' },
  { value: 'muscle_building', label: 'Muscle building' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'fat_loss', label: 'Fat loss' },
  { value: 'general_health', label: 'General health' },
  { value: 'powerlifting', label: 'Powerlifting' },
  { value: 'bodybuilding', label: 'Bodybuilding' },
] as const;

export default function GoalsScreen() {
  const router = useRouter();
  const { me, refresh } = useSession();
  const [selected, setSelected] = useState<string[]>(me?.profile.goals ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(value: string) {
    setSelected((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  async function next() {
    setBusy(true);
    setError(null);
    try {
      await api.updateProfile({ goals: selected, onboardingStep: 'exercises' });
      await refresh();
      router.push('/onboarding/exercises');
    } catch {
      setError('Could not save that. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Type variant="title">What are you training for?</Type>
      <Type variant="caption" colour={colors.textSecondary}>
        Pick as many as apply.
      </Type>

      {error ? <ErrorState message={error} /> : null}

      <Card>
        <Row gap={spacing.sm} style={{ flexWrap: 'wrap' }}>
          {GOALS.map((goal) => (
            <Choice
              key={goal.value}
              label={goal.label}
              selected={selected.includes(goal.value)}
              onPress={() => toggle(goal.value)}
            />
          ))}
        </Row>
      </Card>

      <Button label="Continue" onPress={() => void next()} loading={busy} />
      <Spacer />
      <Button label="Skip" tone="ghost" onPress={() => router.push('/onboarding/exercises')} />
    </Screen>
  );
}
