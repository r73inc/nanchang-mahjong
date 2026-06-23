/**
 * Bot decision engine — pure functions, no I/O, no @nanchang/shared imports.
 *
 * getBotDiscard  — choose which tile to discard on the bot's turn.
 * getBotClaim    — decide whether to claim a discard and with what action.
 *
 * Structural note: BotDifficulty / BotClaimOption intentionally mirror the
 * shared package's ClaimAction and BotDifficulty types without importing them,
 * so this module stays free of circular dependencies.
 */

import { isHonor, isTerminalOrHonor, getRank, getSuit } from '../tiles';
import { separateJing } from '../jing';
import type { TileType, GameState } from '../types';
import { overallDist } from './ting-distance';
import {
  getVisibleTiles,
  rankDiscardCandidates,
  simulatePung,
  simulateChow,
  bestDistAfterClaim,
  bestDistAfterDraw,
} from './effective-draws';
import { isOpponentThreatening, safestDiscard } from './defense';
import { buildCheatContext } from './cheat-api';
import type { CheatContext } from './cheat-api';

export type BotDifficulty = 'easy' | 'normal' | 'hard' | 'psychic' | 'passive';

/**
 * Available call options offered to the bot during a claim window.
 * Mirrors shared's ClaimAction — compatible via structural typing.
 */
export type BotClaimOption =
  | { kind: 'win' }
  | { kind: 'pung' }
  | { kind: 'kong' }
  | { kind: 'chow'; sequences: [TileType, TileType, TileType][] };

/** The bot's chosen claim response — null means pass. */
export type BotClaimDecision =
  | { kind: 'win' }
  | { kind: 'pung' }
  | { kind: 'kong' }
  | { kind: 'chow'; sequence: [TileType, TileType, TileType] };

// ── Discard scoring (Normal difficulty) ──────────────────────────────────────

/**
 * Utility score for a single tile given the full naturals array.
 * Higher = more valuable (keep); lower = better discard candidate.
 *
 *   0 — isolated honor (wind / dragon)
 *   1 — isolated terminal (1 or 9)
 *   2 — isolated simple (2–8)
 *   3 — partial sequence (one same-suit neighbor within 2 steps)
 *   4 — complete sequence (all 3 tiles of a run present) or pair
 *   5 — triplet (3+ copies)
 */
function tileScore(tile: TileType, naturals: TileType[]): number {
  const copies = naturals.filter((t) => t === tile).length;
  if (copies >= 3) return 5;
  if (copies >= 2) return 4;

  if (isHonor(tile)) return 0; // isolated honor — no suit sequences possible

  const r = getRank(tile)!; // safe: tile is not an honor
  const s = getSuit(tile)!; // safe: tile is not an honor

  const has = (rank: number): boolean =>
    rank >= 1 && rank <= 9 && naturals.includes(`${rank}${s}` as TileType);

  // Participates in a complete 3-tile sequential run
  if (
    (r >= 3 && has(r - 1) && has(r - 2)) || // upper: (r-2, r-1, r)
    (r >= 2 && r <= 8 && has(r - 1) && has(r + 1)) || // middle: (r-1, r, r+1)
    (r <= 7 && has(r + 1) && has(r + 2)) // lower: (r, r+1, r+2)
  )
    return 4;

  // At least one same-suit neighbor within 2 steps (partial / kanchan)
  if (has(r - 1) || has(r + 1) || has(r - 2) || has(r + 2)) return 3;

  return r === 1 || r === 9 ? 1 : 2; // isolated terminal or isolated simple
}

// ── Hard difficulty: discard logic ───────────────────────────────────────────

