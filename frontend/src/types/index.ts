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

/** @deprecated Use `vital` flag and `TaskSize` instead. Kept for backward compat during migration. */
export type Classification = 'unclassified' | 'boulder' | 'rock' | 'pebble';
export type TaskStatus = 'active' | 'completed' | 'iceboxed';
/** @deprecated Use `vital` boolean instead. Kept for backward compat during migration. */
export type Priority = 'high' | 'med' | 'low';
/** @deprecated Use `InvestmentStatus` instead. */
export type ProjectStatus = 'active' | 'on_hold';

// ── v2 types ──

export type TaskSize = 'S' | 'M' | 'L';
export type InvestmentStatus = 'active' | 'on_hold' | 'completed';

export type { RecurrenceRule };

export interface Task {
  id: string;
  title: string;
  notes: string;
  /** @deprecated Use `vital` and `size` instead. */
  classification: Classification;
  status: TaskStatus;
  /** @deprecated Use `vital` instead. */
  priority: Priority;
  deadline: string | null; // ISO string or Firestore timestamp
  recurrence: RecurrenceRule | null;
  /** @deprecated Use `investmentId` instead. */
  projectId: string | null;
  sortOrder: number;
  /** Ordering on the Family tab (independent from Me / sortOrder). */
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
  /** When true, task stays off Family even if the investment is family-visible. */
  excludeFromFamily: boolean;
  /** When true, task appears on Family even without a family-scoped investment. */
  familyPinned: boolean;

  // ── v2 fields ──

  /** Strategic or critical — gets scheduled first. */
  vital: boolean;
  /** Effort: S (~5 min), M (~1 hr), L (2-3 hr). Null = untriaged. */
  size: TaskSize | null;
  /** Investment this task belongs to (replaces projectId). */
  investmentId: string | null;
  /** Initiative within the investment (one nesting level). */
  initiativeId: string | null;
}

/** @deprecated Use `Investment` instead. */
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

// ── v2 entities ──

export interface Investment {
  id: string;
  name: string;
  markdown: string;
  status: InvestmentStatus;
  /** Rank among peer investments — lower is higher priority. */
  rank: number;
  createdAt: FirestoreTimestampLike;
  updatedAt: FirestoreTimestampLike;
  ownerUid?: string;
  householdId?: string | null;
  assigneeUids: string[];
  /** Family tab shows tasks in this investment by default (tasks can opt out). */
  familyVisible: boolean;
}

export interface Initiative {
  id: string;
  name: string;
  markdown: string;
  /** Parent investment. */
  investmentId: string;
  /** Rank within parent investment — lower is higher priority. */
  rank: number;
  createdAt: FirestoreTimestampLike;
  updatedAt: FirestoreTimestampLike;
  ownerUid?: string;
  householdId?: string | null;
  assigneeUids: string[];
}

export interface ActivityLogEntry {
  id: string;
  projectId: string;
  action: 'task_created' | 'task_completed' | 'task_iceboxed' | 'task_classified' | 'project_created' | 'project_status_changed' | 'investment_created' | 'investment_status_changed';
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
  /** Feed this event belongs to (for scope-based visibility filtering). */
  feedId?: string;
  /** Firestore mirror document id (client-side calendar sync). */
  mirrorDocId?: string;
}

export interface CalendarFeed {
  id: string;
  name: string;
  color: string;
  enabled: boolean;
  /** True when the current user created this feed. */
  isOwner: boolean;
  /** When true, this feed appears on the Family view and in household members' lists. */
  sharedWithFamily: boolean;
  /** When true, the current user has chosen not to display this feed in their views. */
  hiddenByUser: boolean;
}

export interface CalendarFeedInput {
  name: string;
  color: string;
  url: string;
}
