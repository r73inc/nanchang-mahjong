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
import type {
  ClientGameState,
  ClaimAction,
  GameEndedPayload,
  TileType,
  SettlementPreviewPayload,
  HandRevealPayload,
} from '@nanchang/shared';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConnectionStatus = 'live' | 'reconnecting' | 'lost';

export interface ClaimWindowState {
  actions: ClaimAction[];
  deadline: number;
}

export interface GameToast {
  /** 'contested' = a lower-priority claim lost (short flash).
   *  'opening_settlement' = Opening Spirit Flip instant payout at round start.
   *  Everything else = a successful action broadcast to all players (longer display). */
  kind:
    | 'win'
    | 'pung'
    | 'kong_open'
    | 'kong_concealed'
    | 'kong_added'
    | 'chow'
    | 'concede'
    | 'contested'
    | 'opening_settlement';
  seat: 0 | 1 | 2 | 3;
  /** Present for opening_settlement toasts: the flipped tile type. */
  settlementTile?: TileType;
  /** Present for opening_settlement toasts: viewer's score delta. */
  settlementDelta?: number;
  /**
   * Set when the viewer submitted a claim during this window but lost to a
   * higher-priority claim from another seat. Drives the "Another player claimed
   * it first" subtitle in ActionToast.
   */
  outbidBy?: 'win' | 'pung' | 'kong' | 'chow';
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface GameStore {
  // ── Server-authoritative state ─────────────────────────────────────────────
  snapshot: ClientGameState | null;

  // ── Derived from game:ended (available for end-screen) ────────────────────
  ended: GameEndedPayload | null;

  // ── Pre-game settlement preview (ruleTopBottomJing only) ─────────────────
  settlementPreview: SettlementPreviewPayload | null;

  // ── Post-hand reveal (server pauses until host advances) ─────────────────
  handReveal: HandRevealPayload | null;

  // ── Rematch: roomCode delivered by game:rematch-ready ─────────────────────
  rematchRoomCode: string | null;

  // ── UI state ───────────────────────────────────────────────────────────────
  /** Index into snapshot.seats[viewerSeat].hand of the selected tile. */
  selectedTileIdx: number | null;

  /** Set while an optimistic discard is waiting for server confirmation. */
  pendingMove: boolean;

  /** Active claim window sent by the server (null between turns). */
  claimWindow: ClaimWindowState | null;

  /**
   * Tracks the claim kind the viewer submitted during the current claim window.
   * Used to detect when a higher-priority claim from another seat wins so the
   * ActionToast can display a "Another player claimed it first" subtitle.
   * Cleared when the snapshot arrives (window resolved) or on pass.
   */
  viewerClaimSubmitted: 'win' | 'pung' | 'kong' | 'chow' | null;

  /** Short-lived toast from game:contested (auto-cleared after 600ms). */
  toast: GameToast | null;

  /** Socket connection health. Drives the reconnecting overlay. */
  connection: ConnectionStatus;

  /**
   * Set when the server emits an unrecoverable game:error (e.g. GAME_NOT_FOUND,
   * NOT_IN_GAME). Drives the error screen instead of the LoadingScreen.
   */
  gameError: string | null;

  /**
   * True for ~2 seconds after game:your-turn fires for the viewer's seat.
   * Drives the YourTurnBanner centre-screen flash.
   */
  yourTurnFlash: boolean;

  // ── Actions ────────────────────────────────────────────────────────────────
  setSnapshot: (s: ClientGameState) => void;
  setEnded: (e: GameEndedPayload) => void;
  setSettlementPreview: (p: SettlementPreviewPayload | null) => void;
  setHandReveal: (r: HandRevealPayload | null) => void;
  setRematchRoomCode: (code: string) => void;
  setConnection: (s: ConnectionStatus) => void;
  setClaimWindow: (w: ClaimWindowState | null) => void;
  setViewerClaimSubmitted: (k: 'win' | 'pung' | 'kong' | 'chow' | null) => void;
  selectTile: (idx: number | null) => void;
  setPendingMove: (v: boolean) => void;
  setToast: (t: GameToast | null) => void;
  setGameError: (err: string | null) => void;
  setYourTurnFlash: (v: boolean) => void;
  reset: () => void;
}

const initialState = {
  snapshot: null,
  ended: null,
  settlementPreview: null,
  handReveal: null,
  rematchRoomCode: null,
  selectedTileIdx: null,
  pendingMove: false,
  claimWindow: null,
  viewerClaimSubmitted: null as 'win' | 'pung' | 'kong' | 'chow' | null,
  toast: null,
  connection: 'live' as ConnectionStatus,
  gameError: null,
  yourTurnFlash: false,
};

export const useGameStore = create<GameStore>()(
  subscribeWithSelector((set) => ({
    ...initialState,

    setSnapshot: (snapshot) =>
      set({
        snapshot,
        // Server snapshot wins — clear any pending optimistic state
        pendingMove: false,
        // Clear claim window and pending claim once snapshot arrives
        claimWindow: null,
        viewerClaimSubmitted: null,
      }),

    setEnded: (ended) => set({ ended }),

    setSettlementPreview: (settlementPreview) => set({ settlementPreview }),

    setHandReveal: (handReveal) => set({ handReveal }),

    setRematchRoomCode: (rematchRoomCode) => set({ rematchRoomCode }),

    setConnection: (connection) => set({ connection }),

    setClaimWindow: (claimWindow) => set({ claimWindow }),

    setViewerClaimSubmitted: (viewerClaimSubmitted) => set({ viewerClaimSubmitted }),

    selectTile: (selectedTileIdx) => set({ selectedTileIdx }),

    setPendingMove: (pendingMove) => set({ pendingMove }),

    setToast: (toast) => set({ toast }),

    setGameError: (gameError) => set({ gameError }),

    setYourTurnFlash: (yourTurnFlash) => set({ yourTurnFlash }),

    reset: () => set(initialState),
  })),
);
