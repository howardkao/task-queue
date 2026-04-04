import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listTasks,
  createTask,
  updateTask,
  completeTask,
  iceboxTask,
  reorderPebbles,
  deleteTask,
  getMeSortOrder,
  type PebbleReorderContext,
} from '../api/tasks';
import { useProjects } from './useProjects';
import { useAuth } from './useAuth';
import type { Classification, Task, RecurrenceRule, Project, PlannerScope } from '../types';
import { firestoreTimeToMs } from '@/lib/firestoreTime';
import { isTaskVisibleOnFamily } from '../taskFamilyScope';

export const STANDALONE_PROJECT_FILTER = '__standalone__';
export type TodayProjectFilter = string[];
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

export function useBoulders() {
  return useQuery({
    queryKey: ACTIVE_TASKS_QUERY_KEY,
    queryFn: () => listTasks({ status: 'active' }),
    select: (tasks) => tasks.filter(t => t.classification === 'boulder'),
  });
}

export function useRocks() {
  return useQuery({
    queryKey: ACTIVE_TASKS_QUERY_KEY,
    queryFn: () => listTasks({ status: 'active' }),
    select: (tasks) => tasks.filter(t => t.classification === 'rock'),
  });
}

export function usePebbles() {
  return useQuery({
    queryKey: ACTIVE_TASKS_QUERY_KEY,
    queryFn: () => listTasks({ status: 'active' }),
    select: (tasks) => tasks.filter(t => t.classification === 'pebble'),
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

export function useClassifyTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, classification, projectId, deadline, recurrence }: {
      id: string;
      classification: Classification;
      projectId?: string | null;
      deadline?: string | null;
      recurrence?: RecurrenceRule | null;
    }) => updateTask(id, {
      classification,
      projectId: projectId ?? undefined,
      deadline: deadline ?? undefined,
      recurrence: recurrence ?? undefined,
    } as Partial<Task>),
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
    mutationFn: ({ id, classification }: { id: string; classification: Classification }) =>
      updateTask(id, { status: 'active', classification } as Partial<Task>),
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

export function useReorderPebbles(context: PebbleReorderContext = 'me') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (order: Array<{ id: string; sortOrder: number }>) => reorderPebbles(order, context),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

function filterOutOnHoldProjectTasks(tasks: Task[], activeProjectIds: Set<string>) {
  return tasks.filter(task => !task.projectId || activeProjectIds.has(task.projectId));
}

/** True when the deadline is set and falls on or before the end of today (local). */
export function isOverdueOrDueToday(deadline: Task['deadline'] | undefined): boolean {
  const ts = firestoreTimeToMs(deadline);
  if (ts === 0) return false;
  const now = new Date();
  now.setHours(23, 59, 59, 999); // End of today
  return ts <= now.getTime();
}

function isDueLater(deadline: Task['deadline'] | undefined): boolean {
  const ts = firestoreTimeToMs(deadline);
  if (ts === 0) return false;
  const now = new Date();
  now.setHours(23, 59, 59, 999); // End of today
  return ts > now.getTime();
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
  const ts = firestoreTimeToMs(task.deadline);
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

function filterByTodayProject(tasks: Task[], projectFilter: TodayProjectFilter) {
  if (projectFilter.length === 0) return tasks;

  const selected = new Set(projectFilter);
  return tasks.filter(task => {
    if (!task.projectId) {
      return selected.has(STANDALONE_PROJECT_FILTER);
    }
    return selected.has(task.projectId);
  });
}

function sortTodayTasks(tasks: Task[], scope: PlannerScope, uid: string) {
  return [...tasks].sort((a, b) => {
    const aDueLater = isDueLater(a.deadline);
    const bDueLater = isDueLater(b.deadline);
    if (aDueLater !== bDueLater) return aDueLater ? -1 : 1;

    const aFuture = isFutureRecurring(a);
    const bFuture = isFutureRecurring(b);
    if (aFuture !== bFuture) return aFuture ? 1 : -1;

    const aOrder =
      scope === 'family'
        ? (a.sortOrderFamily ?? a.sortOrder ?? 0)
        : getMeSortOrder(a, uid);
    const bOrder =
      scope === 'family'
        ? (b.sortOrderFamily ?? b.sortOrder ?? 0)
        : getMeSortOrder(b, uid);
    if (aOrder !== bOrder) return aOrder - bOrder;

    return firestoreTimeToMs(b.createdAt) - firestoreTimeToMs(a.createdAt);
  });
}

function filterTasksByPlannerScope(
  tasks: Task[],
  scope: PlannerScope,
  uid: string,
  projectById: Map<string, Project>,
): Task[] {
  if (scope === 'me') {
    return tasks.filter((t) => t.assigneeUids.includes(uid));
  }
  return tasks.filter((t) =>
    isTaskVisibleOnFamily(t, t.projectId ? projectById.get(t.projectId) : undefined),
  );
}

function useTodayTaskList(
  tasks: Task[],
  projectFilter: TodayProjectFilter = [],
  scope: PlannerScope = 'me',
) {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const { data: activeProjects = [] } = useProjects('active');

  const data = useMemo(() => {
    if (!uid) return [];
    const projectById = new Map(activeProjects.map((p) => [p.id, p]));
    const activeProjectIds = new Set(activeProjects.map((project) => project.id));
    let visibleTasks = filterOutOnHoldProjectTasks(tasks, activeProjectIds);
    visibleTasks = filterTasksByPlannerScope(visibleTasks, scope, uid, projectById);
    visibleTasks = visibleTasks.filter(
      (t) => !isOverdueOrDueToday(t.deadline) && !isFutureRecurring(t),
    );

    const projectFilteredTasks = filterByTodayProject(visibleTasks, projectFilter);
    return sortTodayTasks(projectFilteredTasks, scope, uid);
  }, [tasks, activeProjects, projectFilter, scope, uid]);

  return data;
}

export function useDueSoonTasks(scope: PlannerScope = 'me') {
  const { data: allTasks = [] } = useTasks({ status: 'active' });
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const { data: activeProjects = [] } = useProjects('active');

  return useMemo(() => {
    if (!uid) return [];
    const projectById = new Map(activeProjects.map((p) => [p.id, p]));
    let pool = filterTasksByPlannerScope(allTasks, scope, uid, projectById);
    const dueSoon = pool.filter((t) => isOverdueOrDueToday(t.deadline) && !isFutureRecurring(t));
    return dueSoon.sort((a, b) => firestoreTimeToMs(a.deadline) - firestoreTimeToMs(b.deadline));
  }, [allTasks, activeProjects, scope, uid]);
}

export function useTodayInboxTasks(
  projectFilter: TodayProjectFilter = [],
  scope: PlannerScope = 'me',
) {
  const inboxQuery = useInboxTasks();
  const data = useTodayTaskList(inboxQuery.data || [], projectFilter, scope);

  return { ...inboxQuery, data };
}

export function useTodayBoulders(
  projectFilter: TodayProjectFilter = [],
  scope: PlannerScope = 'me',
) {
  const bouldersQuery = useBoulders();
  const data = useTodayTaskList(bouldersQuery.data || [], projectFilter, scope);

  return { ...bouldersQuery, data };
}

export function useTodayRocks(
  projectFilter: TodayProjectFilter = [],
  scope: PlannerScope = 'me',
) {
  const rocksQuery = useRocks();
  const data = useTodayTaskList(rocksQuery.data || [], projectFilter, scope);

  return { ...rocksQuery, data };
}

export function useTodayPebbles(
  projectFilter: TodayProjectFilter = [],
  scope: PlannerScope = 'me',
) {
  const pebblesQuery = usePebbles();
  const data = useTodayTaskList(pebblesQuery.data || [], projectFilter, scope);

  return { ...pebblesQuery, data };
}
