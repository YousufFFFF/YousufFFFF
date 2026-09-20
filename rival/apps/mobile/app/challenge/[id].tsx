import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ApiError, type Challenge } from '@rival/api-client';
import { fromGrams } from '@rival/core';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { VersusRow } from '@/components/VersusRow';
import {
  Button,
  Card,
  Divider,
  ErrorState,
  Label,
  LoadingState,
  Pill,
  ProgressBar,
  Row,
  Screen,
  Spacer,
  Stat,
  Type,
} from '@/components/ui';
import { colors, spacing } from '@/theme';

/** One challenge, in full. */

export default function ChallengeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const state = useAsync<Challenge>(() => api.challenge(id), [id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function respond(accept: boolean) {
    setBusy(true);
    setError(null);
    try {
      if (accept) await api.acceptChallenge(id);
      else await api.declineChallenge(id);
      await state.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not respond.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      await api.cancelChallenge(id);
      router.back();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not cancel.');
      setBusy(false);
    }
  }

  if (state.loading && !state.data) return <LoadingState label="Loading challenge" />;
  if (state.error && !state.data) {
    return (
      <Screen>
        <ErrorState message={state.error} onRetry={() => void state.reload()} />
      </Screen>
    );
  }

  const challenge = state.data!;
  const format = (value: number) =>
    challenge.targetIsWeight ? `${fromGrams(value, challenge.unit)}` : String(value);
  const won = challenge.winnerId === challenge.you.id;

  return (
    <>
      <Stack.Screen options={{ title: challenge.title }} />
      <Screen>
        <View style={styles.hero}>
          <Type variant="display" align="center" style={styles.blades}>
            ⚔️
          </Type>
          <Type variant="title" align="center">
            You vs {challenge.opponent.displayName}
          </Type>
          <Type variant="caption" colour={colors.textSecondary} align="center" style={{ marginTop: spacing.xs }}>
            {challenge.exercise ? `${challenge.exercise.name} · ` : ''}
            {challenge.summary}
          </Type>
        </View>

        {error ? <ErrorState message={error} /> : null}

        {challenge.status === 'completed' || challenge.status === 'expired' ? (
          <Card glow={won} style={styles.card}>
            <Label colour={won ? colors.crown : colors.textTertiary}>
              {won ? '🏆 You won' : challenge.winnerId ? 'Your rival took it' : 'Finished — nobody hit the target'}
            </Label>
            <Type variant="caption" colour={colors.textSecondary}>
              {won
                ? `You beat ${challenge.opponent.displayName} on ${challenge.title.toLowerCase()}.`
                : 'It happens. Set another one.'}
            </Type>
          </Card>
        ) : null}

        <Card style={styles.card}>
          <VersusRow
            youLabel="You"
            rivalLabel={challenge.opponent.displayName}
            youValue={format(challenge.you.value)}
            rivalValue={format(challenge.opponent.value)}
            unit={challenge.targetIsWeight ? challenge.unit : undefined}
            leader={challenge.leaderId === challenge.you.id ? 'you' : challenge.leaderId ? 'rival' : 'tie'}
            large
          />

          {challenge.target !== null ? (
            <>
              <Divider />
              <Row>
                <Label style={{ flex: 1 }}>Target</Label>
                <Stat
                  value={challenge.targetIsWeight ? fromGrams(challenge.target, challenge.unit) : challenge.target}
                  unit={challenge.targetIsWeight ? challenge.unit : undefined}
                />
              </Row>
              <View style={{ gap: 8 }}>
                <ProgressBar value={challenge.you.progressPct} label={`You: ${challenge.you.progressPct}% of target`} />
                <ProgressBar
                  value={challenge.opponent.progressPct}
                  label={`${challenge.opponent.displayName}: ${challenge.opponent.progressPct}% of target`}
                  tone="rival"
                />
              </View>
            </>
          ) : null}
        </Card>

        <Card style={styles.card}>
          <Row>
            <Label style={{ flex: 1 }}>Deadline</Label>
            <Pill
              label={challenge.deadline}
              tone={challenge.daysRemaining <= 3 && challenge.status === 'active' ? 'behind' : 'neutral'}
            />
          </Row>
          <Row>
            <Label style={{ flex: 1 }}>Status</Label>
            <Pill label={challenge.status} />
          </Row>
          <Row>
            <Label style={{ flex: 1 }}>Started</Label>
            <Type variant="caption" colour={colors.textSecondary}>
              {challenge.startDate}
            </Type>
          </Row>
        </Card>

        {challenge.status === 'pending' && !challenge.isCreator ? (
          <Row gap={spacing.sm}>
            <View style={{ flex: 1 }}>
              <Button label="Accept" onPress={() => void respond(true)} loading={busy} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Decline" tone="ghost" onPress={() => void respond(false)} />
            </View>
          </Row>
        ) : null}

        {(challenge.status === 'pending' || challenge.status === 'active') && challenge.isCreator ? (
          <Button label="Cancel challenge" tone="danger" onPress={() => void cancel()} loading={busy} />
        ) : null}

        <Spacer />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: spacing.lg },
  blades: { fontSize: 36, marginBottom: spacing.sm },
  card: { gap: spacing.md },
});
