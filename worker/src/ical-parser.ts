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

    if (event.isRecurring()) {
      // Expand recurring event within our date range
      const iterator = event.iterator();
      let next: ICAL.Time | null;
      let count = 0;
      const MAX_ITERATIONS = 500; // safety limit

      while ((next = iterator.next()) && count < MAX_ITERATIONS) {
        count++;
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
        });
      }
    } else {
      // Single event — check if it overlaps the range
      const dtstart = event.startDate;
      const dtend = event.endDate;

      if (dtend.compare(start) <= 0 || dtstart.compare(end) >= 0) continue;

      events.push({
        summary,
        start: dtstart.toJSDate(),
        end: dtend.toJSDate(),
        transparency: transp,
      });
    }
  }

  return events;
}
