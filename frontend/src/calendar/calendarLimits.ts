/**
 * Calendar mirror sync window and Today view scroll bounds (local calendar days from "today").
 * Kept in one place so Firestore mirror rows and UI stay aligned.
 */
export const CALENDAR_RANGE_DAYS = 14;

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Keeps the visible range inside [today − CALENDAR_RANGE_DAYS, today + CALENDAR_RANGE_DAYS]
 * (inclusive on last visible day).
 */
export function clampStartDateForCalendarScroll(start: Date, visibleDayCount: number): Date {
  const today = startOfLocalDay(new Date());
  const minStart = new Date(today);
  minStart.setDate(minStart.getDate() - CALENDAR_RANGE_DAYS);

  const maxStart = new Date(today);
  maxStart.setDate(maxStart.getDate() + CALENDAR_RANGE_DAYS - Math.max(visibleDayCount - 1, 0));

  const t = start.getTime();
  if (t < minStart.getTime()) return minStart;
  if (t > maxStart.getTime()) return maxStart;
  return start;
}

function addCalendarDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** True when the start date is already at the earliest allowed day (cannot scroll further back). */
export function isCalendarScrollAtPastLimit(start: Date, visibleDayCount: number): boolean {
  return (
    clampStartDateForCalendarScroll(addCalendarDays(start, -1), visibleDayCount).getTime() ===
    start.getTime()
  );
}

/** True when the start date is already at the latest allowed day (cannot scroll further forward). */
export function isCalendarScrollAtFutureLimit(start: Date, visibleDayCount: number): boolean {
  return (
    clampStartDateForCalendarScroll(addCalendarDays(start, 1), visibleDayCount).getTime() ===
    start.getTime()
  );
}
