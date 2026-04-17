import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listTasks,
  createTask,
  updateTask,
  completeTask,
  iceboxTask,
  reorderTasks,
  deleteTask,
  type TaskReorderContext,
} from '../api/tasks';
import { useInvestments } from './useInvestments';
import { useAuth } from './useAuth';
import type { Classification, Task, TaskSize, RecurrenceRule, PlannerScope } from '../types';
import { deadlineToLocalMs } from '@/lib/firestoreTime';
import { isTaskVisibleInFamily, isTaskVisibleInMe } from '../taskPolicy';

export type { PlannerScope } from '../types';

/** One Firestore fetch for all active tasks; inbox/boulders/rocks/pebbles/due-soon derive via `select`. */
const ACTIVE_TASKS_QUERY_KEY = ['tasks', 'active-all'] as const;

function isActiveTasksOnly(filters: {
  classification?: Classification;
  status?: string;
  projectId?: string;
}): boolean {
  return (
    filters.status === 'active' &&
    filters.classification === undefined &&
    filters.projectId === undefined
  );
}

export function useTasks(filters: {
  classification?: Classification;
  status?: string;
  projectId?: string;
}) {
  const activeOnly = isActiveTasksOnly(filters);
  return useQuery({
    queryKey: activeOnly ? ACTIVE_TASKS_QUERY_KEY : (['tasks', filters] as const),
    queryFn: () => listTasks(filters),
  });
}

export function useInboxTasks() {
  return useQuery({
    queryKey: ACTIVE_TASKS_QUERY_KEY,
    queryFn: () => listTasks({ status: 'active' }),
    select: (tasks) => tasks.filter(t => t.classification === 'unclassified'),
  });
}

// ── v2 selectors ──

export function useVitalTasks() {
  return useQuery({
    queryKey: ACTIVE_TASKS_QUERY_KEY,
    queryFn: () => listTasks({ status: 'active' }),
    select: (tasks) => tasks.filter(t => t.vital === true && t.size != null),
  });
}

export function useOtherTasks() {
  return useQuery({
    queryKey: ACTIVE_TASKS_QUERY_KEY,
    queryFn: () => listTasks({ status: 'active' }),
    select: (tasks) => tasks.filter(t => t.vital === false && t.size != null),
  });
}

/** Untriaged tasks: missing size or importance (inbox). */
export function useInboxTasksV2() {
  return useQuery({
    queryKey: ACTIVE_TASKS_QUERY_KEY,
    queryFn: () => listTasks({ status: 'active' }),
    select: (tasks) => tasks.filter(t => t.size == null || t.vital === null),
  });
}

export function useTasksByInvestment(investmentId: string | null) {
  return useQuery({
    queryKey: ACTIVE_TASKS_QUERY_KEY,
    queryFn: () => listTasks({ status: 'active' }),
    select: (tasks) => tasks.filter(t => t.investmentId === investmentId),
    enabled: investmentId != null,
  });
}

export function useIceboxedTasks() {
  return useQuery({
    queryKey: ['tasks', 'iceboxed'],
    queryFn: () => listTasks({ status: 'iceboxed' }),
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Task> }) => updateTask(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useCompleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => completeTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useIceboxTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => iceboxTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useReactivateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, size }: { id: string; size?: TaskSize }) =>
      updateTask(id, { status: 'active', ...(size !== undefined ? { size } : {}) } as Partial<Task>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteTask,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/** v2 triage: set vital, size, and optionally assign to an investment/initiative. */
export function useTriageTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, vital, size, investmentId, initiativeId }: {
      id: string;
      vital?: boolean | null;
      size?: Task['size'];
      investmentId?: string | null;
      initiativeId?: string | null;
    }) => updateTask(id, { vital, size, investmentId, initiativeId } as Partial<Task>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useReorderTasks(context: TaskReorderContext = 'me') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (order: Array<{ id: string; sortOrder: number }>) => reorderTasks(order, context),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/** True when the deadline is set and falls on or before the end of today (local). */
export function isOverdueOrDueToday(deadline: Task['deadline'] | undefined): boolean {
  const ts = deadlineToLocalMs(deadline);
  if (ts === 0) return false;
  const now = new Date();
  now.setHours(23, 59, 59, 999); // End of today
  return ts <= now.getTime();
}

function getRecurrenceCadenceHours(rule: RecurrenceRule): number {
  switch (rule.freq) {
    case 'daily':
      return 24;
    case 'weekly':
      // If specific days are set, the "cadence" between occurrences might be less than a week,
      // but for simplicity of "hiding", we'll treat weekly as a 7-day cadence unless we want to be more surgical.
      // Usually weekly means "once a week".
      return 7 * 24;
    case 'monthly':
      return 30 * 24;
    case 'yearly':
      return 365 * 24;
    case 'periodically': {
      const interval = rule.interval || 1;
      if (rule.periodUnit === 'hours') return interval;
      if (rule.periodUnit === 'days') return interval * 24;
      if (rule.periodUnit === 'weeks') return interval * 7 * 24;
      return interval * 24; // default to days
    }
    case 'custom': {
      const interval = rule.interval || 1;
      if (rule.customUnit === 'weekly') return interval * 7 * 24;
      if (rule.customUnit === 'monthly') return interval * 30 * 24;
      return interval * 7 * 24; // default to weekly
    }
    default:
      return 7 * 24 + 1; // Default to more than a week
  }
}

function isFutureRecurring(task: Task): boolean {
  if (!task.recurrence) return false;
  const ts = deadlineToLocalMs(task.deadline);
  if (ts === 0) return false;
  
  const now = Date.now();
  const diffMs = ts - now;
  if (diffMs <= 0) return false; // Already due or overdue

  const diffHours = diffMs / (1000 * 60 * 60);
  const cadenceHours = getRecurrenceCadenceHours(task.recurrence);

  // 1. Any recurring task that is more than a week away should be hidden.
  if (diffHours > 7 * 24) return true;

  // 2. If the recurrence cadence is 24 hours or less, it should be hidden until 12 hours before the next due date and time.
  if (cadenceHours <= 24) {
    return diffHours > 12;
  }

  // 3. If the recurrence cadence is more than 24 hours but less than or equal to a week, it should be hidden until 24 hours before the next due date and time.
  if (cadenceHours <= 7 * 24) {
    return diffHours > 24;
  }

  return false;
}

function filterTasksByPlannerScope(
  tasks: Task[],
  scope: PlannerScope,
  uid: string,
  investmentById: Map<string, { familyVisible: boolean }>,
): Task[] {
  if (scope === 'me') {
    return tasks.filter((task) =>
      isTaskVisibleInMe(task, task.investmentId ? investmentById.get(task.investmentId) : undefined, uid),
    );
  }
  return tasks.filter((task) =>
    isTaskVisibleInFamily(task, task.investmentId ? investmentById.get(task.investmentId) : undefined),
  );
}

export function useDueSoonTasks(scope: PlannerScope = 'me') {
  const { data: allTasks = [] } = useTasks({ status: 'active' });
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const { data: activeInvestments = [] } = useInvestments('active');

  return useMemo(() => {
    if (!uid) return [];
    const investmentById = new Map(activeInvestments.map((investment) => [investment.id, investment]));
    let pool = filterTasksByPlannerScope(allTasks, scope, uid, investmentById);
    const dueSoon = pool.filter((t) => isOverdueOrDueToday(t.deadline) && !isFutureRecurring(t));
    return dueSoon.sort((a, b) => deadlineToLocalMs(a.deadline) - deadlineToLocalMs(b.deadline));
  }, [allTasks, activeInvestments, scope, uid]);
}
