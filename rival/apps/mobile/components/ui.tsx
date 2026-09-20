import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextProps,
  type TextStyle,
  View,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { colors, MIN_TOUCH, radius, spacing, typography } from '@/theme';

/**
 * The shared UI kit.
 *
 * Every screen is assembled from these, so a change to the visual language
 * happens in one place. Each one keeps the accessibility basics: real minimum
 * tap targets, roles on interactive elements, and labels on anything whose
 * meaning is carried by colour alone.
 */

// ── text ─────────────────────────────────────────────────────────────────

type Variant = keyof typeof typography;

interface TypeProps extends TextProps {
  variant?: Variant;
  colour?: string;
  align?: TextStyle['textAlign'];
  children: ReactNode;
}

export function Type({ variant = 'body', colour = colors.text, align, style, children, ...rest }: TypeProps) {
  return (
    <Text style={[typography[variant] as TextStyle, { color: colour, textAlign: align }, style]} {...rest}>
      {children}
    </Text>
  );
}

export function Label({ children, colour = colors.textTertiary, style, ...rest }: Omit<TypeProps, 'variant'>) {
  return (
    <Type variant="label" colour={colour} style={style} {...rest}>
      {children}
    </Type>
  );
}

/**
 * A competitive figure. Tabular so the digits do not shift as the number
 * changes — which they do constantly on the home and rivalry screens.
 */
export function Stat({
  value,
  unit,
  large,
  colour = colors.text,
}: {
  value: string | number;
  unit?: string;
  large?: boolean;
  colour?: string;
}) {
  return (
    <View style={styles.statRow}>
      <Text
        style={[
          (large ? typography.statLarge : typography.stat) as TextStyle,
          { color: colour, fontVariant: ['tabular-nums'] },
        ]}
      >
        {value}
      </Text>
      {unit ? (
        <Text style={[styles.statUnit, { color: colour }]} allowFontScaling>
          {unit}
        </Text>
      ) : null}
    </View>
  );
}

// ── containers ───────────────────────────────────────────────────────────

interface CardProps extends ViewProps {
  children: ReactNode;
  padded?: boolean;
  glow?: boolean;
}

export function Card({ children, padded = true, glow, style, ...rest }: CardProps) {
  return (
    <View style={[styles.card, padded && styles.cardPadded, glow && styles.cardGlow, style]} {...rest}>
      {children}
    </View>
  );
}

export function Screen({
  children,
  scroll = true,
  refreshControl,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshControl?: React.ComponentProps<typeof ScrollView>['refreshControl'];
  contentStyle?: ViewStyle;
}) {
  if (!scroll) return <View style={[styles.screen, contentStyle]}>{children}</View>;
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.screenContent, contentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  );
}

export function Row({ children, gap = spacing.sm, style, ...rest }: ViewProps & { children: ReactNode; gap?: number }) {
  return (
    <View style={[styles.row, { gap }, style]} {...rest}>
      {children}
    </View>
  );
}

export function Spacer({ size = spacing.lg }: { size?: number }) {
  return <View style={{ height: size }} />;
}

export function Divider() {
  return <View style={styles.divider} />;
}

// ── controls ─────────────────────────────────────────────────────────────

export type ButtonTone = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  full?: boolean;
  accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  tone = 'primary',
  disabled,
  loading,
  small,
  full = true,
  accessibilityHint,
}: ButtonProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        full && styles.buttonFull,
        toneStyles[tone],
        pressed && !inactive && styles.buttonPressed,
        inactive && styles.buttonDisabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tone === 'primary' ? '#150904' : colors.text} />
      ) : (
        <Text style={[styles.buttonLabel, small && styles.buttonLabelSmall, toneLabelStyles[tone]]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Pill({
  label,
  tone = 'neutral',
  icon,
}: {
  label: string;
  tone?: 'neutral' | 'ahead' | 'behind' | 'accent' | 'crown';
  icon?: string;
}) {
  return (
    <View style={[styles.pill, pillTones[tone]]}>
      {icon ? <Text style={styles.pillIcon}>{icon}</Text> : null}
      <Text style={[styles.pillLabel, pillLabelTones[tone]]}>{label}</Text>
    </View>
  );
}

/**
 * A progress track. `label` is required so the bar is not the only way to read
 * the value — colour and width alone are not accessible.
 */
export function ProgressBar({
  value,
  label,
  tone = 'flame',
}: {
  value: number;
  label: string;
  tone?: 'flame' | 'rival';
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped), text: label }}
      style={styles.progressTrack}
    >
      <View
        style={[
          styles.progressFill,
          { width: `${clamped}%`, backgroundColor: tone === 'flame' ? colors.flameMid : colors.level },
        ]}
      />
    </View>
  );
}

