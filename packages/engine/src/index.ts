/**
 * Nanchang Mahjong game engine — public API.
 *
 * Pure TypeScript, no I/O, fully deterministic.
 * Use the seed + event log for replay; the engine re-derives any past state.
 */

export const ENGINE_VERSION = '0.1.0';

// ── Types ─────────────────────────────────────────────────────────────────────

export type {
  TileType,
  TileId,
  MeldKind,
  Meld,
  Decomposition,
  WinType,
  ScoringContext,
  FanItem,
  FanResult,
  Payment,
  SeatWind,
  GamePhase,
  SeatState,
  GameState,
  GameEvent,
} from './types';

// ── Tile utilities ────────────────────────────────────────────────────────────

export {
  TILE_TYPES,
  SUIT_MAN,
  SUIT_PIN,
  SUIT_SOU,
  WINDS,
  DRAGONS,
  WIND_CHOWS,
  DRAGON_CHOW,
  typeOf,
  idOf,
  typeIndex,
  sortTypes,
  isHonor,
  isSuit,
  isTerminal,
  isTerminalOrHonor,
  getSuit,
  getRank,
  stepAbove,
  suitDistance,
  getHonorChowsContaining,
  buildWall,
} from './tiles';

// ── PRNG ──────────────────────────────────────────────────────────────────────

export { mulberry32, seededShuffle } from './prng';

// ── Jing (wildcard) ───────────────────────────────────────────────────────────

export { jingTypeFromIndicator, jingTypesFromIndicator, isJing, separateJing } from './jing';

// ── Hand analysis ─────────────────────────────────────────────────────────────

export { isWinningHand, decomposeHand, shantenNumber } from './hand';

// ── Call eligibility ──────────────────────────────────────────────────────────

export {
  canWin,
  canPung,
  canKongFromDiscard,
  concealedKongOptions,
  addToKongOptions,
  chowOptions,
  tenpaiTiles,
  isTenpai,
} from './calls';

// ── Scoring ───────────────────────────────────────────────────────────────────

export { calculateFan, calculateSevenPairsFan, calculatePayment } from './scoring';

// ── Engine ────────────────────────────────────────────────────────────────────

export { GameEngine } from './engine';
