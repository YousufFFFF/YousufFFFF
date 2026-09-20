import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Spacer, Type } from '@/components/ui';
import { colors, spacing } from '@/theme';

/** Screen 1: the promise, and one way in. */
export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.top}>
        <Type variant="label" colour={colors.textTertiary} style={styles.wordmark}>
          R I V A L
        </Type>
      </View>

      <View style={styles.middle}>
        <Type variant="display" style={styles.headline}>
          YOUR FRIENDS.
        </Type>
        <Type variant="display" style={styles.headline}>
          YOUR PRs.
        </Type>
        <Type variant="display" colour={colors.flameLight} style={styles.headline}>
          YOUR COMPETITION.
        </Type>

        <Spacer size={spacing.xl} />
        <Type variant="body" colour={colors.textSecondary} style={styles.blurb}>
          Track your workouts, beat your PRs and compete with the gym friends you actually train with — and nobody
          else.
        </Type>
      </View>

      <View style={styles.bottom}>
        <Button label="Get started" onPress={() => router.push('/onboarding/sign-up')} />
        <Spacer size={spacing.sm} />
        <Button label="I already have an account" tone="ghost" onPress={() => router.push('/onboarding/sign-in')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink900, paddingHorizontal: spacing.lg },
  top: { alignItems: 'center' },
  wordmark: { fontSize: 14, letterSpacing: 8 },
  middle: { flex: 1, justifyContent: 'center' },
  headline: { fontSize: 38, lineHeight: 42 },
  blurb: { maxWidth: 320, lineHeight: 22 },
  bottom: { gap: spacing.xs },
});
