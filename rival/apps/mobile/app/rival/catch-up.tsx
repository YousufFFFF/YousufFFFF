import { StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { CatchUpView } from '@rival/api-client';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { VersusRow } from '@/components/VersusRow';
import { Button, Card, ErrorState, Label, LoadingState, Pill, Row, Screen, Spacer, Stat, Type } from '@/components/ui';
import { colors, spacing } from '@/theme';

/**
 * Catch-up mode.
 *
 * The most motivating screen in the app, and so the one that most needs a
 * limit: the call to action comes from the API's `catchUpCallToAction`, which
 * refuses to suggest a second session in a day however far behind you are. When
 * you have already trained, this screen says "tomorrow", not "again".
 */

export default function CatchUpScreen() {
  const { rivalId } = useLocalSearchParams<{ rivalId: string }>();
  const router = useRouter();
  const state = useAsync<CatchUpView>(() => api.catchUp(rivalId), [rivalId]);

  if (state.loading && !state.data) return <LoadingState label="Working out the gap" />;
  if (state.error && !state.data) {
    return (
      <Screen>
        <ErrorState message={state.error} onRetry={() => void state.reload()} />
      </Screen>
    );
  }

  const view = state.data!;
  const behind = view.gap > 0;

  return (
    <>
      <Stack.Screen options={{ title: 'Catch-up mode' }} />
      <Screen>
        <View style={styles.hero}>
          <Type variant="display" align="center" style={styles.blades}>
            ⚔️
          </Type>
          <Type variant="title" align="center">
            {behind
              ? `${view.rival.displayName} is ${view.gap} ${view.gap === 1 ? 'day' : 'days'} ahead`
              : view.gap === 0
                ? `You and ${view.rival.displayName} are level`
                : `You're ${-view.gap} ahead`}
          </Type>
          <Type variant="caption" colour={colors.textSecondary} align="center" style={styles.heroBody}>
            Gym days over the last {view.windowDays} days.
          </Type>
        </View>

        <Card style={styles.card}>
          <VersusRow
            youLabel="You"
            rivalLabel={view.rival.displayName}
            youValue={view.you}
            rivalValue={view.them}
            leader={behind ? 'rival' : view.gap === 0 ? 'tie' : 'you'}
            large
          />
          <Row style={styles.gapRow}>
            <Label>Gap</Label>
            <Stat value={Math.abs(view.gap)} colour={behind ? colors.behind : colors.ahead} />
          </Row>
        </Card>

        <Card style={styles.card}>
          <Label>Next opportunity to close the gap</Label>
          <Type variant="heading">{view.cta.enabled ? 'Log your next workout' : 'Logged for today'}</Type>
          <Type variant="caption" colour={colors.textSecondary}>
            {view.cta.helper}
          </Type>

          {view.cta.enabled ? (
            <Button label={view.cta.label} onPress={() => router.push('/(tabs)/log')} />
          ) : (
            <Pill label={view.cta.label} tone="ahead" icon="✓" />
          )}
        </Card>

        {/* Stated on the screen itself, not buried in a setting. */}
        <Card style={styles.noteCard}>
          <Label>🛌 One session a day</Label>
          <Type variant="caption" colour={colors.textSecondary}>
            RIVAL counts one gym day per calendar day, however many times you log. Training twice today will not close
            the gap faster — and recovery is part of getting stronger.
          </Type>
        </Card>

        <Spacer />
        <Button
          label={`Back to your rivalry`}
          tone="ghost"
          onPress={() => router.replace({ pathname: '/rival/[id]', params: { id: rivalId } })}
        />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: spacing.lg },
  blades: { fontSize: 40, marginBottom: spacing.sm },
  heroBody: { maxWidth: 280, marginTop: spacing.sm },
  card: { gap: spacing.md },
  gapRow: { justifyContent: 'space-between' },
  noteCard: { gap: spacing.xs, backgroundColor: colors.ink850 },
});
