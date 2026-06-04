/**
 * Socket event contracts for the Nanchang Mahjong game module.
 *
 * Zod schemas validate inbound Client→Server payloads at the gateway boundary.
 * Plain TypeScript interfaces describe Server→Client payloads (trusted, no validation needed).
 *
 * Both engine types and game-event types are re-exported from here so consumers
 * only need to import from @nanchang/shared.
 */

import { z } from 'zod';
import { TILE_TYPES } from '@nanchang/engine';
import type {
  TileType,
  SeatWind,
  GamePhase,
  Meld,
  WinPaymentResult,
  HandType,
  WinType,
} from '@nanchang/engine';

// Re-export engine types so consumers only need one import source.
export type { TileType, SeatWind, GamePhase, Meld, WinPaymentResult, HandType, WinType };

// ── Shared primitive schemas ──────────────────────────────────────────────────

/** Runtime-validating schema for the 34 canonical tile types. */
export const TileTypeSchema = z.enum(TILE_TYPES as unknown as [TileType, ...TileType[]]);

// ── Client → Server schemas ───────────────────────────────────────────────────

/** Join an active game as a player (re-join) or spectator. */
export const JoinPayloadSchema = z.object({
  gameId: z.string().min(1),
  spectate: z.boolean().optional().default(false),
});
export type JoinPayload = z.infer<typeof JoinPayloadSchema>;

/** Active player discards a tile from their hand. */
export const DiscardPayloadSchema = z.object({
  tile: TileTypeSchema,
  /** Animation hint: was this the most-recently drawn tile? */
  fromDrawn: z.boolean().optional().default(false),
});
export type DiscardPayload = z.infer<typeof DiscardPayloadSchema>;

/** Player claims a discarded tile (during claim window). */
export const ClaimPayloadSchema = z.object({
  kind: z.enum(['win', 'pung', 'kong', 'chow']),
  /** Required for chow claims — the three-tile sequence including the claimed tile. */
  sequence: z.tuple([TileTypeSchema, TileTypeSchema, TileTypeSchema]).optional(),
});
export type ClaimPayload = z.infer<typeof ClaimPayloadSchema>;

/** Player explicitly passes on the current claim window. */
export const PassPayloadSchema = z.object({});
export type PassPayload = z.infer<typeof PassPayloadSchema>;

/** Declare a concealed kong on the active player's turn. */
export const KongConcealedPayloadSchema = z.object({ tile: TileTypeSchema });
export type KongConcealedPayload = z.infer<typeof KongConcealedPayloadSchema>;

/** Promote an existing open pung to a kong (add-to-kong). Opens rob-kong window. */
export const KongAddPayloadSchema = z.object({ tile: TileTypeSchema });
export type KongAddPayload = z.infer<typeof KongAddPayloadSchema>;

/** Player surrenders the game. */
export const ConcedePayloadSchema = z.object({});
export type ConcedePayload = z.infer<typeof ConcedePayloadSchema>;

/** Host triggers the Jing reveal (transitions from jing_reveal → playing). */
export const RevealJingPayloadSchema = z.object({});
export type RevealJingPayload = z.infer<typeof RevealJingPayloadSchema>;

// ── Server → Client data shapes ───────────────────────────────────────────────

/** Per-seat view within a ClientGameState. */
export interface ClientSeatState {
  wind: SeatWind;
  score: number;
  connected: boolean;
  afk: boolean;
  openMelds: Meld[];
  discards: TileType[];
  /**
   * Full hand for the viewer's own seat; null for opponents and spectators.
   * Never leaks private tiles to non-owner viewers.
   */
  hand: TileType[] | null;
  /** Always present — equals the true hand length including private tiles. */
  handCount: number;
}

/**
 * Per-viewer redacted game state.
 * Sent as `game:snapshot` after every applied move and on join/reconnect.
 * The viewer's own hand is revealed; all others are hidden (hand = null).
 */
