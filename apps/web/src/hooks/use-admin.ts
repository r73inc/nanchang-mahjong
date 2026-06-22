import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

// ── Dev test game types ───────────────────────────────────────────────────────

export type TestWinCondition = 'immediate' | 'self_draw' | 'left_discard' | 'right_discard';

export interface DevTestMeld {
  kind: 'chow' | 'pung' | 'kong';
  tiles: string[];
  concealed: boolean;
}

export interface DevTestGameConfig {
  hand: string[];
  openMelds?: DevTestMeld[];
  condition: TestWinCondition;
  winTile?: string;
}

// ── Shared types ──────────────────────────────────────────────────────────────

export interface InviteRecord {
  code: string;
  status: 'active' | 'used' | 'revoked' | 'expired';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  note?: string;
}

export interface AdminUser {
  sub: string;
  handle: string;
  role: 'user' | 'admin';
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Invites ───────────────────────────────────────────────────────────────────

export function useAdminInvites() {
  return useQuery({
    queryKey: ['admin', 'invites'],
    queryFn: () =>
      api.get<{ invites: InviteRecord[] }>('/admin/invites').then((r) => r.data.invites),
  });
}

export function useCreateInvites() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { count?: number; expiresAt?: string; note?: string }) =>
      api.post<{ invites: InviteRecord[] }>('/admin/invites', data).then((r) => r.data.invites),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'invites'] }),
  });
}

export function useRevokeInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.delete(`/admin/invites/${code}`).then(() => undefined),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'invites'] }),
  });
}

// ── Users ─────────────────────────────────────────────────────────────────────

export function useAdminUsers(search?: string) {
  return useQuery({
    queryKey: ['admin', 'users', search ?? ''],
    queryFn: () => {
      const qs = search ? `?search=${encodeURIComponent(search)}` : '';
      return api.get<{ users: AdminUser[] }>(`/admin/users${qs}`).then((r) => r.data.users);
    },
  });
}

export function useSetRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sub, role }: { sub: string; role: 'user' | 'admin' }) =>
      api.patch(`/admin/users/${sub}/role`, { role }).then(() => undefined),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useSetDisabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sub, disabled }: { sub: string; disabled: boolean }) =>
      api.patch(`/admin/users/${sub}/disable`, { disabled }).then(() => undefined),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

// ── Dev test room ─────────────────────────────────────────────────────────────

export function useCreateDevTestGame() {
  return useMutation({
    mutationFn: (config: DevTestGameConfig) =>
      api.post<{ gameId: string }>('/admin/dev-test-game', config).then((r) => r.data),
  });
}
