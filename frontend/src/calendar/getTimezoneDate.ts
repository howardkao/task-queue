/** Interpret YYYY-MM-DD at HH:MM:SS in a named IANA timezone as a Date (mirrors worker behavior). */
export function getTimezoneDate(dateStr: string, timeStr: string, tz: string): Date {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const [hh, mm, ss] = timeStr.split(':').map(Number);
    const utcDate = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });
    const parts = dtf.formatToParts(utcDate);
    const p: Record<string, string> = {};
    for (const part of parts) if (part.type !== 'literal') p[part.type] = part.value;
    const localAsUtc = new Date(
      `${p.year}-${p.month.padStart(2, '0')}-${p.day.padStart(2, '0')}T${p.hour.padStart(2, '0')}:${p.minute.padStart(2, '0')}:${p.second.padStart(2, '0')}Z`,
    );
    const offset = localAsUtc.getTime() - utcDate.getTime();
    return new Date(utcDate.getTime() - offset);
  } catch {
    return new Date(`${dateStr}T${timeStr}Z`);
  }
}

export function addDaysToYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
