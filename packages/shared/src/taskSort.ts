/**
 * Classifications that use `sortOrder` when ordering tasks of the same class
 * (aligned between web app and MCP list ordering).
 */
export const ORDERED_CLASSIFICATIONS = new Set<string>([
  'boulder',
  'rock',
  'pebble',
  'unclassified',
]);

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
