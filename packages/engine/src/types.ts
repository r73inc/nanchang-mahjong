/**
 * Core type definitions for the Nanchang Mahjong engine.
 * All types are pure data — no I/O, no side effects.
 */

// ── Tile identity ─────────────────────────────────────────────────────────────

/** The 34 unique tile types used in Nanchang Mahjong (no flowers/seasons). */
export type TileType =
  // Characters (万/man) 1–9
  | '1m'
  | '2m'
  | '3m'
  | '4m'
  | '5m'
  | '6m'
  | '7m'
  | '8m'
  | '9m'
  // Circles (饼/pin) 1–9
  | '1p'
  | '2p'
  | '3p'
  | '4p'
  | '5p'
  | '6p'
  | '7p'
  | '8p'
  | '9p'
  // Bamboo (条/sou) 1–9
  | '1s'
  | '2s'
  | '3s'
  | '4s'
  | '5s'
  | '6s'
  | '7s'
  | '8s'
  | '9s'
  // Winds
  | 'east'
  | 'south'
  | 'west'
  | 'north'
  // Dragons
  | 'zhong'
  | 'fa'
  | 'bai';

/**
 * A physical tile ID (0–135). Each TileType has exactly 4 copies.
 * `tileId = typeIndex * 4 + copyIndex` where typeIndex ∈ [0, 33] and copyIndex ∈ [0, 3].
 */
export type TileId = number;

// ── Melds ─────────────────────────────────────────────────────────────────────

export type MeldKind = 'chow' | 'pung' | 'kong';

export interface Meld {
  kind: MeldKind;
  /** Canonical tile types in the meld (sorted; for chow: [n, n+1, n+2]). */
  tiles: [TileType, TileType, TileType] | [TileType, TileType, TileType, TileType];
  /** Whether the meld was formed entirely from drawn/held tiles (not a claimed discard). */
  concealed: boolean;
}

// ── Hand decomposition ────────────────────────────────────────────────────────

/** A valid decomposition of a 14-tile winning hand. */
export interface Decomposition {
  pair: TileType;
  melds: Meld[];
  /** How many Jing (wildcard) tiles were used across all melds and the pair. */
  jingsUsed: number;
  /** True if the pair uses at least one Jing tile. */
  jingPair: boolean;
}

// ── Hand types (for scoring multiplier selection) ─────────────────────────────

/**
 * The structural type of a winning hand.
 * Determines the hand-type multiplier in the locked rules payout table (§6.3).
 */
export type HandType =
  | 'standard' // 4 melds + 1 pair
  | 'seven_pairs' // 七对子 — seven pairs; ×2
  | 'all_triplets' // 大七对 — all pungs/kongs + pair (Big Seven Pairs / Pung Pung Hu); ×2
  | 'thirteen_misfits' // 十三烂 — Thirteen Misfits; ×2
  | 'seven_star_thirteen'; // 七星十三烂 — Seven Star Thirteen Misfits (all 7 unique honors); ×4

// ── Scoring ───────────────────────────────────────────────────────────────────

export type WinType = 'tsumo' | 'ron';

/**
 * Context supplied to the scoring functions.
 * Implements the locked rules §6.3 / §6.4 multiplier system.
 */
export interface ScoringContext {
  winType: WinType;
  handType: HandType;
  /** Seat index of the winner. */
  winnerSeat: 0 | 1 | 2 | 3;
  /** Seat index of the current dealer. */
  dealerSeat: 0 | 1 | 2 | 3;
  /** Seat index of the discarder (ron only; undefined for tsumo). */
  discarderSeat?: 0 | 1 | 2 | 3;
  /** Seat index whose add-to-kong was robbed (rob-kong wins only). */
  kongSeat?: 0 | 1 | 2 | 3;
  /** Winner's seat wind (computed from winnerSeat and dealerSeat). */
  seatWind: SeatWind;
  /** Current prevailing (round) wind. */
  roundWind: SeatWind;
  /** Won by robbing an add-to-kong move (抢杠). Treated as tsumo; konger pays for all. */
  isRobKong: boolean;
  /** Won without using any Jing tiles as wildcards (prerequisite for German). */
  isGerman: boolean;
  /** German win where no other player holds Jing tiles (passed from session layer). */
  isTrueGerman: boolean;
  /** Won while waiting on a pair with 4 open melds (精钓); must be tsumo. */
  isSpiritFishing: boolean;
  /** Dealer wins on their initial 14-tile hand before any discard (天胡). */
  isHeavenlyWin: boolean;
  /** Non-dealer wins on the very first discard ever, before any player draws (地胡). */
  isEarthlyWin: boolean;
  /** Won on a Kong replacement draw (杠上花/杠开). ×4 multiplier (Self-Draw ×2 × Kong Bloom ×2). */
  isAfterKong: boolean;
  /** Won on the very last tile in the wall (海底捞月). Informational. */
  isLastTile: boolean;
  /** Number of Jing tiles used as wildcards in the winning hand (for display / Phase 8). */
  jingsUsed: number;
  /** Open melds at time of win (for display / Phase 8). */
  openMelds: Meld[];
  /** Best decomposition found (undefined for special hands like 7-pairs / 13-misfits). */
  decomposition?: Decomposition;
}

