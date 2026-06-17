/**
 * Defensive heuristics for the Nanchang Mahjong hard bot.
 *
 * Provides danger scoring for potential discards and opponent threat detection,
 * enabling the bot to switch from "attack" mode (maximize effective draws) to
 * "defense" mode (minimize the chance of dealing into an opponent's winning hand).
 *
 * All functions are pure — no I/O, no mutation.
 */

import { isHonor } from '../tiles';
import type { TileType, SeatState } from '../types';
import type { CheatContext } from './cheat-api';

// ── Opponent threat detection ─────────────────────────────────────────────────

/**
 * Returns true if any opponent appears to be in or near Ting (tenpai).
 *
 * Threat indicators:
 *   1. 3+ open melds — only needs 1 complete meld + pair in their concealed hand.
 *   2. Has discarded a Jing tile — giving up a wildcard is a strong signal
 *      the player has a complete hand and no longer needs flexibility.
 *
 * @param seats     All four seat states.
 * @param botSeat   The bot's own seat index (skipped in the loop).
 * @param jingTypes Active Jing tile types for this game.
 */
export function isOpponentThreatening(
  seats: SeatState[],
  botSeat: number,
  jingTypes: TileType[],
  cheatContext?: CheatContext | null,
): boolean {
  // Psychic mode: use exact Ting distances instead of visual heuristics.
  // An opponent at distance 0 is in Ting — treat as an immediate threat.
  if (cheatContext) {
    for (const [seatStr, dist] of Object.entries(cheatContext.opponentTingDistances)) {
      if (Number(seatStr) !== botSeat && dist === 0) return true;
    }
    // No opponent is confirmed in Ting — fall through to visual heuristics.
    // Exact distances enhance defense; they don't replace it.
  }

  // Standard visual heuristic for hard (and below) bots.
  for (let i = 0; i < seats.length; i++) {
    if (i === botSeat) continue;
    const seat = seats[i];

    // 3+ open melds → very close to a complete hand
    if (seat.openMelds.length >= 3) return true;

    // Discarded a Jing tile → voluntarily gave up a wildcard → likely tenpai
    if (seat.discards.some((t) => jingTypes.includes(t))) return true;
  }
  return false;
}

// ── Danger scoring ────────────────────────────────────────────────────────────

/**
 * Compute a danger score for discarding a specific tile.
 *
 * Higher score = more dangerous (more likely to complete an opponent's hand).
 * Score 0 = completely safe.
 *
 * Safety rules (score 0):
 *   - All 4 copies of this tile type are already visible (in melds/discards/bot hand).
 *   - Every opponent has already discarded this tile at least once.
 *
 * Danger estimation for unsafe tiles:
 *   Base = (4 − visibleCount) × 2   (more unseen copies = more danger)
 *   Honors get a −2 reduction        (honors can't be part of chow sequences)
 *
 * @param tile      The tile being considered for discard.
 * @param visible   Pre-computed visible tile map (from getVisibleTiles).
 * @param seats     All four seat states (used only for the allOpponentsDiscarded check).
 * @param botSeat   The bot's own seat index.
 */
export function getDangerScore(
  tile: TileType,
  visible: Map<TileType, number>,
  seats: SeatState[],
  botSeat: number,
): number {
  const visibleCount = visible.get(tile) ?? 0;

  // All 4 copies are accounted for — safe
  if (visibleCount >= 4) return 0;

  // Every opponent has discarded this tile — no one is waiting for it
  const allOpponentsDiscarded = seats.every(
    (seat, i) => i === botSeat || seat.discards.includes(tile),
  );
  if (allOpponentsDiscarded) return 0;

  // Base danger from unseen copies
  const unseenCount = 4 - visibleCount;
  let score = unseenCount * 2;

  // Honors can't complete chows, so they're slightly safer
  if (isHonor(tile)) score = Math.max(0, score - 2);

  return score;
}

// ── Safe discard selector ─────────────────────────────────────────────────────

/**
 * Return the tile with the lowest danger score from the given list of naturals.
 * Ties are broken by returning the first (leftmost) tile in the array.
 *
 * @param naturals  Non-jing candidate discard tiles.
 * @param visible   Pre-computed visible tile map (from getVisibleTiles).
 * @param seats     All four seat states.
 * @param botSeat   The bot's own seat index.
 */
export function safestDiscard(
  naturals: TileType[],
  visible: Map<TileType, number>,
  seats: SeatState[],
  botSeat: number,
): TileType {
  if (naturals.length === 0) throw new Error('safestDiscard called with empty naturals');

  let minScore = Infinity;
  let best = naturals[0];

  for (const tile of naturals) {
    const score = getDangerScore(tile, visible, seats, botSeat);
    if (score < minScore) {
      minScore = score;
      best = tile;
    }
  }

  return best;
}
