import { useLayoutEffect, useRef } from 'react';

function escapeForAttributeSelector(id: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(id);
  }
  return id.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * When `expandedTaskId` is set, keeps the task row at the same viewport Y inside `scrollContainerRef`
 * across list reflows (autosave changing vital/investment/deadline ordering, due-soon section, etc.).
 */
export function usePreserveExpandedTaskRowScroll(
  expandedTaskId: string | null,
  getScrollContainer: () => HTMLElement | null,
  /** Changes whenever list structure / task data that affects layout should re-anchor. */
  layoutSignal: unknown,
): void {
  const lastRowTopRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (!expandedTaskId) {
      lastRowTopRef.current = null;
      return;
    }
    const container = getScrollContainer();
    if (!container) {
      lastRowTopRef.current = null;
      return;
    }
    const el = container.querySelector(
      `[data-task-row-id="${escapeForAttributeSelector(expandedTaskId)}"]`,
    ) as HTMLElement | null;
    if (!el) {
      lastRowTopRef.current = null;
      return;
    }
    const top = el.getBoundingClientRect().top;
    const last = lastRowTopRef.current;
    if (last != null) {
      const delta = top - last;
      if (Math.abs(delta) > 0.5) {
        container.scrollTop += delta;
      }
    }
    lastRowTopRef.current = el.getBoundingClientRect().top;
  }, [expandedTaskId, layoutSignal, getScrollContainer]);
}
