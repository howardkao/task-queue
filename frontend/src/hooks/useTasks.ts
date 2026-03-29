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

function getDuePriority(deadline: string | null): number {
  if (!deadline) return 1;
  const due = new Date(deadline);
  if (Number.isNaN(due.getTime())) return 1;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const threshold = new Date(today);
  threshold.setDate(threshold.getDate() + 3);
  threshold.setHours(23, 59, 59, 999);

  return due.getTime() <= threshold.getTime() ? 0 : 1;
}

function getCreatedAtTimestamp(value: any): number {
  if (!value) return 0;
  if (value.seconds) return value.seconds * 1000;
  if (value.toDate) return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
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
    const priorityDiff = getDuePriority(a.deadline) - getDuePriority(b.deadline);
    if (priorityDiff !== 0) return priorityDiff;

    const aOrder = a.sortOrder || 0;
    const bOrder = b.sortOrder || 0;
    if (aOrder !== bOrder) return aOrder - bOrder;

    return getCreatedAtTimestamp(a.createdAt) - getCreatedAtTimestamp(b.createdAt);
  });
}

function useTodayTaskList(tasks: Task[], projectFilter: TodayProjectFilter = []) {
  const { data: activeProjects = [] } = useProjects('active');

  const data = useMemo(() => {
    const activeProjectIds = new Set(activeProjects.map(project => project.id));
    const visibleTasks = filterOutOnHoldProjectTasks(tasks, activeProjectIds);
    const projectFilteredTasks = filterByTodayProject(visibleTasks, projectFilter);
    return sortTodayTasks(projectFilteredTasks);
  }, [tasks, activeProjects, projectFilter]);

  return data;
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
