import {
  calculateNextOccurrence,
  ORDERED_CLASSIFICATIONS,
  sortTasksForList,
  type RecurrenceRule,
} from '@task-queue/shared';
import { db, OWNER_UID, FieldValue, Timestamp } from './firestore.js';

const tasksRef = db.collection('tasks');
const logRef = db.collection('activityLog');

export type Classification = 'unclassified' | 'boulder' | 'rock' | 'pebble';

export interface Task {
  id: string;
  title: string;
  notes: string;
  classification: Classification;
  status: 'active' | 'completed' | 'iceboxed';
  priority: 'high' | 'med' | 'low';
  deadline: string | null;
  recurrence: { freq: string; interval?: number; days?: string[]; customUnit?: string; periodUnit?: string } | null;
  projectId: string | null;
  sortOrder: number;
  sortOrderFamily: number;
  sortOrderByAssignee: Record<string, number>;
  completedAt: string | null;
  lastOccurrenceCompletedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  ownerUid?: string;
  householdId?: string | null;
  assigneeUids: string[];
  excludeFromFamily: boolean;
  familyPinned: boolean;
}

function tsToISO(ts: any): string | null {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate().toISOString();
  if (ts._seconds !== undefined) return new Date(ts._seconds * 1000).toISOString();
  if (ts.seconds) return new Date(ts.seconds * 1000).toISOString();
  return null;
}

function toTask(id: string, data: any): Task {
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
          Object.entries(rawBy).filter(([, value]) => typeof value === 'number') as [string, number][],
        )
      : {};
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
    sortOrder: sortBase,
    sortOrderFamily: typeof data.sortOrderFamily === 'number' ? data.sortOrderFamily : sortBase,
    sortOrderByAssignee,
    completedAt: tsToISO(data.completedAt),
    lastOccurrenceCompletedAt: tsToISO(data.lastOccurrenceCompletedAt),
    createdAt: tsToISO(data.createdAt),
    updatedAt: tsToISO(data.updatedAt),
    ownerUid,
    householdId: data.householdId ?? null,
    assigneeUids,
    excludeFromFamily: data.excludeFromFamily === true,
    familyPinned: data.familyPinned === true,
  };
}

async function getOwnerHouseholdId(): Promise<string> {
  const userSnap = await db.collection('users').doc(OWNER_UID).get();
  const householdId = userSnap.data()?.householdId;
  if (typeof householdId !== 'string' || householdId.length === 0) {
    throw new Error(`Owner ${OWNER_UID} is missing householdId`);
  }
  return householdId;
}

async function assertTaskInOwnerHousehold(id: string, data: FirebaseFirestore.DocumentData): Promise<void> {
  const householdId = await getOwnerHouseholdId();
  if (data.householdId !== householdId) {
    throw new Error(`Task ${id} is outside owner household ${householdId}`);
  }
}

export async function listTasks(filters?: {
  classification?: string;
  status?: string;
  projectId?: string;
  staleThresholdDays?: number;
}): Promise<Task[]> {
  const householdId = await getOwnerHouseholdId();
  let q: FirebaseFirestore.Query = tasksRef.where('householdId', '==', householdId);

  if (filters?.status) {
    q = q.where('status', '==', filters.status);
  }

  const snapshot = await q.get();
  let tasks = snapshot.docs.map(d => toTask(d.id, d.data()));

  if (filters?.classification) {
    tasks = tasks.filter(t => t.classification === filters.classification);
  }
  if (filters?.projectId) {
    tasks = tasks.filter(t => t.projectId === filters.projectId);
  }
  if (filters?.staleThresholdDays) {
    const cutoff = Date.now() - filters.staleThresholdDays * 24 * 60 * 60 * 1000;
    tasks = tasks.filter(t => {
      if (!t.createdAt) return false;
      return new Date(t.createdAt).getTime() < cutoff;
    });
  }

  return sortTasksForList(tasks, (t) => (t.createdAt ? new Date(t.createdAt).getTime() : 0));
}

export async function getTask(id: string): Promise<Task> {
  const d = await tasksRef.doc(id).get();
  if (!d.exists) throw new Error('Task not found');
  const data = d.data();
  if (!data) throw new Error('Task data missing');
  await assertTaskInOwnerHousehold(d.id, data);
  return toTask(d.id, data);
}

async function getTopSortOrder(classification: Classification): Promise<number> {
  try {
    const householdId = await getOwnerHouseholdId();
    const snapshot = await tasksRef
      .where('householdId', '==', householdId)
      .where('status', '==', 'active')
      .get();
    const tasks = snapshot.docs
      .map((doc) => toTask(doc.id, doc.data()))
      .filter((task) => task.classification === classification);

    if (tasks.length === 0) return 1000;

    tasks.sort((a, b) => a.sortOrder - b.sortOrder);
    const minOrder = tasks[0].sortOrder;
    return minOrder - 1000;
  } catch {
    return 500 + Math.random() * 100;
  }
}

