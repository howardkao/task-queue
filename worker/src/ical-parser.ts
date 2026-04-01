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
    
    // Quick skip for recurring: if it has an UNTIL date that is in the past
    if (event.isRecurring()) {
      const until = vevent.getFirstPropertyValue('until') as ICAL.Time | undefined;
      if (until && until.compare(start) < 0) continue;
    } else {
      // Single event: skip if it doesn't overlap the range
      if (event.endDate.compare(start) <= 0 || event.startDate.compare(end) >= 0) continue;
    }

    const summary = event.summary || '(No title)';
    const transp = (vevent.getFirstPropertyValue('transp') || 'OPAQUE').toString().toUpperCase();
    const isAllDay = event.startDate.isDate;
    const uid = vevent.getFirstPropertyValue('uid') as string | undefined;

    if (event.isRecurring()) {
      // Fast-forward to the range start, but never before the event's actual start date.
      const iterStart = start.compare(event.startDate) > 0 ? start : event.startDate;
      const iterator = event.iterator(iterStart);
      let next: ICAL.Time | null;
      let count = 0;
      const MAX_ITERATIONS = 200; // Limit per-event expansion to save CPU

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
          description: vevent.getFirstPropertyValue('description') as string | undefined,
          location: vevent.getFirstPropertyValue('location') as string | undefined,
          uid,
          rrule: vevent.getFirstPropertyValue('rrule')?.toString(),
          rawStart: vevent.getFirstPropertyValue('dtstart')?.toString(),
          rawEnd: vevent.getFirstPropertyValue('dtend')?.toString(),
        });
      }
    } else {
      // Single event overlap confirmed above
      events.push({
        summary,
        start: event.startDate.toJSDate(),
        end: event.endDate.toJSDate(),
        transparency: transp,
        isAllDay,
        description: vevent.getFirstPropertyValue('description') as string | undefined,
        location: vevent.getFirstPropertyValue('location') as string | undefined,
        uid,
        rrule: undefined,
        rawStart: vevent.getFirstPropertyValue('dtstart')?.toString(),
        rawEnd: vevent.getFirstPropertyValue('dtend')?.toString(),
      });
    }
  }

  return events;
}
