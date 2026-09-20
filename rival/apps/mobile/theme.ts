/**
 * RIVAL design tokens.
 *
 * Mirrors `apps/web/app/globals.css`. Dark-first, one accent reserved for
 * competitive signals, and big tabular numbers — a PR or a gap should be the
 * first thing the eye lands on.
 */

export const colors = {
  ink900: '#08080B',
  ink850: '#0B0B10',
  ink800: '#101018',
  ink700: '#16161F',
  ink600: '#1E1E2A',
  ink500: '#2A2A38',

  text: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.66)',
  textTertiary: 'rgba(255,255,255,0.42)',
  textFaint: 'rgba(255,255,255,0.24)',

  flame: '#FF4D2D',
  flameMid: '#FF6A3D',
  flameLight: '#FF9A3C',

  ahead: '#2FD07A',
  behind: '#FF4D5E',
  level: '#6F7BFF',
  crown: '#FFC53D',

  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',

  /** Tinted backgrounds for state pills. */
  aheadSoft: 'rgba(47,208,122,0.12)',
  behindSoft: 'rgba(255,77,94,0.12)',
  flameSoft: 'rgba(255,122,45,0.12)',
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const typography = {
  display: { fontSize: 40, fontWeight: '900', letterSpacing: -1.2, lineHeight: 42 },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
  heading: { fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  body: { fontSize: 15, fontWeight: '500' },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1.6, textTransform: 'uppercase' },
  caption: { fontSize: 13, fontWeight: '500' },
  /** Competitive figures. */
  stat: { fontSize: 34, fontWeight: '900', letterSpacing: -1.4 },
  statLarge: { fontSize: 56, fontWeight: '900', letterSpacing: -2.4 },
} as const;

/** Minimum tap target, per the platform accessibility guidelines. */
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;
export const MIN_TOUCH = 44;
