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
import { replayHand } from '@nanchang/engine';
import type {
  TileType,
  SeatWind,
  GamePhase,
  Meld,
  WinPaymentResult,
  HandType,
  WinType,
  GameEvent,
  GameState,
  GameConfig,
  WallState,
  ReplayHandConfig,
} from '@nanchang/engine';

// Re-export engine types so consumers only need one import source.
export type {
  TileType,
  SeatWind,
  GamePhase,
  Meld,
  WinPaymentResult,
  HandType,
  WinType,
  GameEvent,
  GameState,
  GameConfig,
  WallState,
  ReplayHandConfig,
};
// Re-export replay utility so web only needs @nanchang/shared.
export { replayHand };

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

/** Active roller triggers their dice roll — server computes from PRNG seed. */
export const RollDicePayloadSchema = z.object({});
export type RollDicePayload = z.infer<typeof RollDicePayloadSchema>;
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

/**
 * Host advances the pre-game reveal by one step.
 * Each click progresses: hands → settlement (if ruleTopBottomJing) → jing → start.
 */
export const AdvancePreGamePayloadSchema = z.object({});
export type AdvancePreGamePayload = z.infer<typeof AdvancePreGamePayloadSchema>;

/** Host advances past the hand-reveal screen to start the next hand (or end session). */
export const AdvanceHandPayloadSchema = z.object({});
export type AdvanceHandPayload = z.infer<typeof AdvanceHandPayloadSchema>;

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
  /** True when this seat is occupied by an AI bot (not a human player). */
  isBot?: boolean;
  /** Bot difficulty — only set when isBot is true. */
  botDifficulty?: import('./room.schemas').BotDifficulty;
  /** Display name for this seat — player's handle or bot's generated name. */
  seatName: string;
  /** Pre-signed avatar URL; null for bots and players without a photo. */
  avatarUrl?: string | null;
}

/**
 * Public wall-position state — everything a renderer needs to draw the
 * physical table (4 walls × 17 stacks × 2 tiles) without leaking any tile
 * identities. Dice values and positions/counts are public table state; only
 * the tiles' faces are secret.
 */
export interface ClientWallState {
  /** Dice roll #1 (rolled by the dealer) — selected which seat's wall. */
  wallSelectionDice: [number, number];
  /** Dice roll #2 (rolled by the selected player) — selected the start stack. */
  dealStartDice: [number, number];
  /** Seat whose wall the deal started from. */
  dealStartSeat: 0 | 1 | 2 | 3;
  /** 0-based stack index within that seat's wall where dealing began. */
  dealStartStack: number;
  /** Next front (normal) draw position in draw order (53 right after deal). */
  drawPtr: number;
  /** Number of back (kong replacement) draws taken so far. */
  kongDraws: number;
  /** Jing reveal dice — null until the jing has been revealed. */
  jingDice: [number, number] | null;
  /** Global stack index (0–67) of the jing/settlement stack — null until reveal. */
  jingStackGlobal: number | null;
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
  /** Tiles remaining to draw (front + back combined). */
  wallCount: number;
  /** Public wall-position state — null until the wall has been built (deal). */
  wall: ClientWallState | null;
  pendingDiscard: TileType | null;
  discardedBySeat: (0 | 1 | 2 | 3) | null;
  /** null = spectator */
  viewerSeat: (0 | 1 | 2 | 3) | null;
  seats: [ClientSeatState, ClientSeatState, ClientSeatState, ClientSeatState];
  /** Which table renderer the host selected for this game. */
  viewMode: '2D' | '3D';
  /** Whether the Opening Top & Bottom Spirit Flip rule is active for this game. */
  ruleTopBottomJing: boolean;
  /**
   * Pre-game reveal sub-phase (null once the game is actually in play).
   *   'dealing'    — waiting for dice rolls before deal(); pendingRoll will be set
   *   'hands'      — hands dealt, waiting for host to advance
   *   'settlement' — settlement tile preview shown (ruleTopBottomJing only)
   *   'jing'       — jing indicator/primary/secondary revealed; waiting for host to start
   */
  preGamePhase: 'dealing' | 'hands' | 'settlement' | 'jing' | null;
  /**
   * Set while awaiting a manual dice roll from a specific player.
   * The roller must emit game:roll-dice to advance.
   * null during normal play.
   */
  pendingRoll: {
    purpose: 'deal_1' | 'deal_2' | 'jing_reveal';
    roller: 0 | 1 | 2 | 3;
  } | null;
}

