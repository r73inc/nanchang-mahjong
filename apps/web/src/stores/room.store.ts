/**
 * room.store.ts — Zustand store for the active room state.
 *
 * Updated by `use-room.ts` whenever the server emits `room:update`.
 * The store is the single source of truth for the Room page;
 * REST calls are made in the hook and the resulting snapshot replaces the store.
 */

import { create } from 'zustand';
import type { RoomState } from '@nanchang/shared';

interface RoomStore {
  /** Current room state (null when not in a room). */
  room: RoomState | null;
  /** Non-null while a REST call is in-flight. */
  loading: boolean;
  /** Last error message (cleared on next successful call). */
  error: string | null;

  setRoom: (room: RoomState) => void;
  clearRoom: () => void;
  setLoading: (v: boolean) => void;
  setError: (message: string | null) => void;
}

export const useRoomStore = create<RoomStore>()((set) => ({
  room: null,
  loading: false,
  error: null,

  setRoom: (room) => set({ room, error: null }),
  clearRoom: () => set({ room: null, error: null, loading: false }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
