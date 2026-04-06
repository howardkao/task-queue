import { getCalendarEventChrome } from '../../theme/calendarFeedPalette';
import { SNAP } from './dayCalendarConstants';
import type { CalEvent } from './dayCalendarTypes';

export function snapToGrid(hour: number): number {
  return Math.round(hour / SNAP) * SNAP;
}

export function isPlacedTaskEventType(type: CalEvent['type']): boolean {
  return type === 'vital' || type === 'task';
}

export function externalCalendarChrome(event: CalEvent) {
  if (isPlacedTaskEventType(event.type)) return null;
  return getCalendarEventChrome(event.color);
}

export function formatTimeLabel(h: number): string {
  const hour = Math.floor(h);
  const isHalf = h % 1 !== 0;
  if (isHalf) return '';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  const ampm = hour >= 12 ? 'pm' : 'am';
  return `${displayHour}:00${ampm}`;
}

export function formatHourMinute(h: number): string {
  const hour = Math.floor(h);
  const min = Math.round((h - hour) * 60);
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  const ampm = hour >= 12 ? 'pm' : 'am';
  return `${displayHour}:${min.toString().padStart(2, '0')}${ampm}`;
}

/**
 * Find the first free slot of given duration in hours.
 */
export function findFreeSlot(
  events: CalEvent[],
  durationHours: number = 2,
  startHour: number = 8,
  endHour: number = 22,
): number {
  const busyEvents = events.filter((e) => e.busy !== false && !isPlacedTaskEventType(e.type));
  const busy = new Set<number>();
  for (const ev of busyEvents) {
    for (let t = ev.startHour; t < ev.startHour + ev.duration; t += SNAP) {
      busy.add(Math.round(t * 4) / 4);
    }
  }

  const slotsNeeded = durationHours * 4;
  for (let t = startHour; t <= endHour - durationHours; t += SNAP) {
    let free = true;
    for (let i = 0; i < slotsNeeded; i++) {
      if (busy.has(Math.round((t + i * SNAP) * 4) / 4)) {
        free = false;
        break;
      }
    }
    if (free) return t;
  }

  return 13;
}