// ── Pre-game & hand-reveal payloads ──────────────────────────────────────────

/** Per-player spirit tile count for the hand-reveal breakdown. */
export interface SpiritCount {
  /** Copies of jingPrimary held (hand + open melds). */
  primary: number;
  /** Copies of jingSecondary held (hand + open melds). */
  secondary: number;
  /** Number of spirit kongs held (quadruplets of a single spirit type). */
  spiritKongs: number;
}

/**
 * Settlement preview emitted as `game:settlement-preview` before `revealJing()`
 * is called (ruleTopBottomJing mode only). The score deltas in this payload are
 * PREVIEW only — they are applied to official scores when the host clicks "Reveal
 * Spirit" and the engine's `revealJing()` runs.
 */
export interface SettlementPreviewPayload {
  /** The jing dice (rolled by the dealer) that resolved the settlement stack. */
  dice: [number, number];
  /** Global stack index (0–67) of the dice-resolved settlement stack. */
  stackGlobal: number;
  /**
   * The flipped settlement tile (下精) — the TOP tile of the dice-resolved
   * stack. Pays 2 pts per copy held.
   */
  settlementTile: TileType;
  /**
   * The "next in sequence" tile — stepAbove(settlementTile), purely derived
   * (no physical tile is flipped for it). Pays 1 pt per copy held.
   */
  nextTile: TileType;
  /** How many copies of the settlement tile (wall[0]) each seat holds. */
  seatCounts: [number, number, number, number];
  /** Preview score delta (zero-sum) for the 2pt settlement tile. */
  delta: [number, number, number, number];
  /** How many copies of the indicator tile (wall[1]) each seat holds. */
  nextTileSeatCounts: [number, number, number, number];
  /** Preview score delta (zero-sum) for the 1pt indicator tile. */
  nextTileDelta: [number, number, number, number];
  /**
   * True when exactly one player holds any settlement tile (2pt or 1pt),
   * triggering the monopoly doubling rule. The combined delta values already
   * reflect the doubling; this flag is for UI display only.
   */
  isMonopoly?: boolean;
}

/**
 * Hand-reveal payload emitted as `game:hand-reveal` after every hand ends.
 * The server pauses and waits for the host to emit `game:advance-hand` before
 * starting the next hand or ending the session.
 */
