export type Classification = 'unclassified' | 'boulder' | 'rock' | 'pebble';
export type TaskStatus = 'active' | 'completed' | 'iceboxed';
export type Priority = 'high' | 'med' | 'low';
export type ProjectStatus = 'active' | 'on_hold';

export interface Task {
  id: string;
  title: string;
  notes: string;
  classification: Classification;
  status: TaskStatus;
  priority: Priority;
  deadline: string | null; // ISO string or Firestore timestamp
  recurrence: RecurrenceRule | null;
  projectId: string | null;
  sortOrder: number;
  placement?: {
    date: string;       // YYYY-MM-DD
    startHour: number;  // e.g. 9.5
    duration: number;   // in hours
  } | null;
  completedAt: any;
  lastOccurrenceCompletedAt?: any; // Completion time of previous occurrence
  createdAt: any;
  updatedAt: any;
}

export interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'periodically' | 'custom';
  interval?: number;        // repeat every N (days for periodically, weeks/months for custom)
  days?: string[];          // for weekly/custom-weekly: ['mon','tue','wed','thu','fri','sat','sun']
  customUnit?: 'weekly' | 'monthly'; // for custom: which unit the interval applies to
  periodUnit?: 'hours' | 'days' | 'weeks'; // for periodically: which unit the interval applies to
}

export interface Project {
  id: string;
  name: string;
  markdown: string;
  status: ProjectStatus;
  visibility: 'personal' | 'shared';
  createdAt: any;
  updatedAt: any;
}

export interface ActivityLogEntry {
  id: string;
  projectId: string;
  action: 'task_created' | 'task_completed' | 'task_iceboxed' | 'task_classified' | 'project_created' | 'project_status_changed';
  description: string;
  taskId?: string;
  timestamp: any;
}

export interface CalendarEvent {
  title: string;
  start: string;
  end: string;
  busy: boolean;
  calendarName: string;
  color: string;
}

export interface CalendarFeed {
  url: string;
  name: string;
  color: string;
}
