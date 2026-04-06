import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listInvestments,
  getInvestment,
  createInvestment,
  updateInvestment,
  setInvestmentStatus,
  reorderInvestments,
  deleteInvestment,
} from '../api/investments';
import type { Investment, InvestmentStatus } from '../types';

const INVESTMENTS_KEY = ['investments'];

export function useInvestments(status?: InvestmentStatus) {
  return useQuery({
    queryKey: status ? [...INVESTMENTS_KEY, status] : INVESTMENTS_KEY,
    queryFn: () => listInvestments(status ? { status } : undefined),
  });
}

export function useInvestment(id: string | null) {
  return useQuery({
    queryKey: [...INVESTMENTS_KEY, id],
    queryFn: () => getInvestment(id!),
    enabled: !!id,
  });
}

export function useCreateInvestment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      markdown?: string;
      status?: InvestmentStatus;
      familyVisible?: boolean;
    }) => createInvestment(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INVESTMENTS_KEY });
    },
  });
}

export function useUpdateInvestment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Investment> }) =>
      updateInvestment(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INVESTMENTS_KEY });
    },
  });
}

export function useSetInvestmentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: InvestmentStatus }) =>
      setInvestmentStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INVESTMENTS_KEY });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useReorderInvestments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (order: Array<{ id: string; rank: number }>) => reorderInvestments(order),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INVESTMENTS_KEY });
    },
  });
}

export function useDeleteInvestment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteInvestment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INVESTMENTS_KEY });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['activityLog'] });
    },
  });
}
