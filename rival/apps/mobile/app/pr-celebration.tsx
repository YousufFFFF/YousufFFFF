import { useEffect, useRef } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FinishResult } from '@rival/api-client';
import { fromGrams } from '@rival/core';
import { useMe } from '@/lib/session';
import { volume } from '@/lib/format';
import { Button, Card, Divider, Label, Pill, Row, Spacer, Stat, Type } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

/**
 * The moment after a workout.
 *
 * Everything shown here came back with the finish request, so there is no
 * spinner between the last set and the payoff. The order is deliberate: the
 * headline PR, then any lead taken, then the quieter records, then XP — and
 * recovery notices last, presented plainly and never as a challenge.
 */

export default function CelebrationScreen() {
  const { payload } = useLocalSearchParams<{ payload: string }>();
  const router = useRouter();
  const me = useMe();
  const insets = useSafeAreaInsets();
  const unit = me.profile.preferredUnit;

  const result = safeParse(payload);

  const scale = useRef(new Animated.Value(0.82)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [scale, fade]);

  function done() {
    router.replace('/(tabs)');
  }

  if (!result) {
    return (
      <View style={[styles.screen, styles.centred]}>
        <Type variant="heading">Workout saved</Type>
        <Spacer />
        <Button label="Back to home" onPress={done} />
      </View>
    );
  }

  const headline = result.headlinePr;
  // `headlinePr` is a separate object in the JSON response, so it has to be
  // matched on identity rather than by reference.
  const otherPrs = result.prs.filter(
    (pr) => !headline || pr.exerciseId !== headline.exerciseId || pr.prType !== headline.prType,
  );
  const isWeightPr = headline?.prType === 'weight' || headline?.prType === 'e1rm';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xxl }]}
    >
      {headline ? (
        <Animated.View style={[styles.hero, { opacity: fade, transform: [{ scale }] }]}>
          <Type variant="display" align="center" style={styles.flames}>
            🔥
          </Type>
          <Label colour={colors.flameLight} align="center">
            New PR
          </Label>
          <Type variant="heading" align="center" colour={colors.textSecondary} style={{ marginTop: spacing.sm }}>
            {headline.exerciseName}
          </Type>

          <View style={styles.heroStat}>
            <Stat
              value={isWeightPr ? fromGrams(headline.value, unit) : headline.value}
              unit={isWeightPr ? unit : headline.prType === 'reps' ? 'reps' : ''}
              large
            />
          </View>

          {headline.previousValue !== null ? (
            <>
              <Row gap={spacing.sm} style={styles.deltaRow}>
                <Pill
                  label={
                    isWeightPr
                      ? `+${fromGrams(headline.value - headline.previousValue, unit)} ${unit}`
                      : `+${headline.value - headline.previousValue}`
                  }
                  tone="accent"
                />
                {headline.improvementPct !== null ? <Pill label={`+${headline.improvementPct}%`} tone="ahead" /> : null}
              </Row>
              <Type variant="caption" colour={colors.textSecondary} align="center" style={styles.heroBody}>
                You just beat your previous best of{' '}
                {isWeightPr ? `${fromGrams(headline.previousValue, unit)} ${unit}` : headline.previousValue}.
              </Type>
            </>
          ) : (
            <Type variant="caption" colour={colors.textSecondary} align="center" style={styles.heroBody}>
              Your first record on this lift. Everything from here is a PR to beat.
            </Type>
          )}

          {headline.prType === 'e1rm' ? (
            <Type variant="caption" colour={colors.textFaint} align="center" style={styles.disclaimer}>
              Estimated from your logged set — not a tested 1-rep max.
            </Type>
          ) : null}
        </Animated.View>
      ) : (
        <View style={styles.hero}>
          <Type variant="display" align="center" style={styles.flames}>
            💪
          </Type>
          <Type variant="title" align="center">
            Workout complete
          </Type>
          <Type variant="caption" colour={colors.textSecondary} align="center" style={styles.heroBody}>
            {result.session.set_count} sets · {volume(Number(result.session.total_volume_grams), unit)} total volume
          </Type>
        </View>
      )}

      {/* The competitive consequence: who you just passed. */}
      {result.leadsTaken.map((lead) => (
        <Card key={`${lead.rivalId}-${lead.exerciseId}`} glow style={styles.leadCard}>
          <Label colour={colors.crown}>👑 You took the lead</Label>
          <Type variant="heading">
            Your {lead.exerciseName} PR is now higher than {lead.rivalName}&rsquo;s
          </Type>
          <Type variant="caption" colour={colors.textSecondary}>
            You&rsquo;re {fromGrams(lead.deltaGrams, unit)} {unit} ahead. They&rsquo;ll be told.
          </Type>
        </Card>
      ))}

      {otherPrs.length > 0 ? (
        <Card style={styles.listCard}>
          <Label>Also beaten</Label>
          <Divider />
          {otherPrs.map((pr, index) => (
            <Row key={`${pr.exerciseId}-${pr.prType}-${index}`} style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <Type variant="body" style={{ fontWeight: '700' }}>
                  {pr.exerciseName}
                </Type>
                <Type variant="caption" colour={colors.textTertiary}>
                  {prLabel(pr.prType)}
                </Type>
              </View>
              <Type variant="body" style={{ fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                {pr.prType === 'reps'
                  ? `${pr.value} reps`
                  : pr.prType === 'volume'
                    ? volume(pr.value, unit)
                    : `${fromGrams(pr.value, unit)} ${unit}`}
              </Type>
            </Row>
          ))}
        </Card>
      ) : null}

      {result.newAchievements.length > 0 ? (
        <Card style={styles.listCard}>
          <Label colour={colors.crown}>Unlocked</Label>
          <Divider />
          {result.newAchievements.map((achievement) => (
            <Row key={achievement.code} style={styles.listRow} gap={spacing.md}>
              <Type variant="heading">{achievement.icon}</Type>
              <View style={{ flex: 1 }}>
                <Type variant="body" style={{ fontWeight: '700' }}>
                  {achievement.title}
                </Type>
                <Type variant="caption" colour={colors.textTertiary}>
                  {achievement.description}
                </Type>
              </View>
            </Row>
          ))}
        </Card>
      ) : null}

      <Card style={styles.xpCard}>
        <Row>
          <View style={{ flex: 1 }}>
            <Label>Earned</Label>
            <Type variant="heading">+{result.xpAwarded} XP</Type>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Label>Streak</Label>
            <Type variant="heading" colour={colors.flameLight}>
              🔥 {result.streak.currentDays}
            </Type>
          </View>
        </Row>
      </Card>

      {/* Neutral, last, and never with a call to action to train more. */}
      {result.recovery.map((notice) => (
        <Card key={notice.flag} style={styles.recoveryCard}>
          <Label>🛌 {notice.title}</Label>
          <Type variant="caption" colour={colors.textSecondary}>
            {notice.message}
          </Type>
        </Card>
      ))}

      <Spacer />
      <Button label="Done" onPress={done} />
    </ScrollView>
  );
}

function prLabel(type: string): string {
  switch (type) {
    case 'weight':
      return 'Heaviest lift';
    case 'reps':
      return 'Most reps at that weight';
    case 'volume':
      return 'Biggest session volume';
    case 'e1rm':
      return 'Estimated 1-rep max';
    default:
      return type;
  }
}

function safeParse(payload: string | undefined): FinishResult | null {
  if (!payload) return null;
  try {
    return JSON.parse(payload) as FinishResult;
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink900 },
  content: { padding: spacing.lg, gap: spacing.md },
  centred: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl },

  hero: { alignItems: 'center', paddingVertical: spacing.xl },
  flames: { fontSize: 44, marginBottom: spacing.sm },
  heroStat: { marginVertical: spacing.md },
  deltaRow: { justifyContent: 'center' },
  heroBody: { maxWidth: 300, marginTop: spacing.md },
  disclaimer: { marginTop: spacing.sm, maxWidth: 280 },

  leadCard: { gap: spacing.xs, borderRadius: radius.md },
  listCard: { gap: spacing.xs },
  listRow: { paddingVertical: spacing.sm },
  xpCard: {},
  recoveryCard: { gap: spacing.xs, backgroundColor: colors.ink850 },
});
