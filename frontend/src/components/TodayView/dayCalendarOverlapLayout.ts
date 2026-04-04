import type { CalEvent } from './dayCalendarTypes';

/** Lower = placed first in column assignment → tends toward smaller column index (left). */
const LANE_PRIORITY: Record<CalEvent['type'], number> = {
  boulder: 0,
  rock: 1,
  pebble: 2,
  meeting: 3,
  personal: 4,
};

export interface TimedEventLane {
  column: number;
  columnCount: number;
}

function eventBounds(e: CalEvent): { start: number; end: number } {
  return { start: e.startHour, end: e.startHour + e.duration };
}

function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function eventsOverlap(a: CalEvent, b: CalEvent): boolean {
  const A = eventBounds(a);
  const B = eventBounds(b);
  return intervalsOverlap(A.start, A.end, B.start, B.end);
}

function isExternalCalEventType(t: CalEvent['type']): boolean {
  return t === 'meeting' || t === 'personal';
}

function findOverlapComponents(events: CalEvent[]): CalEvent[][] {
  const visited = new Set<string>();
  const components: CalEvent[][] = [];

  const neighbors = (e: CalEvent) =>
    events.filter((o) => o.id !== e.id && eventsOverlap(e, o));

  for (const e of events) {
    if (visited.has(e.id)) continue;
    const stack = [e];
    const comp: CalEvent[] = [];
    visited.add(e.id);
    while (stack.length) {
      const cur = stack.pop()!;
      comp.push(cur);
      for (const n of neighbors(cur)) {
        if (!visited.has(n.id)) {
          visited.add(n.id);
          stack.push(n);
        }
      }
    }
    components.push(comp);
  }
  return components;
}

/**
 * Assign columns within one overlap component: placed tasks claim lanes before GCal events.
 * Among external (meeting / personal) events, shorter blocks are placed first so very long
 * events tend to the right, regardless of calendar subtype or slightly different start times.
 */
function assignLanesInComponent(events: CalEvent[]): Map<string, number> {
  const sorted = [...events].sort((a, b) => {
    const aExt = isExternalCalEventType(a.type);
    const bExt = isExternalCalEventType(b.type);
    if (aExt !== bExt) return aExt ? 1 : -1;

    if (!aExt && !bExt) {
      const p = LANE_PRIORITY[a.type] - LANE_PRIORITY[b.type];
      if (p !== 0) return p;
      if (a.startHour !== b.startHour) return a.startHour - b.startHour;
      return b.duration - a.duration;
    }

    if (a.duration !== b.duration) return a.duration - b.duration;
    if (a.startHour !== b.startHour) return a.startHour - b.startHour;
    return LANE_PRIORITY[a.type] - LANE_PRIORITY[b.type];
  });

  const placed: { start: number; end: number; col: number }[] = [];
  const map = new Map<string, number>();

  for (const e of sorted) {
    const { start, end } = eventBounds(e);
    const taken = new Set<number>();
    for (const p of placed) {
      if (intervalsOverlap(start, end, p.start, p.end)) {
        taken.add(p.col);
      }
    }
    let col = 0;
    while (taken.has(col)) col++;
    map.set(e.id, col);
    placed.push({ start, end, col });
  }
  return map;
}

/**
 * Google Calendar–style columns: each timed event gets a lane within its overlap cluster.
 * Lane order favors boulders, then rocks, then pebbles; then iCal events by increasing duration.
 */
export function computeTimedEventOverlapLayout(events: CalEvent[]): Map<string, TimedEventLane> {
  const result = new Map<string, TimedEventLane>();
  const components = findOverlapComponents(events);

  for (const comp of components) {
    const colById = assignLanesInComponent(comp);
    let columnCount = 0;
    for (const id of colById.keys()) {
      columnCount = Math.max(columnCount, (colById.get(id) ?? 0) + 1);
    }
    if (columnCount === 0) columnCount = 1;

    for (const id of colById.keys()) {
      result.set(id, { column: colById.get(id) ?? 0, columnCount });
    }
  }
  return result;
}
