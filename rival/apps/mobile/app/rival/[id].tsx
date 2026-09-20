import { RefreshControl, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { PrBattle, RivalryDetail } from '@rival/api-client';
import { fromGrams } from '@rival/core';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { relativeTime } from '@/lib/format';
import { VersusRow } from '@/components/VersusRow';
import {
  Avatar,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  Label,
  LoadingState,
  Pill,
  Row,
  Screen,
  Spacer,
  Type,
} from '@/components/ui';
import { colors, spacing } from '@/theme';

/**
 * The rivalry in full: overall score, strength lift by lift, consistency,
 * challenges and a timeline of what has happened between the two of you.
 */

export default function RivalryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const detail = useAsync<RivalryDetail>(() => api.rivalry(id), [id]);
  const timeline = useAsync(() => api.rivalryTimeline(id), [id]);

  if (detail.loading && !detail.data) return <LoadingState label="Loading rivalry" />;
  if (detail.error && !detail.data) {
    return (
      <Screen>
        <ErrorState message={detail.error} onRetry={() => void detail.reload()} />
      </Screen>
    );
  }

  const rivalry = detail.data!;
  const unit = rivalry.unit;
  const name = rivalry.rival.displayName;

  // Privacy or a pause can close the comparison; say which, and stop there.
  if (!rivalry.comparable) {
    return (
      <>
        <Stack.Screen options={{ title: name }} />
        <Screen>
          <EmptyState
            icon="🔒"
            title="Comparison is off"
            body={rivalry.reason ?? `${name} is not comparing statistics right now.`}
          />
        </Screen>
      </>
    );
  }

  const comparable = rivalry.battles.filter((battle) => battle.outcome !== 'not_comparable');
  const pending = rivalry.battles.filter((battle) => battle.outcome === 'not_comparable');
  const consistencyGap = rivalry.consistency.gap;

  return (
    <>
      <Stack.Screen options={{ title: `You vs ${name}` }} />
      <Screen
        refreshControl={
          <RefreshControl
            refreshing={detail.refreshing}
            onRefresh={() => {
              void detail.refresh();
              void timeline.refresh();
            }}
            tintColor={colors.flameMid}
          />
        }
      >
        {/* ── overall ──────────────────────────────────────────────────── */}
        <Card style={styles.card}>
          <Row gap={spacing.md}>
            <Avatar name={name} size={48} />
            <View style={{ flex: 1 }}>
              <Label>Overall</Label>
              <Type variant="heading">{rivalry.score.headline}</Type>
            </View>
          </Row>
          <VersusRow
            youLabel="You"
            rivalLabel={name}
            youValue={rivalry.score.you}
            rivalValue={rivalry.score.rival}
            leader={rivalry.score.leader}
            large
          />
          <Row gap={spacing.sm} style={{ flexWrap: 'wrap' }}>
            <Pill label={`Battles ${rivalry.score.breakdown.prBattles.you}–${rivalry.score.breakdown.prBattles.rival}`} />
            <Pill
              label={`Consistency ${rivalry.score.breakdown.consistency.you}–${rivalry.score.breakdown.consistency.rival}`}
            />
            <Pill label={`Challenges ${rivalry.challenges.youWon}–${rivalry.challenges.rivalWon}`} />
          </Row>
        </Card>

        {/* ── consistency ──────────────────────────────────────────────── */}
        <Card style={styles.card}>
          <Label>🔥 Consistency · last {rivalry.consistency.windowDays} days</Label>
          <VersusRow
            youLabel="You"
            rivalLabel={name}
            youValue={rivalry.consistency.you}
            rivalValue={rivalry.consistency.rival}
            leader={consistencyGap > 0 ? 'rival' : consistencyGap < 0 ? 'you' : 'tie'}
          />
          <Type variant="caption" colour={colors.textSecondary}>
            {rivalry.consistency.message}
          </Type>
          {consistencyGap > 0 ? (
            <Button
              label="Catch up"
              onPress={() => router.push({ pathname: '/rival/catch-up', params: { rivalId: id } })}
            />
          ) : null}
        </Card>

        {/* ── strength ─────────────────────────────────────────────────── */}
        <Card style={styles.card}>
          <Label>💪 Strength</Label>
          <Divider />
          {comparable.length === 0 ? (
            <Type variant="caption" colour={colors.textTertiary}>
              No exercises you have both logged yet. Train something in common and this fills in.
            </Type>
          ) : (
            comparable.map((battle) => <BattleRow key={battle.exerciseId} battle={battle} unit={unit} name={name} />)
          )}
        </Card>

        {pending.length > 0 ? (
          <Card style={styles.card}>
            <Label>Not comparable yet</Label>
            <Type variant="caption" colour={colors.textTertiary}>
              An exercise is only compared once you have both logged it.
            </Type>
            <Divider />
            {pending.slice(0, 6).map((battle) => (
              <Row key={battle.exerciseId} style={styles.pendingRow}>
                <Type variant="caption" colour={colors.textSecondary} style={{ flex: 1 }}>
                  {battle.exerciseName}
                </Type>
                <Type variant="caption" colour={colors.textFaint}>
                  {battle.status}
                </Type>
              </Row>
            ))}
          </Card>
        ) : null}

        {/* ── challenges ───────────────────────────────────────────────── */}
        <Card style={styles.card}>
          <Row>
            <View style={{ flex: 1 }}>
              <Label>🏆 Challenges</Label>
              <Type variant="heading">
                {rivalry.challenges.youWon}–{rivalry.challenges.rivalWon}
              </Type>
              {rivalry.challenges.active > 0 ? (
                <Type variant="caption" colour={colors.textTertiary}>
                  {rivalry.challenges.active} running
                </Type>
              ) : null}
            </View>
            <Button
              label="Challenge"
              tone="secondary"
              small
              full={false}
              onPress={() =>
                router.push({ pathname: '/challenge/new', params: { opponentId: id, opponentName: name } })
              }
            />
          </Row>
        </Card>

        {/* ── timeline ─────────────────────────────────────────────────── */}
        <Card style={styles.card}>
          <Label>Recent activity</Label>
          <Divider />
          {timeline.loading ? (
            <Type variant="caption" colour={colors.textTertiary}>
              Loading…
            </Type>
          ) : (timeline.data ?? []).length === 0 ? (
            <Type variant="caption" colour={colors.textTertiary}>
              Nothing yet. The first PR one of you sets will show up here.
            </Type>
          ) : (
            (timeline.data ?? []).map((event) => (
              <Row key={event.id} style={styles.eventRow} gap={spacing.md}>
                <Type variant="body">{eventIcon(event.event_type)}</Type>
                <View style={{ flex: 1 }}>
                  <Type variant="caption">{eventText(event, unit)}</Type>
                  <Type variant="caption" colour={colors.textFaint}>
                    {relativeTime(event.created_at)}
                  </Type>
                </View>
              </Row>
            ))
          )}
        </Card>

        <Spacer />
      </Screen>
    </>
  );
}

