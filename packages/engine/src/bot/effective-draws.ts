/**
 * Effective Draws (有效牌 / Jin Zhang) probability engine for the hard bot.
 *
 * Jin Zhang: tiles that, if drawn, would reduce the hand's Distance to Ting.
 * The "effective draw count" is the sum of unseen copies of those tiles still
 * available in the wall + other players' concealed hands (unknown to the bot).
 *
 * All functions are pure — no I/O, no mutation.
 */

import { TILE_TYPES } from '../tiles';
import { separateJing } from '../jing';
import { isWinningHand } from '../hand';
import type { TileType, SeatState } from '../types';
import { overallDist } from './ting-distance';
import { PSYCHIC_LOOKAHEAD_BOOST } from './cheat-api';
import type { CheatContext } from './cheat-api';

// ── Visible tile tracking ─────────────────────────────────────────────────────

/**
 * Build a map of how many copies of each tile type are currently visible to the
 * bot: own hand + all players' open melds + all discard piles.
 *
 * "Visible" = known to the bot; everything else is considered hidden (wall or
 * another player's concealed hand).
 *
 * @param botHand  The bot's own concealed hand (all 13/14 tiles).
 * @param seats    All four seat states from the game snapshot.
 */
export function getVisibleTiles(botHand: TileType[], seats: SeatState[]): Map<TileType, number> {
  const visible = new Map<TileType, number>();
  const see = (t: TileType) => visible.set(t, (visible.get(t) ?? 0) + 1);

  // Own hand (all tiles, including jings)
  for (const t of botHand) see(t);

  // Every player's open melds and discard pile
  for (const seat of seats) {
    for (const meld of seat.openMelds) {
      for (const t of meld.tiles) see(t);
    }
    for (const t of seat.discards) see(t);
  }

  return visible;
}

// ── Winning tile finder ───────────────────────────────────────────────────────

/**
 * Given a 13-tile hand in Ting (tenpai), return every tile type that would
 * complete a winning hand when drawn (isSelfDraw = true covers Thirteen Misfits).
 */
export function getWinningTiles(hand13: TileType[], jingTypes: TileType[]): TileType[] {
  return TILE_TYPES.filter((t) => isWinningHand([...hand13, t], jingTypes, true));
}

// ── Effective draw counter ────────────────────────────────────────────────────

/**
 * Count effective draws: the number of unseen tiles that would win from a
 * 13-tile tenpai hand (or, if not in tenpai, that would reduce distance).
 *
 * @param hand13   13-tile hand after a candidate discard.
 * @param jingTypes Active jing tile types.
 * @param visible  Tile-type → seen-count map from getVisibleTiles.
 */
export function countEffectiveDraws(
  hand13: TileType[],
  jingTypes: TileType[],
  visible: Map<TileType, number>,
): number {
  const dist = overallDist(hand13, jingTypes);

  if (dist === 0) {
    // Tenpai: count unseen winning tiles
    const winners = getWinningTiles(hand13, jingTypes);
    let count = 0;
    for (const t of winners) {
      count += Math.max(0, 4 - (visible.get(t) ?? 0));
    }
    return count;
  }

  // Not yet tenpai: count tiles that reduce distance by at least 1
  let count = 0;
  for (const t of TILE_TYPES) {
    const hand14 = [...hand13, t];
    // After drawing t, what's the best discard distance?
    const bestAfter = bestDistAfterDraw(hand14, jingTypes);
    if (bestAfter < dist) {
      count += Math.max(0, 4 - (visible.get(t) ?? 0));
    }
  }
  return count;
}

/**
 * Given a 14-tile hand (after drawing), find the minimum distance achievable
 * by discarding any single natural tile.
 */
export function bestDistAfterDraw(hand14: TileType[], jingTypes: TileType[]): number {
  const { naturals } = separateJing(hand14, jingTypes);
  if (naturals.length === 0) return overallDist(hand14.slice(1), jingTypes);

  let best = Infinity;
  const seen = new Set<TileType>();
  for (const tile of naturals) {
    if (seen.has(tile)) continue;
    seen.add(tile);
    const hand13 = removeOneTile(hand14, tile);
    const d = overallDist(hand13, jingTypes);
    if (d < best) best = d;
  }
  return best === Infinity ? 8 : best;
}

// ── Discard candidate ranking ─────────────────────────────────────────────────

export interface DiscardCandidate {
  /** The tile to discard. */
  tile: TileType;
  /** Distance to Ting of the resulting 13-tile hand. */
  distAfterDiscard: number;
  /**
   * Effective draw count:
   *   - If distAfterDiscard === 0: count of unseen winning tiles.
   *   - Otherwise: count of unseen tiles that would reduce distance.
   */
  effectiveDraws: number;
}

