import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '@/lib/session';
import { colors } from '@/theme';

/**
 * Root layout and route guard.
 *
 * One place decides where a person belongs: signed out → onboarding; signed in
 * but part-way through profile setup → the remaining onboarding steps; done →
 * the tabs. Individual screens never redirect, so there is no chance of two
 * of them disagreeing.
 */

function RouteGuard() {
  const { me, ready } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;

    const group = segments[0];
    const inOnboarding = group === 'onboarding';
    const onboardingComplete = me?.profile.onboardingStep === 'done';

    if (!me && !inOnboarding) {
      router.replace('/onboarding');
      return;
    }
    if (me && !onboardingComplete && !inOnboarding) {
      router.replace('/onboarding/profile');
      return;
    }
    if (me && onboardingComplete && inOnboarding) {
      router.replace('/(tabs)');
    }
  }, [me, ready, segments, router]);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.ink900, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.flameMid} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.ink900 },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '800' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.ink900 },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="workout/[id]" options={{ title: 'Workout' }} />
      <Stack.Screen name="workout/active" options={{ title: 'Log workout', headerBackTitle: 'Back' }} />
      <Stack.Screen name="rival/[id]" options={{ title: 'Rivalry' }} />
      <Stack.Screen name="rival/catch-up" options={{ title: 'Catch-up mode' }} />
      <Stack.Screen name="challenge/[id]" options={{ title: 'Challenge' }} />
      <Stack.Screen name="challenge/new" options={{ title: 'New challenge', presentation: 'modal' }} />
      <Stack.Screen name="connections" options={{ title: 'Find friends' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="leaderboards" options={{ title: 'Leaderboards' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="pr-celebration" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="light" />
        <RouteGuard />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
