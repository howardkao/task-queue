import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  toggleProjectStatus,
} from '../api/projects';
import type { Project, ProjectStatus } from '../types';

const PROJECTS_KEY = ['projects'];

export function useProjects(status?: ProjectStatus) {
  return useQuery({
    queryKey: status ? [...PROJECTS_KEY, status] : PROJECTS_KEY,
    queryFn: () => listProjects(status ? { status } : undefined),
  });
}

export function useProject(id: string | null) {
  return useQuery({
    queryKey: [...PROJECTS_KEY, id],
    queryFn: () => getProject(id!),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; markdown?: string; status?: ProjectStatus }) =>
      createProject(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Project> }) =>
      updateProject(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
    },
  });
}

export function useToggleProjectStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => toggleProjectStatus(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
