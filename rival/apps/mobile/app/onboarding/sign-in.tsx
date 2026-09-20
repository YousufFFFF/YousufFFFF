import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { ApiError } from '@rival/api-client';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorState, Screen, Spacer, Type } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { Field } from './sign-up';

/** Sign in, plus the forgot-password path. */
export default function SignInScreen() {
  const router = useRouter();
  const { signIn, loading } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setNotice(null);
    try {
      await signIn(email.trim(), password);
      router.replace('/(tabs)');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not sign you in.');
    }
  }

  async function forgot() {
    if (!email.trim()) {
      setError('Enter your email address first.');
      return;
    }
    setError(null);
    try {
      await api.forgotPassword(email.trim());
      // Deliberately the same message whether or not the address is registered.
      setNotice('If that address has an account, a reset link is on its way.');
    } catch {
      setNotice('If that address has an account, a reset link is on its way.');
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Type variant="title">Welcome back</Type>

        {error ? <ErrorState message={error} /> : null}
        {notice ? (
          <Card>
            <Type variant="caption" colour={colors.ahead}>
              {notice}
            </Type>
          </Card>
        ) : null}

        <Card style={{ gap: spacing.md }}>
          <Field
            label="Email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoComplete="email"
          />
          <Field label="Password" value={password} onChange={setPassword} secure autoComplete="current-password" />
        </Card>

        <Button label="Sign in" onPress={() => void submit()} loading={loading} />
        <Button label="Forgot password" tone="ghost" onPress={() => void forgot()} />

        <Spacer size={spacing.sm} />
        <Button label="Create an account" tone="ghost" onPress={() => router.replace('/onboarding/sign-up')} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
