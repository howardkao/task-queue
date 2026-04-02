import type { CSSProperties } from 'react';

/**
 * Calendar feed colors: bg, title (`border`), meta + card stroke (`foreground`).
 * HSL channels only (no hsl() wrapper) — matches :root in index.css.
 */
export type CalendarFeedColorId =
  | 'high'
  | 'med'
  | 'low'
  | 'sage'
  | 'lavender'
  | 'teal'
  | 'warm'
  | 'neutral'
  | 'rose'
  | 'sky'
  | 'grayscale';

export type CalendarFeedPaletteEntry = {
  id: CalendarFeedColorId;
  label: string;
  /** Card background */
  bg: string;
  /** Event title color */
  border: string;
  /** Meta text and 1px card border (stroke) */
  foreground: string;
};

export const CALENDAR_FEED_PALETTE: Record<CalendarFeedColorId, Omit<CalendarFeedPaletteEntry, 'id' | 'label'>> = {
  high: { bg: '0 60% 85%', border: '0 60% 30%', foreground: '0 72% 58%' },
  med: { bg: '38 70% 82%', border: '30 60% 28%', foreground: '38 92% 50%' },
  low: { bg: '210 45% 84%', border: '210 50% 28%', foreground: '210 60% 55%' },
  sage: { bg: '145 30% 92%', border: '145 25% 28%', foreground: '145 22% 80%' },
  lavender: { bg: '260 35% 94%', border: '260 30% 30%', foreground: '260 25% 82%' },
  teal: { bg: '180 30% 92%', border: '180 28% 26%', foreground: '180 22% 80%' },
  warm: { bg: '30 20% 93%', border: '30 15% 35%', foreground: '30 14% 82%' },
  neutral: { bg: '220 10% 95%', border: '220 10% 40%', foreground: '220 8% 86%' },
  rose: { bg: '330 38% 93%', border: '330 32% 30%', foreground: '330 28% 82%' },
  sky: { bg: '205 48% 91%', border: '205 55% 28%', foreground: '205 38% 80%' },
  grayscale: { bg: '0 0% 94%', border: '0 0% 36%', foreground: '0 0% 80%' },
};

const FEED_COLOR_ROWS: [CalendarFeedColorId, string][] = [
  ['high', 'Priority high'],
  ['med', 'Priority med'],
  ['low', 'Priority low'],
  ['sage', 'Sage'],
  ['lavender', 'Lavender'],
  ['teal', 'Teal'],
  ['warm', 'Warm sand'],
  ['neutral', 'Neutral'],
  ['rose', 'Rose'],
  ['sky', 'Sky'],
  ['grayscale', 'Grayscale'],
];

/** All palette entries (feeds may still store high/med/low from before). */
export const CALENDAR_FEED_COLOR_OPTIONS: CalendarFeedPaletteEntry[] = FEED_COLOR_ROWS.map(
  ([id, label]) => ({ id, label, ...CALENDAR_FEED_PALETTE[id] }),
);

const PICKER_EXCLUDED: Set<CalendarFeedColorId> = new Set(['high', 'med', 'low']);

/** Calendar settings color swatches only (priority tiers reserved for task cards). */
export const CALENDAR_FEED_PICKER_OPTIONS: CalendarFeedPaletteEntry[] =
  CALENDAR_FEED_COLOR_OPTIONS.filter((o) => !PICKER_EXCLUDED.has(o.id));

const PALETTE_IDS = new Set<string>(
  (Object.keys(CALENDAR_FEED_PALETTE) as CalendarFeedColorId[]).map((k) => k),
);

/** Old Google-style hex presets → closest semantic id */
const LEGACY_HEX_TO_ID: Record<string, CalendarFeedColorId> = {
  '#4285f4': 'low',
  '#ea4335': 'high',
  '#34a853': 'sage',
  '#fbbc04': 'med',
  '#ff6d01': 'warm',
  '#a142f4': 'lavender',
  '#e91e63': 'rose',
  '#00bcd4': 'teal',
};

export function normalizeFeedColorId(stored: string | undefined | null): CalendarFeedColorId {
  if (!stored) return 'neutral';
  if (PALETTE_IDS.has(stored)) return stored as CalendarFeedColorId;
  const hex = stored.trim().toLowerCase();
  return LEGACY_HEX_TO_ID[hex] ?? 'neutral';
}

export function hsl(channels: string): string {
  return `hsl(${channels})`;
}

/** Inline styles for calendar event blocks (external / iCal). */
export function getCalendarEventChrome(storedColor: string | undefined | null): {
  background: string;
  border: string;
  titleColor: string;
  metaColor: string;
} {
  const id = normalizeFeedColorId(storedColor);
  const p = CALENDAR_FEED_PALETTE[id];
  return {
    background: hsl(p.bg),
    border: `1px solid ${hsl(p.foreground)}`,
    titleColor: hsl(p.border),
    metaColor: hsl(p.foreground),
  };
}

/** Placed boulder/rock/pebble blocks: priority-high palette + dashed stroke. */
export function getPlacedTaskCalendarChrome(): {
  background: string;
  border: string;
  titleColor: string;
  metaColor: string;
} {
  const p = CALENDAR_FEED_PALETTE.high;
  return {
    background: hsl(p.bg),
    border: `1px dashed ${hsl(p.foreground)}`,
    titleColor: hsl(p.border),
    metaColor: hsl(p.foreground),
  };
}

/** Swatch preview: fill = bg; ring = stroke (same as meta / card border) */
export function getCalendarFeedSwatchStyle(id: CalendarFeedColorId): CSSProperties {
  const p = CALENDAR_FEED_PALETTE[id];
  return {
    background: hsl(p.bg),
    border: `2px solid ${hsl(p.foreground)}`,
  };
}
