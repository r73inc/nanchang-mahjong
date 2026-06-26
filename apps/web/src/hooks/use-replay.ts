import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef } from 'react';
import { api } from '../lib/api';
import { useChallenge } from './use-challenges';
import { useAuthStore } from '../stores/auth.store';
import { buildOmniscientTimeline } from '../lib/replay-engine';
import type { ReplayGamePayload, AiSummaryPublic } from '@nanchang/shared';
import type { OmniscientReplayStep } from '../lib/replay-engine';

// ── General replay ─────────────────────────────────────────────────────────────

export function useReplay(gameId: string) {
  return useQuery({
    queryKey: ['replay', gameId],
    queryFn: () => api.get<ReplayGamePayload>(`/replays/${gameId}`).then((r) => r.data),
    enabled: !!gameId,
    retry: false,
  });
}

export function useGameSummary(gameId: string) {
  return useQuery({
    queryKey: ['replay-summary', gameId],
    queryFn: () =>
      api.get<AiSummaryPublic | null>(`/replays/${gameId}/summary`).then((r) => r.data),
    enabled: !!gameId,
    retry: false,
  });
}

export function useRequestGameSummary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (gameId: string) =>
      api.post<AiSummaryPublic>(`/replays/${gameId}/request-summary`).then((r) => r.data),
    onSuccess: (_, gameId) => {
      void qc.invalidateQueries({ queryKey: ['replay-summary', gameId] });
    },
  });
}

/**
 * Regenerate an existing game summary. Requires the admin-ai-features permission
 * (or admin role) — reuses the admin retry endpoint, which re-runs generation and
 * overwrites the stored summary regardless of its current done/failed status.
 */
export function useRegenerateGameSummary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (gameId: string) =>
      api.post(`/admin/ai/jobs/game/${gameId}/retry`).then(() => undefined),
    onSuccess: (_, gameId) => {
      void qc.invalidateQueries({ queryKey: ['replay-summary', gameId] });
    },
  });
}

// ── Challenge replay ───────────────────────────────────────────────────────────

export interface ChallengeReplayParticipant {
  sub: string;
  handle: string;
  gameId: string;
}

export interface UseChallengeReplayResult {
  challenge: ReturnType<typeof useChallenge>['data'];
  participants: ChallengeReplayParticipant[];
  timelines: Record<string, OmniscientReplayStep[]>;
  /** Raw replay payload keyed by participant sub — use for seatNames/seatMap display. */
  payloads: Record<string, ReplayGamePayload>;
  maxTurns: number;
  hasAccess: boolean;
  myStatus: string | null;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Fetches and builds all parallel timelines for a Point Challenge replay.
 *
 * Access control: the current user must have status === 'completed' in the
 * challenge participants list. Without access the replay fetches are disabled
 * and hasAccess is false so the UI can show a gate screen.
 */
export function useChallengeReplay(challengeId: string): UseChallengeReplayResult {
  const user = useAuthStore((s) => s.user);

  const {
    data: challenge,
    isLoading: challengeLoading,
    isError: challengeError,
  } = useChallenge(challengeId);

  const myParticipant = challenge?.participants.find((p) => p.sub === user?.sub);
  const hasAccess = myParticipant?.status === 'completed';

  const completedParticipants = useMemo<ChallengeReplayParticipant[]>(
    () =>
      (challenge?.participants ?? []).flatMap((p) =>
        p.status === 'completed' && p.gameId != null
          ? [{ sub: p.sub, handle: p.handle, gameId: p.gameId }]
          : [],
      ),
    [challenge],
  );

  const replayQueries = useQueries({
    queries: completedParticipants.map((p) => ({
      queryKey: ['replay', p.gameId] as const,
      queryFn: () => api.get<ReplayGamePayload>(`/replays/${p.gameId}`).then((r) => r.data),
      enabled: hasAccess,
      retry: false,
    })),
  });

  // Per-participant cache: reuse the expensive buildOmniscientTimeline result as long as
  // the payload reference hasn't changed. useQueries returns a new array on every render
  // even when the underlying data is identical, so we check reference equality on data
  // rather than depending on the array itself being stable.
  const timelineCache = useRef(
    new Map<string, { payload: ReplayGamePayload; steps: OmniscientReplayStep[] }>(),
  );

  const { timelines, payloads } = useMemo<{
    timelines: Record<string, OmniscientReplayStep[]>;
    payloads: Record<string, ReplayGamePayload>;
  }>(() => {
    const cache = timelineCache.current;
    const timelines: Record<string, OmniscientReplayStep[]> = {};
    const payloads: Record<string, ReplayGamePayload> = {};
    completedParticipants.forEach((p, i) => {
      const data = replayQueries[i]?.data;
      if (!data) return;
      const cached = cache.get(p.sub);
      if (cached && cached.payload === data) {
        timelines[p.sub] = cached.steps;
      } else {
        const steps = buildOmniscientTimeline(data);
        cache.set(p.sub, { payload: data, steps });
        timelines[p.sub] = steps;
      }
      payloads[p.sub] = data;
    });
    return { timelines, payloads };
  }, [completedParticipants, replayQueries]);

  const maxTurns = useMemo(
    () => Math.max(0, ...Object.values(timelines).map((t) => Math.max(0, t.length - 1))),
    [timelines],
  );

  const isLoading =
    challengeLoading || (hasAccess && replayQueries.some((q) => q.isLoading && !q.data));
  const isError = challengeError || replayQueries.some((q) => q.isError);

  return {
    challenge,
    participants: completedParticipants,
    timelines,
    payloads,
    maxTurns,
    hasAccess,
    myStatus: myParticipant?.status ?? null,
    isLoading,
    isError,
  };
}
