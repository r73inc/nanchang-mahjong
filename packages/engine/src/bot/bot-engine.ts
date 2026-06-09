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
import type { TileType } from '../types';

export type BotDifficulty = 'easy' | 'normal';

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

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Choose a tile to discard on the bot's turn.
 *
 * Easy   — picks a random non-wildcard tile; falls back to the first tile
 *          only when the entire hand consists of wildcards.
 * Normal — scores every non-wildcard tile by strategic utility and discards
 *          the weakest one; ties are broken randomly. Wildcards are never
 *          discarded unless no natural tiles remain.
 */
export function getBotDiscard(
  hand: TileType[],
  wildcards: TileType[],
  difficulty: BotDifficulty,
): TileType {
  const { naturals } = separateJing(hand, wildcards);

  if (naturals.length === 0) return hand[0]; // forced: entire hand is wildcards

  if (difficulty === 'easy') {
    return naturals[Math.floor(Math.random() * naturals.length)];
  }

  // Normal: discard the tile with the lowest utility score; break ties randomly.
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
 * @param difficulty    'easy' | 'normal'
 */
export function getBotClaim(
  available: BotClaimOption[],
  discardedTile: TileType,
  openMeldCount: number,
  difficulty: BotDifficulty,
): BotClaimDecision | null {
  if (available.length === 0) return null;

  // Both difficulties always claim a winning hand — never pass up a win.
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

  // Normal difficulty heuristics:

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
