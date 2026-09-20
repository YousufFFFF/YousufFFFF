import { useEffect } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { relativeTime } from '@/lib/format';
import { Card, Divider, EmptyState, ErrorState, LoadingState, Row, Screen, Type } from '@/components/ui';
import { colors, spacing } from '@/theme';

/** The notification inbox. Competition events only. */

const ICONS: Record<string, string> = {
  pr_beaten: '🔥',
  took_number_one: '👑',
  lost_number_one: '🔻',
  consistency_gap: '⚠️',
  challenge_received: '⚔️',
  challenge_accepted: '✅',
  challenge_declined: '✋',
  challenge_won: '🏆',
  challenge_lost: '🥈',
  connection_request: '🤝',
  connection_accepted: '⚔️',
  friend_pr: '💪',
  own_pr: '🔥',
  achievement_earned: '🎖️',
};

export default function NotificationsScreen() {
  const state = useAsync(() => api.notifications(50), []);

  useEffect(() => {
    // Opening the inbox is the read receipt.
    if (state.data && state.data.unread > 0) void api.markNotificationsRead().catch(() => undefined);
  }, [state.data]);

  if (state.loading && !state.data) return <LoadingState label="Loading notifications" />;
  if (state.error && !state.data) {
    return (
      <Screen>
        <ErrorState message={state.error} onRetry={() => void state.reload()} />
      </Screen>
    );
  }

  const items = state.data?.items ?? [];

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={state.refreshing} onRefresh={() => void state.refresh()} tintColor={colors.flameMid} />
      }
    >
      {items.length === 0 ? (
        <EmptyState
          icon="🔔"
          title="Nothing yet"
          body="When a rival beats your PR, challenges you or pulls ahead on gym days, you'll hear about it here."
        />
      ) : (
        <Card style={styles.card}>
          {items.map((item, index) => (
            <View key={item.id}>
              {index > 0 ? <Divider /> : null}
              <Row style={[styles.row, !item.readAt && styles.unread]} gap={spacing.md}>
                <Type variant="heading">{ICONS[item.type] ?? '•'}</Type>
                <View style={{ flex: 1 }}>
                  <Type variant="body" style={{ fontWeight: '700' }}>
                    {item.title}
                  </Type>
                  <Type variant="caption" colour={colors.textSecondary}>
                    {item.body}
                  </Type>
                  <Type variant="caption" colour={colors.textFaint} style={{ marginTop: 2 }}>
                    {relativeTime(item.createdAt)}
                  </Type>
                </View>
              </Row>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 0 },
  row: { paddingVertical: spacing.md },
  unread: { opacity: 1 },
});
