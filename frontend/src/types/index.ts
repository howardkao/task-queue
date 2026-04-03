import type { RecurrenceRule } from '@task-queue/shared';

/**
 * Timestamp shapes from Firestore reads, optimistic writes, or normalized strings.
 * `number` is treated as epoch milliseconds where relevant (e.g. sorting).
 */
export type FirestoreTimestampLike =
  | {
      seconds?: number;
      nanoseconds?: number;
      _seconds?: number;
      _nanoseconds?: number;
      toDate?: () => Date;
    }
  | string
  | Date
  | number
  | null
  | undefined;

export type Classification = 'unclassified' | 'boulder' | 'rock' | 'pebble';
export type TaskStatus = 'active' | 'completed' | 'iceboxed';
export type Priority = 'high' | 'med' | 'low';
export type ProjectStatus = 'active' | 'on_hold';

export type { RecurrenceRule };

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
  completedAt: FirestoreTimestampLike | null;
  lastOccurrenceCompletedAt?: FirestoreTimestampLike | null;
  createdAt: FirestoreTimestampLike;
  updatedAt: FirestoreTimestampLike;
}

export interface Project {
  id: string;
  name: string;
  markdown: string;
  status: ProjectStatus;
  visibility: 'personal' | 'shared';
  createdAt: FirestoreTimestampLike;
  updatedAt: FirestoreTimestampLike;
}

export interface ActivityLogEntry {
  id: string;
  projectId: string;
  action: 'task_created' | 'task_completed' | 'task_iceboxed' | 'task_classified' | 'project_created' | 'project_status_changed';
  description: string;
  taskId?: string;
  timestamp: FirestoreTimestampLike;
}

export interface CalendarResponse {
  events: CalendarEvent[];
  syncWarnings: string[];
}

export interface CalendarEvent {
  title: string;
  start: string;
  end: string;
  busy: boolean;
  calendarName: string;
  color: string;
  allDay?: boolean;
  description?: string;
  location?: string;
  uid?: string;
  rrule?: string;
  rawStart?: string;
  rawEnd?: string;
  /** Firestore mirror document id (client-side calendar sync). */
  mirrorDocId?: string;
}

export interface CalendarFeed {
  id: string;
  name: string;
  color: string;
  enabled: boolean;
}

export interface CalendarFeedInput {
  name: string;
  color: string;
  url: string;
}
