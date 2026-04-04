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

export type PlannerScope = 'me' | 'family';

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
  /** Ordering on the Family tab for this classification (independent from Me / sortOrder). */
  sortOrderFamily: number;
  /** Per-assignee ordering on Me; falls back to sortOrder when missing for a uid. */
  sortOrderByAssignee: Record<string, number>;
  placement?: {
    date: string;       // YYYY-MM-DD
    startHour: number;  // e.g. 9.5
    duration: number;   // in hours
  } | null;
  completedAt: FirestoreTimestampLike | null;
  lastOccurrenceCompletedAt?: FirestoreTimestampLike | null;
  createdAt: FirestoreTimestampLike;
  updatedAt: FirestoreTimestampLike;
  /** Legacy / creator uid; kept for rules and migration. */
  ownerUid?: string;
  householdId?: string | null;
  /** Always at least one household member. */
  assigneeUids: string[];
  /** When true, task stays off Family even if the project is family-visible. */
  excludeFromFamily: boolean;
  /** When true, task appears on Family even without a family-scoped project. */
  familyPinned: boolean;
}

export interface Project {
  id: string;
  name: string;
  markdown: string;
  status: ProjectStatus;
  /** Legacy field; family visibility is expressed with familyVisible. */
  visibility: 'personal' | 'shared';
  createdAt: FirestoreTimestampLike;
  updatedAt: FirestoreTimestampLike;
  ownerUid?: string;
  householdId?: string | null;
  /** At least one uid; typically includes ownerUid. */
  assigneeUids: string[];
  /** Family tab shows tasks in this project by default (tasks can opt out). */
  familyVisible: boolean;
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
