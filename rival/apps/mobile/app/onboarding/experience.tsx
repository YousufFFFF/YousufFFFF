import { useState } from 'react';
import { useRouter } from 'expo-router';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorState, Screen, Spacer, Type } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { Choice } from './profile';

/** Screen 4: experience level. */

const LEVELS = [
  { value: 'beginner', label: 'Beginner', blurb: 'New to lifting, or back after a long break.' },
  { value: 'intermediate', label: 'Intermediate', blurb: 'Training consistently, know your way around.' },
  { value: 'advanced', label: 'Advanced', blurb: 'Years in, chasing small gains.' },
] as const;

export default function ExperienceScreen() {
  const router = useRouter();
  const { me, refresh } = useSession();
  const [level, setLevel] = useState<string | null>(me?.profile.experienceLevel ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function next() {
    setBusy(true);
    setError(null);
    try {
      await api.updateProfile({ experienceLevel: level, onboardingStep: 'goals' });
      await refresh();
      router.push('/onboarding/goals');
    } catch {
      setError('Could not save that. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Type variant="title">How long have you been training?</Type>
      <Type variant="caption" colour={colors.textSecondary}>
        This only shapes what RIVAL suggests. It never affects how you are ranked — the improvement board is measured
        against your own past, not against anyone else&rsquo;s.
      </Type>

      {error ? <ErrorState message={error} /> : null}

      <Card style={{ gap: spacing.md }}>
        {LEVELS.map((option) => (
          <Choice
            key={option.value}
            label={option.label}
            sublabel={option.blurb}
            selected={level === option.value}
            onPress={() => setLevel(option.value)}
          />
        ))}
      </Card>

      <Button label="Continue" onPress={() => void next()} loading={busy} disabled={!level} />
      <Spacer />
      <Button label="Skip" tone="ghost" onPress={() => router.push('/onboarding/goals')} />
    </Screen>
  );
}