// ── states ───────────────────────────────────────────────────────────────

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <View style={styles.stateBox} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={colors.flameMid} />
    </View>
  );
}

/** Skeleton rows, for lists where the shape is known before the data. */
export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <Card>
      {Array.from({ length: lines }).map((_, index) => (
        <View
          key={index}
          style={[styles.skeleton, { width: index === 0 ? '55%' : '85%', marginTop: index === 0 ? 0 : spacing.sm }]}
        />
      ))}
    </Card>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card style={styles.stateCard}>
      <Text style={styles.stateIcon}>⚠️</Text>
      <Type variant="heading" align="center">
        Something went wrong
      </Type>
      <Type variant="caption" colour={colors.textSecondary} align="center" style={styles.stateBody}>
        {message}
      </Type>
      {onRetry ? <Button label="Try again" tone="secondary" onPress={onRetry} /> : null}
    </Card>
  );
}

export function EmptyState({
  icon = '⚔️',
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon?: string;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Card style={styles.stateCard}>
      <Text style={styles.stateIcon}>{icon}</Text>
      <Type variant="heading" align="center">
        {title}
      </Type>
      <Type variant="caption" colour={colors.textSecondary} align="center" style={styles.stateBody}>
        {body}
      </Type>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} /> : null}
    </Card>
  );
}

// ── avatar ───────────────────────────────────────────────────────────────

export function Avatar({ name, size = 40, tone }: { name: string; size?: number; tone?: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: tone ?? colors.ink600 },
      ]}
      accessibilityLabel={name}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink900 },
  screenContent: { padding: spacing.lg, paddingBottom: spacing.xxl * 2, gap: spacing.md },

  card: {
    backgroundColor: colors.ink800,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPadded: { padding: spacing.lg },
  cardGlow: { borderColor: 'rgba(255,122,45,0.35)' },

  row: { flexDirection: 'row', alignItems: 'center' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },

  statRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  statUnit: { fontSize: 13, fontWeight: '800', opacity: 0.6 },

  button: {
    minHeight: MIN_TOUCH + 4,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  buttonSmall: { minHeight: MIN_TOUCH, paddingHorizontal: spacing.lg },
  buttonFull: { alignSelf: 'stretch' },
  buttonPressed: { opacity: 0.85, transform: [{ translateY: 1 }] },
  buttonDisabled: { opacity: 0.45 },
  buttonLabel: { fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  buttonLabelSmall: { fontSize: 13.5 },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  pillIcon: { fontSize: 11 },
  pillLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.9, textTransform: 'uppercase' },

  progressTrack: {
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.ink600,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: radius.pill },

  stateBox: { paddingVertical: spacing.xxl, alignItems: 'center' },
  stateCard: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  stateIcon: { fontSize: 34, marginBottom: spacing.xs },
  stateBody: { maxWidth: 280, marginBottom: spacing.sm },

  skeleton: { height: 13, borderRadius: 6, backgroundColor: colors.ink600 },

  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.text, fontWeight: '800' },
});

const toneStyles: Record<ButtonTone, ViewStyle> = {
  primary: { backgroundColor: colors.flame },
  secondary: { backgroundColor: colors.ink700, borderColor: colors.borderStrong },
  ghost: { backgroundColor: 'transparent', borderColor: colors.borderStrong },
  danger: { backgroundColor: colors.behindSoft, borderColor: 'rgba(255,77,94,0.35)' },
};

const toneLabelStyles: Record<ButtonTone, TextStyle> = {
  primary: { color: '#150904' },
  secondary: { color: colors.text },
  ghost: { color: colors.textSecondary },
  danger: { color: colors.behind },
};

const pillTones: Record<string, ViewStyle> = {
  neutral: { backgroundColor: colors.ink700, borderColor: colors.border },
  ahead: { backgroundColor: colors.aheadSoft, borderColor: 'rgba(47,208,122,0.3)' },
  behind: { backgroundColor: colors.behindSoft, borderColor: 'rgba(255,77,94,0.3)' },
  accent: { backgroundColor: colors.flameSoft, borderColor: 'rgba(255,122,45,0.35)' },
  crown: { backgroundColor: 'rgba(255,197,61,0.12)', borderColor: 'rgba(255,197,61,0.35)' },
};

const pillLabelTones: Record<string, TextStyle> = {
  neutral: { color: colors.textSecondary },
  ahead: { color: colors.ahead },
  behind: { color: colors.behind },
  accent: { color: colors.flameLight },
  crown: { color: colors.crown },
};
