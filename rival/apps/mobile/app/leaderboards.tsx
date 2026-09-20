import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LeaderboardName } from '@rival/api-client';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import {
  Avatar,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  Label,
  LoadingState,
  Row,
  Screen,
  Type,
} from '@/components/ui';
import { Choice } from './onboarding/profile';
import { colors, spacing } from '@/theme';

/**
 * Private leaderboards.
 *
 * Every board is scoped to your accepted connections by the API — nobody
 * outside your circle can appear, and nobody outside it can see you.
 */

const BOARDS: { key: LeaderboardName; label: string; blurb: string }[] = [
  { key: 'overall', label: 'Overall', blurb: 'Rivalry points across your circle.' },
  { key: 'strength', label: 'Strength', blurb: 'Squat, bench, deadlift and overhead press combined.' },
  { key: 'consistency', label: 'Consistency', blurb: 'Gym days in the current window.' },
  { key: 'improvement', label: 'Improvement', blurb: 'Percentage gained, not weight lifted — so the newest lifter can top it.' },
  { key: 'challenges', label: 'Challenges', blurb: 'Challenges won.' },
];

export default function LeaderboardsScreen() {
  const [board, setBoard] = useState<LeaderboardName>('overall');
  const state = useAsync(() => api.leaderboard(board), [board]);

  const meta = BOARDS.find((item) => item.key === board)!;

  return (
    <Screen>
      <Row gap={spacing.sm} style={styles.tabs}>
        {BOARDS.map((item) => (
          <Choice key={item.key} label={item.label} selected={board === item.key} onPress={() => setBoard(item.key)} />
        ))}
      </Row>

      <Type variant="caption" colour={colors.textSecondary}>
        {meta.blurb}
      </Type>

      {state.loading && !state.data ? (
        <LoadingState />
      ) : state.error ? (
        <ErrorState message={state.error} onRetry={() => void state.reload()} />
      ) : (state.data?.entries ?? []).length === 0 ? (
        <EmptyState
          icon="🏅"
          title="Nothing to rank yet"
          body="Connect with gym friends and log some workouts — this board only ever shows people you're connected with."
        />
      ) : (
        <Card style={styles.card}>
          <Label>{meta.label}</Label>
          <Divider />
          {(state.data?.entries ?? []).map((entry) => (
            <Row
              key={entry.userId}
              style={[styles.row, entry.isYou && styles.rowYou]}
              gap={spacing.md}
              accessible
              accessibilityLabel={`${entry.rank}. ${entry.displayName}${entry.isYou ? ', you' : ''}: ${entry.display}`}
            >
              <Type variant="body" colour={colors.textTertiary} style={styles.rank}>
                {entry.medal ?? entry.rank}
              </Type>
              <Avatar name={entry.displayName} size={34} />
              <View style={{ flex: 1 }}>
                <Type variant="body" style={{ fontWeight: entry.isYou ? '900' : '700' }}>
                  {entry.displayName}
                  {entry.isYou ? ' · you' : ''}
                </Type>
                <Type variant="caption" colour={colors.textTertiary}>
                  @{entry.username}
                </Type>
              </View>
              <Type variant="body" style={styles.value}>
                {entry.display}
              </Type>
            </Row>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexWrap: 'wrap' },
  card: { gap: spacing.xs },
  row: { paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: 12 },
  rowYou: { backgroundColor: colors.ink700 },
  rank: { width: 28, fontWeight: '800' },
  value: { fontWeight: '800', fontVariant: ['tabular-nums'] },
});
