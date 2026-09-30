import { useQuery } from '@tanstack/react-query';
import { api, type UpdateState } from '../api';
import { useServer } from '../serverStore';

/** Is there a newer version (1.0.0)? Shared by «Оновлення» in the settings and the settings button's dot. */
export function useUpdateState(): UpdateState | undefined {
  const serverAvailable = useServer((s) => s.available);
  return useQuery({
    queryKey: ['update'],
    queryFn: api.update,
    enabled: serverAvailable === true,
    staleTime: 60 * 60 * 1000,
    refetchInterval: 6 * 60 * 60 * 1000,
    retry: false,
  }).data;
}
