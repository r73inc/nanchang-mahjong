import { useQuery, useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '../lib/api';
import { useChallenge } from './use-challenges';
import { useAuthStore } from '../stores/auth.store';
import { buildOmniscientTimeline } from '../lib/replay-engine';
import type { ReplayGamePayload } from '@nanchang/shared';
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
      (challenge?.participants ?? [])
        .filter((p) => p.status === 'completed' && !!p.gameId)
        .map((p) => ({ sub: p.sub, handle: p.handle, gameId: p.gameId! })),
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

  const timelines = useMemo<Record<string, OmniscientReplayStep[]>>(() => {
    const result: Record<string, OmniscientReplayStep[]> = {};
    completedParticipants.forEach((p, i) => {
      const data = replayQueries[i]?.data;
      if (data) result[p.sub] = buildOmniscientTimeline(data);
    });
    return result;
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
    maxTurns,
    hasAccess,
    myStatus: myParticipant?.status ?? null,
    isLoading,
    isError,
  };
}
