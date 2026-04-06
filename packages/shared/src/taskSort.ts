/**
 * Classifications that use `sortOrder` when ordering tasks of the same class
 * (aligned between web app and MCP list ordering).
 * @deprecated v2 sorts by investment group + vital/other, not classification.
 */
export const ORDERED_CLASSIFICATIONS = new Set<string>([
  'boulder',
  'rock',
  'pebble',
  'unclassified',
]);

/** @deprecated Use sortTasksByOrder for v2 sorting. */
export function sortTasksForList<T extends { classification: string; sortOrder?: number }>(
  tasks: T[],
  getCreatedMs: (t: T) => number,
): T[] {
  const ordered = ORDERED_CLASSIFICATIONS;
  return [...tasks].sort((a, b) => {
    if (a.classification === b.classification && ordered.has(a.classification)) {
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    }
    return getCreatedMs(a) - getCreatedMs(b);
  });
}

/** Simple sort by sortOrder for v2 — tasks within the same group (vital/other, within an investment). */
export function sortTasksByOrder<T extends { sortOrder?: number }>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}
