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

function buildParsedEvent(
  event: ICAL.Event,
  source: ICAL.Component,
  start: ICAL.Time,
  end: ICAL.Time,
  isAllDay: boolean,
  rrule?: ICAL.Recur,
): ICalEvent {
  return {
    summary: event.summary || '(No title)',
    start: start.toJSDate(),
    end: end.toJSDate(),
    transparency: (source.getFirstPropertyValue('transp') || 'OPAQUE').toString().toUpperCase(),
    isAllDay,
    description: source.getFirstPropertyValue('description') as string | undefined,
    location: source.getFirstPropertyValue('location') as string | undefined,
    uid: source.getFirstPropertyValue('uid') as string | undefined,
    rrule: rrule?.toString(),
    rawStart: source.getFirstPropertyValue('dtstart')?.toString(),
    rawEnd: source.getFirstPropertyValue('dtend')?.toString(),
  };
}

export function parseICal(text: string, rangeStart: Date, rangeEnd: Date): ParseResult {
  const startTime = Date.now();
  const jcal = ICAL.parse(text);
  const comp = new ICAL.Component(jcal);
  const events: ICalEvent[] = [];
  const warnings: string[] = [];

  const start = ICAL.Time.fromJSDate(rangeStart, true);
  const end = ICAL.Time.fromJSDate(rangeEnd, true);

  const vevents = comp.getAllSubcomponents('vevent');
  const parsedEvents = vevents.map((vevent) => new ICAL.Event(vevent));
  const recurringMastersByUid = new Map<string, ICAL.Event>();
  const attachedExceptionKeys = new Set<string>();

  for (const event of parsedEvents) {
    if (event.isRecurrenceException()) continue;
    if (!event.isRecurring()) continue;
    if (!event.uid) continue;
    if (!recurringMastersByUid.has(event.uid)) recurringMastersByUid.set(event.uid, event);
  }

  for (const event of parsedEvents) {
    if (!event.isRecurrenceException()) continue;
    if (!event.uid || !event.recurrenceId) continue;
    const master = recurringMastersByUid.get(event.uid);
    if (!master) continue;
    master.relateException(event);
    attachedExceptionKeys.add(`${event.uid}|${event.recurrenceId.toString()}`);
  }

  for (let i = 0; i < vevents.length; i++) {
    if (Date.now() - startTime > TIME_LIMIT_MS) {
      warnings.push('Parsing interrupted: time limit exceeded. Some events might be missing.');
      break;
    }

    const vevent = vevents[i]!;
    const event = parsedEvents[i]!;

    if (
      event.isRecurrenceException() &&
      event.uid &&
      event.recurrenceId &&
      attachedExceptionKeys.has(`${event.uid}|${event.recurrenceId.toString()}`)
    ) {
      continue;
    }

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

        const details = event.getOccurrenceDetails(next);
        const sourceEvent = details.item;
        const sourceVevent = sourceEvent.component ?? vevent;

        if (details.endDate.compare(start) > 0) {
          events.push(buildParsedEvent(sourceEvent, sourceVevent, details.startDate, details.endDate, details.startDate.isDate, rrule));
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

      events.push(buildParsedEvent(event, vevent, event.startDate, event.endDate, event.startDate.isDate));
    }
  }

  return { events, warnings };
}
