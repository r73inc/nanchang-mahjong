import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { SaveSlotInfo, SaveSlot } from '@nanchang/shared';

const SAVES_KEY = ['saves'] as const;

export function useSaves() {
  return useQuery({
    queryKey: SAVES_KEY,
    queryFn: (): Promise<SaveSlotInfo[]> => api.get<SaveSlotInfo[]>('/saves').then((r) => r.data),
    staleTime: 30_000,
  });
}

export function useLoadAutoSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (): Promise<{ gameId: string }> =>
      api.post<{ gameId: string }>('/saves/auto/load').then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: SAVES_KEY }),
  });
}

export function useLoadManualSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (): Promise<{ gameId: string; restoreCode: string }> =>
      api.post<{ gameId: string; restoreCode: string }>('/saves/manual/load').then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: SAVES_KEY }),
  });
}

export function useDeleteSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slot: SaveSlot): Promise<void> =>
      api.delete(`/saves/${slot}`).then(() => undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: SAVES_KEY }),
  });
}

export function useJoinRestore() {
  return useMutation({
    mutationFn: (code: string): Promise<{ gameId: string }> =>
      api
        .get<{ gameId: string }>(`/saves/restore/${encodeURIComponent(code.trim().toUpperCase())}`)
        .then((r) => r.data),
  });
}
