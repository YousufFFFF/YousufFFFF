import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors } from '@/theme';

/**
 * Bottom navigation.
 *
 * Five destinations, with logging in the middle and visually louder — it is the
 * action the whole loop depends on, and it should never be more than one tap
 * away.
 */

function Icon({ glyph, focused, accent }: { glyph: string; focused: boolean; accent?: boolean }) {
  return (
    <Text
      style={{
        fontSize: accent ? 24 : 20,
        opacity: focused || accent ? 1 : 0.45,
      }}
    >
      {glyph}
    </Text>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.ink850,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 84,
          paddingTop: 8,
          paddingBottom: 26,
        },
        tabBarActiveTintColor: colors.flameLight,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <Icon glyph="🏠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="rivals"
        options={{
          title: 'Rivals',
          tabBarIcon: ({ focused }) => <Icon glyph="⚔️" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="log"
        options={{
          title: 'Log',
          tabBarIcon: ({ focused }) => <Icon glyph="➕" focused={focused} accent />,
          tabBarAccessibilityLabel: 'Log a workout',
        }}
      />
      <Tabs.Screen
        name="challenges"
        options={{
          title: 'Battles',
          tabBarIcon: ({ focused }) => <Icon glyph="🏆" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <Icon glyph="👤" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