export interface ClientGameState {
  gameId: string;
  phase: GamePhase;
  jingIndicator: TileType | null;
  jingPrimary: TileType | null;
  jingSecondary: TileType | null;
  currentSeat: 0 | 1 | 2 | 3;
  dealerSeat: 0 | 1 | 2 | 3;
  roundWind: SeatWind;
  wallCount: number;
  deadWallCount: number;
  pendingDiscard: TileType | null;
  discardedBySeat: (0 | 1 | 2 | 3) | null;
  /** null = spectator */
  viewerSeat: (0 | 1 | 2 | 3) | null;
  seats: [ClientSeatState, ClientSeatState, ClientSeatState, ClientSeatState];
}

/** A single available call during a claim window, sent to each eligible seat. */
export interface ClaimAction {
  kind: 'win' | 'pung' | 'kong' | 'chow';
  /** For chow claims — the available sequences. */
  sequences?: [TileType, TileType, TileType][];
}

/**
 * Redacted game event broadcast for animation / toast cues.
 * Contains only public information — no concealed tile values.
 */
export type PublicGameEvent =
  | { kind: 'draw'; seat: 0 | 1 | 2 | 3 } // tile is private
  | { kind: 'discard'; seat: 0 | 1 | 2 | 3; tile: TileType }
  | { kind: 'pung'; seat: 0 | 1 | 2 | 3; tile: TileType }
  | { kind: 'kong_open'; seat: 0 | 1 | 2 | 3; tile: TileType }
  | { kind: 'kong_concealed'; seat: 0 | 1 | 2 | 3 } // tile hidden
  | { kind: 'kong_added'; seat: 0 | 1 | 2 | 3; tile: TileType }
  | { kind: 'chow'; seat: 0 | 1 | 2 | 3; tile: TileType; sequence: [TileType, TileType, TileType] }
  | {
      kind: 'win';
      seat: 0 | 1 | 2 | 3;
      winType: WinType;
      handType: HandType;
      payment: WinPaymentResult;
    }
  | { kind: 'draw_game' }
  | { kind: 'concede'; seat: 0 | 1 | 2 | 3 };

/**
 * Final session result emitted as `game:ended`.
 * Rich enough for Phase 8 ELO calculations — includes score deltas,
 * placement, last-hand win breakdown, and spirit settlement.
 */
export interface GameEndedPayload {
  /** How the session terminated. */
  result: 'win' | 'draw' | 'concede' | 'bust';
  /** Seat that won the final hand (present when result === 'win'). */
  winnerSeat?: 0 | 1 | 2 | 3;
  /** Cumulative final scores after all hands [seat0, seat1, seat2, seat3]. */
  finalScores: [number, number, number, number];
  /** Score rank per seat: 1 = highest score. Tied seats share the same rank. */
  placement: [1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4];
  /** Total hands played in the session. */
  handsPlayed: number;
  /** Win payment breakdown for the final hand (Phase 8 ELO input). */
  lastHandPayment?: WinPaymentResult;
  /** Spirit settlement deltas for the final hand [seat0, seat1, seat2, seat3]. */
  lastHandSpirits?: [number, number, number, number];
  /** userId for each seat [seat0, seat1, seat2, seat3]. */
  seatMap: [string, string, string, string];
  /** Session start ISO timestamp. */
  startedAt: string;
  /** Session end ISO timestamp. */
  endedAt: string;
}

// ── Typed S→C payload wrappers ────────────────────────────────────────────────
// These exist for type-safe emits in the gateway.

export interface SnapshotPayload {
  state: ClientGameState;
}
export interface GameEventPayload {
  event: PublicGameEvent;
}
export interface YourTurnPayload {
  seat: 0 | 1 | 2 | 3;
}
export interface ClaimWindowPayload {
  actions: ClaimAction[];
  deadline: number;
}
export interface RobKongWindowPayload {
  kongSeat: 0 | 1 | 2 | 3;
  deadline: number;
}
export interface ContestedPayload {
  kind: 'win' | 'pung' | 'kong' | 'chow';
  seat: 0 | 1 | 2 | 3;
}
export interface PlayerConnectionPayload {
  seat: 0 | 1 | 2 | 3;
  status: 'connected' | 'reconnecting' | 'left';
}
export interface GameErrorPayload {
  code: string;
  message: string;
}
export interface AfkWarningPayload {
  seat: 0 | 1 | 2 | 3;
}
