/**
 * Distance-to-Ting calculations for the Nanchang Mahjong hard bot.
 *
 * "Distance to Ting" is the minimum number of tile swaps needed for a 13-tile
 * hand to become ready (tenpai) — one tile away from a winning hand.
 *
 * 0 = already in Ting (ready, waiting for the final tile)
 * n = n swaps still needed
 *
 * All functions are pure — no I/O, no mutation.
 * Jing (精) wildcards are handled per Nanchang rules:
 *   - Standard / Seven Pairs / Thirteen Misfits / Star Win: Jing acts as any tile (wildcard)
 */

import { sortTypes, isHonor, isSuit, getRank, getHonorChowsContaining } from '../tiles';
import { separateJing } from '../jing';
import type { TileType } from '../types';

// ── Private helpers ───────────────────────────────────────────────────────────

function removeOne(arr: TileType[], t: TileType): TileType[] {
  const idx = arr.indexOf(t);
  if (idx === -1) return arr;
  return [...arr.slice(0, idx), ...arr.slice(idx + 1)];
}

function removeN(arr: TileType[], t: TileType, n: number): TileType[] {
  let result = arr;
  for (let i = 0; i < n; i++) result = removeOne(result, t);
  return result;
}

function countOf(arr: TileType[], t: TileType): number {
  let n = 0;
  for (const x of arr) if (x === t) n++;
  return n;
}

/**
 * Greedy score of how many complete + partial melds can be formed from the
 * remaining tiles plus jing wildcards. Returns 0–4 (4 = four complete melds).
 * Used by standardDist to estimate progress toward a winning hand.
 */
function countPartialMelds(naturals: TileType[], jings: number): number {
  const sorted = sortTypes(naturals);
  let score = 0;
  const used = new Array<boolean>(sorted.length).fill(false);

  // Pass 1: complete melds (pung then chow)
  for (let i = 0; i < sorted.length; i++) {
    if (used[i]) continue;
    const t = sorted[i];

    // Pung (3 identical)
    const sameIdxs: number[] = [];
    for (let j = i + 1; j < sorted.length; j++) {
      if (!used[j] && sorted[j] === t) {
        sameIdxs.push(j);
        if (sameIdxs.length >= 2) break;
      }
    }
    if (sameIdxs.length >= 2) {
      used[i] = true;
      used[sameIdxs[0]] = true;
      used[sameIdxs[1]] = true;
      score++;
      continue;
    }

    // Suit chow (3 consecutive in same suit)
    if (isSuit(t)) {
      const rank = getRank(t)!;
      const suit = t[1] as 'm' | 'p' | 's';
      if (rank <= 7) {
        const t2 = `${rank + 1}${suit}` as TileType;
        const t3 = `${rank + 2}${suit}` as TileType;
        const i2 = sorted.findIndex((x, k) => k > i && !used[k] && x === t2);
        const i3 = sorted.findIndex((x, k) => k > i && !used[k] && x === t3);
        if (i2 !== -1 && i3 !== -1) {
          used[i] = true;
          used[i2] = true;
          used[i3] = true;
          score++;
          continue;
        }
      }
    } else {
      // Honor chow (wind or dragon sequence)
      for (const chow of getHonorChowsContaining(t)) {
        const idxs: number[] = [];
        let ok = true;
        for (const ct of chow) {
          const ci = sorted.findIndex((x, k) => (k === i || k > i) && !used[k] && x === ct);
          if (ci === -1) {
            ok = false;
            break;
          }
          idxs.push(ci);
        }
        if (ok && new Set(idxs).size === 3) {
          for (const ci of idxs) used[ci] = true;
          score++;
          break;
        }
      }
    }
  }

  // Pass 2: partial meld bonus.
  // Award +1 if any two remaining tiles form a pair (identical) OR a sequential
  // partial in the same suit with rank difference ≤ 2 (two-sided wait or kanchan).
  // At most one partial bonus per call — keeps the approximation conservative.
  if (score < 4) {
    const remaining = sorted.filter((_, k) => !used[k]);
    let hasPartial = false;
    outer: for (let i = 0; i < remaining.length; i++) {
      const ti = remaining[i];
      for (let j = i + 1; j < remaining.length; j++) {
        const tj = remaining[j];
        if (ti === tj) {
          hasPartial = true;
          break outer;
        } // pair
        if (isSuit(ti) && isSuit(tj) && ti[1] === tj[1]) {
          if (Math.abs(getRank(tj)! - getRank(ti)!) <= 2) {
            hasPartial = true;
            break outer; // same-suit sequential partial
          }
        }
      }
    }
    if (hasPartial) score++;
  }

  // Each Jing can upgrade a partial to a complete meld
  score += Math.min(4 - score, jings);

  return Math.min(4, score);
}

