import type { CSSProperties } from 'react';

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