function BattleRow({ battle, unit, name }: { battle: PrBattle; unit: 'kg' | 'lb'; name: string }) {
  const youLead = battle.outcome === 'you';
  const tie = battle.outcome === 'tie';

  return (
    <View style={styles.battleRow}>
      <Row>
        <Type variant="body" style={{ flex: 1, fontWeight: '700' }}>
          {battle.exerciseName}
        </Type>
        <Pill label={battle.status} tone={tie ? 'neutral' : youLead ? 'ahead' : 'behind'} />
      </Row>
      <Row style={styles.battleValues}>
        <Type
          variant="body"
          colour={youLead || tie ? colors.text : colors.behind}
          style={styles.battleValue}
        >
          {fromGrams(battle.youGrams ?? 0, unit)} {unit}
        </Type>
        <Type variant="caption" colour={colors.textFaint}>
          vs
        </Type>
        <Type
          variant="body"
          colour={!youLead || tie ? colors.text : colors.behind}
          style={[styles.battleValue, { textAlign: 'right' }]}
          accessibilityLabel={`${name}: ${fromGrams(battle.rivalGrams ?? 0, unit)} ${unit}`}
        >
          {fromGrams(battle.rivalGrams ?? 0, unit)} {unit}
        </Type>
      </Row>
    </View>
  );
}

function eventIcon(type: string): string {
  switch (type) {
    case 'rivalry_started':
      return '⚔️';
    case 'lead_taken':
      return '👑';
    case 'lead_lost':
      return '🔻';
    case 'pr_beaten':
      return '🔥';
    case 'challenge_sent':
      return '📨';
    case 'challenge_won':
      return '🏆';
    default:
      return '•';
  }
}

function eventText(
  event: { event_type: string; actor_name: string; exercise_name: string | null; payload: Record<string, unknown> },
  unit: 'kg' | 'lb',
): string {
  const exercise = event.exercise_name ?? 'an exercise';
  switch (event.event_type) {
    case 'rivalry_started':
      return 'Your rivalry started.';
    case 'lead_taken': {
      const delta = Number(event.payload.deltaGrams ?? 0);
      return `${event.actor_name} took the lead on ${exercise}${delta ? ` by ${fromGrams(delta, unit)} ${unit}` : ''}.`;
    }
    case 'challenge_sent':
      return `${event.actor_name} sent a challenge: ${String(event.payload.title ?? '')}`;
    case 'challenge_won':
      return `${event.actor_name} won a challenge.`;
    default:
      return `${event.actor_name} · ${event.event_type.replace(/_/g, ' ')}`;
  }
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  battleRow: { gap: 6, paddingVertical: spacing.sm },
  battleValues: { gap: spacing.md },
  battleValue: { flex: 1, fontWeight: '800', fontVariant: ['tabular-nums'] },
  pendingRow: { paddingVertical: 6, gap: spacing.md },
  eventRow: { paddingVertical: spacing.sm },
});
