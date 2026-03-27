import { useQuery } from '@tanstack/react-query';
import { getProjectLog } from '../api/activityLog';

export function useProjectActivityLog(projectId: string | null) {
  return useQuery({
    queryKey: ['activityLog', projectId],
    queryFn: () => getProjectLog(projectId!),
    enabled: !!projectId,
  });
}
