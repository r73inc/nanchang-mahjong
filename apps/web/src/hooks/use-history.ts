import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface GameHistoryItem {
  gameId: string;
  placement: 1 | 2 | 3 | 4;
  finalScore: number;
  result: 'win' | 'draw' | 'concede' | 'bust';
  endedAt: string;
}

export interface HistoryPage {
  games: GameHistoryItem[];
  nextCursor?: string;
}

export function useGameHistory() {
  return useInfiniteQuery({
    queryKey: ['games', 'history'] as const,
    queryFn: ({ pageParam }: { pageParam: string | undefined }): Promise<HistoryPage> =>
      api
        .get<HistoryPage>('/users/me/games', {
          params: { limit: 20, ...(pageParam ? { cursor: pageParam } : {}) },
        })
        .then((r) => r.data),
    getNextPageParam: (lastPage: HistoryPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
  });
}
