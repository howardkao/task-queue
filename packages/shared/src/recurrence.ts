/** Matches app + MCP recurrence payloads stored in Firestore. */
export interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'periodically' | 'custom';
  interval?: number;
  days?: string[];
  customUnit?: 'weekly' | 'monthly';
  periodUnit?: 'hours' | 'days' | 'weeks';
}

const DAY_INDEX: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function findNextDayOfWeek(from: Date, days: string[]): Date {
  const targetDays = days
    .map((d) => DAY_INDEX[d])
    .filter((d) => d !== undefined)
    .sort((a, b) => a - b);
  if (targetDays.length === 0) {
    const next = new Date(from);
    next.setDate(next.getDate() + 7);
    return next;
  }
  const currentDay = from.getDay();
  const nextDay = targetDays.find((d) => d > currentDay);
  const daysToAdd =
    nextDay !== undefined ? nextDay - currentDay : 7 - currentDay + targetDays[0];
  const next = new Date(from);
  next.setDate(next.getDate() + daysToAdd);
  return next;
}

export function calculateNextOccurrence(
  recurrence: RecurrenceRule | null | undefined,
  currentDeadline: string | null,
): string | null {
  if (!recurrence || !recurrence.freq) return null;

  const now = new Date();

  switch (recurrence.freq) {
    case 'daily': {
      const base = currentDeadline ? new Date(currentDeadline) : now;
      const next = new Date(base);
      next.setDate(next.getDate() + (recurrence.interval || 1));
      return next.toISOString();
    }
    case 'weekly': {
      const base = currentDeadline ? new Date(currentDeadline) : now;
      if (recurrence.days && recurrence.days.length > 0) {
        return findNextDayOfWeek(base, recurrence.days).toISOString();
      }
      const next = new Date(base);
      next.setDate(next.getDate() + 7);
      return next.toISOString();
    }
    case 'monthly': {
      const base = currentDeadline ? new Date(currentDeadline) : now;
      const next = new Date(base);
      next.setMonth(next.getMonth() + (recurrence.interval || 1));
      return next.toISOString();
    }
    case 'yearly': {
      const base = currentDeadline ? new Date(currentDeadline) : now;
      const next = new Date(base);
      next.setFullYear(next.getFullYear() + (recurrence.interval || 1));
      return next.toISOString();
    }
    case 'periodically': {
      const next = new Date(now);
      const interval = recurrence.interval || 1;
      const unit = recurrence.periodUnit || 'days';
      if (unit === 'hours') {
        next.setHours(next.getHours() + interval);
      } else if (unit === 'weeks') {
        next.setDate(next.getDate() + interval * 7);
      } else {
        next.setDate(next.getDate() + interval);
      }
      return next.toISOString();
    }
    case 'custom': {
      const base = currentDeadline ? new Date(currentDeadline) : now;
      const interval = recurrence.interval || 1;
      if (recurrence.customUnit === 'monthly') {
        const next = new Date(base);
        next.setMonth(next.getMonth() + interval);
        return next.toISOString();
      }
      if (recurrence.days && recurrence.days.length > 0) {
        const jumped = new Date(base);
        jumped.setDate(jumped.getDate() + 7 * (interval - 1));
        return findNextDayOfWeek(jumped, recurrence.days).toISOString();
      }
      const next = new Date(base);
      next.setDate(next.getDate() + 7 * interval);
      return next.toISOString();
    }
    default:
      return null;
  }
}
