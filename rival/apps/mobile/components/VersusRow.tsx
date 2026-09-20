import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '@/theme';
import { Label, Stat, Type } from './ui';

/**
 * The head-to-head row: you, the blades, them.
 *
 * This shape appears on the home screen, the rivals list, the rivalry detail
 * and catch-up mode, so it lives here rather than being re-laid-out five times.
 * The losing side is tinted red — but the numbers themselves always carry the
 * meaning, so colour is never the only signal.
 */

interface VersusRowProps {
  youLabel: string;
  rivalLabel: string;
  youValue: string | number;
  rivalValue: string | number;
  unit?: string;
  leader: 'you' | 'rival' | 'tie';
  large?: boolean;
}

export function VersusRow({
  youLabel,
  rivalLabel,
  youValue,
  rivalValue,
  unit,
  leader,
  large,
}: VersusRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.side}>
        <Label>{youLabel}</Label>
        <Stat
          value={youValue}
          unit={unit}
          large={large}
          colour={leader === 'rival' ? colors.behind : colors.text}
        />
      </View>

      <Type variant="heading" colour={colors.textFaint} style={styles.blades}>
        ⚔️
      </Type>

      <View style={[styles.side, styles.sideRight]}>
        <Label>{rivalLabel}</Label>
        <Stat
          value={rivalValue}
          unit={unit}
          large={large}
          colour={leader === 'you' ? colors.behind : colors.text}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  side: { flex: 1, gap: 2 },
  sideRight: { alignItems: 'flex-end' },
  blades: { opacity: 0.5 },
});
