import {
  collection, doc, addDoc, getDocs, getDoc, updateDoc, deleteDoc, query, where, orderBy,
  Timestamp, serverTimestamp, writeBatch,
  type DocumentData,
  type QueryConstraint,
} from 'firebase/firestore';
import { calculateNextOccurrence, ORDERED_CLASSIFICATIONS, sortTasksForList } from '@task-queue/shared';
import { auth, db } from '../firebase';
import type { Task, Classification, RecurrenceRule, FirestoreTimestampLike } from '../types';
import { addLogEntry } from './activityLog';
import { firestoreTimeToMs } from '../lib/firestoreTime';

const tasksRef = collection(db, 'tasks');

function requireUser() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}

function toTask(id: string, data: DocumentData): Task {
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
  recurrence?: RecurrenceRule | null;
  lastOccurrenceCompletedAt?: FirestoreTimestampLike | null;
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
  const constraints: QueryConstraint[] = [where('ownerUid', '==', user.uid)];

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

  return sortTasksForList(tasks, (t) => firestoreTimeToMs(t.createdAt));
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