function getHardBotDiscard(
  hand: TileType[],
  jingTypes: TileType[],
  state: GameState,
  botSeat: 0 | 1 | 2 | 3,
  cheatContext?: CheatContext | null,
): TileType {
  const { naturals } = separateJing(hand, jingTypes);

  // If the entire hand is wildcards, must discard one (last resort)
  if (naturals.length === 0) return hand[0];

  const visible = getVisibleTiles(hand, state.seats);
  const candidates = rankDiscardCandidates(hand, jingTypes, visible, cheatContext);

  if (candidates.length === 0) return naturals[0];

  const bestDist = candidates[0].distAfterDiscard;

  const threatened = isOpponentThreatening(state.seats, botSeat, jingTypes, cheatContext);

  // Psychic: hard-pivot to defense whenever any opponent is confirmed in Ting,
  //          regardless of our own distance.
  // Hard:    defend only when threatened AND we are more than 1 step from Ting.
  const shouldDefend = cheatContext ? threatened : threatened && bestDist > 1;
  if (shouldDefend) {
    return safestDiscard(naturals, visible, state.seats, botSeat);
  }

  // Attack mode: discard the tile that keeps the best effective draws path
  return candidates[0].tile;
}

// ── Hard difficulty: claim logic ──────────────────────────────────────────────

