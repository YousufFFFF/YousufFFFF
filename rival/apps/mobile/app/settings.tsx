import { useState } from 'react';
import { Alert, StyleSheet, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ApiError, type PrivacySettings, type Visibility } from '@rival/api-client';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useSession } from '@/lib/session';
import {
  Button,
  Card,
  Divider,
  ErrorState,
  Label,
  Pill,
  Row,
  Screen,
  Spacer,
  Type,
} from '@/components/ui';
import { Choice } from './onboarding/profile';
import { colors, spacing } from '@/theme';

/**
 * Settings: privacy, notifications, units, competition pause, subscription,
 * referrals and account deletion.
 *
 * Privacy is first because it is the setting that matters most in a
 * competitive app, and each category is controlled separately.
 */

const PRIVACY_FIELDS: { key: keyof PrivacySettings; label: string; blurb: string }[] = [
  { key: 'prs', label: 'Personal records', blurb: 'Your best lifts, and whether rivals can compare against them.' },
  { key: 'workoutHistory', label: 'Workout history', blurb: 'The sessions and sets you have logged.' },
  { key: 'attendance', label: 'Gym attendance', blurb: 'How often you train — the consistency comparison.' },
  { key: 'progress', label: 'Progress', blurb: 'Improvement over time.' },
  { key: 'activityFeed', label: 'Activity feed', blurb: 'Whether your PRs and workouts appear in friends’ feeds.' },
  { key: 'bodyweight', label: 'Bodyweight', blurb: 'Private by default. Never used in any score.' },
  { key: 'gymLocation', label: 'Gym location', blurb: 'Private by default. RIVAL never shows an exact location.' },
];

const VISIBILITIES: { value: Visibility; label: string }[] = [
  { value: 'public', label: 'Public' },
  { value: 'connections', label: 'Rivals' },
  { value: 'private', label: 'Private' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { me, refresh, signOut } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const referrals = useAsync(() => api.referrals(), []);

  if (!me) return null;

  async function setVisibility(field: keyof PrivacySettings, value: Visibility) {
    setError(null);
    try {
      await api.updatePrivacy({ [field]: value });
      await refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save that setting.');
    }
  }

  async function setPaused(paused: boolean) {
    setError(null);
    try {
      await api.setCompetitionPaused(paused);
      await refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not change that.');
    }
  }

  async function setUnit(unit: 'kg' | 'lb') {
    await api.updateProfile({ preferredUnit: unit });
    await refresh();
  }

  function confirmDelete() {
    Alert.alert(
      'Delete your account?',
      'This removes your workouts, PRs, rivalries and challenges. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            void api
              .deleteAccount()
              .then(() => router.replace('/onboarding'))
              .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Could not delete the account.'))
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  }

  return (
    <Screen>
      {error ? <ErrorState message={error} /> : null}

      {/* ── privacy ───────────────────────────────────────────────────── */}
      <Card style={styles.card}>
        <Label>🔒 Privacy</Label>
        <Type variant="caption" colour={colors.textSecondary}>
          Competition only ever happens between people who have both accepted a connection. These control what those
          rivals — and anyone else — can see.
        </Type>
        <Divider />
        {PRIVACY_FIELDS.map((field) => (
          <View key={field.key} style={styles.privacyRow}>
            <Type variant="body" style={{ fontWeight: '700' }}>
              {field.label}
            </Type>
            <Type variant="caption" colour={colors.textTertiary}>
              {field.blurb}
            </Type>
            <Row gap={spacing.sm} style={{ marginTop: spacing.sm, flexWrap: 'wrap' }}>
              {VISIBILITIES.map((option) => (
                <Choice
                  key={option.value}
                  label={option.label}
                  selected={me.privacy[field.key] === option.value}
                  onPress={() => void setVisibility(field.key, option.value)}
                />
              ))}
            </Row>
          </View>
        ))}
      </Card>

      {/* ── competition ───────────────────────────────────────────────── */}
      <Card style={styles.card}>
        <Row>
          <View style={{ flex: 1 }}>
            <Label>⏸️ Pause competition</Label>
            <Type variant="caption" colour={colors.textSecondary}>
              Step out of every rivalry and leaderboard. Your data stays exactly as it is, and you can step back in at
              any time.
            </Type>
          </View>
          <Switch
            value={me.profile.competitionPaused}
            onValueChange={(value) => void setPaused(value)}
            trackColor={{ true: colors.flame, false: colors.ink600 }}
            accessibilityLabel="Pause competition"
          />
        </Row>
      </Card>

      {/* ── units ─────────────────────────────────────────────────────── */}
      <Card style={styles.card}>
        <Label>Units</Label>
        <Row gap={spacing.sm}>
          {(['kg', 'lb'] as const).map((unit) => (
            <Choice
              key={unit}
              label={unit.toUpperCase()}
              selected={me.profile.preferredUnit === unit}
              onPress={() => void setUnit(unit)}
            />
          ))}
        </Row>
        <Type variant="caption" colour={colors.textFaint}>
          Display only. Everything is stored in one unit internally, so switching never changes a record.
        </Type>
      </Card>

      {/* ── subscription ──────────────────────────────────────────────── */}
      <Card style={styles.card}>
        <Row>
          <View style={{ flex: 1 }}>
            <Label>Plan</Label>
            <Type variant="heading">{me.subscription.isPro ? (me.subscription.plan?.name ?? 'RIVAL PRO') : 'Free'}</Type>
          </View>
          {me.subscription.isPro ? <Pill label="Pro" tone="accent" /> : null}
        </Row>
        <Type variant="caption" colour={colors.textSecondary}>
          {me.subscription.isPro
            ? 'Advanced statistics, full PR history and unlimited custom challenges.'
            : 'Logging, PRs, rivalries, leaderboards and challenges are all free. Pro adds the deeper analytics.'}
        </Type>
      </Card>

      {/* ── referrals ─────────────────────────────────────────────────── */}
      {referrals.data ? (
        <Card style={styles.card}>
          <Label>Invite your gym</Label>
          <Type variant="heading">{referrals.data.code}</Type>
          <Type variant="caption" colour={colors.textSecondary}>
            {referrals.data.rewardGranted
              ? `Reward unlocked — ${referrals.data.rewardDays} days of RIVAL PRO.`
              : `${referrals.data.signedUp} of 3 friends joined. Three unlocks ${referrals.data.rewardDays} days of PRO.`}
          </Type>
          <Type variant="caption" colour={colors.textFaint}>
            {referrals.data.link}
          </Type>
        </Card>
      ) : null}

      {/* ── account ───────────────────────────────────────────────────── */}
      <Card style={styles.card}>
        <Label>Account</Label>
        <Type variant="caption" colour={colors.textSecondary}>
          {me.email ?? 'No email on this account'}
          {me.email && !me.emailVerified ? ' · not verified' : ''}
        </Type>
        {me.email && !me.emailVerified ? (
          <Button
            label="Resend verification email"
            tone="secondary"
            onPress={() => void api.resendVerification().catch(() => undefined)}
          />
        ) : null}
        <Button label="Sign out" tone="secondary" onPress={() => void signOut()} />
        <Button label="Delete account" tone="danger" loading={busy} onPress={confirmDelete} />
      </Card>

      <Spacer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  privacyRow: { paddingVertical: spacing.sm },
});
