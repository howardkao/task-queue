import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listTasks, createTask, updateTask, completeTask, iceboxTask, reorderPebbles } from '../api/tasks';
import type { Classification, Task, RecurrenceRule } from '../types';

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
    mutationFn: async (id: string) => {
      const { deleteTask } = await import('../api/tasks');
      return deleteTask(id);
    },
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
