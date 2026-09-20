import { useCallback } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { HomeCard, HomeView } from '@rival/api-client';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useSession } from '@/lib/session';
import { Button, Card, EmptyState, ErrorState, Label, Pill, Screen, SkeletonCard, Spacer, Type } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

/**
 * Home.
 *
 * The API decides what matters most right now and returns an ordered list of
 * cards; this screen renders them. That keeps the "what is most urgent"
 * judgement in one testable place rather than spread through the UI, and means
 * the screen genuinely changes as the rivalries do.
 */

const TONE_STYLES: Record<HomeCard['tone'], { border: string; accent: string }> = {
  alert: { border: 'rgba(255,77,94,0.3)', accent: colors.behind },
  urgent: { border: 'rgba(255,122,45,0.35)', accent: colors.flameLight },
  positive: { border: 'rgba(47,208,122,0.3)', accent: colors.ahead },
  neutral: { border: colors.border, accent: colors.textSecondary },
};

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { me } = useSession();
  const state = useAsync<HomeView>(() => api.home(), []);
  const unread = useAsync(() => api.notifications(1), []);

  // The home screen is the one place stale numbers are most obvious, so it
  // reloads every time it comes back into view.
  useFocusEffect(
    useCallback(() => {
      void state.refresh();
      void unread.refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  function runAction(card: HomeCard) {
    const action = card.cta?.action;
    const params = card.cta?.params ?? {};
    switch (action) {
      case 'workout.start':
        router.push('/(tabs)/log');
        break;
      case 'workout.today':
        router.push('/(tabs)/log');
        break;
      case 'connections.search':
        router.push('/connections');
        break;
      case 'catchup.open':
        router.push({ pathname: '/rival/catch-up', params: { rivalId: params.rivalId ?? '' } });
        break;
      case 'rivalry.open':
        router.push({ pathname: '/rival/[id]', params: { id: params.rivalId ?? '' } });
        break;
      case 'challenge.open':
        router.push({ pathname: '/challenge/[id]', params: { id: params.challengeId ?? '' } });
        break;
      case 'share.pr':
        router.push('/(tabs)/profile');
        break;
      default:
        break;
    }
  }

  if (state.loading && !state.data) {
    return (
      <Screen contentStyle={{ paddingTop: insets.top + spacing.md }}>
        <SkeletonCard lines={1} />
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

  const home = state.data!;
  const unreadCount = unread.data?.unread ?? 0;

  return (
    <Screen
      contentStyle={{ paddingTop: insets.top + spacing.md }}
      refreshControl={
        <RefreshControl refreshing={state.refreshing} onRefresh={() => void state.refresh()} tintColor={colors.flameMid} />
      }
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Type variant="title">{home.greeting}</Type>
          {home.streakDays > 0 ? (
            <Type variant="caption" colour={colors.flameLight} style={{ marginTop: 4 }}>
              🔥 {home.streakDays}-day streak
            </Type>
          ) : (
            <Type variant="caption" colour={colors.textTertiary} style={{ marginTop: 4 }}>
              Log a workout to start a streak
            </Type>
          )}
        </View>

        <Pressable
          onPress={() => router.push('/notifications')}
          accessibilityRole="button"
          accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          style={styles.bell}
        >
          <Text style={styles.bellIcon}>🔔</Text>
          {unreadCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {home.cards.length === 0 ? (
        <EmptyState
          title="Nothing to chase yet"
          body="Log a workout and connect with a friend to start competing."
          actionLabel="Log workout"
          onAction={() => router.push('/(tabs)/log')}
        />
      ) : (
        home.cards.map((card, index) => (
          <HomeCardView
            key={`${card.kind}-${index}`}
            card={card}
            // One primary button per screen: the most urgent card. Everything
            // else is secondary, so there is a single obvious next action.
            emphasis={index === 0}
            onAction={() => runAction(card)}
          />
        ))
      )}

      <Spacer size={spacing.sm} />
      <Pressable onPress={() => router.push('/leaderboards')} accessibilityRole="button">
        <Card style={styles.linkCard}>
          <Type variant="heading">Leaderboards</Type>
          <Type variant="caption" colour={colors.textTertiary}>
            {me ? `${home.connectionCount} ${home.connectionCount === 1 ? 'rival' : 'rivals'} in your circle` : ''}
          </Type>
        </Card>
      </Pressable>
    </Screen>
  );
}

function HomeCardView({
  card,
  emphasis,
  onAction,
}: {
  card: HomeCard;
  emphasis: boolean;
  onAction: () => void;
}) {
  const tone = TONE_STYLES[card.tone];

  return (
    <Card style={[styles.card, { borderColor: tone.border }]}>
      <View style={styles.cardHead}>
        <Label colour={tone.accent}>{labelFor(card.kind)}</Label>
      </View>

      <Type variant="heading" style={styles.cardTitle}>
        {card.title}
      </Type>
      <Type variant="caption" colour={colors.textSecondary} style={styles.cardBody}>
        {card.body}
      </Type>

      {card.cta ? (
        <Button
          label={card.cta.label}
          onPress={onAction}
          tone={emphasis && card.tone !== 'positive' ? 'primary' : 'secondary'}
          small
        />
      ) : null}

      {/* A recovery notice deliberately has no call to action — see safety.ts. */}
      {card.kind === 'recovery' ? <Pill label="Recovery" tone="neutral" icon="🛌" /> : null}
    </Card>
  );
}

function labelFor(kind: HomeCard['kind']): string {
  switch (kind) {
    case 'pr_under_threat':
      return '🚨 Your PR is under threat';
    case 'consistency_behind':
      return '⚠️ Consistency gap';
    case 'took_the_lead':
      return '👑 You took the lead';
    case 'challenge_incoming':
      return '⚔️ Challenge';
    case 'challenge_deadline':
      return '⏳ Deadline';
    case 'pr_battle':
      return '⚔️ PR battle';
    case 'log_workout':
      return 'Today';
    case 'workout_complete':
      return '🔥 Today';
    case 'streak':
      return 'Streak';
    case 'recovery':
      return 'Recovery';
    case 'no_rivals':
      return 'Get started';
    default:
      return '';
  }
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.xs },
  bell: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  bellIcon: { fontSize: 20 },
  badge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.flame,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#150904', fontSize: 10, fontWeight: '900' },

  card: { gap: spacing.sm },
  cardHead: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { marginTop: 2 },
  cardBody: { marginBottom: spacing.xs },

  linkCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
