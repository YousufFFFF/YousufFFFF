import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ApiError } from '@rival/api-client';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorState, Label, Pill, Row, Screen, Spacer, Type } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { Field } from './sign-up';

/**
 * Screen 3: the profile.
 *
 * Height and weight are optional and clearly marked private. The privacy note
 * is on the screen where the data is entered, not buried in settings — it is
 * the moment it matters.
 */

export default function ProfileSetupScreen() {
  const router = useRouter();
  const { me, refresh } = useSession();

  const [displayName, setDisplayName] = useState(me?.profile.displayName ?? '');
  const [username, setUsername] = useState(me?.profile.username ?? '');
  const [birthYear, setBirthYear] = useState(me?.profile.birthYear ? String(me.profile.birthYear) : '');
  const [gender, setGender] = useState<string | null>(me?.profile.gender ?? null);
  const [heightCm, setHeightCm] = useState(me?.profile.heightCm ? String(me.profile.heightCm) : '');
  const [bodyweight, setBodyweight] = useState('');
  const [unit, setUnit] = useState<'kg' | 'lb'>(me?.profile.preferredUnit ?? 'kg');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function next() {
    setBusy(true);
    setError(null);
    try {
      await api.updateProfile({
        displayName: displayName.trim() || undefined,
        username: username.trim() || undefined,
        birthYear: birthYear ? Number.parseInt(birthYear, 10) : null,
        gender,
        heightCm: heightCm ? Number.parseFloat(heightCm) : null,
        ...(bodyweight ? { bodyweight: Number.parseFloat(bodyweight), bodyweightUnit: unit } : {}),
        preferredUnit: unit,
        onboardingStep: 'experience',
      });
      await refresh();
      router.push('/onboarding/experience');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save your profile.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Type variant="title">Create your profile</Type>
        <Type variant="caption" colour={colors.textSecondary}>
          Your friends will find you by username.
        </Type>

        {error ? <ErrorState message={error} /> : null}

        <Card style={styles.form}>
          <Field label="Name" value={displayName} onChange={setDisplayName} autoCapitalize="words" />
          <Field
            label="Username"
            value={username}
            onChange={(value) => setUsername(value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())}
            hint="Letters, numbers and underscores. This is public."
          />
        </Card>

        <Card style={styles.form}>
          <Label>Units</Label>
          <Row gap={spacing.sm}>
            {(['kg', 'lb'] as const).map((option) => (
              <Choice key={option} label={option.toUpperCase()} selected={unit === option} onPress={() => setUnit(option)} />
            ))}
          </Row>
          <Type variant="caption" colour={colors.textFaint}>
            You can change this any time. Weights are stored once and converted for display, so you and a friend using
            different units still compare exactly.
          </Type>
        </Card>

        <Card style={styles.form}>
          <Row>
            <Label style={{ flex: 1 }}>About you (optional)</Label>
            <Pill label="Private" icon="🔒" />
          </Row>
          <Field label="Birth year" value={birthYear} onChange={setBirthYear} keyboardType="number-pad" placeholder="1999" />
          <View style={{ gap: 6 }}>
            <Label>Gender (optional)</Label>
            <Row gap={spacing.sm} style={{ flexWrap: 'wrap' }}>
              {[
                ['male', 'Male'],
                ['female', 'Female'],
                ['other', 'Other'],
                ['prefer_not_to_say', 'Prefer not to say'],
              ].map(([value, label]) => (
                <Choice
                  key={value}
                  label={label!}
                  selected={gender === value}
                  onPress={() => setGender(gender === value ? null : value!)}
                />
              ))}
            </Row>
          </View>
          <Field label="Height (cm)" value={heightCm} onChange={setHeightCm} keyboardType="decimal-pad" placeholder="178" />
          <Field
            label={`Bodyweight (${unit})`}
            value={bodyweight}
            onChange={setBodyweight}
            keyboardType="decimal-pad"
            placeholder="—"
            hint="Private by default. Bodyweight is never shown to anyone, including your rivals, unless you change it in settings."
          />
        </Card>

        <Button label="Continue" onPress={() => void next()} loading={busy} />
        <Spacer />
      </Screen>
    </KeyboardAvoidingView>
  );
}

export function Choice({
  label,
  selected,
  onPress,
  sublabel,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  sublabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={sublabel ? `${label}. ${sublabel}` : label}
      style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, pressed && { opacity: 0.85 }]}
    >
      <Type variant="body" colour={selected ? colors.flameLight : colors.textSecondary} style={styles.choiceLabel}>
        {label}
      </Type>
      {sublabel ? (
        <Type variant="caption" colour={colors.textFaint}>
          {sublabel}
        </Type>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  choice: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.ink800,
  },
  choiceSelected: { borderColor: colors.flame, backgroundColor: colors.flameSoft },
  choiceLabel: { fontWeight: '700' },
});
