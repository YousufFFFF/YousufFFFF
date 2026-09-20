import { useCallback, useMemo } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addDays, fromGrams, startOfWeek, toIsoDate } from '@rival/core';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useSession } from '@/lib/session';
import { WeekStrip } from '@/components/WeekStrip';
import {
  Avatar,
  Button,
  Card,
  Divider,
  EmptyState,
  Label,
  Pill,
  ProgressBar,
  Row,
  Screen,
  SkeletonCard,
  Spacer,
  Stat,
  Type,
} from '@/components/ui';
import { colors, spacing } from '@/theme';

/** Profile: who you are, what you have lifted, and what you have unlocked. */

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { me, refresh } = useSession();

  const today = toIsoDate(new Date());
  const weekStart = startOfWeek(today);

  const prs = useAsync(() => api.personalRecords(), []);
  const calendar = useAsync(() => api.calendar(addDays(weekStart, -21), addDays(weekStart, 6)), []);
  const achievements = useAsync(() => api.achievements(), []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      void prs.refresh();
      void calendar.refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const weights = useMemo(
    () => (prs.data?.records ?? []).filter((record) => record.pr_type === 'weight').slice(0, 8),
    [prs.data],
  );

  const weeks = useMemo(() => {
    const days = calendar.data ?? [];
    const chunks: (typeof days)[] = [];
    for (let index = 0; index < days.length; index += 7) chunks.push(days.slice(index, index + 7));
    return chunks;
  }, [calendar.data]);

  if (!me) return <SkeletonCard lines={3} />;

  const stats = me.stats;
  const unit = me.profile.preferredUnit;

  return (
    <Screen
      contentStyle={{ paddingTop: insets.top + spacing.md }}
      refreshControl={
        <RefreshControl refreshing={prs.refreshing} onRefresh={() => void prs.refresh()} tintColor={colors.flameMid} />
      }
    >
      <Row gap={spacing.md}>
        <Avatar name={me.profile.displayName} size={60} />
        <View style={{ flex: 1 }}>
          <Type variant="title">{me.profile.displayName}</Type>
          <Type variant="caption" colour={colors.textTertiary}>
            @{me.profile.username}
          </Type>
          {me.profile.bio ? (
            <Type variant="caption" colour={colors.textSecondary} style={{ marginTop: 4 }}>
              {me.profile.bio}
            </Type>
          ) : null}
        </View>
        <Pressable
          onPress={() => router.push('/settings')}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          style={styles.gear}
        >
          <Type variant="heading">⚙️</Type>
        </Pressable>
      </Row>

      {me.profile.competitionPaused ? (
        <Card style={styles.pausedCard}>
          <Label>⏸️ Competition paused</Label>
          <Type variant="caption" colour={colors.textSecondary}>
            You are out of every rivalry and leaderboard until you resume. Nothing has been deleted.
          </Type>
          <Button label="Resume competing" tone="secondary" onPress={() => router.push('/settings')} />
        </Card>
      ) : null}

      {/* ── level ─────────────────────────────────────────────────────── */}
      <Card style={styles.card}>
        <Row>
          <View style={{ flex: 1 }}>
            <Label>Level {stats.level.level}</Label>
            <Type variant="heading">{stats.level.name}</Type>
          </View>
          <Type variant="caption" colour={colors.textTertiary}>
            {stats.level.xpForNextLevel !== null
              ? `${stats.level.xpForNextLevel} XP to ${stats.level.nextLevelName}`
              : 'Top level'}
          </Type>
        </Row>
        <ProgressBar
          value={stats.level.progressPct}
          label={`${stats.level.progressPct}% towards ${stats.level.nextLevelName ?? 'the top level'}`}
        />
      </Card>

      {/* ── headline stats ────────────────────────────────────────────── */}
      <Row gap={spacing.md} style={styles.statGrid}>
        <StatTile label="Streak" value={stats.currentStreak} hint={`best ${stats.longestStreak}`} accent />
        <StatTile label="Workouts" value={stats.totalWorkouts} hint="gym days" />
        <StatTile label="PRs" value={stats.prCount} hint="records held" />
      </Row>
      <Row gap={spacing.md} style={styles.statGrid}>
        <StatTile label="Rivalries won" value={stats.rivalryWins} hint={`${stats.connections} rivals`} />
        <StatTile label="Battles won" value={stats.battlesWon} hint="lifts you lead" />
        <StatTile label="Challenges" value={stats.challengesWon} hint="won" />
      </Row>

      {/* ── attendance ────────────────────────────────────────────────── */}
      <Card style={styles.card}>
        <Row>
          <Label style={{ flex: 1 }}>Last four weeks</Label>
          <Pill label={`${me.profile.weeklyTarget}×/week target`} />
        </Row>
        {calendar.loading && !calendar.data ? (
          <SkeletonCard lines={2} />
        ) : (
          weeks.map((week, index) => <WeekStrip key={index} days={week} />)
        )}
        <Type variant="caption" colour={colors.textFaint}>
          ✓ trained · – planned rest · blank missed. Rest days never break your streak.
        </Type>
      </Card>

      {/* ── personal records ──────────────────────────────────────────── */}
      <Card style={styles.card}>
        <Label>🔥 Personal records</Label>
        <Divider />
        {prs.loading && !prs.data ? (
          <SkeletonCard lines={3} />
        ) : weights.length === 0 ? (
          <EmptyState
            icon="🏋️"
            title="No PRs yet"
            body="Log your first workout and your records start here."
            actionLabel="Log workout"
            onAction={() => router.push('/(tabs)/log')}
          />
        ) : (
          weights.map((record) => (
            <Row key={record.id} style={styles.prRow}>
              <Type variant="body" style={{ flex: 1, fontWeight: '700' }}>
                {record.exercise_name}
              </Type>
              <Type variant="body" style={styles.prValue}>
                {fromGrams(record.value, unit)} {unit}
              </Type>
            </Row>
          ))
        )}
      </Card>

      {/* ── achievements ──────────────────────────────────────────────── */}
      <Card style={styles.card}>
        <Label>Achievements</Label>
        <Divider />
        <View style={styles.badgeGrid}>
          {(achievements.data ?? []).map((badge) => (
            <View
              key={badge.code}
              style={[styles.badge, !badge.earned_at && styles.badgeLocked]}
              accessible
              accessibilityLabel={`${badge.title}: ${badge.earned_at ? 'unlocked' : 'locked'}. ${badge.description}`}
            >
              <Type variant="heading" style={!badge.earned_at ? styles.badgeIconLocked : undefined}>
                {badge.icon}
              </Type>
              <Type
                variant="caption"
                colour={badge.earned_at ? colors.text : colors.textFaint}
                align="center"
                style={styles.badgeTitle}
              >
                {badge.title}
              </Type>
            </View>
          ))}
        </View>
      </Card>

      <Spacer />
      <Button label="Leaderboards" tone="secondary" onPress={() => router.push('/leaderboards')} />
    </Screen>
  );
}

function StatTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number;
  hint: string;
  accent?: boolean;
}) {
  return (
    <Card style={styles.statTile}>
      <Label>{label}</Label>
      <Stat value={value} colour={accent ? colors.flameLight : colors.text} />
      <Type variant="caption" colour={colors.textFaint}>
        {hint}
      </Type>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  gear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pausedCard: { gap: spacing.sm, backgroundColor: colors.ink850 },
  statGrid: { alignItems: 'stretch' },
  statTile: { flex: 1, gap: 2, padding: spacing.md },
  prRow: { paddingVertical: spacing.sm },
  prValue: { fontWeight: '800', fontVariant: ['tabular-nums'] },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  badge: { width: 76, alignItems: 'center', gap: 4 },
  badgeLocked: { opacity: 0.85 },
  badgeIconLocked: { opacity: 0.25 },
  badgeTitle: { fontSize: 11, lineHeight: 14 },
});
