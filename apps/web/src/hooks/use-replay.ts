import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { ReplayGamePayload } from '@nanchang/shared';

export function useReplay(gameId: string) {
  return useQuery({
    queryKey: ['replay', gameId],
    queryFn: () => api.get<ReplayGamePayload>(`/replays/${gameId}`).then((r) => r.data),
    enabled: !!gameId,
    retry: false,
  });
}