async function getTopSortOrderFamily(classification: Classification): Promise<number> {
  try {
    const householdId = await getOwnerHouseholdId();
    const snapshot = await tasksRef
      .where('householdId', '==', householdId)
      .where('status', '==', 'active')
      .get();
    const tasks = snapshot.docs
      .map((doc) => toTask(doc.id, doc.data()))
      .filter((task) => task.classification === classification);

    if (tasks.length === 0) return 1000;

    tasks.sort((a, b) => a.sortOrderFamily - b.sortOrderFamily);
    const minOrder = tasks[0].sortOrderFamily;
    return minOrder - 1000;
  } catch {
    return 500 + Math.random() * 100;
  }
}

async function addLogEntry(entry: {
  projectId: string;
  action: string;
  description: string;
  taskId?: string;
}): Promise<void> {
  const householdId = await getOwnerHouseholdId();
  await logRef.add({
    ...entry,
    ownerUid: OWNER_UID,
    householdId,
    timestamp: FieldValue.serverTimestamp(),
  });
}

export async function createTask(data: {
  title: string;
  notes?: string;
  classification?: string;
  priority?: string;
  deadline?: string;
  projectId?: string;
  recurrence?: any;
  lastOccurrenceCompletedAt?: any;
}): Promise<Task> {
  const classification = (data.classification || 'unclassified') as Classification;
  const householdId = await getOwnerHouseholdId();
  const sortOrder = await getTopSortOrder(classification);
  const sortOrderFamily = await getTopSortOrderFamily(classification);

  const taskData: any = {
    title: data.title.trim(),
    notes: data.notes || '',
    classification,
    status: 'active',
    priority: data.priority || 'low',
    deadline: data.deadline ? Timestamp.fromDate(new Date(data.deadline)) : null,
    recurrence: data.recurrence || null,
    projectId: data.projectId || null,
    lastOccurrenceCompletedAt: data.lastOccurrenceCompletedAt || null,
    sortOrder,
    sortOrderFamily,
    sortOrderByAssignee: { [OWNER_UID]: sortOrder },
    ownerUid: OWNER_UID,
    householdId,
    assigneeUids: [OWNER_UID],
    excludeFromFamily: false,
    familyPinned: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const ref = await tasksRef.add(taskData);

  if (data.projectId) {
    addLogEntry({
      projectId: data.projectId,
      action: 'task_created',
      description: `Created ${classification}: "${data.title.trim()}"`,
      taskId: ref.id,
    }).catch(() => {});
  }

  return getTask(ref.id);
}

export async function updateTask(id: string, data: {
  title?: string;
  notes?: string;
  classification?: string;
  priority?: string;
  status?: string;
  deadline?: string | null;
  projectId?: string | null;
  sortOrder?: number;
}): Promise<Task> {
  const updates: any = { updatedAt: FieldValue.serverTimestamp() };

  if (data.title !== undefined) updates.title = data.title;
  if (data.notes !== undefined) updates.notes = data.notes;
  if (data.classification !== undefined) {
    updates.classification = data.classification;
    if (ORDERED_CLASSIFICATIONS.has(data.classification) && data.sortOrder === undefined) {
      updates.sortOrder = await getTopSortOrder(data.classification as Classification);
      updates.sortOrderFamily = await getTopSortOrderFamily(data.classification as Classification);
      updates[`sortOrderByAssignee.${OWNER_UID}`] = updates.sortOrder;
    }
  }
  if (data.priority !== undefined && data.priority !== null) updates.priority = data.priority;
  if (data.status !== undefined) updates.status = data.status;
  if (data.deadline !== undefined) {
    updates.deadline = data.deadline ? Timestamp.fromDate(new Date(data.deadline)) : null;
  }
  if (data.projectId !== undefined) updates.projectId = data.projectId;
  if (data.sortOrder !== undefined) updates.sortOrder = data.sortOrder;
  if ((data as any).placement !== undefined) updates.placement = (data as any).placement;
  if ((data as any).lastOccurrenceCompletedAt !== undefined) updates.lastOccurrenceCompletedAt = (data as any).lastOccurrenceCompletedAt;

  await tasksRef.doc(id).update(updates);
  return getTask(id);
}

export async function reorderTasks(order: Array<{ id: string; sortOrder: number }>): Promise<void> {
  const batch = db.batch();
  for (const item of order) {
    batch.update(tasksRef.doc(item.id), {
      sortOrder: item.sortOrder,
      [`sortOrderByAssignee.${OWNER_UID}`]: item.sortOrder,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
}

export async function completeTask(id: string): Promise<{ completed: Task; nextOccurrence: Task | null }> {
  const task = await getTask(id);
  const now = FieldValue.serverTimestamp();
  await tasksRef.doc(id).update({
    status: 'completed',
    completedAt: now,
    updatedAt: FieldValue.serverTimestamp(),
  });

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
    const nextDeadline = calculateNextOccurrence(task.recurrence as RecurrenceRule, task.deadline);
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

  return { completed: { ...task, status: 'completed' }, nextOccurrence };
}

export async function iceboxTask(id: string): Promise<Task> {
  const task = await getTask(id);
  const result = await updateTask(id, { status: 'iceboxed' });

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
