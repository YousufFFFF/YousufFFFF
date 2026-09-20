import { useCallback } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RivalSummary } from '@rival/api-client';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useMe } from '@/lib/session';
import { weightWithUnit } from '@/lib/format';
import { VersusRow } from '@/components/VersusRow';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Label,
  Pill,
  Row,
  Screen,
  SkeletonCard,
  Type,
} from '@/components/ui';
import { colors, spacing } from '@/theme';

/**
 * The rivals list.
 *
 * One card per rivalry, each leading with the score and the gym-day gap —
 * the two numbers people check most often.
 */

export default function RivalsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useMe();
  const state = useAsync<RivalSummary[]>(() => api.rivals(), []);
  const requests = useAsync(() => api.connectionRequests(), []);

  useFocusEffect(
    useCallback(() => {
      void state.refresh();
      void requests.refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

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

  const rivals = state.data ?? [];
  const incoming = requests.data?.incoming ?? [];

  return (
    <Screen
      contentStyle={{ paddingTop: insets.top + spacing.md }}
      refreshControl={
        <RefreshControl refreshing={state.refreshing} onRefresh={() => void state.refresh()} tintColor={colors.flameMid} />
      }
    >
      <Row>
        <Type variant="title" style={{ flex: 1 }}>
          ⚔️ Your rivals
        </Type>
        <Button label="Find friends" tone="secondary" small full={false} onPress={() => router.push('/connections')} />
      </Row>

      {incoming.length > 0 ? (
        <Pressable onPress={() => router.push('/connections')} accessibilityRole="button">
          <Card glow style={styles.requestCard}>
            <Label colour={colors.flameLight}>
              {incoming.length} pending {incoming.length === 1 ? 'request' : 'requests'}
            </Label>
            <Type variant="caption" colour={colors.textSecondary}>
              {incoming.map((request) => request.user.displayName).join(', ')} want{incoming.length === 1 ? 's' : ''} to
              be your rival.
            </Type>
          </Card>
        </Pressable>
      ) : null}

      {rivals.length === 0 ? (
        <EmptyState
          title="No rivals yet"
          body="Connect with your gym friends and start your first rivalry."
          actionLabel="Find friends"
          onAction={() => router.push('/connections')}
        />
      ) : (
        rivals.map((rival) => (
          <RivalCard
            key={rival.rivalryId}
            rival={rival}
            unit={me.profile.preferredUnit}
            onOpen={() => router.push({ pathname: '/rival/[id]', params: { id: rival.rival.id } })}
          />
        ))
      )}
    </Screen>
  );
}

function RivalCard({
  rival,
  unit,
  onOpen,
}: {
  rival: RivalSummary;
  unit: 'kg' | 'lb';
  onOpen: () => void;
}) {
  const gap = rival.sessionsThem - rival.sessionsYou;

  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Open your rivalry with ${rival.rival.displayName}. ${rival.headline}`}>
      <Card style={styles.card}>
        <Row gap={spacing.md}>
          <Avatar name={rival.rival.displayName} />
          <View style={{ flex: 1 }}>
            <Type variant="heading">{rival.rival.displayName}</Type>
            <Type variant="caption" colour={colors.textTertiary}>
              @{rival.rival.username}
            </Type>
          </View>
          <Pill
            label={rival.headline}
            tone={rival.leader === 'you' ? 'ahead' : rival.leader === 'rival' ? 'behind' : 'neutral'}
          />
        </Row>

        <VersusRow
          youLabel="You"
          rivalLabel={rival.rival.displayName}
          youValue={rival.you}
          rivalValue={rival.them}
          leader={rival.leader}
        />

        <Row gap={spacing.sm} style={styles.metaRow}>
          <Pill
            label={`Gym days ${rival.sessionsYou}–${rival.sessionsThem}`}
            tone={gap > 0 ? 'behind' : gap < 0 ? 'ahead' : 'neutral'}
          />
          {rival.competitionPaused ? <Pill label="Paused" tone="neutral" icon="⏸️" /> : null}
        </Row>

        {rival.recentPr ? (
          <Type variant="caption" colour={colors.textTertiary}>
            🔥 Recent PR: {rival.recentPr.exerciseName} {weightWithUnit(rival.recentPr.value, unit)}
          </Type>
        ) : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  requestCard: { gap: spacing.xs },
  metaRow: { flexWrap: 'wrap' },
});
