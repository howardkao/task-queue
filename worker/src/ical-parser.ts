/**
 * iCal parser for Cloudflare Workers using ical.js.
 * Handles recurring events (RRULE), timezone conversion, and TRANSP.
 */

import ICAL from 'ical.js';

export interface ICalEvent {
  summary: string;
  start: Date;
  end: Date;
  transparency: string; // OPAQUE or TRANSPARENT
  isAllDay: boolean;
  description?: string;
  location?: string;
  uid?: string;
  rrule?: string;
  rawStart?: string;
  rawEnd?: string;
}

/**
 * Parse iCal text and expand recurring events for a given date range.
 * Returns all event occurrences that overlap [rangeStart, rangeEnd).
 */
export function parseICal(text: string, rangeStart: Date, rangeEnd: Date): ICalEvent[] {
  const jcal = ICAL.parse(text);
  const comp = new ICAL.Component(jcal);
  const events: ICalEvent[] = [];

  const start = ICAL.Time.fromJSDate(rangeStart, true);
  const end = ICAL.Time.fromJSDate(rangeEnd, true);

  const vevents = comp.getAllSubcomponents('vevent');

  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);
    const transp = (vevent.getFirstPropertyValue('transp') || 'OPAQUE').toString().toUpperCase();
    const summary = event.summary || '(No title)';
    const isAllDay = event.startDate.isDate;
    const description = vevent.getFirstPropertyValue('description') as string | undefined;
    const location = vevent.getFirstPropertyValue('location') as string | undefined;
    const uid = vevent.getFirstPropertyValue('uid') as string | undefined;
    const rrule = vevent.getFirstPropertyValue('rrule')?.toString();
    const rawStart = vevent.getFirstPropertyValue('dtstart')?.toString();
    const rawEnd = vevent.getFirstPropertyValue('dtend')?.toString();

    if (event.isRecurring()) {
      // Expand recurring event starting from our range start to save CPU.
      // We must not pass a start date earlier than the event's actual start date,
      // as some versions of ical.js may anchor the recurrence incorrectly.
      const iterStart = start.compare(event.startDate) > 0 ? start : event.startDate;
      const iterator = event.iterator(iterStart);
      let next: ICAL.Time | null;
      let count = 0;
      const MAX_ITERATIONS = 1000; // expansion is cheaper with fast-forward

      while ((next = iterator.next()) && count < MAX_ITERATIONS) {
        count++;

        // Safety: ensure occurrence is not before the event's intended start
        if (next.compare(event.startDate) < 0) continue;

        // Stop if we've gone past the range
        if (next.compare(end) >= 0) break;

        const duration = event.duration;
        const occurrenceEnd = next.clone();
        occurrenceEnd.addDuration(duration);

        // Skip if occurrence ends before range starts
        if (occurrenceEnd.compare(start) <= 0) continue;

        events.push({
          summary,
          start: next.toJSDate(),
          end: occurrenceEnd.toJSDate(),
          transparency: transp,
          isAllDay: next.isDate,
          description,
          location,
          uid,
          rrule,
          rawStart,
          rawEnd,
        });
      }
    } else {
      // Single event — check if it overlaps the range
      const dtstart = event.startDate;
      const dtend = event.endDate;

      // Skip if it ends before the range starts OR starts after the range ends
      if (dtend.compare(start) <= 0 || dtstart.compare(end) >= 0) continue;

      // Additional safety: skip if it's completely in the future relative to its own start
      // (This handles weirdly malformed iCal entries)
      if (dtstart.compare(event.startDate) < 0) continue;

      events.push({
        summary,
        start: dtstart.toJSDate(),
        end: dtend.toJSDate(),
        transparency: transp,
        isAllDay,
        description,
        location,
        uid,
        rrule,
        rawStart,
        rawEnd,
      });
    }
  }

  return events;
}
