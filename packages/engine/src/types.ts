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

// ── Scoring ───────────────────────────────────────────────────────────────────

export type WinType = 'tsumo' | 'ron';

export interface ScoringContext {
  winType: WinType;
  /** The seat wind of the winning player. */
  seatWind: SeatWind;
  /** The prevailing (round) wind. */
  roundWind: SeatWind;
  /** True if this was the last tile drawn from the wall (海底). */
  isLastTile: boolean;
  /** True if won on a Kong replacement draw (杠上花). */
  isAfterKong: boolean;
  /** True if won by robbing a Kong (抢杠). */
  isRobKong: boolean;
  /** The decomposition used for scoring. */
  decomposition: Decomposition;
  /** All open melds (from claimed discards). */
  openMelds: Meld[];
}

export interface FanItem {
  name: string;
  nameZh: string;
  fan: number;
}

export interface FanResult {
  items: FanItem[];
  total: number;
}

export interface Payment {
  /** Units each loser pays (tsumo: all three; ron: only discarder). */
  unitsPerPayer: number;
  totalReceived: number;
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
  /** The indicator tile drawn for Jing determination. */
  jingIndicator: TileType | null;
  /** Primary Spirit (正精): the indicator tile itself — all 4 copies are wildcards. */
  jingPrimary: TileType | null;
  /** Secondary Spirit (副精): the tile one rank above the indicator — all 4 copies are wildcards. */
  jingSecondary: TileType | null;
  /** Remaining live wall tile IDs (in draw order). */
  wall: TileId[];
  /** Dead wall (for Kong replacements). */
  deadWall: TileId[];
  seats: [SeatState, SeatState, SeatState, SeatState];
  /** Index of the seat whose turn it is (0=East, 1=South, 2=West, 3=North). */
  currentSeat: 0 | 1 | 2 | 3;
  /** The last discarded tile (awaiting claims). */
  pendingDiscard: TileType | null;
  /** Index of the seat that just discarded (for claim eligibility). */
  discardedBySeat: (0 | 1 | 2 | 3) | null;
  /** Number of Kongs declared this game (affects dead wall size). */
  kongsTotal: number;
  /** True if the current draw was a Kong replacement tile. */
  isKongDraw: boolean;
}

// ── Events (move log for replay) ──────────────────────────────────────────────

export type GameEvent =
  | { kind: 'deal'; seed: number; hands: [TileType[], TileType[], TileType[], TileType[]] }
  | { kind: 'jing_indicator'; indicator: TileType; jingPrimary: TileType; jingSecondary: TileType }
  | { kind: 'draw'; seat: 0 | 1 | 2 | 3; tile: TileType; fromDeadWall: boolean }
  | { kind: 'discard'; seat: 0 | 1 | 2 | 3; tile: TileType }
  | { kind: 'pung'; seat: 0 | 1 | 2 | 3; tile: TileType }
  | { kind: 'kong_open'; seat: 0 | 1 | 2 | 3; tile: TileType }
  | { kind: 'kong_concealed'; seat: 0 | 1 | 2 | 3; tile: TileType }
  | { kind: 'kong_added'; seat: 0 | 1 | 2 | 3; tile: TileType }
  | { kind: 'chow'; seat: 0 | 1 | 2 | 3; tile: TileType; sequence: [TileType, TileType, TileType] }
  | { kind: 'win'; seat: 0 | 1 | 2 | 3; winType: WinType; fanResult: FanResult }
  | { kind: 'draw_game' };