export interface HandRevealPayload {
  /** All four hands fully revealed (including the winner's and opponents'). */
  hands: [TileType[], TileType[], TileType[], TileType[]];
  /** All four players' open melds (pungs, chows, kongs) for the full hand picture. */
  openMelds: [Meld[], Meld[], Meld[], Meld[]];
  jingPrimary: TileType | null;
  jingSecondary: TileType | null;
  /** Per-player spirit tile counts (for the settlement breakdown display). */
  spiritCounts: [SpiritCount, SpiritCount, SpiritCount, SpiritCount];
  /** Zero-sum spirit settlement delta [seat0, seat1, seat2, seat3]. */
  spiritDeltas: [number, number, number, number];
  /** How the hand ended. */
  result: 'win' | 'draw' | 'concede';
  /** Seat that won (present when result === 'win'). */
  winnerSeat?: 0 | 1 | 2 | 3;
  winType?: WinType;
  handType?: HandType;
  /** Winning hand payment breakdown (null for draw/concede). */
  winPayment?: WinPaymentResult;
  /** Seat that conceded (present when result === 'concede'). */
  concedeSeat?: 0 | 1 | 2 | 3;
  /** True when this is the last hand of the session. */
  isLastHand: boolean;
  /** Dealer seat for the next hand (undefined when isLastHand). */
  nextDealerSeat?: 0 | 1 | 2 | 3;
  /**
   * Net score change per seat this hand: includes win payment, kong payouts,
   * opening jing settlement, and spirit settlement. Zero-sum.
   */
  handNetDeltas: [number, number, number, number];
  /**
   * Opening jing settlement delta per seat (ruleTopBottomJing only).
   * Omitted when the rule is off or no settlement occurred this hand.
   * Already included in handNetDeltas — tracked separately so the UI can
   * display it as "Bonus Tile" rather than lumping it into "Kong Payouts".
   */
  openingJingDelta?: [number, number, number, number];
  /**
   * The single seat liable for the full win payment.
   * - Ron: the seat that discarded the winning tile.
   * - Rob-kong: the seat whose promoted kong was robbed (pays all three shares).
   * - Tsumo: undefined (all losers share payment equally).
   */
  liableSeat?: 0 | 1 | 2 | 3;
  /** True when the win was a rob-kong (抢杠). UI label only — does not change payment logic. */
  isRobKong?: boolean;
  /**
   * How the winning tile completed the hand (ron wins only; omitted for tsumo and rob-kong).
   * Derived server-side from the winning tile's copy count in the 13-tile closed hand:
   *   0 copies → chow (tile not in hand, must complete a sequence)
   *   1 copy   → pair (completes the eyes/jantou)
   *   2+ copies → pung (completes a triplet)
   * Also inferred from handType: seven_pairs → pair, all_triplets → pung.
   */
  winMeldKind?: 'chow' | 'pung' | 'pair';
  /**
   * The tile that completed the winning hand.
   * - Tsumo: the drawn tile (already present in hands[winnerSeat]).
   * - Ron: the discarded tile (NOT in hands[winnerSeat] — show separately in UI).
   * - Rob-kong: the robbed tile (NOT in hands[winnerSeat] — show separately in UI).
   * - Draw / concede: undefined.
   */
  winningTile?: TileType;
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
  | {
      kind: 'dice_roll';
      /** What the roll resolved: wall selection, deal start, or jing reveal. */
      purpose: 'wall_selection' | 'deal_start' | 'jing_reveal';
      /** Seat of the player who rolled. */
      roller: 0 | 1 | 2 | 3;
      /** Individual die faces (each 1–6). */
      dice: [number, number];
    }
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
  | { kind: 'concede'; seat: 0 | 1 | 2 | 3 }
  | {
      kind: 'opening_jing_settlement';
      /** The flipped settlement tile (下精). */
      settlementTile: TileType;
      /** Zero-sum score delta for each seat [seat0, seat1, seat2, seat3]. */
      scoreDelta: [number, number, number, number];
    };

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
  /** ELO rating deltas per seat [seat0, seat1, seat2, seat3]. Added by Phase 8. */
  ratingDeltas?: [number, number, number, number];
  /** Present when this game is part of a Point Challenge. Navigate to /challenges/:id after viewing the result. */
  challengeId?: string;
  /** Cumulative spirit settlement points per seat across ALL hands in the session. Zero-sum. */
  sessionSpiritPoints?: [number, number, number, number];
  /** Cumulative opening bonus-tile settlement per seat across ALL hands in the session. */
  sessionBonusTilePoints?: [number, number, number, number];
  /** Number of hands won by each seat in the session. */
  handsWon?: [number, number, number, number];
  /** Highest single-hand net score delta achieved by each seat in the session. */
  bestHandPoints?: [number, number, number, number];
}

export interface RematchReadyPayload {
  roomId: string;
  roomCode: string;
}

// ── Typed S→C payload wrappers ────────────────────────────────────────────────
// These exist for type-safe emits in the gateway.

export interface SnapshotPayload {
  state: ClientGameState;
}
/**
 * Broadcast to all players when the host saves and closes a game.
 * Non-host players use this to show a "game was saved" notification.
 */
export interface GameSavedPayload {
  /** Display name of the host who triggered the save. */
  hostName: string;
}
/**
 * Emitted to all players in a restored session when anyone joins or disconnects,
 * so the restore-waiting UI stays in sync.
 */
export interface RestoreStatusPayload {
  restoreCode?: string;
  /** Seat indices of human (non-bot) players in this session. */
  humanSeats: ReadonlyArray<0 | 1 | 2 | 3>;
  /** Seat indices of human players who are currently connected. */
  connectedSeats: ReadonlyArray<0 | 1 | 2 | 3>;
}
/**
 * Sent once per joining player when they join a restored (save-loaded) session.
 * Contains the history-relevant public events from the current hand so the
 * client can bootstrap its in-game history panel without replaying from scratch.
 */
export interface RestoreHistoryPayload {
  events: Array<
    Extract<
      PublicGameEvent,
      | { kind: 'discard' }
      | { kind: 'pung' }
      | { kind: 'chow' }
      | { kind: 'kong_open' }
      | { kind: 'kong_concealed' }
      | { kind: 'kong_added' }
      | { kind: 'win' }
      | { kind: 'concede' }
    >
  >;
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
/** Sent privately to the active player's socket when their drawn hand is a winning hand. */
export interface CanTsumoPayload {
  seat: 0 | 1 | 2 | 3;
}
