import { StyleSheet, View } from 'react-native';
import type { CalendarDay } from '@rival/api-client';
import { colors, radius, spacing } from '@/theme';
import { Type } from './ui';

/**
 * A week of attendance.
 *
 * Three states, not two: trained, planned rest, and missed. Rest days are drawn
 * as a neutral dash rather than a cross — a planned rest is not a failure, and
 * the UI should not imply it is.
 */

const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function WeekStrip({ days }: { days: CalendarDay[] }) {
  return (
    <View style={styles.strip}>
      {days.map((day) => {
        const weekday = new Date(`${day.date}T00:00:00Z`).getUTCDay();
        const state = day.trained ? 'trained' : day.rest ? 'rest' : 'missed';
        return (
          <View
            key={day.date}
            style={styles.day}
            accessible
            accessibilityLabel={`${day.date}: ${state === 'trained' ? 'trained' : state === 'rest' ? 'planned rest day' : 'no workout'}`}
          >
            <Type variant="caption" colour={colors.textFaint} style={styles.weekday}>
              {WEEKDAY[weekday]}
            </Type>
            <View style={[styles.dot, state === 'trained' && styles.dotTrained, state === 'rest' && styles.dotRest]}>
              <Type variant="caption" colour={state === 'trained' ? '#150904' : colors.textFaint} style={styles.mark}>
                {state === 'trained' ? '✓' : state === 'rest' ? '–' : ''}
              </Type>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  day: { flex: 1, alignItems: 'center', gap: 6 },
  weekday: { fontSize: 10, fontWeight: '700' },
  dot: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.ink700,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotTrained: { backgroundColor: colors.flame, borderColor: 'transparent' },
  dotRest: { backgroundColor: colors.ink600 },
  mark: { fontSize: 13, fontWeight: '900' },
});
