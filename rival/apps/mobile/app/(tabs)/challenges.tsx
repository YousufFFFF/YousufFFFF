import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, type Challenge } from '@rival/api-client';
import { fromGrams } from '@rival/core';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { VersusRow } from '@/components/VersusRow';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  Label,
  Pill,
  ProgressBar,
  Row,
  Screen,
  SkeletonCard,
  Type,
} from '@/components/ui';
import { colors, spacing } from '@/theme';

/** Challenges: what is waiting on you, what is running, and what is done. */

export default function ChallengesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const state = useAsync<Challenge[]>(() => api.challenges(), []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void state.refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  async function respond(challenge: Challenge, accept: boolean) {
    setBusyId(challenge.id);
    setError(null);
    try {
      if (accept) await api.acceptChallenge(challenge.id);
      else await api.declineChallenge(challenge.id);
      await state.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not respond to that challenge.');
    } finally {
      setBusyId(null);
    }
  }

  if (state.loading && !state.data) {
    return (
      <Screen contentStyle={{ paddingTop: insets.top + spacing.md }}>
        <SkeletonCard lines={3} />
        <SkeletonCard lines={3} />
      </Screen>
    );
  }

  if (state.error && !state.data) {
    return (
      <Screen contentStyle={{ paddingTop: insets.top + spacing.md }}>
        <ErrorState message={state.error} onRetry={() => void state.reload()} />
      </Screen>
    );
  }

  const all = state.data ?? [];
  const waiting = all.filter((c) => c.status === 'pending' && !c.isCreator);
  const sent = all.filter((c) => c.status === 'pending' && c.isCreator);
  const active = all.filter((c) => c.status === 'active');
  const finished = all.filter((c) => ['completed', 'expired', 'declined', 'cancelled'].includes(c.status));

  return (
    <Screen
      contentStyle={{ paddingTop: insets.top + spacing.md }}
      refreshControl={
        <RefreshControl refreshing={state.refreshing} onRefresh={() => void state.refresh()} tintColor={colors.flameMid} />
      }
    >
      <Row>
        <Type variant="title" style={{ flex: 1 }}>
          🏆 Battles
        </Type>
        <Button label="New" small full={false} onPress={() => router.push('/challenge/new')} />
      </Row>

      {error ? <ErrorState message={error} /> : null}

      {all.length === 0 ? (
        <EmptyState
          icon="🏆"
          title="No challenges yet"
          body="Challenge a rival to a PR, a volume war or a month of showing up."
          actionLabel="Create a challenge"
          onAction={() => router.push('/challenge/new')}
        />
      ) : null}

      {waiting.length > 0 ? (
        <>
          <Label colour={colors.flameLight}>Waiting on you</Label>
          {waiting.map((challenge) => (
            <Card key={challenge.id} glow style={styles.card}>
              <Type variant="heading">{challenge.opponent.displayName} challenged you</Type>
              <Type variant="body" colour={colors.textSecondary}>
                {challenge.title}
              </Type>
              {challenge.target !== null ? (
                <Type variant="caption" colour={colors.textTertiary}>
                  Target: {formatTarget(challenge)} · deadline {challenge.deadline}
                </Type>
              ) : null}
              <Row gap={spacing.sm}>
                <View style={{ flex: 1 }}>
                  <Button label="Accept" small onPress={() => void respond(challenge, true)} loading={busyId === challenge.id} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Decline" tone="ghost" small onPress={() => void respond(challenge, false)} />
                </View>
              </Row>
            </Card>
          ))}
        </>
      ) : null}

      {active.length > 0 ? (
        <>
          <Label>Running</Label>
          {active.map((challenge) => (
            <ChallengeCard
              key={challenge.id}
              challenge={challenge}
              onOpen={() => router.push({ pathname: '/challenge/[id]', params: { id: challenge.id } })}
            />
          ))}
        </>
      ) : null}

      {sent.length > 0 ? (
        <>
          <Label>Sent</Label>
          {sent.map((challenge) => (
            <Card key={challenge.id} style={styles.card}>
              <Row>
                <View style={{ flex: 1 }}>
                  <Type variant="body" style={{ fontWeight: '700' }}>
                    {challenge.title}
                  </Type>
                  <Type variant="caption" colour={colors.textTertiary}>
                    Waiting for {challenge.opponent.displayName}
                  </Type>
                </View>
                <Pill label="Pending" />
              </Row>
            </Card>
          ))}
        </>
      ) : null}

      {finished.length > 0 ? (
        <>
          <Label>Finished</Label>
          <Card style={styles.card}>
            {finished.map((challenge, index) => (
              <View key={challenge.id}>
                {index > 0 ? <Divider /> : null}
                <Pressable
                  onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: challenge.id } })}
                  accessibilityRole="button"
                >
                  <Row style={styles.finishedRow}>
                    <View style={{ flex: 1 }}>
                      <Type variant="body" style={{ fontWeight: '700' }}>
                        {challenge.title}
                      </Type>
                      <Type variant="caption" colour={colors.textTertiary}>
                        vs {challenge.opponent.displayName}
                      </Type>
                    </View>
                    {challenge.winnerId === challenge.you.id ? (
                      <Pill label="Won" tone="ahead" icon="🏆" />
                    ) : challenge.winnerId ? (
                      <Pill label="Lost" tone="behind" />
                    ) : (
                      <Pill label={challenge.status} />
                    )}
                  </Row>
                </Pressable>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function ChallengeCard({ challenge, onOpen }: { challenge: Challenge; onOpen: () => void }) {
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Open ${challenge.title}`}>
      <Card style={styles.card}>
        <Row>
          <View style={{ flex: 1 }}>
            <Type variant="heading">{challenge.title}</Type>
            <Type variant="caption" colour={colors.textTertiary}>
              You vs {challenge.opponent.displayName}
              {challenge.exercise ? ` · ${challenge.exercise.name}` : ''}
            </Type>
          </View>
          <Pill
            label={challenge.summary}
            tone={challenge.daysRemaining <= 3 ? 'behind' : 'neutral'}
          />
        </Row>

        <VersusRow
          youLabel="You"
          rivalLabel={challenge.opponent.displayName}
          youValue={formatValue(challenge, challenge.you.value)}
          rivalValue={formatValue(challenge, challenge.opponent.value)}
          leader={
            challenge.leaderId === challenge.you.id ? 'you' : challenge.leaderId ? 'rival' : 'tie'
          }
        />

        {challenge.target !== null ? (
          <View style={{ gap: 6 }}>
            <ProgressBar
              value={challenge.you.progressPct}
              label={`You are ${challenge.you.progressPct}% of the way to ${formatTarget(challenge)}`}
            />
            <Type variant="caption" colour={colors.textTertiary}>
              Target {formatTarget(challenge)} · you {challenge.you.progressPct}% · {challenge.opponent.displayName}{' '}
              {challenge.opponent.progressPct}%
            </Type>
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

function formatValue(challenge: Challenge, value: number): string {
  return challenge.targetIsWeight ? `${fromGrams(value, challenge.unit)}` : String(value);
}

function formatTarget(challenge: Challenge): string {
  if (challenge.target === null) return '—';
  return challenge.targetIsWeight
    ? `${fromGrams(challenge.target, challenge.unit)} ${challenge.unit}`
    : `${challenge.target}`;
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  finishedRow: { paddingVertical: spacing.sm },
});