/** One named multiplier or flat-bonus item in the win payout breakdown. */
export interface MultiplierItem {
  name: string;
  nameZh: string;
  /** Multiplicative factor applied to the running total (e.g. 2 = ×2). 1 if flat-only. */
  multiplier: number;
  /** Flat bonus paid by each non-winning player on top of the multiplied amount. */
  flatPerLoser: number;
}

/**
 * The result of calculateWinPayout — describes what each player pays/receives
 * and the breakdown of multipliers for display / Phase 8 history.
 */
export interface WinPaymentResult {
  items: MultiplierItem[];
  /** Product of all applied multipliers. */
  totalMultiplier: number;
  /** Flat bonus per non-winning player (German/True German: 5). */
  flatBonusPerLoser: number;
  /**
   * Score delta for each seat [0,1,2,3].
   * Positive = receives points; negative = pays points.
   * Always zero-sum: sum of all four values = 0.
   */
  scoreDelta: [number, number, number, number];
  /** Total points received by the winner (= scoreDelta[winnerSeat]). */
  winnerTotal: number;
}

export interface Payment {
  /** Units each loser pays (tsumo: all three; ron: only discarder). */
  unitsPerPayer: number;
  totalReceived: number;
}

// ── Game configuration ────────────────────────────────────────────────────────

/**
 * Rule flags that control optional gameplay variants.
 * Stored inside GameState so every engine method has access without additional parameters.
 * All flags default to false (standard Nanchang rules).
 */
export interface GameConfig {
  /**
   * Opening Top & Bottom Spirit Flip (开局上下翻精).
   *
   * After dealing, the dealer rolls two dice; the sum counts stacks backwards
   * from the back of the wall (inclusive) to resolve the jing stack.
   *
   * When true:
   *   1. The TOP tile of the resolved stack is flipped — the settlement tile
   *      (下精); any player holding it in their dealt hand receives 2 pts from
   *      every other player per copy (+1 pt per copy of the next-in-sequence).
   *   2. The settlement tile is swapped with the tile directly below it; the
   *      revealed BOTTOM tile is the Jing indicator.
   *   3. jingPrimary = indicator, jingSecondary = stepAbove(indicator).
   *   4. Both tiles remain in the wall in their swapped positions and are
   *      drawn normally — neither is consumed.
   *
   * When false (standard rule): the same dice procedure resolves the stack,
   * the TOP tile is flipped as the Jing indicator (no settlement, no swap),
   * and it likewise stays in the wall.
   */
  ruleTopBottomJing: boolean;
}

// ── Wall state (physical ring-of-stacks model) ────────────────────────────────

/**
 * The physical wall: 4 per-seat walls × 17 two-tile stacks = 68 stacks (136
 * tiles), modeled as a ring. Dealing/drawing advances forward from the
 * dice-resolved start stack; kong replacements come from the back. See
 * wall.ts for the full conventions and the helpers that operate on this.
 *
 * All positional data a renderer needs to draw the physical table at any
 * point in the hand is derivable from this state alone.
 */
export interface WallState {
  /**
   * All 136 tiles in draw order: index 0 = first tile dealt, walking the
   * ring forward from the deal-start stack (top then bottom of each stack).
   * Fixed at build except for the jing reveal in-place swap.
   */
  drawOrder: TileId[];
  /** Dice roll #1 (rolled by the dealer) — selects which seat's wall. */
  wallSelectionDice: [number, number];
  /** Dice roll #2 (rolled by the selected player) — selects the start stack. */
  dealStartDice: [number, number];
  /** Seat whose wall the deal started from (resolved from roll #1). */
  dealStartSeat: 0 | 1 | 2 | 3;
  /** 0-based stack index within that seat's wall (resolved from roll #2). */
  dealStartStack: number;
  /** Next front (normal) draw position — index into drawOrder. */
  drawPtr: number;
  /** Number of back (kong replacement) draws taken so far. */
  kongDraws: number;
  /** Jing reveal dice (rolled by the dealer) — null until revealJing(). */
  jingDice: [number, number] | null;
  /** Global stack index (0–67) resolved by the jing dice — null until reveal. */
  jingStackGlobal: number | null;
}

