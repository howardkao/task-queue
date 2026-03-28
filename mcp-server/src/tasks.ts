import { db, OWNER_UID, FieldValue, Timestamp } from './firestore.js';

const tasksRef = db.collection('tasks');
const logRef = db.collection('activityLog');

export interface Task {
  id: string;
  title: string;
  notes: string;
  classification: 'unclassified' | 'boulder' | 'pebble';
  status: 'active' | 'completed' | 'iceboxed';
  deadline: string | null;
  recurrence: { freq: string; interval?: number; day?: string } | null;
  projectId: string | null;
  sortOrder: number;
  completedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

function tsToISO(ts: any): string | null {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate().toISOString();
  if (ts._seconds !== undefined) return new Date(ts._seconds * 1000).toISOString();
  if (ts.seconds) return new Date(ts.seconds * 1000).toISOString();
  return null;
}

function toTask(id: string, data: any): Task {
  return {
    id,
    title: data.title || '',
    notes: data.notes || '',
    classification: data.classification || 'unclassified',
    status: data.status || 'active',
    deadline: data.deadline ? (data.deadline.toDate ? data.deadline.toDate().toISOString() : data.deadline) : null,
    recurrence: data.recurrence || null,
    projectId: data.projectId || null,
    sortOrder: data.sortOrder || 0,
    completedAt: tsToISO(data.completedAt),
    createdAt: tsToISO(data.createdAt),
    updatedAt: tsToISO(data.updatedAt),
  };
}

export async function listTasks(filters?: {
  classification?: string;
  status?: string;
  projectId?: string;
  staleThresholdDays?: number;
}): Promise<Task[]> {
  let q: FirebaseFirestore.Query = tasksRef.where('ownerUid', '==', OWNER_UID);

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

  tasks.sort((a, b) => {
    if (a.classification === 'pebble' && b.classification === 'pebble') {
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    }
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aTime - bTime;
  });

  return tasks;
}

export async function getTask(id: string): Promise<Task> {
  const d = await tasksRef.doc(id).get();
  if (!d.exists) throw new Error('Task not found');
  return toTask(d.id, d.data());
}

async function getNewPebbleSortOrder(): Promise<number> {
  try {
    const snapshot = await tasksRef
      .where('ownerUid', '==', OWNER_UID)
      .where('classification', '==', 'pebble')
      .where('status', '==', 'active')
      .orderBy('sortOrder', 'asc')
      .get();

    if (snapshot.empty) return 1000;

    const orders = snapshot.docs.map(d => d.data().sortOrder as number);
    if (orders.length < 4) {
      return orders[orders.length - 1] + 1000;
    }
    return orders[2] + (orders[3] - orders[2]) / 2;
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
  await logRef.add({
    ...entry,
    ownerUid: OWNER_UID,
    timestamp: FieldValue.serverTimestamp(),
  });
}

export async function createTask(data: {
  title: string;
  notes?: string;
  classification?: string;
  deadline?: string;
  projectId?: string;
  recurrence?: any;
}): Promise<Task> {
  let sortOrder = 0;
  if (data.classification === 'pebble') {
    sortOrder = await getNewPebbleSortOrder();
  }

  const taskData: any = {
    title: data.title.trim(),
    notes: data.notes || '',
    classification: data.classification || 'unclassified',
    status: 'active',
    deadline: data.deadline ? Timestamp.fromDate(new Date(data.deadline)) : null,
    recurrence: data.recurrence || null,
    projectId: data.projectId || null,
    sortOrder,
    ownerUid: OWNER_UID,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const ref = await tasksRef.add(taskData);

  if (data.projectId) {
    addLogEntry({
      projectId: data.projectId,
      action: 'task_created',
      description: `Created ${data.classification || 'unclassified'}: "${data.title.trim()}"`,
      taskId: ref.id,
    }).catch(() => {});
  }

  return getTask(ref.id);
}

export async function updateTask(id: string, data: {
  title?: string;
  notes?: string;
  classification?: string;
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
    if (data.classification === 'pebble' && data.sortOrder === undefined) {
      updates.sortOrder = await getNewPebbleSortOrder();
    }
  }
  if (data.status !== undefined) updates.status = data.status;
  if (data.deadline !== undefined) {
    updates.deadline = data.deadline ? Timestamp.fromDate(new Date(data.deadline)) : null;
  }
  if (data.projectId !== undefined) updates.projectId = data.projectId;
  if (data.sortOrder !== undefined) updates.sortOrder = data.sortOrder;

  await tasksRef.doc(id).update(updates);
  return getTask(id);
}

export async function completeTask(id: string): Promise<{ completed: Task; nextOccurrence: Task | null }> {
  const task = await getTask(id);
  await tasksRef.doc(id).update({
    status: 'completed',
    completedAt: FieldValue.serverTimestamp(),
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
    const nextDeadline = calculateNextOccurrence(task.recurrence, task.deadline);
    nextOccurrence = await createTask({
      title: task.title,
      notes: task.notes,
      classification: task.classification,
      deadline: nextDeadline || undefined,
      projectId: task.projectId || undefined,
      recurrence: task.recurrence,
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
  const nextDay = targetDays.find(d => d > currentDay);
  const daysToAdd = nextDay !== undefined
    ? nextDay - currentDay
    : 7 - currentDay + targetDays[0];
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
      const next = new Date(now);
      next.setDate(next.getDate() + (recurrence.interval || 7));
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
      if (recurrence.days && recurrence.days.length > 0) {
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
