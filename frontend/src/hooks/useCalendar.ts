import { useQuery } from '@tanstack/react-query';
import { fetchTodayEvents } from '../api/calendar';

export function useTodayEvents() {
  return useQuery({
    queryKey: ['calendar', 'today'],
    queryFn: fetchTodayEvents,
    staleTime: 5 * 60 * 1000, // 5 minutes — calendar data doesn't change often
    retry: 1,
  });
}
