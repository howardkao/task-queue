/**
 * iCal parser (ical.js) for the browser — expands RRULEs for a date range.
 */

import ICAL from 'ical.js';

export interface ICalEvent {
  summary: string;
  start: Date;
  end: Date;
  transparency: string;
  isAllDay: boolean;
  description?: string;
  location?: string;
  uid?: string;
  rrule?: string;
  rawStart?: string;
  rawEnd?: string;
}

export interface ParseResult {
  events: ICalEvent[];
  warnings: string[];
}

const TIME_LIMIT_MS = 30000;

export function parseICal(text: string, rangeStart: Date, rangeEnd: Date): ParseResult {
  const startTime = Date.now();
  const jcal = ICAL.parse(text);
  const comp = new ICAL.Component(jcal);
  const events: ICalEvent[] = [];
  const warnings: string[] = [];

  const start = ICAL.Time.fromJSDate(rangeStart, true);
  const end = ICAL.Time.fromJSDate(rangeEnd, true);

  const vevents = comp.getAllSubcomponents('vevent');

  for (const vevent of vevents) {
    if (Date.now() - startTime > TIME_LIMIT_MS) {
      warnings.push('Parsing interrupted: time limit exceeded. Some events might be missing.');
      break;
    }

    const event = new ICAL.Event(vevent);

    if (event.isRecurring()) {
      const rrule = vevent.getFirstPropertyValue('rrule') as ICAL.Recur | undefined;

      if (rrule?.until && rrule.until.compare(start) < 0) continue;

      const iterator = event.iterator();
      let next: ICAL.Time | null;
      let iterations = 0;
      let skipped = 0;

      while ((next = iterator.next()) && next.compare(start) < 0) {
        skipped++;
        if (skipped > 2000) break;
      }

      if (!next) continue;

      while (next) {
        iterations++;

        if (next.compare(end) >= 0) break;

        const duration = event.duration;
        const occurrenceEnd = next.clone();
        occurrenceEnd.addDuration(duration);

        if (occurrenceEnd.compare(start) > 0) {
          events.push({
            summary: event.summary || '(No title)',
            start: next.toJSDate(),
            end: occurrenceEnd.toJSDate(),
            transparency: (vevent.getFirstPropertyValue('transp') || 'OPAQUE').toString().toUpperCase(),
            isAllDay: next.isDate,
            description: vevent.getFirstPropertyValue('description') as string | undefined,
            location: vevent.getFirstPropertyValue('location') as string | undefined,
            uid: vevent.getFirstPropertyValue('uid') as string | undefined,
            rrule: rrule?.toString(),
            rawStart: vevent.getFirstPropertyValue('dtstart')?.toString(),
            rawEnd: vevent.getFirstPropertyValue('dtend')?.toString(),
          });
        }

        if (iterations > 500) {
          warnings.push(
            `Event "${event.summary}" (UID: ${vevent.getFirstPropertyValue('uid')}) has too many occurrences in this range; skipping remaining.`,
          );
          break;
        }

        next = iterator.next();
      }
    } else {
      if (event.endDate.compare(start) <= 0 || event.startDate.compare(end) >= 0) continue;

      events.push({
        summary: event.summary || '(No title)',
        start: event.startDate.toJSDate(),
        end: event.endDate.toJSDate(),
        transparency: (vevent.getFirstPropertyValue('transp') || 'OPAQUE').toString().toUpperCase(),
        isAllDay: event.startDate.isDate,
        description: vevent.getFirstPropertyValue('description') as string | undefined,
        location: vevent.getFirstPropertyValue('location') as string | undefined,
        uid: vevent.getFirstPropertyValue('uid') as string | undefined,
        rawStart: vevent.getFirstPropertyValue('dtstart')?.toString(),
        rawEnd: vevent.getFirstPropertyValue('dtend')?.toString(),
      });
    }
  }

  return { events, warnings };
}
