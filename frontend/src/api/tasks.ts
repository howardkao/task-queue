import {
  collection, doc, addDoc, getDocs, getDoc, updateDoc, deleteDoc, query, where, orderBy,
  Timestamp, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { Task, Classification } from '../types';
import { addLogEntry } from './activityLog';

const tasksRef = collection(db, 'tasks');
const ORDERED_CLASSIFICATIONS = new Set<Classification>(['boulder', 'rock', 'pebble', 'unclassified']);

function requireUser() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}

function toTask(id: string, data: any): Task {
  return {
    id,
    title: data.title || '',
    notes: data.notes || '',
    classification: data.classification || 'unclassified',
    status: data.status || 'active',
    priority: data.priority || 'low',
    deadline: data.deadline ? (data.deadline.toDate ? data.deadline.toDate().toISOString() : data.deadline) : null,
    recurrence: data.recurrence || null,
    projectId: data.projectId || null,
    sortOrder: data.sortOrder || 0,
    placement: data.placement || null,
    completedAt: data.completedAt || null,
    lastOccurrenceCompletedAt: data.lastOccurrenceCompletedAt || null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export async function createTask(data: {
  title: string;
  notes?: string;
  classification?: Classification;
  priority?: 'high' | 'med' | 'low';
  deadline?: string;
  projectId?: string;
  recurrence?: any;
  lastOccurrenceCompletedAt?: any;
}): Promise<Task> {
  const user = requireUser();
  const classification = data.classification || 'unclassified';
  const sortOrder = await getTopSortOrder(classification);

  const taskData = {
    title: data.title.trim(),
    notes: data.notes || '',
    classification,
    status: 'active',
    priority: data.priority || 'low',
    deadline: data.deadline ? Timestamp.fromDate(new Date(data.deadline)) : null,
    recurrence: data.recurrence || null,
    projectId: data.projectId || null,
    lastOccurrenceCompletedAt: data.lastOccurrenceCompletedAt || null,
    ownerUid: user.uid,
    sortOrder,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(tasksRef, taskData);
  const task = toTask(docRef.id, { ...taskData, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });

  // Log activity for project-linked tasks
  if (task.projectId) {
    addLogEntry({
      projectId: task.projectId,
      action: 'task_created',
      description: `Created ${task.classification}: "${task.title}"`,
      taskId: task.id,
    }).catch(() => {}); // fire and forget
  }

  return task;
}

export async function listTasks(filters?: {
  classification?: Classification;
  status?: string;
  projectId?: string;
}): Promise<Task[]> {
  const user = requireUser();
  // Query with at most one where clause to avoid composite index requirements.
  // Apply remaining filters client-side.
  const constraints: any[] = [where('ownerUid', '==', user.uid)];

  if (filters?.status) {
    constraints.push(where('status', '==', filters.status));
  }

  const q = query(tasksRef, ...constraints);
  const snapshot = await getDocs(q);

  let tasks = snapshot.docs.map(d => toTask(d.id, d.data()));

  // Client-side filtering
  if (filters?.classification) {
    tasks = tasks.filter(t => t.classification === filters.classification);
  }
  if (filters?.projectId) {
    tasks = tasks.filter(t => t.projectId === filters.projectId);
  }

  // Sort ordered task classes by sortOrder, fallback to createdAt
  tasks.sort((a, b) => {
    if (a.classification === b.classification && ORDERED_CLASSIFICATIONS.has(a.classification)) {
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    }
    const aTime = a.createdAt?.seconds || 0;
    const bTime = b.createdAt?.seconds || 0;
    return aTime - bTime;
  });

  return tasks;
}

export async function getTask(id: string): Promise<Task> {
  requireUser();
  const d = await getDoc(doc(tasksRef, id));
  if (!d.exists()) throw new Error('Task not found');
  return toTask(d.id, d.data());
}

export async function updateTask(id: string, data: Partial<Task>): Promise<Task> {
  requireUser();
  const updates: any = { updatedAt: serverTimestamp() };

  if (data.title !== undefined) updates.title = data.title;
  if (data.notes !== undefined) updates.notes = data.notes;
  if (data.classification !== undefined) {
    updates.classification = data.classification;
    // When classifying into an ordered class, put at top of that list if no explicit sortOrder
    if (ORDERED_CLASSIFICATIONS.has(data.classification) && data.sortOrder === undefined) {
      updates.sortOrder = await getTopSortOrder(data.classification);
    }
  }
  if (data.status !== undefined) updates.status = data.status;
  if (data.priority !== undefined && data.priority !== null) updates.priority = data.priority;
  if (data.deadline !== undefined) {
    updates.deadline = data.deadline ? Timestamp.fromDate(new Date(data.deadline)) : null;
  }
  if (data.projectId !== undefined) updates.projectId = data.projectId;
  if (data.sortOrder !== undefined) updates.sortOrder = data.sortOrder;
  if (data.placement !== undefined) updates.placement = data.placement;
  if (data.lastOccurrenceCompletedAt !== undefined) updates.lastOccurrenceCompletedAt = data.lastOccurrenceCompletedAt;
  if (data.recurrence !== undefined) {
    if (data.recurrence) {
      // Strip undefined values — Firestore rejects them
      updates.recurrence = Object.fromEntries(
        Object.entries(data.recurrence).filter(([, v]) => v !== undefined)
      );
    } else {
      updates.recurrence = null;
    }
  }

  await updateDoc(doc(tasksRef, id), updates);
  return getTask(id);
}

export async function completeTask(id: string): Promise<{ completed: Task; nextOccurrence: Task | null }> {
  requireUser();
  const task = await getTask(id);
  const now = Timestamp.now();
  await updateDoc(doc(tasksRef, id), {
    status: 'completed',
    completedAt: now,
    updatedAt: serverTimestamp(),
  });

  // Log activity for project-linked tasks
  if (task.projectId) {
    addLogEntry({
      projectId: task.projectId,
      action: 'task_completed',
      description: `Completed ${task.classification}: "${task.title}"`,
      taskId: task.id,
    }).catch(() => {});
  }

  let nextOccurrence: Task | null = null;
  if (task.recurrence) {
    const nextDeadline = calculateNextOccurrence(task.recurrence, task.deadline);
    nextOccurrence = await createTask({
      title: task.title,
      notes: task.notes,
      classification: task.classification,
      priority: task.priority,
      deadline: nextDeadline || undefined,
      projectId: task.projectId || undefined,
      recurrence: task.recurrence,
      lastOccurrenceCompletedAt: now,
    });
  }

  return { completed: { ...task, status: 'completed', completedAt: now.toDate().toISOString() }, nextOccurrence };
}

export async function iceboxTask(id: string): Promise<Task> {
  requireUser();
  const task = await getTask(id);
  const result = await updateTask(id, { status: 'iceboxed' } as Partial<Task>);

  if (task.projectId) {
    addLogEntry({
      projectId: task.projectId,
      action: 'task_iceboxed',
      description: `Iceboxed ${task.classification}: "${task.title}"`,
      taskId: task.id,
    }).catch(() => {});
  }

  return result;
}

export async function deleteTask(id: string): Promise<void> {
  requireUser();
  await deleteDoc(doc(tasksRef, id));
}

export async function reorderPebbles(order: Array<{ id: string; sortOrder: number }>): Promise<void> {
  requireUser();
  const batch = writeBatch(db);
  for (const item of order) {
    batch.update(doc(tasksRef, item.id), {
      sortOrder: item.sortOrder,
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

// Helper: get sort order that puts item at top of its classification list
async function getTopSortOrder(classification: string): Promise<number> {
  const user = requireUser();
  try {
    const q = query(
      tasksRef,
      where('ownerUid', '==', user.uid),
      where('classification', '==', classification),
      where('status', '==', 'active'),
      orderBy('sortOrder', 'asc'),
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) return 1000;

    const minOrder = snapshot.docs[0].data().sortOrder as number;
    return minOrder - 1000;
  } catch {
    return -1000 + Math.random() * 100;
  }
}

const DAY_INDEX: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

function findNextDayOfWeek(from: Date, days: string[]): Date {
  const targetDays = days.map(d => DAY_INDEX[d]).filter(d => d !== undefined).sort((a, b) => a - b);
  if (targetDays.length === 0) {
    const next = new Date(from);
    next.setDate(next.getDate() + 7);
    return next;
  }
  const currentDay = from.getDay();
  // Find the next target day after the current day
  let nextDay = targetDays.find(d => d > currentDay);
  const daysToAdd = nextDay !== undefined
    ? nextDay - currentDay
    : 7 - currentDay + targetDays[0]; // wrap to next week
  const next = new Date(from);
  next.setDate(next.getDate() + daysToAdd);
  return next;
}

function calculateNextOccurrence(recurrence: any, currentDeadline: string | null): string | null {
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
      // Always relative to completion (now), not deadline
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
      // weekly custom
      if (recurrence.days && recurrence.days.length > 0) {
        // Jump forward by (interval - 1) weeks, then find the next matching day
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
