import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listInitiatives,
  getInitiative,
  createInitiative,
  updateInitiative,
  reorderInitiatives,
  deleteInitiative,
} from '../api/initiatives';
import type { Initiative } from '../types';

const INITIATIVES_KEY = ['initiatives'];

export function useInitiatives(investmentId?: string) {
  return useQuery({
    queryKey: investmentId ? [...INITIATIVES_KEY, investmentId] : INITIATIVES_KEY,
    queryFn: () => listInitiatives(investmentId),
  });
}

export function useInitiative(id: string | null) {
  return useQuery({
    queryKey: [...INITIATIVES_KEY, id],
    queryFn: () => getInitiative(id!),
    enabled: !!id,
  });
}

export function useCreateInitiative() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      investmentId: string;
      markdown?: string;
    }) => createInitiative(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INITIATIVES_KEY });
    },
  });
}

export function useUpdateInitiative() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Initiative> }) =>
      updateInitiative(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INITIATIVES_KEY });
    },
  });
}

export function useReorderInitiatives() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (order: Array<{ id: string; rank: number }>) => reorderInitiatives(order),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INITIATIVES_KEY });
    },
  });
}

export function useDeleteInitiative() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteInitiative,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INITIATIVES_KEY });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
