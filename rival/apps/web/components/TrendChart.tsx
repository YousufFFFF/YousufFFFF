'use client';

/**
 * A small multi-series area chart, drawn as inline SVG.
 *
 * No charting dependency: the admin dashboard needs one shape of chart, and a
 * hand-rolled path keeps the bundle small and the styling consistent with the
 * rest of the design system.
 */

export interface Series {
  key: string;
  label: string;
  colour: string;
  values: number[];
}

interface TrendChartProps {
  labels: string[];
  series: Series[];
  height?: number;
}

const PADDING = { top: 12, right: 8, bottom: 22, left: 34 };

export function TrendChart({ labels, series, height = 200 }: TrendChartProps) {
  const width = 720;
  const innerWidth = width - PADDING.left - PADDING.right;
  const innerHeight = height - PADDING.top - PADDING.bottom;

  const allValues = series.flatMap((s) => s.values);
  // A flat-zero chart still needs a scale, so floor the maximum at 1.
  const max = Math.max(1, ...allValues);
  const count = Math.max(labels.length, 2);

  const x = (index: number) => PADDING.left + (index / (count - 1)) * innerWidth;
  const y = (value: number) => PADDING.top + innerHeight - (value / max) * innerHeight;

  // Round ticks to whole numbers — these are counts, not measurements.
  const ticks = [0, Math.round(max / 2), max].filter((v, i, arr) => arr.indexOf(v) === i);

  const summary = series
    .map((s) => `${s.label}: ${s.values.reduce((sum, v) => sum + v, 0)} over ${labels.length} days`)
    .join('; ');

  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={summary}
        preserveAspectRatio="none"
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PADDING.left}
              x2={width - PADDING.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--border)"
              strokeWidth="1"
            />
            <text x={PADDING.left - 8} y={y(tick) + 4} textAnchor="end" fontSize="10" fill="var(--text-faint)">
              {tick}
            </text>
          </g>
        ))}

        {series.map((s) => {
          const line = s.values.map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(value)}`).join(' ');
          const area = `${line} L${x(s.values.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
          return (
            <g key={s.key}>
              <path d={area} fill={s.colour} opacity="0.1" />
              <path d={line} fill="none" stroke={s.colour} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })}

        {labels.length > 0 && (
          <>
            <text x={PADDING.left} y={height - 6} fontSize="10" fill="var(--text-faint)">
              {labels[0]!.slice(5)}
            </text>
            <text x={width - PADDING.right} y={height - 6} textAnchor="end" fontSize="10" fill="var(--text-faint)">
              {labels[labels.length - 1]!.slice(5)}
            </text>
          </>
        )}
      </svg>

      <figcaption style={{ display: 'flex', gap: 18, marginTop: 10, flexWrap: 'wrap' }}>
        {series.map((s) => (
          <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.colour }} aria-hidden="true" />
            {s.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
