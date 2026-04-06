import type { CalEvent } from './dayCalendarTypes';
import type { CalendarEvent, Task } from '../../types';

/** Fallback mock events when no iCal feeds configured */
export const MOCK_CAL_EVENTS: CalEvent[] = [
  { id: 'cal-0', title: 'Vacation in Paris', startHour: 0, duration: 24, type: 'meeting', allDay: true, busy: true },
  { id: 'cal-1', title: 'Team standup', startHour: 9, duration: 0.5, type: 'meeting', busy: true },
  { id: 'cal-2', title: 'Design review', startHour: 10, duration: 1, type: 'meeting', busy: true },
  { id: 'cal-3', title: 'Lunch w/ Sam', startHour: 12, duration: 1, type: 'personal', busy: true },
  { id: 'cal-4', title: 'Pickup kids', startHour: 16, duration: 0.5, type: 'personal', busy: true },
];

export function icalToCalEvents(events: CalendarEvent[]): CalEvent[] {
  return events.map((e, i) => {
    const start = new Date(e.start);
    const end = new Date(e.end);
    const startHour = start.getHours() + start.getMinutes() / 60;
    const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

    const allDay = e.allDay ?? (startHour === 0 && duration >= 23.9);

    return {
      id: e.mirrorDocId ? `mirror-${e.mirrorDocId}` : `ical-${i}`,
      title: e.title,
      startHour,
      duration: Math.max(duration, 0.25),
      type: 'meeting' as const,
      busy: e.busy,
      color: e.color,
      allDay,
      description: e.description,
      location: e.location,
      uid: e.uid,
      rrule: e.rrule,
      rawStart: e.rawStart,
      rawEnd: e.rawEnd,
    };
  });
}

export function calendarEventTypeForTask(task: Pick<Task, 'vital'>): CalEvent['type'] {
  return task.vital ? 'vital' : 'task';
}
