import {
  collection,
  doc,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type QueryConstraint,
} from 'firebase/firestore';
import { calculateNextOccurrence, ORDERED_CLASSIFICATIONS, sortTasksForList } from '@task-queue/shared';
import { auth, db } from '../firebase';
import type { Task, Classification, TaskSize, RecurrenceRule, FirestoreTimestampLike } from '../types';
import { addLogEntry } from './activityLog';
import { firestoreTimeToMs } from '../lib/firestoreTime';
import { ensureUserHousehold } from './household';

const tasksRef = collection(db, 'tasks');

function requireUser() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}

export function getMeSortOrder(task: Task, uid: string): number {
  const v = task.sortOrderByAssignee[uid];
  if (typeof v === 'number') return v;
  return task.sortOrder || 0;
}

function toTask(id: string, data: DocumentData): Task {
  const ownerUid = data.ownerUid as string | undefined;
  const assigneeUids =
    Array.isArray(data.assigneeUids) && data.assigneeUids.length > 0
      ? [...data.assigneeUids]
      : ownerUid
        ? [ownerUid]
        : [];
  const sortBase = typeof data.sortOrder === 'number' ? data.sortOrder : 0;
  const rawBy = data.sortOrderByAssignee;
  const sortOrderByAssignee: Record<string, number> =
    rawBy && typeof rawBy === 'object' && !Array.isArray(rawBy)
      ? Object.fromEntries(
          Object.entries(rawBy).filter(([, v]) => typeof v === 'number') as [string, number][],
        )
      : {};
  const sortOrderFamily = typeof data.sortOrderFamily === 'number' ? data.sortOrderFamily : sortBase;

  // v2 fields — derive from old fields if not yet migrated
  const classification = data.classification || 'unclassified';
  const CLASSIFICATION_TO_SIZE: Record<string, TaskSize | null> = {
    boulder: 'L', rock: 'M', pebble: 'S', unclassified: null,
  };
  const vital: boolean = data.vital === true || data.priority === 'high';
  const size: TaskSize | null = data.size !== undefined ? data.size : (CLASSIFICATION_TO_SIZE[classification] ?? null);
  const investmentId: string | null = data.investmentId !== undefined ? (data.investmentId || null) : (data.projectId || null);
  const initiativeId: string | null = data.initiativeId || null;

  return {
    id,
    title: data.title || '',
    notes: data.notes || '',
    classification,
    status: data.status || 'active',
    priority: data.priority || 'low',
    deadline: data.deadline ? (data.deadline.toDate ? data.deadline.toDate().toISOString() : data.deadline) : null,
    recurrence: data.recurrence || null,
    projectId: data.projectId || null,
    sortOrder: sortBase,
    sortOrderFamily,
    sortOrderByAssignee,
    placement: data.placement || null,
    completedAt: data.completedAt || null,
    lastOccurrenceCompletedAt: data.lastOccurrenceCompletedAt || null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    ownerUid,
    householdId: data.householdId ?? null,
    assigneeUids,
    excludeFromFamily: data.excludeFromFamily === true,
    familyPinned: data.familyPinned === true,
    vital,
    size,
    investmentId,
    initiativeId,
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
  assigneeUids?: string[];
  excludeFromFamily?: boolean;
  familyPinned?: boolean;
  // v2 fields
  vital?: boolean;
  size?: TaskSize | null;
  investmentId?: string | null;
  initiativeId?: string | null;
}): Promise<Task> {
  const user = requireUser();
  await ensureUserHousehold(user.uid);
  const householdId = (await getDoc(doc(db, 'users', user.uid))).data()?.householdId as string;

  // Derive v1 classification from v2 size for backward compat
  const SIZE_TO_CLASSIFICATION: Record<string, Classification> = { L: 'boulder', M: 'rock', S: 'pebble' };
  const classification = data.classification || (data.size ? SIZE_TO_CLASSIFICATION[data.size] : 'unclassified');
  const sortOrder = await getTopSortOrder(classification, user.uid, householdId);
  const sortOrderFamily = await getTopSortOrderFamily(classification, householdId);

  const assigneeUids =
    data.assigneeUids && data.assigneeUids.length > 0 ? [...data.assigneeUids] : [user.uid];
  if (!assigneeUids.includes(user.uid)) {
    throw new Error('You must be among assignees');
  }

  // Derive v2 fields from v1 if not provided
  const vital = data.vital ?? (data.priority === 'high');
  const classificationToSize: Partial<Record<Classification, 'L' | 'M' | 'S'>> = {
    boulder: 'L',
    rock: 'M',
    pebble: 'S',
  };
  const size = data.size !== undefined ? data.size : (data.classification ? (classificationToSize[data.classification] ?? null) : null);
  const investmentId = data.investmentId !== undefined ? (data.investmentId || null) : (data.projectId || null);
  const initiativeId = data.initiativeId || null;

  const taskData: Record<string, unknown> = {
    title: data.title.trim(),
    notes: data.notes || '',
    // v1 fields (backward compat)
    classification,
    status: 'active',
    priority: vital ? 'high' : (data.priority || 'low'),
    projectId: investmentId,
    // v2 fields
    vital,
    size,
    investmentId,
    initiativeId,
    // shared
    deadline: data.deadline ? Timestamp.fromDate(new Date(data.deadline)) : null,
    recurrence: data.recurrence || null,
    lastOccurrenceCompletedAt: data.lastOccurrenceCompletedAt || null,
    ownerUid: user.uid,
    householdId,
    assigneeUids,
    excludeFromFamily: data.excludeFromFamily === true,
    familyPinned: data.familyPinned === true,
    sortOrder,
    sortOrderFamily,
    sortOrderByAssignee: { [user.uid]: sortOrder },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(tasksRef, taskData);
  const task = toTask(docRef.id, { ...taskData, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });

  if (task.investmentId) {
    addLogEntry({
      projectId: task.investmentId,
      action: 'task_created',
      description: `Created task: "${task.title}"`,
      taskId: task.id,
    }).catch(() => {});
  }

  return task;
}

export async function listTasks(filters?: {
  classification?: Classification;
  status?: string;
  projectId?: string;
}): Promise<Task[]> {
  const user = requireUser();
  await ensureUserHousehold(user.uid);
  const householdId = (await getDoc(doc(db, 'users', user.uid))).data()?.householdId as string;

  const constraints: QueryConstraint[] = [
    where('householdId', '==', householdId),
  ];

  if (filters?.status) {
    constraints.push(where('status', '==', filters.status));
  }

  const q = query(tasksRef, ...constraints);
  const snapshot = await getDocs(q);

  let tasks = snapshot.docs.map((d) => toTask(d.id, d.data()));

  if (filters?.classification) {
    tasks = tasks.filter((t) => t.classification === filters.classification);
  }
  if (filters?.projectId) {
    tasks = tasks.filter((t) => t.projectId === filters.projectId);
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
  const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };

  if (data.title !== undefined) updates.title = data.title;
  if (data.notes !== undefined) updates.notes = data.notes;
  if (data.classification !== undefined) {
    updates.classification = data.classification;
    if (ORDERED_CLASSIFICATIONS.has(data.classification) && data.sortOrder === undefined) {
      const user = requireUser();
      const householdId = (await getDoc(doc(db, 'users', user.uid))).data()?.householdId as string;
      updates.sortOrder = await getTopSortOrder(data.classification, user.uid, householdId);
      updates.sortOrderFamily = await getTopSortOrderFamily(data.classification, householdId);
      updates[`sortOrderByAssignee.${user.uid}`] = updates.sortOrder;
    }
  }
  if (data.status !== undefined) updates.status = data.status;
  if (data.priority !== undefined && data.priority !== null) updates.priority = data.priority;
  if (data.deadline !== undefined) {
    updates.deadline = data.deadline ? Timestamp.fromDate(new Date(data.deadline)) : null;
  }
  if (data.projectId !== undefined) updates.projectId = data.projectId;
  if (data.sortOrder !== undefined) updates.sortOrder = data.sortOrder;
  if (data.sortOrderFamily !== undefined) updates.sortOrderFamily = data.sortOrderFamily;
  if (data.placement !== undefined) updates.placement = data.placement;
  if (data.lastOccurrenceCompletedAt !== undefined) updates.lastOccurrenceCompletedAt = data.lastOccurrenceCompletedAt;
  if (data.recurrence !== undefined) {
    if (data.recurrence) {
      updates.recurrence = Object.fromEntries(
        Object.entries(data.recurrence).filter(([, v]) => v !== undefined),
      );
    } else {
      updates.recurrence = null;
    }
  }
  if (data.assigneeUids !== undefined) {
    updates.assigneeUids = data.assigneeUids;
  }
  if (data.excludeFromFamily !== undefined) updates.excludeFromFamily = data.excludeFromFamily;
  if (data.familyPinned !== undefined) updates.familyPinned = data.familyPinned;
  if (data.sortOrderByAssignee !== undefined) {
    updates.sortOrderByAssignee = data.sortOrderByAssignee;
  }

  // v2 fields
  if (data.vital !== undefined) {
    updates.vital = data.vital;
    // Keep v1 priority in sync
    updates.priority = data.vital ? 'high' : 'low';
  }
  if (data.size !== undefined) {
    updates.size = data.size;
    // Keep v1 classification in sync
    const SIZE_TO_CLASSIFICATION: Record<string, string> = { L: 'boulder', M: 'rock', S: 'pebble' };
    if (data.size && SIZE_TO_CLASSIFICATION[data.size]) {
      updates.classification = SIZE_TO_CLASSIFICATION[data.size];
    }
  }
  if (data.investmentId !== undefined) {
    updates.investmentId = data.investmentId;
    updates.projectId = data.investmentId; // Keep v1 in sync
  }
  if (data.initiativeId !== undefined) updates.initiativeId = data.initiativeId;

  await updateDoc(doc(tasksRef, id), updates as any);
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

  const logProjectId = task.investmentId || task.projectId;
  if (logProjectId) {
    addLogEntry({
      projectId: logProjectId,
      action: 'task_completed',
      description: `Completed task: "${task.title}"`,
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
      assigneeUids: task.assigneeUids,
      excludeFromFamily: task.excludeFromFamily,
      familyPinned: task.familyPinned,
      vital: task.vital,
      size: task.size,
      investmentId: task.investmentId,
      initiativeId: task.initiativeId,
    });
  }

  return { completed: { ...task, status: 'completed', completedAt: now.toDate().toISOString() }, nextOccurrence };
}

export async function iceboxTask(id: string): Promise<Task> {
  requireUser();
  const task = await getTask(id);
  const result = await updateTask(id, { status: 'iceboxed' } as Partial<Task>);

  const logProjectId = task.investmentId || task.projectId;
  if (logProjectId) {
    addLogEntry({
      projectId: logProjectId,
      action: 'task_iceboxed',
      description: `Iceboxed task: "${task.title}"`,
      taskId: task.id,
    }).catch(() => {});
  }

  return result;
}

export async function deleteTask(id: string): Promise<void> {
  requireUser();
  await deleteDoc(doc(tasksRef, id));
}

export type TaskReorderContext = 'me' | 'family';

export async function reorderTasks(
  order: Array<{ id: string; sortOrder: number }>,
  context: TaskReorderContext = 'me',
): Promise<void> {
  const user = requireUser();
  const batch = writeBatch(db);
  for (const item of order) {
    if (context === 'family') {
      batch.update(doc(tasksRef, item.id), {
        sortOrderFamily: item.sortOrder,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(doc(tasksRef, item.id), {
        sortOrder: item.sortOrder,
        [`sortOrderByAssignee.${user.uid}`]: item.sortOrder,
        updatedAt: serverTimestamp(),
      });
    }
  }
  await batch.commit();
}

async function getTopSortOrder(classification: string, uid: string, householdId: string): Promise<number> {
  try {
    const q = query(tasksRef, where('householdId', '==', householdId), where('status', '==', 'active'));
    const snapshot = await getDocs(q);
    const tasks = snapshot.docs
      .map((d) => toTask(d.id, d.data()))
      .filter((t) => t.classification === classification);
    if (tasks.length === 0) return 1000;
    tasks.sort((a, b) => getMeSortOrder(a, uid) - getMeSortOrder(b, uid));
    const minOrder = getMeSortOrder(tasks[0], uid);
    return minOrder - 1000;
  } catch {
    return -1000 + Math.random() * 100;
  }
}

async function getTopSortOrderFamily(classification: string, householdId: string): Promise<number> {
  try {
    const q = query(tasksRef, where('householdId', '==', householdId), where('status', '==', 'active'));
    const snapshot = await getDocs(q);
    const tasks = snapshot.docs
      .map((d) => toTask(d.id, d.data()))
      .filter((t) => t.classification === classification);
    if (tasks.length === 0) return 1000;
    tasks.sort((a, b) => (a.sortOrderFamily || 0) - (b.sortOrderFamily || 0));
    const minOrder = tasks[0].sortOrderFamily || 0;
    return minOrder - 1000;
  } catch {
    return -1000 + Math.random() * 100;
  }
}
