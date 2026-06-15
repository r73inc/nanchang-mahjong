import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export type FriendStatus = 'pending_sent' | 'pending_received' | 'accepted';

export interface FriendWithProfile {
  friendSub: string;
  handle: string;
  status: FriendStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SearchResult {
  sub: string;
  handle: string;
  friendStatus: FriendStatus | null;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useFriends() {
  return useQuery({
    queryKey: ['friends'],
    queryFn: () =>
      api.get<{ friends: FriendWithProfile[] }>('/friends').then((r) => r.data.friends),
  });
}

export function useSearchUsers(query: string) {
  return useQuery({
    queryKey: ['friends', 'search', query],
    queryFn: () =>
      api
        .get<{ users: SearchResult[] }>(`/friends/search?q=${encodeURIComponent(query)}`)
        .then((r) => r.data.users),
    enabled: query.trim().length > 0,
  });
}

export function useSendRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (targetSub: string) =>
      api.post('/friends/request', { targetSub }).then(() => undefined),
    onSuccess: (_, targetSub) => {
      void qc.invalidateQueries({ queryKey: ['friends'] });
      // Invalidate search results so friendStatus updates live
      void qc.invalidateQueries({ queryKey: ['friends', 'search'] });
      // Optimistically update the cached search result
      void qc.setQueriesData<SearchResult[]>(
        { queryKey: ['friends', 'search'], exact: false },
        (old) =>
          old?.map((u) => (u.sub === targetSub ? { ...u, friendStatus: 'pending_sent' } : u)),
      );
    },
  });
}

export function useAcceptRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (requesterSub: string) =>
      api.post('/friends/accept', { requesterSub }).then(() => undefined),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['friends'] });
    },
  });
}

export function useDeclineRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (requesterSub: string) =>
      api.post('/friends/decline', { requesterSub }).then(() => undefined),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['friends'] });
    },
  });
}

export function useRemoveFriend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (friendSub: string) => api.delete(`/friends/${friendSub}`).then(() => undefined),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['friends'] });
    },
  });
}
