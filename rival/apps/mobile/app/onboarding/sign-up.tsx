import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ApiError } from '@rival/api-client';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card, Divider, ErrorState, Label, Screen, Spacer, Type } from '@/components/ui';
import { colors, MIN_TOUCH, radius, spacing } from '@/theme';

/**
 * Screen 2: create an account.
 *
 * Email and password always; Google and Apple appear only when the deployment
 * has them configured, so the buttons on screen are ones that actually work.
 */

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp, loading } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [referral, setReferral] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<{ google: boolean; apple: boolean }>({ google: false, apple: false });

  useEffect(() => {
    void api
      .authProviders()
      .then((result) => setProviders({ google: result.google, apple: result.apple }))
      .catch(() => undefined);
  }, []);

  async function submit() {
    setError(null);
    try {
      await signUp({
        email: email.trim(),
        password,
        displayName: name.trim() || undefined,
        referralCode: referral.trim() || undefined,
      });
      router.replace('/onboarding/profile');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not create your account.');
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Type variant="title">Create your account</Type>
        <Type variant="caption" colour={colors.textSecondary}>
          One account, all your rivalries.
        </Type>

        {error ? <ErrorState message={error} /> : null}

        <Card style={styles.form}>
          <Field label="Name" value={name} onChange={setName} placeholder="Muzz" autoComplete="name" />
          <Field
            label="Email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoComplete="email"
          />
          <Field
            label="Password"
            value={password}
            onChange={setPassword}
            placeholder="At least 8 characters"
            secure
            autoComplete="new-password"
            hint="At least 8 characters, with a letter and a number."
          />
          <Field
            label="Referral code (optional)"
            value={referral}
            onChange={setReferral}
            placeholder="ABC123"
            autoCapitalize="characters"
          />
        </Card>

        <Button label="Create account" onPress={() => void submit()} loading={loading} />

        {providers.google || providers.apple ? (
          <>
            <Spacer size={spacing.sm} />
            <Divider />
            <Type variant="caption" colour={colors.textFaint} align="center">
              or continue with
            </Type>
            {providers.google ? (
              <Button
                label="Continue with Google"
                tone="secondary"
                onPress={() => setError('Google sign-in opens the provider flow on a real device build.')}
              />
            ) : null}
            {providers.apple && Platform.OS === 'ios' ? (
              <Button
                label="Continue with Apple"
                tone="secondary"
                onPress={() => setError('Apple sign-in opens the provider flow on a real device build.')}
              />
            ) : null}
          </>
        ) : null}

        <Spacer size={spacing.sm} />
        <Button label="I already have an account" tone="ghost" onPress={() => router.replace('/onboarding/sign-in')} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  secure,
  keyboardType,
  autoComplete,
  autoCapitalize = 'none',
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  secure?: boolean;
  keyboardType?: 'default' | 'email-address' | 'number-pad' | 'decimal-pad';
  autoComplete?: 'name' | 'email' | 'new-password' | 'current-password' | 'username';
  autoCapitalize?: 'none' | 'words' | 'characters';
  hint?: string;
}) {
  return (
    <View style={styles.field}>
      <Label>{label}</Label>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        secureTextEntry={secure}
        keyboardType={keyboardType ?? 'default'}
        autoComplete={autoComplete}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        accessibilityLabel={label}
        accessibilityHint={hint}
      />
      {hint ? (
        <Type variant="caption" colour={colors.textFaint}>
          {hint}
        </Type>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  field: { gap: 6 },
  input: {
    minHeight: MIN_TOUCH + 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.ink900,
    color: colors.text,
    paddingHorizontal: spacing.md,
    fontSize: 16,
  },
});
