import { z } from 'zod';

// ── Room types ────────────────────────────────────────────────────────────────

export type RoomStatus = 'waiting' | 'playing' | 'finished';

export const RoomSettingsSchema = z.object({
  /**
   * Which rounds to play.
   * 'east' = East round only (4 dealerships).
   * 'east+south' = East + South rounds (8 dealerships).
   * Only applies when terminationType is 'rounds'.
   */
  rounds: z.enum(['east', 'east+south']).default('east+south'),

  /**
   * How the session ends.
   * 'rounds' — play the configured number of rounds, then settle scores.
   * 'bust'   — play until any player's score drops below 0, then settle.
   */
  terminationType: z.enum(['rounds', 'bust']).default('rounds'),

  /**
   * Starting score for each player.
   * Standard zero-sum: 0 (scores can go negative, settle at session end).
   * Bust mode: typically 20 (session ends when any player goes negative).
   * Configurable for tuning.
   */
  startingScore: z.number().int().min(0).max(1000).default(0),

  /**
   * Turn timer in seconds (per-turn limit).
   * Reserved for future use — no turn timer is enforced at MVP (D1/D2).
   * Value is stored so it can be activated later without a settings migration.
   */
  timerSecs: z.number().int().min(5).max(60).default(30),

  /** Minimum fan required to win (reserved for future rule variants). */
  minFan: z.number().int().min(1).max(8).default(1),

  /** Which game table renderer to use. Defaults to 3D; host can switch to 2D. */
  viewMode: z.enum(['2D', '3D']).default('3D'),

  /**
   * Opening Top & Bottom Spirit Flip (开局上下翻精).
   * When true, the first two wall tiles are used as the settlement tile and
   * Jing indicator after dealing, triggering an instant payout for players
   * holding the settlement tile. See engine/src/types.ts GameConfig for details.
   */
  ruleTopBottomJing: z.boolean().default(false),
});
export type RoomSettings = z.infer<typeof RoomSettingsSchema>;

export interface RoomSeat {
  seatIdx: number;
  userId: string | null;
  handle: string | null;
  displayName: string | null;
  ready: boolean;
  isHost: boolean;
}

export interface RoomState {
  roomId: string;
  code: string;
  hostUserId: string;
  status: RoomStatus;
  seats: RoomSeat[];
  settings: RoomSettings;
  createdAt: string;
  gameId?: string;
}

// ── REST DTOs ─────────────────────────────────────────────────────────────────

export const CreateRoomSchema = z.object({
  settings: RoomSettingsSchema.optional(),
});
export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;

export const JoinRoomSchema = z.object({
  code: z.string().min(1, 'Room code is required'),
});
export type JoinRoomInput = z.infer<typeof JoinRoomSchema>;

// ── Socket events ─────────────────────────────────────────────────────────────

/** Client → Server */
export interface WsSubscribePayload {
  roomId: string;
}

/** Server → Client: broadcast on any room state change */
export interface WsRoomUpdatePayload {
  room: RoomState;
}

/** Server → Client: broadcast when the host starts the game */
export interface WsRoomStartedPayload {
  roomId: string;
  gameId: string;
}

/** Server → Client: connection or room-state error */
export interface WsRoomErrorPayload {
  code: string;
  message: string;
}
