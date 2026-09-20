import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ApiError, type ChallengeType } from '@rival/api-client';
import { addDays, fromGrams, toIsoDate } from '@rival/core';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useMe } from '@/lib/session';
import { Button, Card, ErrorState, Label, LoadingState, Row, Screen, Spacer, Type } from '@/components/ui';
import { Choice } from '../onboarding/profile';
import { colors, MIN_TOUCH, radius, spacing } from '@/theme';

/**
 * Create a challenge: opponent, type, exercise, target, deadline.
 *
 * For a PR challenge the target is pre-filled from the opponent's current best,
 * rounded up to a real plate jump — a target you have to work for, not one you
 * already cleared.
 */

const TYPES: { value: ChallengeType; label: string; blurb: string; needsExercise: boolean; weightTarget: boolean }[] = [
  { value: 'pr', label: 'Beat my PR', blurb: 'One lift, one number to pass.', needsExercise: true, weightTarget: true },
  { value: 'exercise', label: 'Highest PR by a date', blurb: 'Whoever leads on the deadline takes it.', needsExercise: true, weightTarget: true },
  { value: 'workout_count', label: 'Workout sprint', blurb: 'A set number of gym days, fast.', needsExercise: false, weightTarget: false },
  { value: 'consistency', label: 'Consistency', blurb: 'A set number of gym days over a month.', needsExercise: false, weightTarget: false },
  { value: 'volume', label: 'Volume war', blurb: 'Highest total training volume.', needsExercise: false, weightTarget: true },
];

export default function NewChallengeScreen() {
  const router = useRouter();
  const me = useMe();
  const params = useLocalSearchParams<{ opponentId?: string; opponentName?: string }>();

  const rivals = useAsync(() => api.rivals(), []);
  const exercises = useAsync(() => api.exercises({ popular: true }), []);

  const [opponentId, setOpponentId] = useState<string | null>(params.opponentId ?? null);
  const [type, setType] = useState<ChallengeType>('pr');
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const [days, setDays] = useState('30');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = TYPES.find((item) => item.value === type)!;
  const unit = me.profile.preferredUnit;

  // Ask the API what a sensible target is once both an opponent and a lift are
  // chosen, rather than making the user guess their rival's numbers.
  const suggestion = useAsync(
    async () =>
      opponentId && exerciseId && config.needsExercise
        ? api.suggestChallengeTarget(opponentId, exerciseId)
        : { opponentBest: null, suggestedTarget: null },
    [opponentId, exerciseId, type],
  );

  const suggestedDisplay = useMemo(() => {
    const value = suggestion.data?.suggestedTarget;
    return value ? String(fromGrams(value, unit)) : '';
  }, [suggestion.data, unit]);

  async function create() {
    if (!opponentId) {
      setError('Choose who you are challenging.');
      return;
    }
    if (config.needsExercise && !exerciseId) {
      setError('Choose an exercise.');
      return;
    }

    const targetValue = Number.parseFloat(target || suggestedDisplay);
    if (config.weightTarget || type === 'consistency' || type === 'workout_count') {
      if (!Number.isFinite(targetValue) || targetValue <= 0) {
        setError('Set a target.');
        return;
      }
    }

    setBusy(true);
    setError(null);
    try {
      const created = await api.createChallenge({
        opponentId,
        type,
        exerciseId: config.needsExercise ? exerciseId : null,
        target: targetValue,
        ...(config.weightTarget ? { targetUnit: unit } : {}),
        deadline: addDays(toIsoDate(new Date()), Number.parseInt(days, 10) || 30),
      });
      router.replace({ pathname: '/challenge/[id]', params: { id: created.id } });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not create that challenge.');
    } finally {
      setBusy(false);
    }
  }

  if (rivals.loading && !rivals.data) return <LoadingState label="Loading your rivals" />;

  const options = rivals.data ?? [];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        {error ? <ErrorState message={error} /> : null}

        {options.length === 0 ? (
          <Card>
            <Type variant="heading">No rivals yet</Type>
            <Type variant="caption" colour={colors.textSecondary}>
              You can only challenge people you are connected with.
            </Type>
            <Button label="Find friends" onPress={() => router.replace('/connections')} />
          </Card>
        ) : (
          <>
            <Card style={styles.card}>
              <Label>Opponent</Label>
              <Row gap={spacing.sm} style={{ flexWrap: 'wrap' }}>
                {options.map((rival) => (
                  <Choice
                    key={rival.rival.id}
                    label={rival.rival.displayName}
                    selected={opponentId === rival.rival.id}
                    onPress={() => setOpponentId(rival.rival.id)}
                  />
                ))}
              </Row>
            </Card>

            <Card style={styles.card}>
              <Label>Challenge type</Label>
              {TYPES.map((item) => (
                <Choice
                  key={item.value}
                  label={item.label}
                  sublabel={item.blurb}
                  selected={type === item.value}
                  onPress={() => {
                    setType(item.value);
                    setTarget('');
                  }}
                />
              ))}
            </Card>

            {config.needsExercise ? (
              <Card style={styles.card}>
                <Label>Exercise</Label>
                <Row gap={spacing.sm} style={{ flexWrap: 'wrap' }}>
                  {(exercises.data ?? []).slice(0, 14).map((exercise) => (
                    <Choice
                      key={exercise.id}
                      label={exercise.name}
                      selected={exerciseId === exercise.id}
                      onPress={() => setExerciseId(exercise.id)}
                    />
                  ))}
                </Row>
              </Card>
            ) : null}

            <Card style={styles.card}>
              <Label>
                Target {config.weightTarget ? `(${unit})` : config.value === 'volume' ? '' : '(workouts)'}
              </Label>
              <TextInput
                style={styles.input}
                value={target}
                onChangeText={setTarget}
                keyboardType="decimal-pad"
                placeholder={suggestedDisplay || (config.weightTarget ? '0' : '10')}
                placeholderTextColor={colors.textFaint}
                accessibilityLabel="Target"
              />
              {suggestion.data?.opponentBest ? (
                <Type variant="caption" colour={colors.textTertiary}>
                  Their current best is {fromGrams(suggestion.data.opponentBest, unit)} {unit}. Suggested target:{' '}
                  {suggestedDisplay} {unit}.
                </Type>
              ) : null}
            </Card>

            <Card style={styles.card}>
              <Label>Deadline</Label>
              <Row gap={spacing.sm} style={{ flexWrap: 'wrap' }}>
                {['7', '14', '30', '45'].map((option) => (
                  <Choice key={option} label={`${option} days`} selected={days === option} onPress={() => setDays(option)} />
                ))}
              </Row>
              <Type variant="caption" colour={colors.textFaint}>
                Ends {addDays(toIsoDate(new Date()), Number.parseInt(days, 10) || 30)}
              </Type>
            </Card>

            <Button label="Send challenge" onPress={() => void create()} loading={busy} />
          </>
        )}

        <Spacer />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  input: {
    minHeight: MIN_TOUCH + 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.ink900,
    color: colors.text,
    paddingHorizontal: spacing.md,
    fontSize: 17,
    fontWeight: '700',
  },
});
