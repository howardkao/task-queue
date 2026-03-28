import { useQuery, useQueries } from '@tanstack/react-query';
import { fetchTodayEvents, fetchEventsForDate } from '../api/calendar';

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