/**
 * Rank all candidate discards from a 14-tile hand (just drew a tile).
 *
 * Jing tiles are excluded from candidates — they should almost never be
 * discarded. The caller handles the jing-only fallback.
 *
 * Sorted: lowest distAfterDiscard first, then highest effectiveDraws.
 *
 * @param hand14      Full 14-tile hand including the newly drawn tile.
 * @param jingTypes   Active jing tile types.
 * @param visible     Visible tile map from getVisibleTiles.
 * @param cheatContext Optional psychic lookahead — boosts candidates that
 *                    can catch confirmed upcoming wall tiles.
 */
export function rankDiscardCandidates(
  hand14: TileType[],
  jingTypes: TileType[],
  visible: Map<TileType, number>,
  cheatContext?: CheatContext | null,
): DiscardCandidate[] {
  const { naturals } = separateJing(hand14, jingTypes);
  const seen = new Set<TileType>();
  const candidates: DiscardCandidate[] = [];

  for (const tile of naturals) {
    if (seen.has(tile)) continue;
    seen.add(tile);

    const hand13 = removeOneTile(hand14, tile);
    const dist = overallDist(hand13, jingTypes);
    let effective = countEffectiveDraws(hand13, jingTypes, visible);

    // Psychic offense: for each wall lookahead tile that would reduce this
    // hand's distance to Ting, apply a large bonus. The bot actively shapes
    // its hand to catch the tiles it knows are coming.
    if (cheatContext) {
      for (const lookaheadTile of cheatContext.wallLookahead) {
        const hand14sim = [...hand13, lookaheadTile];
        if (bestDistAfterDraw(hand14sim, jingTypes) < dist) {
          effective += PSYCHIC_LOOKAHEAD_BOOST;
        }
      }
    }

    candidates.push({ tile, distAfterDiscard: dist, effectiveDraws: effective });
  }

  candidates.sort((a, b) =>
    a.distAfterDiscard !== b.distAfterDiscard
      ? a.distAfterDiscard - b.distAfterDiscard
      : b.effectiveDraws - a.effectiveDraws,
  );

  return candidates;
}

// ── Claim evaluation ──────────────────────────────────────────────────────────

/**
 * Simulate a pung claim: remove 2 copies of the discarded tile from the
 * 13-tile concealed hand, forming an open meld (the caller tracks open melds).
 * Returns the resulting 11-tile concealed hand, or null if not possible.
 */
export function simulatePung(hand13: TileType[], tile: TileType): TileType[] | null {
  const h = [...hand13];
  let removed = 0;
  for (let i = 0; i < h.length && removed < 2; i++) {
    if (h[i] === tile) {
      h.splice(i, 1);
      i--;
      removed++;
    }
  }
  return removed === 2 ? h : null;
}

/**
 * Simulate a chow claim: remove the two non-discarded tiles of `sequence`
 * from the 13-tile hand. Returns the resulting 11-tile hand, or null if
 * the required tiles aren't present.
 */
export function simulateChow(
  hand13: TileType[],
  discardedTile: TileType,
  sequence: [TileType, TileType, TileType],
): TileType[] | null {
  const h = [...hand13];
  for (const seqTile of sequence) {
    if (seqTile === discardedTile) continue;
    const idx = h.indexOf(seqTile);
    if (idx === -1) return null;
    h.splice(idx, 1);
  }
  return h;
}

/**
 * After claiming a meld, the bot must discard one tile from its 11-tile hand.
 * Returns the minimum distance achievable across all possible discards.
 * (The "best discard" distance — what the bot can achieve after a claim.)
 */
export function bestDistAfterClaim(hand11: TileType[], jingTypes: TileType[]): number {
  const { naturals } = separateJing(hand11, jingTypes);
  if (naturals.length === 0) {
    // Entirely wildcards — discard one jing (suboptimal edge case)
    return overallDist(hand11.slice(1), jingTypes);
  }

  let best = Infinity;
  const seen = new Set<TileType>();
  for (const tile of naturals) {
    if (seen.has(tile)) continue;
    seen.add(tile);
    const hand10 = removeOneTile(hand11, tile);
    const d = overallDist(hand10, jingTypes);
    if (d < best) best = d;
  }
  return best === Infinity ? 8 : best;
}

// ── Internal utility ──────────────────────────────────────────────────────────

function removeOneTile(hand: TileType[], tile: TileType): TileType[] {
  const idx = hand.indexOf(tile);
  if (idx === -1) return hand;
  return [...hand.slice(0, idx), ...hand.slice(idx + 1)];
}
