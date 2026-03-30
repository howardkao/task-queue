import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchTodayEvents,
  fetchEventsForDate,
  getCalendarFeeds,
  createCalendarFeed,
  updateCalendarFeed,
  deleteCalendarFeed,
} from '../api/calendar';
import type { CalendarFeedInput } from '../types';

export function useTodayEvents() {
  return useQuery({
    queryKey: ['calendar', 'today'],
    queryFn: fetchTodayEvents,
    staleTime: 5 * 60 * 1000, // 5 minutes — calendar data doesn't change often
    retry: 1,
  });
}

/** Fetch calendar events for multiple dates in parallel */
export function useEventsForDates(dates: string[]) {
  return useQueries({
    queries: dates.map(date => ({
      queryKey: ['calendar', date],
      queryFn: () => fetchEventsForDate(date),
      staleTime: 5 * 60 * 1000,
      retry: 1,
    })),
  });
}

// ── Feed management hooks ────────────────────────────────────────────────────

export function useCalendarFeeds() {
  return useQuery({
    queryKey: ['calendar', 'feeds'],
    queryFn: getCalendarFeeds,
    staleTime: 30 * 1000,
    retry: 1,
  });
}

export function useCreateFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CalendarFeedInput) => createCalendarFeed(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar', 'feeds'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
    },
  });
}

export function useUpdateFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<CalendarFeedInput & { enabled: boolean }> }) =>
      updateCalendarFeed(id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar', 'feeds'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
    },
  });
}

export function useDeleteFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCalendarFeed(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar', 'feeds'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
    },
  });
}
