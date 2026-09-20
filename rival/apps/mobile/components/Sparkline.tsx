import Svg, { Circle, Path } from 'react-native-svg';
import { View } from 'react-native';
import { colors } from '@/theme';

/**
 * A tiny progression line, used on PR history and profile cards.
 * Deliberately unlabelled — it sits beside the real numbers, not instead of
 * them — so it is hidden from screen readers.
 */

export function Sparkline({
  values,
  width = 120,
  height = 36,
  colour = colors.flameMid,
}: {
  values: number[];
  width?: number;
  height?: number;
  colour?: string;
}) {
  if (values.length < 2) return <View style={{ width, height }} />;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const padding = 3;

  const points = values.map((value, index) => ({
    x: padding + (index / (values.length - 1)) * (width - padding * 2),
    y: padding + (1 - (value - min) / span) * (height - padding * 2),
  }));

  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ');
  const last = points[points.length - 1]!;

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height}>
        <Path d={path} stroke={colour} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={last.x} cy={last.y} r={3} fill={colour} />
      </Svg>
    </View>
  );
}
