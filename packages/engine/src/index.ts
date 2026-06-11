/**
 * Nanchang Mahjong game engine — public API.
 *
 * Pure TypeScript, no I/O, fully deterministic.
 * Use the seed + event log for replay; the engine re-derives any past state.
 */

export const ENGINE_VERSION = '0.2.0';

// ── Types ─────────────────────────────────────────────────────────────────────

export type {
  TileType,
  TileId,
  MeldKind,
  Meld,
  Decomposition,
  HandType,
  WinType,
  ScoringContext,
  MultiplierItem,
  WinPaymentResult,
  Payment,
  GameConfig,
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

export { isWinningHand, decomposeHand, decomposeConcealed, shantenNumber } from './hand';

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

// ── Scoring (locked rules §6) ─────────────────────────────────────────────────

export {
  calculateWinPayout,
  instantKongPayment,
  calculateSpiritSettlement,
  calculateOpeningJingSettlement,
} from './scoring';

// ── Engine ────────────────────────────────────────────────────────────────────

export { GameEngine, nextDealer } from './engine';

// ── Replay ────────────────────────────────────────────────────────────────────

export { replayHand } from './replay';
export type { ReplayHandConfig } from './replay';

// ── Bot decision engine ───────────────────────────────────────────────────────

export { getBotDiscard, getBotClaim } from './bot/bot-engine';
export type { BotDifficulty, BotClaimOption, BotClaimDecision } from './bot/bot-engine';