// ── Game state ────────────────────────────────────────────────────────────────

export type SeatWind = 'east' | 'south' | 'west' | 'north';

export type GamePhase = 'dealing' | 'jing_reveal' | 'playing' | 'awaiting_claims' | 'finished';

export interface SeatState {
  wind: SeatWind;
  hand: TileType[]; // concealed tiles
  openMelds: Meld[];
  discards: TileType[];
  score: number;
}

export interface GameState {
  phase: GamePhase;
  /** RNG seed for this game (for replay). */
  seed: number;
  /** Rule-variant configuration for this game instance. */
  config: GameConfig;
  /** The indicator tile drawn for Jing determination. */
  jingIndicator: TileType | null;
  /** Primary Spirit (正精): the indicator tile itself — all 4 copies are wildcards. */
  jingPrimary: TileType | null;
  /** Secondary Spirit (副精): the tile one rank above the indicator — all 4 copies are wildcards. */
  jingSecondary: TileType | null;
  /**
   * The physical wall (ring-of-stacks model). Null only during the 'dealing'
   * phase, before deal() has rolled the dice and built the wall.
   */
  wall: WallState | null;
  seats: [SeatState, SeatState, SeatState, SeatState];
  /** Index of the seat whose turn it is. */
  currentSeat: 0 | 1 | 2 | 3;
  /** The last discarded tile (awaiting claims). */
  pendingDiscard: TileType | null;
  /** Index of the seat that just discarded (for claim eligibility). */
  discardedBySeat: (0 | 1 | 2 | 3) | null;
  /** Number of Kongs declared this game (affects dead wall size). */
  kongsTotal: number;
  /** True if the current draw was a Kong replacement tile. */
  isKongDraw: boolean;
  /**
   * Seat index of the current dealer (庄家).
   * The dealer is always seat-wind 'east' for the hand.
   * Initialized to 0 and updated by the session layer via nextDealer() between hands.
   */
  dealerSeat: 0 | 1 | 2 | 3;
  /**
   * The prevailing (round) wind.
   * East round: 'east'. East+South: advances to 'south' after a full dealer rotation.
   */
  roundWind: SeatWind;
}

// ── Events (move log for replay) ──────────────────────────────────────────────

export type GameEvent =
  | {
      kind: 'dice_roll';
      /** What this roll resolves — one event per physical dice moment. */
      purpose: 'wall_selection' | 'deal_start' | 'jing_reveal';
      /** Seat index of the player who physically rolls these dice. */
      roller: 0 | 1 | 2 | 3;
      /** Individual die faces (each 1–6) — never just the sum. */
      dice: [number, number];
    }
  | { kind: 'deal'; seed: number; hands: [TileType[], TileType[], TileType[], TileType[]] }
  | {
      kind: 'opening_jing_settlement';
      /** The flipped settlement tile (下精) that triggered instant payouts. */
      settlementTile: TileType;
      /** Zero-sum score delta for each seat [seat0, seat1, seat2, seat3]. */
      scoreDelta: [number, number, number, number];
    }
  | { kind: 'jing_indicator'; indicator: TileType; jingPrimary: TileType; jingSecondary: TileType }
  | { kind: 'draw'; seat: 0 | 1 | 2 | 3; tile: TileType; fromBack: boolean }
  | { kind: 'discard'; seat: 0 | 1 | 2 | 3; tile: TileType }
  | { kind: 'pung'; seat: 0 | 1 | 2 | 3; tile: TileType }
  | { kind: 'kong_open'; seat: 0 | 1 | 2 | 3; tile: TileType }
  | { kind: 'kong_concealed'; seat: 0 | 1 | 2 | 3; tile: TileType }
  | { kind: 'kong_added'; seat: 0 | 1 | 2 | 3; tile: TileType }
  | { kind: 'chow'; seat: 0 | 1 | 2 | 3; tile: TileType; sequence: [TileType, TileType, TileType] }
  | {
      kind: 'win';
      seat: 0 | 1 | 2 | 3;
      winType: WinType;
      handType: HandType;
      paymentResult: WinPaymentResult;
    }
  | { kind: 'draw_game' }
  | { kind: 'concede'; seat: 0 | 1 | 2 | 3 }
  | {
      kind: 'sacking_dealer';
      /** The tile type all four players discarded in the first round. */
      tile: TileType;
      /** Zero-sum score delta [seat0..3]: dealer pays −15, each other player receives +5. */
      scoreDelta: [number, number, number, number];
    };
