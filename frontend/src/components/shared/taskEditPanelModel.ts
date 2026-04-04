import type { Task, RecurrenceRule, Classification, Priority } from '../../types';

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

export function dayOfWeekFromDate(dateStr: string): string {
  try {
    return INDEX_TO_DAY[new Date(dateStr + 'T12:00:00').getDay()];
  } catch {
    return 'mon';
  }
}

export function recurrenceToMode(rec: RecurrenceRule | null): RecurrenceMode {
  if (!rec) return '';
  return rec.freq as RecurrenceMode;
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
  classification: Classification;
  priority: Priority;
  projectId: string | null;
  deadline: string | null;
  recurrence: RecurrenceRule | null;
  excludeFromFamily: boolean;
  familyPinned: boolean;
}

export function buildEditableState(task: Task): EditableTaskState {
  const { date, time } = parseDeadline(task.deadline);
  const deadlineStr = date ? (time ? `${date}T${time}` : date) : null;
  return {
    title: task.title,
    notes: task.notes,
    classification: task.classification,
    priority: task.priority || 'low',
    projectId: task.projectId || null,
    deadline: deadlineStr,
    recurrence: task.recurrence || null,
    excludeFromFamily: task.excludeFromFamily,
    familyPinned: task.familyPinned,
  };
}

export const PRIORITY_CLASSES: Record<
  Priority,
  { active: string; inactive: string }
> = {
  high: {
    active: 'bg-priority-high text-white border-priority-high',
    inactive: 'bg-card text-foreground border-input hover:bg-priority-high-bg',
  },
  med: {
    active: 'bg-priority-med text-white border-priority-med',
    inactive: 'bg-card text-foreground border-input hover:bg-priority-med-bg',
  },
  low: {
    active: 'bg-priority-low text-white border-priority-low',
    inactive: 'bg-card text-foreground border-input hover:bg-priority-low-bg',
  },
};
