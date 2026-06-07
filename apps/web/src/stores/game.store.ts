/**
 * game.store.ts — Zustand store for the live game state.
 *
 * The authoritative ClientGameState snapshot is replaced wholesale on every
 * server push (server always wins). The only optimistic mutation is removing
 * the discarded tile from the viewer's hand while the server confirms.
 *
 * Claim windows and the connection status are also held here so any component
 * in the tree can read them without prop-drilling.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { ClientGameState, ClaimAction, GameEndedPayload } from '@nanchang/shared';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConnectionStatus = 'live' | 'reconnecting' | 'lost';

export interface ClaimWindowState {
  actions: ClaimAction[];
  deadline: number;
}

export interface GameToast {
  /** 'contested' = a lower-priority claim lost (short flash).
   *  Everything else = a successful action broadcast to all players (longer display). */
  kind:
    | 'win'
    | 'pung'
    | 'kong_open'
    | 'kong_concealed'
    | 'kong_added'
    | 'chow'
    | 'concede'
    | 'contested';
  seat: 0 | 1 | 2 | 3;
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface GameStore {
  // ── Server-authoritative state ─────────────────────────────────────────────
  snapshot: ClientGameState | null;

  // ── Derived from game:ended (available for end-screen) ────────────────────
  ended: GameEndedPayload | null;

  // ── Rematch: roomCode delivered by game:rematch-ready ─────────────────────
  rematchRoomCode: string | null;

  // ── UI state ───────────────────────────────────────────────────────────────
  /** Index into snapshot.seats[viewerSeat].hand of the selected tile. */
  selectedTileIdx: number | null;

  /** Set while an optimistic discard is waiting for server confirmation. */
  pendingMove: boolean;

  /** Active claim window sent by the server (null between turns). */
  claimWindow: ClaimWindowState | null;

  /** Short-lived toast from game:contested (auto-cleared after 600ms). */
  toast: GameToast | null;

  /** Socket connection health. Drives the reconnecting overlay. */
  connection: ConnectionStatus;

  /**
   * Set when the server emits an unrecoverable game:error (e.g. GAME_NOT_FOUND,
   * NOT_IN_GAME). Drives the error screen instead of the LoadingScreen.
   */
  gameError: string | null;

  // ── Actions ────────────────────────────────────────────────────────────────
  setSnapshot: (s: ClientGameState) => void;
  setEnded: (e: GameEndedPayload) => void;
  setRematchRoomCode: (code: string) => void;
  setConnection: (s: ConnectionStatus) => void;
  setClaimWindow: (w: ClaimWindowState | null) => void;
  selectTile: (idx: number | null) => void;
  setPendingMove: (v: boolean) => void;
  setToast: (t: GameToast | null) => void;
  setGameError: (err: string | null) => void;
  reset: () => void;
}

const initialState = {
  snapshot: null,
  ended: null,
  rematchRoomCode: null,
  selectedTileIdx: null,
  pendingMove: false,
  claimWindow: null,
  toast: null,
  connection: 'live' as ConnectionStatus,
  gameError: null,
};

export const useGameStore = create<GameStore>()(
  subscribeWithSelector((set) => ({
    ...initialState,

    setSnapshot: (snapshot) =>
      set({
        snapshot,
        // Server snapshot wins — clear any pending optimistic state
        pendingMove: false,
        // Clear claim window once snapshot arrives (it carries the new phase)
        claimWindow: null,
      }),

    setEnded: (ended) => set({ ended }),

    setRematchRoomCode: (rematchRoomCode) => set({ rematchRoomCode }),

    setConnection: (connection) => set({ connection }),

    setClaimWindow: (claimWindow) => set({ claimWindow }),

    selectTile: (selectedTileIdx) => set({ selectedTileIdx }),

    setPendingMove: (pendingMove) => set({ pendingMove }),

    setToast: (toast) => set({ toast }),

    setGameError: (gameError) => set({ gameError }),

    reset: () => set(initialState),
  })),
);
