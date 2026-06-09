import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MyProfile {
  sub: string;
  handle: string;
  displayName: string;
  role: 'user' | 'admin';
  createdAt: string;
  updatedAt: string;
  disabled: boolean;
  gamesPlayed: number;
  gamesWon: number;
  rating: number;
  streak: number;
}

export interface UpdateProfileInput {
  displayName?: string;
  handle?: string;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useMyProfile() {
  return useQuery({
    queryKey: ['profile', 'me'],
    queryFn: () => api.get<MyProfile>('/users/me').then((r) => r.data),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateProfileInput) =>
      api.patch<MyProfile>('/users/me', data).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profile', 'me'] });
    },
  });
}
