import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listTasks, createTask, updateTask, completeTask, iceboxTask, reorderPebbles, deleteTask } from '../api/tasks';
import { useProjects } from './useProjects';
import type { Classification, Task, RecurrenceRule } from '../types';

export const STANDALONE_PROJECT_FILTER = '__standalone__';
export type TodayProjectFilter = string[];

export function useTasks(filters: {
  classification?: Classification;
  status?: string;
  projectId?: string;
}) {
  return useQuery({
    queryKey: ['tasks', filters],
    queryFn: () => listTasks(filters),
  });
}

export function useInboxTasks() {
  return useQuery({
    queryKey: ['tasks', 'inbox'],
    queryFn: () => listTasks({ classification: 'unclassified', status: 'active' }),
  });
}

export function useBoulders() {
  return useQuery({
    queryKey: ['tasks', 'boulders'],
    queryFn: () => listTasks({ classification: 'boulder', status: 'active' }),
  });
}

export function useRocks() {
  return useQuery({
    queryKey: ['tasks', 'rocks'],
    queryFn: () => listTasks({ classification: 'rock', status: 'active' }),
  });
}

export function usePebbles() {
  return useQuery({
    queryKey: ['tasks', 'pebbles'],
    queryFn: () => listTasks({ classification: 'pebble', status: 'active' }),
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

export function useReorderPebbles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: reorderPebbles,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', 'pebbles'] });
    },
  });
}

function filterOutOnHoldProjectTasks(tasks: Task[], activeProjectIds: Set<string>) {
  return tasks.filter(task => !task.projectId || activeProjectIds.has(task.projectId));
}

function getTimestamp(value: any): number {
  if (!value) return 0;
  if (typeof value === 'object' && value.seconds) return value.seconds * 1000;
  if (typeof value === 'object' && typeof value.toDate === 'function') return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** True when the deadline is set and falls on or before the end of today (local). */
export function isOverdueOrDueToday(deadline: any): boolean {
  const ts = getTimestamp(deadline);
  if (ts === 0) return false;
  const now = new Date();
  now.setHours(23, 59, 59, 999); // End of today
  return ts <= now.getTime();
}

function isDueLater(deadline: any): boolean {
  const ts = getTimestamp(deadline);
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
  const ts = getTimestamp(task.deadline);
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

function sortTodayTasks(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    // 1. Due Later tasks (that aren't in Due Soon) go to the very top
    const aDueLater = isDueLater(a.deadline);
    const bDueLater = isDueLater(b.deadline);
    if (aDueLater !== bDueLater) return aDueLater ? -1 : 1;

    // 2. Future recurring tasks go to the bottom
    const aFuture = isFutureRecurring(a);
    const bFuture = isFutureRecurring(b);
    if (aFuture !== bFuture) return aFuture ? 1 : -1;

    // Primary: Manual sort order
    const aOrder = a.sortOrder || 0;
    const bOrder = b.sortOrder || 0;
    if (aOrder !== bOrder) return aOrder - bOrder;

    // Secondary: Created time (newest first for same sort order)
    return getTimestamp(b.createdAt) - getTimestamp(a.createdAt);
  });
}

function useTodayTaskList(tasks: Task[], projectFilter: TodayProjectFilter = []) {
  const { data: activeProjects = [] } = useProjects('active');

  const data = useMemo(() => {
    const activeProjectIds = new Set(activeProjects.map(project => project.id));
    let visibleTasks = filterOutOnHoldProjectTasks(tasks, activeProjectIds);
    
    // We only exclude tasks that are in the "Due Soon" section (Overdue/Today)
    // AND tasks that are considered future recurring based on our new logic
    visibleTasks = visibleTasks.filter(t => !isOverdueOrDueToday(t.deadline) && !isFutureRecurring(t));

    const projectFilteredTasks = filterByTodayProject(visibleTasks, projectFilter);
    return sortTodayTasks(projectFilteredTasks);
  }, [tasks, activeProjects, projectFilter]);

  return data;
}

export function useDueSoonTasks() {
  const { data: allTasks = [] } = useTasks({ status: 'active' });
  
  return useMemo(() => {
    const dueSoon = allTasks.filter(t => isOverdueOrDueToday(t.deadline) && !isFutureRecurring(t));
    return dueSoon.sort((a, b) => getTimestamp(a.deadline) - getTimestamp(b.deadline));
  }, [allTasks]);
}

export function useTodayInboxTasks(projectFilter: TodayProjectFilter = []) {
  const inboxQuery = useInboxTasks();
  const data = useTodayTaskList(inboxQuery.data || [], projectFilter);

  return { ...inboxQuery, data };
}

export function useTodayBoulders(projectFilter: TodayProjectFilter = []) {
  const bouldersQuery = useBoulders();
  const data = useTodayTaskList(bouldersQuery.data || [], projectFilter);

  return { ...bouldersQuery, data };
}

export function useTodayRocks(projectFilter: TodayProjectFilter = []) {
  const rocksQuery = useRocks();
  const data = useTodayTaskList(rocksQuery.data || [], projectFilter);

  return { ...rocksQuery, data };
}

export function useTodayPebbles(projectFilter: TodayProjectFilter = []) {
  const pebblesQuery = usePebbles();
  const data = useTodayTaskList(pebblesQuery.data || [], projectFilter);

  return { ...pebblesQuery, data };
}