function getHardBotClaim(
  available: BotClaimOption[],
  discardedTile: TileType,
  hand: TileType[],
  jingTypes: TileType[],
  cheatContext?: CheatContext | null,
): BotClaimDecision | null {
  // Kong is always worth claiming (extra draw + instant payout)
  const kong = available.find((a) => a.kind === 'kong');
  if (kong) return { kind: 'kong' };

  // Current distance from the 13-tile concealed hand
  const currentDist = overallDist(hand, jingTypes);

  // ── Psychic lookahead heuristic ──────────────────────────────────────────────
  // If the immediately upcoming wall tile would naturally reduce our Ting
  // distance on its own, pass on any non-kong claim. Claiming a pung or chow
  // opens a meld and forfeits the natural draw — the psychic bot knows that
  // draw is a guaranteed improvement and keeps its hand concealed instead.
  if (cheatContext && cheatContext.wallLookahead.length > 0) {
    const distIfNaturalDraw = bestDistAfterDraw(
      [...hand, cheatContext.wallLookahead[0]],
      jingTypes,
    );
    if (distIfNaturalDraw < currentDist) {
      return null; // upcoming draw is better — do not interrupt with a claim
    }
  }

  // ── Pung evaluation ──────────────────────────────────────────────────────────
  const pung = available.find((a) => a.kind === 'pung');
  if (pung) {
    const hand11 = simulatePung(hand, discardedTile);
    if (hand11 !== null) {
      const distAfterPung = bestDistAfterClaim(hand11, jingTypes);
      // Claim pung if it reduces or maintains distance to Ting
      if (distAfterPung <= currentDist) {
        return { kind: 'pung' };
      }
    }
  }

  // ── Chow evaluation ──────────────────────────────────────────────────────────
  // Claiming a chow forecloses on Thirteen Misfits and Seven Pairs paths,
  // so only do it when it genuinely improves the standard-hand distance.
  const chow = available.find(
    (a): a is Extract<BotClaimOption, { kind: 'chow' }> => a.kind === 'chow',
  );
  if (chow) {
    let bestChowDist = Infinity;
    let bestSeq: [TileType, TileType, TileType] | null = null;

    for (const seq of chow.sequences) {
      const hand11 = simulateChow(hand, discardedTile, seq);
      if (hand11 === null) continue;
      const distAfterChow = bestDistAfterClaim(hand11, jingTypes);
      if (distAfterChow < bestChowDist) {
        bestChowDist = distAfterChow;
        bestSeq = seq;
      }
    }

    // Only claim chow if it strictly improves the distance (not just maintains it),
    // because the open meld eliminates special-hand flexibility.
    if (bestSeq !== null && bestChowDist < currentDist) {
      return { kind: 'chow', sequence: bestSeq };
    }
  }

  return null;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Choose a tile to discard on the bot's turn.
 *
 * Easy   — picks a random non-wildcard tile; falls back to the first tile
 *          only when the entire hand consists of wildcards.
 * Normal — scores every non-wildcard tile by strategic utility and discards
 *          the weakest one; ties are broken randomly. Wildcards are never
 *          discarded unless no natural tiles remain.
 * Hard   — uses Distance-to-Ting + effective draws (Jin Zhang) for attack mode,
 *          falls back to danger-score-based discard in defense mode.
 *          Requires `state` and `botSeat` to access the visible board; falls
 *          back to Normal behaviour if not provided.
 */
export function getBotDiscard(
  hand: TileType[],
  wildcards: TileType[],
  difficulty: BotDifficulty,
  state?: GameState,
  botSeat?: 0 | 1 | 2 | 3,
): TileType {
  const { naturals } = separateJing(hand, wildcards);

  if (naturals.length === 0) return hand[0]; // forced: entire hand is wildcards

  // Passive bots discard only the tile they drew (always the last tile in hand).
  if (difficulty === 'passive') {
    return hand[hand.length - 1];
  }

  if (difficulty === 'easy') {
    return naturals[Math.floor(Math.random() * naturals.length)];
  }

  if (
    (difficulty === 'hard' || difficulty === 'psychic') &&
    state !== undefined &&
    botSeat !== undefined
  ) {
    const cheatContext = buildCheatContext(state, botSeat, difficulty);
    return getHardBotDiscard(hand, wildcards, state, botSeat, cheatContext);
  }

  // Normal (and hard fallback when state not available):
  // discard the tile with the lowest utility score; break ties randomly.
  let minScore = Infinity;
  for (const t of naturals) {
    const sc = tileScore(t, naturals);
    if (sc < minScore) minScore = sc;
  }
  const candidates = naturals.filter((t) => tileScore(t, naturals) === minScore);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Decide how the bot responds during a claim window.
 * Returns null to pass (register no claim).
 *
 * @param available     Claim options offered by the engine for this seat.
 * @param discardedTile The tile currently pending in the claim window.
 * @param openMeldCount Number of open melds this bot already holds.
 * @param difficulty    'easy' | 'normal' | 'hard' | 'psychic'
 * @param hand          Bot's current concealed hand (required for 'hard'/'psychic').
 * @param jingTypes     Active Jing tile types (required for 'hard'/'psychic').
 * @param state         Full authoritative game state (required for 'psychic' lookahead).
 * @param botSeat       The bot's own seat index (required for 'psychic' lookahead).
 */
export function getBotClaim(
  available: BotClaimOption[],
  discardedTile: TileType,
  openMeldCount: number,
  difficulty: BotDifficulty,
  hand?: TileType[],
  jingTypes?: TileType[],
  state?: GameState,
  botSeat?: 0 | 1 | 2 | 3,
): BotClaimDecision | null {
  if (available.length === 0) return null;

  // Passive bots never claim anything — they only discard the tile they drew.
  if (difficulty === 'passive') return null;

  // All difficulties always claim a winning hand — never pass up a win.
  const win = available.find((a) => a.kind === 'win');
  if (win) return { kind: 'win' };

  if (difficulty === 'easy') {
    // 30% chance to claim any non-win action; pick randomly if claiming.
    if (Math.random() >= 0.3) return null;
    const nonWin = available.filter((a) => a.kind !== 'win');
    const choice = nonWin[Math.floor(Math.random() * nonWin.length)];
    if (choice.kind === 'chow') {
      const seq = choice.sequences[Math.floor(Math.random() * choice.sequences.length)];
      return { kind: 'chow', sequence: seq };
    }
    return { kind: choice.kind as 'pung' | 'kong' };
  }

  if (
    (difficulty === 'hard' || difficulty === 'psychic') &&
    hand !== undefined &&
    jingTypes !== undefined
  ) {
    const cheatContext =
      state !== undefined && botSeat !== undefined
        ? buildCheatContext(state, botSeat, difficulty)
        : null;
    return getHardBotClaim(available, discardedTile, hand, jingTypes, cheatContext);
  }

  // Normal difficulty heuristics (also used as hard fallback when hand not provided):

  // Kong is always worth claiming (extra draw + instant payout).
  const kong = available.find((a) => a.kind === 'kong');
  if (kong) return { kind: 'kong' };

  // Pung: always claim honors and terminals; 50 % chance for simples.
  const pung = available.find((a) => a.kind === 'pung');
  if (pung && (isTerminalOrHonor(discardedTile) || Math.random() < 0.5)) {
    return { kind: 'pung' };
  }

  // Chow: only when the hand is not already heavily exposed (< 2 open melds).
  const chow = available.find((a) => a.kind === 'chow');
  if (chow && openMeldCount < 2) {
    return { kind: 'chow', sequence: chow.sequences[0] };
  }

  return null;
}
