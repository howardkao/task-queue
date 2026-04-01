/**
 * iCal parser for Cloudflare Workers using ical.js.
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

/**
 * Parse iCal text and expand recurring events for a given date range.
 */
export function parseICal(text: string, rangeStart: Date, rangeEnd: Date): ParseResult {
  const startTime = Date.now();
  const TIME_LIMIT_MS = 100; // 100ms total for parsing
  
  const jcal = ICAL.parse(text);
  const comp = new ICAL.Component(jcal);
  const events: ICalEvent[] = [];
  const warnings: string[] = [];

  const start = ICAL.Time.fromJSDate(rangeStart, true);
  const end = ICAL.Time.fromJSDate(rangeEnd, true);

  const vevents = comp.getAllSubcomponents('vevent');

  for (const vevent of vevents) {
    // Check global time limit
    if (Date.now() - startTime > TIME_LIMIT_MS) {
      warnings.push(`Parsing interrupted: CPU time limit exceeded. Some events might be missing.`);
      break;
    }

    const event = new ICAL.Event(vevent);
    
    if (event.isRecurring()) {
      const rrule = vevent.getFirstPropertyValue('rrule') as ICAL.Recur | undefined;
      
      // Safety: If it has an UNTIL date that is in the past, skip entirely
      if (rrule?.until && rrule.until.compare(start) < 0) continue;

      // Accuracy Fix: We can only "fast-forward" the iterator if there's no COUNT.
      // ical.js resets the count if you start the iterator mid-stream.
      const canFastForward = !rrule?.count;
      const iterStart = (canFastForward && start.compare(event.startDate) > 0) ? start : event.startDate;
      
      const iterator = event.iterator(iterStart);
      let next: ICAL.Time | null;
      let iterations = 0;

      while ((next = iterator.next())) {
        iterations++;
        
        // Infinite loop / CPU spike protection
        if (iterations > 1000) {
          warnings.push(`Event "${event.summary}" (UID: ${vevent.getFirstPropertyValue('uid')}) has too many occurrences; skipping remaining.`);
          break;
        }

        // Stop if we've gone past the range
        if (next.compare(end) >= 0) break;

        // Skip if occurrence is before range start
        if (next.compare(start) < 0) continue;

        const duration = event.duration;
        const occurrenceEnd = next.clone();
        occurrenceEnd.addDuration(duration);

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
    } else {
      // Single event overlap check
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
