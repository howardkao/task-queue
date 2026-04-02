import type { CSSProperties } from 'react';

/**
 * Due line on task cards: "Mon, Apr 15" for date-only; "Mon, Apr 15 · 3:00 PM" when a time is set.
 * Matches TaskEditPanel date-only semantics (YYYY-MM-DD, UTC midnight ISO, local midnight).
 */
export function formatTaskDeadlineForMeta(deadline: string | null | undefined): string | null {
  if (!deadline?.trim()) return null;
  const s = deadline.trim();

  const dateOnlyYmd =
    /^\d{4}-\d{2}-\d{2}$/.test(s)
      ? s
      : /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.000)?Z$/.exec(s)?.[1] ?? null;

  const dateOpts: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  };

  if (dateOnlyYmd) {
    const d = new Date(`${dateOnlyYmd}T12:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', dateOpts);
  }

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;

  const localMidnight =
    d.getHours() === 0 &&
    d.getMinutes() === 0 &&
    d.getSeconds() === 0 &&
    d.getMilliseconds() === 0;

  const datePart = d.toLocaleDateString('en-US', dateOpts);
  if (localMidnight) return datePart;

  const timePart = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${datePart} · ${timePart}`;
}

/** Muted secondary line under task card titles (due + ↻ as one unit · project · …). */
export const collapsedTaskMetaLineStyle: CSSProperties = {
  fontSize: '12px',
  color: '#9ca3af',
  marginTop: '3px',
  lineHeight: 1.35,
};

export type CollapsedTaskMetaParts = {
  /** Due date/time text */
  deadlineLabel?: string | null;
  showRecurrence?: boolean;
  projectName?: string | null;
  /** Full segment text, e.g. “Prev: Jan 1, 3:00pm” */
  prevCompletedLabel?: string | null;
  /** Appended last (e.g. classification label on project rail cards). */
  extraTrailing?: string | null;
};

/** Due and ↻ are one segment (no dot between them); other parts joined with · */
export function formatCollapsedTaskMetaLine(parts: CollapsedTaskMetaParts): string | null {
  const segments: string[] = [];

  const due = parts.deadlineLabel?.trim() || '';
  const hasRec = !!parts.showRecurrence;
  if (due || hasRec) {
    let chunk = '';
    if (due) chunk = due;
    if (hasRec) chunk = due ? `${chunk} ↻` : '↻';
    segments.push(chunk);
  }

  if (parts.projectName?.trim()) segments.push(parts.projectName.trim());
  if (parts.prevCompletedLabel?.trim()) segments.push(parts.prevCompletedLabel.trim());
  if (parts.extraTrailing?.trim()) segments.push(parts.extraTrailing.trim());
  return segments.length > 0 ? segments.join(' · ') : null;
}
