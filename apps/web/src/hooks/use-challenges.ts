import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getApiErrorMessage } from '../lib/api';
import type {
  Challenge,
  ChallengeSummary,
  CreateChallengeInput,
  CreateChallengeResult,
  StartChallengeGameResult,
  AiSummaryPublic,
} from '@nanchang/shared';

// ── Query keys ────────────────────────────────────────────────────────────────

const KEYS = {
  list: ['challenges'] as const,
  detail: (id: string) => ['challenges', id] as const,
};

// ── Hooks ─────────────────────────────────────────────────────────────────────

/** List all challenges the current user is part of. */
export function useChallenges() {
  return useQuery({
    queryKey: KEYS.list,
    queryFn: () =>
      api.get<{ challenges: ChallengeSummary[] }>('/challenges').then((r) => r.data.challenges),
  });
}

/** Get full challenge detail (score visibility enforced server-side). */
export function useChallenge(challengeId: string) {
  return useQuery({
    queryKey: KEYS.detail(challengeId),
    queryFn: () => api.get<Challenge>(`/challenges/${challengeId}`).then((r) => r.data),
    enabled: !!challengeId,
  });
}

/** Create a challenge and start the creator's game. Returns { challengeId, gameId }. */
export function useCreateChallenge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateChallengeInput) =>
      api.post<CreateChallengeResult>('/challenges', input).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEYS.list });
    },
  });
}

/** Start the challenge game for a challenged participant. Returns { gameId }. */
export function useStartChallengeGame() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (challengeId: string) =>
      api
        .post<StartChallengeGameResult>(`/challenges/${challengeId}/start-game`)
        .then((r) => r.data),
    onSuccess: (_, challengeId) => {
      void qc.invalidateQueries({ queryKey: KEYS.detail(challengeId) });
      void qc.invalidateQueries({ queryKey: KEYS.list });
    },
  });
}

/** Mark that the current user has viewed the final results of a completed challenge. */
export function useMarkChallengeResultsViewed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (challengeId: string) =>
      api.post(`/challenges/${challengeId}/mark-viewed`).then(() => undefined),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEYS.list });
    },
  });
}

/** Fetch the current AI summary state for a challenge (null if none yet). */
export function useChallengeSummary(challengeId: string) {
  return useQuery({
    queryKey: ['challenge-summary', challengeId],
    queryFn: () =>
      api.get<AiSummaryPublic | null>(`/challenges/${challengeId}/summary`).then((r) => r.data),
    enabled: !!challengeId,
    retry: false,
  });
}

/** Request an AI overview summary for a challenge. */
export function useRequestChallengeSummary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (challengeId: string) =>
      api.post<AiSummaryPublic>(`/challenges/${challengeId}/request-summary`).then((r) => r.data),
    onSuccess: (_, challengeId) => {
      void qc.invalidateQueries({ queryKey: ['challenge-summary', challengeId] });
    },
  });
}

/** Decline a challenge invite. */
export function useDeclineChallenge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (challengeId: string) =>
      api.post(`/challenges/${challengeId}/decline`).then(() => undefined),
    onSuccess: (_, challengeId) => {
      void qc.invalidateQueries({ queryKey: KEYS.detail(challengeId) });
      void qc.invalidateQueries({ queryKey: KEYS.list });
    },
    onError: (err: unknown) => getApiErrorMessage(err),
  });
}
