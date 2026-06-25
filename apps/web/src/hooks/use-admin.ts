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
  permissions: string[];
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

export function useSetPermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sub, permission, grant }: { sub: string; permission: string; grant: boolean }) =>
      api.patch(`/admin/users/${sub}/permission`, { permission, grant }).then(() => undefined),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

// ── Dev test room ─────────────────────────────────────────────────────────────

export function useCreateDevTestGame() {
  return useMutation({
    mutationFn: (config: DevTestGameConfig) =>
      api.post<{ gameId: string }>('/dev-test/game', config).then((r) => r.data),
  });
}

// ── AI admin types ────────────────────────────────────────────────────────────

export interface AiPendingRequest {
  reqId: string;
  targetType: 'game' | 'challenge';
  targetId: string;
  requestedBy: string;
  requestedAt: string;
}

export interface AiFailedJob {
  targetType: 'game' | 'challenge';
  targetId: string;
  attempts: number;
  errorCode?: string;
  requestedAt: string;
}

// ── AI admin hooks ────────────────────────────────────────────────────────────

export function useAiPendingRequests() {
  return useQuery({
    queryKey: ['admin', 'ai-requests'],
    queryFn: () =>
      api
        .get<{
          requests: Array<{
            PK: string;
            targetType: 'game' | 'challenge';
            targetId: string;
            requestedBy: string;
            requestedAt: string;
          }>;
        }>('/admin/ai/requests')
        .then((r) =>
          r.data.requests.map(
            (item): AiPendingRequest => ({
              reqId: item.PK.replace('AIREQ#', ''),
              targetType: item.targetType,
              targetId: item.targetId,
              requestedBy: item.requestedBy,
              requestedAt: item.requestedAt,
            }),
          ),
        ),
  });
}

export function useApproveAiRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reqId: string) =>
      api.post(`/admin/ai/requests/${reqId}/approve`).then(() => undefined),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'ai-requests'] }),
  });
}

export function useRejectAiRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reqId: string) =>
      api.post(`/admin/ai/requests/${reqId}/reject`).then(() => undefined),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'ai-requests'] }),
  });
}

export function useAiFailedJobs() {
  return useQuery({
    queryKey: ['admin', 'ai-jobs-failed'],
    queryFn: () =>
      api
        .get<{
          jobs: Array<{
            PK: string;
            attempts: number;
            errorCode?: string;
            requestedAt: string;
          }>;
        }>('/admin/ai/jobs/failed')
        .then((r) =>
          r.data.jobs.map((item): AiFailedJob => {
            const hashIdx = item.PK.indexOf('#');
            return {
              targetType: item.PK.slice(0, hashIdx) === 'GAME' ? 'game' : 'challenge',
              targetId: item.PK.slice(hashIdx + 1),
              attempts: item.attempts,
              errorCode: item.errorCode,
              requestedAt: item.requestedAt,
            };
          }),
        ),
  });
}

export function useRetryAiJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      targetType,
      targetId,
    }: {
      targetType: 'game' | 'challenge';
      targetId: string;
    }) => api.post(`/admin/ai/jobs/${targetType}/${targetId}/retry`).then(() => undefined),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'ai-jobs-failed'] }),
  });
}

export interface BackfillResult {
  game: { queued: number; skipped: number };
  challenge: { queued: number; skipped: number };
}

export function useBackfillSummaries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<BackfillResult>('/admin/ai/backfill').then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'ai-requests'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'ai-jobs-failed'] });
    },
  });
}