// ── Standard hand distance ────────────────────────────────────────────────────

/**
 * Distance to Ting for a standard 4-meld + 1-pair hand.
 *
 * @param naturals  Non-jing tiles in the 13-tile hand.
 * @param jingCount Number of Jing (wildcard) tiles in the hand.
 * @returns 0 = tenpai, n = n swaps needed.
 */
export function standardDist(naturals: TileType[], jingCount: number): number {
  // For a full 13-tile hand we need 4 melds + 1 pair (offset = 4).
  // For smaller sub-hands (after claims), we need fewer melds (offset = 3).
  // This mirrors the logic in hand.ts computeStdShanten.
  const totalTiles = naturals.length + jingCount;
  const offset = totalTiles === 13 ? 4 : 3;

  const sorted = sortTypes(naturals);
  let best = 8;

  // Try every tile as the pair tile (including jing-assisted pairs)
  const seen = new Set<TileType>();
  for (const pt of sorted) {
    if (seen.has(pt)) continue;
    seen.add(pt);
    const cnt = countOf(sorted, pt);

    // Natural pair (2+ copies present)
    if (cnt >= 2) {
      const rest = removeN(sorted, pt, 2);
      best = Math.min(best, offset - countPartialMelds(rest, jingCount));
    }
    // Half-jing pair (1 natural + 1 wildcard)
    if (cnt >= 1 && jingCount >= 1) {
      const rest = removeOne(sorted, pt);
      best = Math.min(best, offset - countPartialMelds(rest, jingCount - 1));
    }
    // Waiting-pair: treat each tile as the tile we're waiting to draw for the pair.
    // If the remaining tiles can form `offset` complete/partial melds → already tenpai.
    if (cnt >= 1) {
      const rest = removeOne(sorted, pt);
      if (countPartialMelds(rest, jingCount) >= offset) {
        best = Math.min(best, 0);
      }
    }
  }

  // Pure jing pair (2+ wildcards used as a pair)
  if (jingCount >= 2) {
    best = Math.min(best, offset - countPartialMelds(sorted, jingCount - 2));
  }

  return Math.max(0, best);
}

// ── Seven Pairs distance ──────────────────────────────────────────────────────

/**
 * Distance to Ting for Seven Pairs (七对).
 *
 * For a 13-tile hand, need 6 complete pairs + wait for 1 more pair tile.
 * Jing tiles can pair with any natural tile.
 *
 * @returns 0 = tenpai (6 pairs exist, waiting for the 7th pair mate).
 */
export function sevenPairsDist(naturals: TileType[], jingCount: number): number {
  const counts = new Map<TileType, number>();
  for (const t of naturals) counts.set(t, (counts.get(t) ?? 0) + 1);

  let pairs = 0;
  let singles = 0;
  for (const cnt of counts.values()) {
    pairs += Math.floor(cnt / 2);
    singles += cnt % 2;
  }

  // Jings first pair with single naturals (to make complete pairs)
  const jingsForSingles = Math.min(singles, jingCount);
  pairs += jingsForSingles;
  const leftoverJings = jingCount - jingsForSingles;
  // Remaining jings form pure-wildcard pairs
  pairs += Math.floor(leftoverJings / 2);

  // Need 6 pairs to be tenpai (waiting for the 7th pair tile)
  return Math.max(0, 6 - pairs);
}

