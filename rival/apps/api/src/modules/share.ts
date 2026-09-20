import { fromGrams, type WeightUnit } from '@rival/core';
import { one } from '../db/index.ts';
import { ApiError } from '../lib/errors.ts';
import { getProfile } from './users.ts';

/**
 * Shareable PR cards.
 *
 * Rendered server-side as SVG so the same card is identical on iOS, Android and
 * the web, and so a share sheet has a real image to hand over. Three aspect
 * ratios cover where people actually post: stories, square posts and a compact
 * card for a chat app.
 */

export type ShareFormat = 'story' | 'square' | 'compact';

const DIMENSIONS: Record<ShareFormat, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 }, // Instagram / WhatsApp stories
  square: { width: 1080, height: 1080 }, // Instagram post
  compact: { width: 1080, height: 608 }, // link preview / chat card
};

export interface ShareCardData {
  exerciseName: string;
  value: number;
  previousValue: number | null;
  deltaGrams: number | null;
  improvementPct: number | null;
  displayName: string;
  username: string;
  unit: WeightUnit;
  achievedAt: Date;
  prType: string;
}

export async function loadShareCard(userId: string, prHistoryId: string): Promise<ShareCardData> {
  const row = await one<{
    exercise_name: string;
    value: number;
    previous_value: number | null;
    improvement_pct: number | null;
    achieved_at: Date;
    pr_type: string;
  }>(
    `SELECT e.name AS exercise_name, h.value, h.previous_value, h.improvement_pct, h.achieved_at, h.pr_type
       FROM pr_history h JOIN exercises e ON e.id = h.exercise_id
      WHERE h.id = $1 AND h.user_id = $2`,
    [prHistoryId, userId],
  );
  if (!row) throw ApiError.notFound('PR not found.');

  const profile = await getProfile(userId);
  const value = Number(row.value);
  const previous = row.previous_value === null ? null : Number(row.previous_value);

  return {
    exerciseName: row.exercise_name,
    value,
    previousValue: previous,
    deltaGrams: previous === null ? null : value - previous,
    improvementPct: row.improvement_pct,
    displayName: profile.display_name,
    username: profile.username,
    unit: profile.preferred_unit,
    achievedAt: row.achieved_at,
    prType: row.pr_type,
  };
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (char) => {
    switch (char) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      default:
        return '&quot;';
    }
  });
}

/**
 * The card. Dark, one enormous number, the delta underneath — the same visual
 * hierarchy the app uses, so a shared card is recognisably RIVAL.
 */
export function renderShareCard(data: ShareCardData, format: ShareFormat = 'story'): string {
  const { width, height } = DIMENSIONS[format];
  const cx = width / 2;

  // A story has room to breathe; the compact card has to stay tight.
  const scale = format === 'story' ? 1 : format === 'square' ? 0.82 : 0.62;
  const centre = format === 'story' ? height * 0.46 : height * 0.5;

  const isWeight = data.prType === 'weight' || data.prType === 'e1rm';
  const headline = isWeight ? `${fromGrams(data.value, data.unit)}` : `${data.value}`;
  const unitLabel = isWeight ? data.unit.toUpperCase() : data.prType === 'reps' ? 'REPS' : '';
  const delta =
    data.deltaGrams === null
      ? 'FIRST RECORD'
      : isWeight
        ? `+${fromGrams(data.deltaGrams, data.unit)} ${data.unit.toUpperCase()}`
        : `+${data.deltaGrams}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(`New ${data.exerciseName} personal record: ${headline} ${unitLabel}`)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0B0B0F"/>
      <stop offset="55%" stop-color="#101018"/>
      <stop offset="100%" stop-color="#16101C"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#FF4D2D"/>
      <stop offset="100%" stop-color="#FF9A3C"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="42%" r="55%">
      <stop offset="0%" stop-color="#FF4D2D" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#FF4D2D" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>

  <text x="${cx}" y="${centre - 300 * scale}" text-anchor="middle"
        font-family="Inter, Helvetica, Arial, sans-serif" font-size="${44 * scale}" font-weight="800"
        letter-spacing="${18 * scale}" fill="#FFFFFF" opacity="0.92">RIVAL</text>

  <text x="${cx}" y="${centre - 190 * scale}" text-anchor="middle"
        font-family="Inter, Helvetica, Arial, sans-serif" font-size="${40 * scale}" font-weight="700"
        letter-spacing="${8 * scale}" fill="url(#accent)">NEW PR</text>

  <text x="${cx}" y="${centre - 100 * scale}" text-anchor="middle"
        font-family="Inter, Helvetica, Arial, sans-serif" font-size="${52 * scale}" font-weight="700"
        letter-spacing="${4 * scale}" fill="#FFFFFF" opacity="0.72">${escapeXml(data.exerciseName.toUpperCase())}</text>

  <text x="${cx}" y="${centre + 90 * scale}" text-anchor="middle"
        font-family="Inter, Helvetica, Arial, sans-serif" font-size="${220 * scale}" font-weight="900"
        fill="#FFFFFF">${escapeXml(headline)}</text>

  <text x="${cx}" y="${centre + 160 * scale}" text-anchor="middle"
        font-family="Inter, Helvetica, Arial, sans-serif" font-size="${56 * scale}" font-weight="800"
        letter-spacing="${10 * scale}" fill="#FFFFFF" opacity="0.7">${escapeXml(unitLabel)}</text>

  <rect x="${cx - 150 * scale}" y="${centre + 210 * scale}" width="${300 * scale}" height="${76 * scale}"
        rx="${38 * scale}" fill="url(#accent)"/>
  <text x="${cx}" y="${centre + 262 * scale}" text-anchor="middle"
        font-family="Inter, Helvetica, Arial, sans-serif" font-size="${38 * scale}" font-weight="800"
        fill="#0B0B0F">${escapeXml(delta)}</text>

  <text x="${cx}" y="${centre + 380 * scale}" text-anchor="middle"
        font-family="Inter, Helvetica, Arial, sans-serif" font-size="${46 * scale}" font-weight="700"
        fill="#FFFFFF" opacity="0.9">${escapeXml(data.displayName.toUpperCase())}</text>

  <text x="${cx}" y="${centre + 450 * scale}" text-anchor="middle"
        font-family="Inter, Helvetica, Arial, sans-serif" font-size="${34 * scale}" font-weight="600"
        letter-spacing="${3 * scale}" fill="#FFFFFF" opacity="0.5">WHO&#8217;S TAKING IT NEXT?</text>
</svg>`;
}

export function shareCaption(data: ShareCardData): string {
  const isWeight = data.prType === 'weight' || data.prType === 'e1rm';
  const value = isWeight ? `${fromGrams(data.value, data.unit)} ${data.unit}` : `${data.value} reps`;
  const delta =
    data.deltaGrams !== null && isWeight ? ` (+${fromGrams(data.deltaGrams, data.unit)} ${data.unit})` : '';
  return `New ${data.exerciseName} PR: ${value}${delta}. Who's taking it next? #RIVAL`;
}

export { DIMENSIONS as SHARE_DIMENSIONS };
