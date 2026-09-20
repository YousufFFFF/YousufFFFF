import { Stack } from 'expo-router';
import { colors } from '@/theme';

/**
 * Onboarding.
 *
 * Six steps, each doing one thing. The profile step onwards runs after the
 * account exists, so a person who drops out mid-way is returned here rather
 * than dumped into an empty app.
 */
export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.ink900 },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '800' },
        contentStyle: { backgroundColor: colors.ink900 },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
      <Stack.Screen name="sign-up" options={{ title: 'Create account' }} />
      <Stack.Screen name="profile" options={{ title: 'Your profile', headerBackVisible: false }} />
      <Stack.Screen name="experience" options={{ title: 'Experience' }} />
      <Stack.Screen name="goals" options={{ title: 'Goals' }} />
      <Stack.Screen name="exercises" options={{ title: 'Favourites' }} />
    </Stack>
  );
}