// ── Thirteen Misfits distance ─────────────────────────────────────────────────

/**
 * Distance to Ting for Thirteen Misfits (十三烂).
 *
 * A valid Thirteen Misfits hand requires:
 *   - All honor tiles are unique (no duplicate winds/dragons)
 *   - Within each suit, sorted adjacent ranks must have gap > 2
 *
 * Jing tiles act as wildcards and can be placed at any valid misfit position,
 * so only natural (non-Jing) tiles are checked for conflicts. Multiple Jing
 * tiles with the same or adjacent face values do NOT create conflicts.
 *
 * Distance = number of conflicting natural tiles that must be replaced:
 *   - Extra copies of the same natural honor tile
 *   - Natural suit tiles within rank 2 of another same-suit natural tile
 *
 * @param naturals  Pre-separated non-Jing tiles (call separateJing upstream).
 * @returns 0 = Hu / complete hand (all natural tiles satisfy misfit constraints).
 */
export function thirteenMisfitsDist(naturals: TileType[]): number {
  let conflicts = 0;

  // Natural honor duplicates: each extra copy beyond 1 is a conflict
  const honorCounts = new Map<TileType, number>();
  for (const t of naturals) {
    if (isHonor(t)) honorCounts.set(t, (honorCounts.get(t) ?? 0) + 1);
  }
  for (const cnt of honorCounts.values()) {
    conflicts += Math.max(0, cnt - 1);
  }

  // Natural suit adjacency conflicts: tiles within rank 2 of another same-suit natural tile
  for (const suit of ['m', 'p', 's'] as const) {
    const ranks = naturals
      .filter((t) => !isHonor(t) && t[1] === suit)
      .map((t) => getRank(t)!)
      .sort((a, b) => a - b);

    // Mark each rank that conflicts with its sorted neighbor
    const conflicted = new Set<number>();
    for (let i = 1; i < ranks.length; i++) {
      if (ranks[i] - ranks[i - 1] <= 2) {
        conflicted.add(ranks[i - 1]);
        conflicted.add(ranks[i]);
      }
    }
    conflicts += conflicted.size;
  }

  return conflicts;
}

// ── Star Win (七星十三烂) distance ─────────────────────────────────────────────

/**
 * Distance to Ting for Seven Star Thirteen Misfits (七星十三烂).
 *
 * Requires Thirteen Misfits + all 7 unique honor types present.
 * Distance = max(misfit conflicts, missing honor types).
 * Jing tiles are excluded from the honor count (they act as wildcards).
 *
 * @param naturals  Pre-separated non-Jing tiles (call separateJing upstream).
 */
export function starWinDist(naturals: TileType[]): number {
  const misfitDist = thirteenMisfitsDist(naturals);
  const uniqueHonors = new Set(naturals.filter(isHonor));
  const missingHonors = Math.max(0, 7 - uniqueHonors.size);
  // Both constraints must be satisfied; a single swap can fix one violation
  // in each category, so take the max as the lower-bound distance.
  return Math.max(misfitDist, missingHonors);
}

// ── Overall distance ──────────────────────────────────────────────────────────

/**
 * Minimum distance to Ting across all valid Nanchang hand types.
 *
 * Evaluates Standard, Seven Pairs, Thirteen Misfits, and Star Win and returns
 * the smallest value — the "easiest" path to tenpai for this hand.
 *
 * @param hand      The full 13-tile hand (naturals + jings mixed together).
 * @param jingTypes Active Jing tile types for this game.
 * @returns 0 = tenpai on at least one hand type, n = n swaps needed.
 */
export function overallDist(hand: TileType[], jingTypes: TileType[]): number {
  const { naturals, jingCount } = separateJing(hand, jingTypes);

  const std = standardDist(naturals, jingCount);
  const pairs = sevenPairsDist(naturals, jingCount);
  const misfits = thirteenMisfitsDist(naturals);
  const star = starWinDist(naturals);

  return Math.min(std, pairs, misfits, star);
}
