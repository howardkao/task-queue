import type { MouseEvent as ReactMouseEvent } from 'react';

/**
 * True when the click target is inside a control that should keep an expanded
 * task header from treating the click as "collapse" (fields, buttons, drag handle, etc.).
 */
export function isExpandedTaskHeaderInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('[data-task-card-drag-handle]')) return true;
  return !!target.closest(
    'button, input, textarea, select, option, label, a[href], [contenteditable="true"], [role="button"]',
  );
}

/** Collapse when the expanded card header is clicked outside interactive controls. */
export function onExpandedTaskHeaderBackgroundClick(
  e: ReactMouseEvent,
  isExpanded: boolean,
  onCollapse: () => void,
): void {
  if (!isExpanded) return;
  if (isExpandedTaskHeaderInteractiveTarget(e.target)) return;
  onCollapse();
}
