import type { Task, RecurrenceRule, Classification, Priority, TaskSize } from '../../types';

export const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export const DAY_LABELS: Record<string, string> = {
  mon: 'M',
  tue: 'T',
  wed: 'W',
  thu: 'Th',
  fri: 'F',
  sat: 'Sa',
  sun: 'Su',
};

export type RecurrenceMode = '' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'periodically' | 'custom';

const INDEX_TO_DAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function normalizeRecurrence(rec: RecurrenceRule | null): RecurrenceRule | null {
  if (!rec) return null;

  switch (rec.freq) {
    case 'weekly':
      return rec.days && rec.days.length > 0
        ? { freq: 'weekly', days: [...rec.days] }
        : { freq: 'weekly' };
    case 'monthly':
      return { freq: 'monthly' };
    case 'yearly':
      return { freq: 'yearly' };
    case 'periodically':
      return {
        freq: 'periodically',
        interval: rec.interval || 1,
        periodUnit: rec.periodUnit || 'days',
      };
    case 'custom': {
      const normalized: RecurrenceRule = {
        freq: 'custom',
        customUnit: rec.customUnit || 'weekly',
        interval: rec.interval || 1,
      };
      if ((rec.customUnit || 'weekly') === 'weekly' && rec.days && rec.days.length > 0) {
        normalized.days = [...rec.days];
      }
      return normalized;
    }
    case 'daily':
    default:
      return { freq: 'daily' };
  }
}

export function recurrenceEquals(a: RecurrenceRule | null, b: RecurrenceRule | null): boolean {
  return JSON.stringify(normalizeRecurrence(a)) === JSON.stringify(normalizeRecurrence(b));
}

export function dayOfWeekFromDate(dateStr: string): string {
  try {
    return INDEX_TO_DAY[new Date(dateStr + 'T12:00:00').getDay()];
  } catch {
    return 'mon';
  }
}

export function recurrenceToMode(rec: RecurrenceRule | null): RecurrenceMode {
  const normalized = normalizeRecurrence(rec);
  if (!normalized) return '';
  return normalized.freq as RecurrenceMode;
}

export function parseDeadline(deadline: string | null): { date: string; time: string } {
  if (!deadline) return { date: '', time: '' };
  const s = deadline.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return { date: s, time: '' };
  }

  const utcMidnight = /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.000)?Z$/.exec(s);
  if (utcMidnight) {
    return { date: utcMidnight[1], time: '' };
  }

  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return { date: '', time: '' };
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const date = `${y}-${m}-${day}`;
    const h = d.getHours();
    const min = d.getMinutes();
    const sec = d.getSeconds();
    const ms = d.getMilliseconds();
    if (h === 0 && min === 0 && sec === 0 && ms === 0) {
      return { date, time: '' };
    }
    const time = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    return { date, time };
  } catch {
    return { date: '', time: '' };
  }
}

export interface EditableTaskState {
  title: string;
  notes: string;
  /** @deprecated Use vital + size instead. */
  classification: Classification;
  /** @deprecated Use vital instead. */
  priority: Priority;
  /** @deprecated Use investmentId instead. */
  projectId: string | null;
  deadline: string | null;
  recurrence: RecurrenceRule | null;
  excludeFromFamily: boolean;
  familyPinned: boolean;
  // v2 fields
  vital: boolean;
  size: TaskSize | null;
  investmentId: string | null;
  initiativeId: string | null;
}

export function buildEditableState(task: Task): EditableTaskState {
  const { date, time } = parseDeadline(task.deadline);
  const deadlineStr = date ? (time ? `${date}T${time}` : date) : null;
  const recurrence = normalizeRecurrence(task.recurrence);
  return {
    title: task.title,
    notes: task.notes,
    classification: task.classification,
    priority: task.priority || 'low',
    projectId: task.projectId || null,
    deadline: deadlineStr,
    recurrence,
    excludeFromFamily: task.excludeFromFamily,
    familyPinned: task.familyPinned,
    vital: task.vital,
    size: task.size,
    investmentId: task.investmentId,
    initiativeId: task.initiativeId,
  };
}
