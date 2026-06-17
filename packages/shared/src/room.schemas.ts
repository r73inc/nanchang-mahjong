import { z } from 'zod';

// ── Room types ────────────────────────────────────────────────────────────────

export type RoomStatus = 'waiting' | 'playing' | 'finished';

/** AI opponent difficulty level. */
export type BotDifficulty = 'easy' | 'normal' | 'hard' | 'psychic';

export const RoomSettingsSchema = z.object({
  /**
   * Which rounds to play.
   * 'east'             = East round only (~4 hands).
   * 'east+south'       = East + South rounds (~8 hands).
   * 'east+south+west'  = East + South + West rounds (~12 hands).
   * 'all'              = All four rounds (~16 hands).
   * Only applies when terminationType is 'rounds'.
   * The three- and four-round variants are used exclusively by Point Challenges.
   */
  rounds: z.enum(['east', 'east+south', 'east+south+west', 'all']).default('east+south'),

  /**
   * How the session ends.
   * 'rounds'      — play the configured number of wind-rounds, then settle scores.
   * 'bust'        — play until any player's score drops below 0, then settle.
   * 'fixed-hands' — play exactly maxHands hands, then settle scores.
   */
  terminationType: z.enum(['rounds', 'bust', 'fixed-hands']).default('rounds'),

  /**
   * Maximum number of hands to play (1–4).
   * Only applies when terminationType is 'fixed-hands'.
   */
  maxHands: z.number().int().min(1).max(4).default(1),

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

  /** Which game table renderer to use. Defaults to 2D; host can switch to 3D (WIP). */
  viewMode: z.enum(['2D', '3D']).default('2D'),

  /**
   * Opening Top & Bottom Spirit Flip (开局上下翻精).
   * When true, the first two wall tiles are used as the settlement tile and
   * Jing indicator after dealing, triggering an instant payout for players
   * holding the settlement tile. See engine/src/types.ts GameConfig for details.
   */
  ruleTopBottomJing: z.boolean().default(true),

  /**
   * Claim window duration in seconds.
   * How long players have to claim a discarded tile (pung/kong/chow/win).
   * 0 = unlimited (window only closes when all eligible seats respond).
   */
  claimWindowSecs: z.number().int().min(0).max(60).default(0),
});
export type RoomSettings = z.infer<typeof RoomSettingsSchema>;

export interface RoomSeat {
  seatIdx: number;
  userId: string | null;
  handle: string | null;
  ready: boolean;
  isHost: boolean;
  /** True when this seat is occupied by a bot rather than a human player. */
  isBot?: boolean;
  /** Difficulty of the bot occupying this seat (only set when isBot is true). */
  botDifficulty?: BotDifficulty;
  /** Pre-signed avatar URL, null if the player has no photo. */
  avatarUrl?: string | null;
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

export const BotConfigSchema = z.object({
  /** Number of bot seats to fill (0–3). */
  count: z.number().int().min(0).max(3),
  /** Difficulty applied to all bots in this room. */
  difficulty: z.enum(['easy', 'normal', 'hard', 'psychic']),
});
export type BotConfig = z.infer<typeof BotConfigSchema>;

export const CreateRoomSchema = z.object({
  settings: RoomSettingsSchema.optional(),
  /** Optional bot configuration. When provided, the host's room will be pre-filled
   *  with the requested number of bot seats at the chosen difficulty. */
  bots: BotConfigSchema.optional(),
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
