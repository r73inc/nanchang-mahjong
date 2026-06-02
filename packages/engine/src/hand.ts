/**
 * Hand analysis: winning check, decomposition, and shanten number.
 *
 * All functions are pure — no mutation of input arrays.
 *
 * Wildcard (Jing) rules enforced:
 *   1. The pair (eyes) must contain ≥1 natural tile.
 *   2. Each meld must contain ≥1 natural tile.
 *   3. Jing × Jing pure-wildcard pairs are allowed only in Seven Pairs.
 */
import { sortTypes, isSuit, getRank, isHonor } from './tiles';
import { separateJing } from './jing';
import type { TileType, Meld, Decomposition } from './types';

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Remove the first occurrence of `t` from `arr`. Returns a new array. */
function removeOne(arr: TileType[], t: TileType): TileType[] {
  const idx = arr.indexOf(t);
  if (idx === -1) throw new Error(`Tile ${t} not found`);
  return [...arr.slice(0, idx), ...arr.slice(idx + 1)];
}

/** Remove N occurrences of `t` from `arr`. Returns a new array. */
function removeN(arr: TileType[], t: TileType, n: number): TileType[] {
  let result = arr;
  for (let i = 0; i < n; i++) result = removeOne(result, t);
  return result;
}

/** Count occurrences of `t` in `arr`. */
function countOf(arr: TileType[], t: TileType): number {
  return arr.filter((x) => x === t).length;
}

/**
 * Try to build a Chow starting at `first` from the sorted `naturals`.
 * Returns { rest, jingsUsed } if possible (using wildcards to fill gaps), or null.
 */
function tryChow(
  naturals: TileType[],
  first: TileType,
  wildsLeft: number,
): { rest: TileType[]; jingsUsed: number; tiles: [TileType, TileType, TileType] } | null {
  if (isHonor(first)) return null;

  const rank = getRank(first)!;
  const suit = first[1]; // 'm' | 'p' | 's'
  if (rank > 7) return null; // can't start a chow at 8 or 9

  const t2 = `${rank + 1}${suit}` as TileType;
  const t3 = `${rank + 2}${suit}` as TileType;

  let rest = removeOne(naturals, first);
  let jingsUsed = 0;

  // second tile
  if (countOf(rest, t2) > 0) {
    rest = removeOne(rest, t2);
  } else if (wildsLeft > jingsUsed) {
    jingsUsed++;
  } else {
    return null;
  }

  // third tile
  if (countOf(rest, t3) > 0) {
    rest = removeOne(rest, t3);
  } else if (wildsLeft > jingsUsed) {
    jingsUsed++;
  } else {
    return null;
  }

  return { rest, jingsUsed, tiles: [first, t2, t3] };
}

/**
 * Recursively try to partition `naturals` into melds, using at most `wildsLeft`
 * wildcards to fill gaps. Returns all valid meld lists (for complete decomposition).
 *
 * `meldsAcc` accumulates the melds built so far.
 */
function tryMelds(
  naturals: TileType[],
  wildsLeft: number,
  meldsAcc: Meld[],
  jingsUsedAcc: number,
): Array<{ melds: Meld[]; jingsUsed: number }> {
  if (naturals.length === 0 && wildsLeft === 0) {
    return [{ melds: meldsAcc, jingsUsed: jingsUsedAcc }];
  }
  // All remaining tiles must be filled by wildcards (each group of 3 needs ≥1 natural)
  // ... handled below by requiring first tile to be natural

  const sorted = sortTypes(naturals);
  if (sorted.length === 0) {
    // Only wildcards left — must form groups but each needs ≥1 natural; fail.
    return [];
  }

  const first = sorted[0];
  const results: Array<{ melds: Meld[]; jingsUsed: number }> = [];

  // ── Try Pung (3 of same tile) ─────────────────────────────────────────────
  const cnt = countOf(sorted, first);
  if (cnt >= 3) {
    const rest = removeN(sorted, first, 3);
    const sub = tryMelds(
      rest,
      wildsLeft,
      [...meldsAcc, { kind: 'pung', tiles: [first, first, first], concealed: true }],
      jingsUsedAcc,
    );
    results.push(...sub);
  }
  if (cnt === 2 && wildsLeft >= 1) {
    const rest = removeN(sorted, first, 2);
    const sub = tryMelds(
      rest,
      wildsLeft - 1,
      [...meldsAcc, { kind: 'pung', tiles: [first, first, first], concealed: true }],
      jingsUsedAcc + 1,
    );
    results.push(...sub);
  }
  if (cnt === 1 && wildsLeft >= 2) {
    const rest = removeOne(sorted, first);
    const sub = tryMelds(
      rest,
      wildsLeft - 2,
      [...meldsAcc, { kind: 'pung', tiles: [first, first, first], concealed: true }],
      jingsUsedAcc + 2,
    );
    results.push(...sub);
  }

  // ── Try Chow (3 consecutive suit tiles) ───────────────────────────────────
  if (isSuit(first)) {
    const chowResult = tryChow(sorted, first, wildsLeft);
    if (chowResult) {
      const sub = tryMelds(
        chowResult.rest,
        wildsLeft - chowResult.jingsUsed,
        [...meldsAcc, { kind: 'chow', tiles: chowResult.tiles, concealed: true }],
        jingsUsedAcc + chowResult.jingsUsed,
      );
      results.push(...sub);
    }
  }

  return results;
}

// ── Seven Pairs ───────────────────────────────────────────────────────────────

/**
 * Check if `hand` can form Seven Pairs. Allows at most ONE Jing pair.
 * Each pair must otherwise have 2 natural tiles (or 1 natural + 1 Jing).
 */
function checkSevenPairs(naturals: TileType[], jingCount: number): boolean {
  if (naturals.length + jingCount !== 14) return false;

  const counts = new Map<TileType, number>();
  for (const t of naturals) counts.set(t, (counts.get(t) ?? 0) + 1);

  let pairs = 0;
  let singles = 0;
  for (const cnt of counts.values()) {
    pairs += Math.floor(cnt / 2);
    singles += cnt % 2;
  }

  // Each single natural tile needs 1 jing to become a pair
  // We also allow at most 1 "full jing pair" (both tiles are jing)
  if (jingCount < singles) return false;
  const jingsForSingles = singles;
  const jingsLeft = jingCount - jingsForSingles;
  // Remaining jings can form at most 1 full jing pair (floor(jingsLeft/2))
  const jingPairs = Math.floor(jingsLeft / 2);
  return pairs + singles + jingPairs === 7;
}

// ── Thirteen Orphans ──────────────────────────────────────────────────────────

const THIRTEEN_ORPHAN_TYPES = new Set<TileType>([
  '1m',
  '9m',
  '1p',
  '9p',
  '1s',
  '9s',
  'east',
  'south',
  'west',
  'north',
  'zhong',
  'fa',
  'bai',
]);

function checkThirteenOrphans(hand: TileType[], jingType: TileType): boolean {
  const { naturals, jingCount } = separateJing(hand, jingType);
  if (naturals.length + jingCount !== 14) return false;
  // Must have each of the 13 orphan types (wildcards can fill gaps)
  const counts = new Map<TileType, number>();
  for (const t of naturals) {
    if (THIRTEEN_ORPHAN_TYPES.has(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let missing = 0;
  for (const t of THIRTEEN_ORPHAN_TYPES) {
    if (!counts.has(t)) missing++;
  }
  if (missing > jingCount) return false;
  // After filling missing, must have at least one duplicate (pair)
  // pairs from naturals:
  let naturalPairs = 0;
  for (const cnt of counts.values()) if (cnt >= 2) naturalPairs++;
  const jingsLeft = jingCount - missing;
  return naturalPairs + jingsLeft > 0;
}

// ── Primary decomposition ─────────────────────────────────────────────────────

/**
 * Try to decompose a 14-tile hand into all valid winning configurations
 * (standard 4-meld + pair). Does NOT include Seven Pairs or Thirteen Orphans
 * (those are checked separately in `isWinningHand`).
 *
 * Wildcard constraints:
 *   - Pair must have ≥1 natural tile.
 *   - Each meld must have ≥1 natural tile.
 */
export function decomposeHand(hand: TileType[], jingType: TileType): Decomposition[] {
  const { naturals, jingCount } = separateJing(hand, jingType);
  if (naturals.length + jingCount !== 14) return [];

  const sorted = sortTypes(naturals);
  const results: Decomposition[] = [];
  const seen = new Set<TileType>();

  for (const pairTile of sorted) {
    if (seen.has(pairTile)) continue;
    seen.add(pairTile);

    const cnt = countOf(sorted, pairTile);

    // Natural pair (2 of same tile)
    if (cnt >= 2) {
      const rest = removeN(sorted, pairTile, 2);
      const meldResults = tryMelds(rest, jingCount, [], 0);
      for (const mr of meldResults) {
        results.push({
          pair: pairTile,
          melds: mr.melds,
          jingsUsed: mr.jingsUsed,
          jingPair: false,
        });
      }
    }

    // Half-jing pair (1 natural + 1 wildcard)
    if (cnt >= 1 && jingCount >= 1) {
      const rest = removeOne(sorted, pairTile);
      const meldResults = tryMelds(rest, jingCount - 1, [], 1);
      for (const mr of meldResults) {
        results.push({
          pair: pairTile,
          melds: mr.melds,
          jingsUsed: mr.jingsUsed + 1,
          jingPair: true, // one jing in the pair
        });
      }
    }
  }

  return results;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * True if `hand` (exactly 14 TileTypes) is a winning hand.
 * Handles: standard 4-meld+pair, Seven Pairs, Thirteen Orphans.
 */
export function isWinningHand(hand: TileType[], jingType: TileType): boolean {
  if (hand.length !== 14) return false;

  // Standard decomposition
  if (decomposeHand(hand, jingType).length > 0) return true;

  // Seven Pairs
  const { naturals, jingCount } = separateJing(hand, jingType);
  if (checkSevenPairs(naturals, jingCount)) return true;

  // Thirteen Orphans
  if (checkThirteenOrphans(hand, jingType)) return true;

  return false;
}

/**
 * Compute the shanten number (tiles needed to reach a winning hand).
 * -1 = already winning; 0 = tenpai (one tile away); n = n tiles away.
 *
 * Uses a simplified estimate sufficient for UI hint purposes.
 */
export function shantenNumber(hand: TileType[], jingType: TileType): number {
  if (hand.length < 13) return 8;

  // Winning?
  const h14 = hand.length === 14 ? hand : hand;
  if (hand.length === 14 && isWinningHand(h14, jingType)) return -1;

  const { naturals, jingCount } = separateJing(hand, jingType);

  // ── Standard hand shanten ─────────────────────────────────────────────────
  const bestStd = computeStdShanten(naturals, jingCount);

  // ── Seven Pairs shanten ───────────────────────────────────────────────────
  const bestPairs = computePairsShanten(naturals, jingCount);

  return Math.min(bestStd, bestPairs);
}

function computeStdShanten(naturals: TileType[], jings: number): number {
  // Upper bound: 8 (all tiles isolated)
  let best = 8;

  const sorted = sortTypes(naturals);
  // The offset depends on hand size:
  //   14-tile hand: after removing pair (2 tiles) we need 4 complete melds → offset=3
  //     (score 4 → shanten -1 = winning)
  //   13-tile hand: after removing 2 tiles we need 4 complete melds from 11 → offset=4
  //     (score 4 → shanten 0 = tenpai)
  // We detect by total tile count.
  const totalTiles = naturals.length + jings;
  const offset = totalTiles === 13 ? 4 : 3;

  // Iterate all possible pair selections
  const seen = new Set<TileType>();
  for (const pt of sorted) {
    if (seen.has(pt)) continue;
    seen.add(pt);

    const cnt = countOf(sorted, pt);
    // Natural pair (2 copies already in hand)
    if (cnt >= 2) {
      const rest = removeN(sorted, pt, 2);
      best = Math.min(best, offset - countPartialMelds(rest, jings));
    }
    // Half-jing pair (1 natural + 1 jing)
    if (cnt >= 1 && jings >= 1) {
      const rest = removeOne(sorted, pt);
      best = Math.min(best, offset - countPartialMelds(rest, jings - 1));
    }
    // In a 13-tile hand: each tile is a possible pair target we're waiting for.
    // If the remaining 12 tiles form 4 complete melds → tenpai (shanten 0).
    if (totalTiles === 13 && cnt >= 1) {
      const rest = removeOne(sorted, pt);
      if (countPartialMelds(rest, jings) >= 4) {
        best = Math.min(best, 0);
      }
    }
  }
  // Pair from 2 jings
  if (jings >= 2) {
    best = Math.min(best, offset - countPartialMelds(sorted, jings - 2));
  }

  return best;
}

/**
 * Greedy count of complete melds + partial melds (pairs in a meld / partial chow).
 * Returns a score 0–4 (higher = better formed).
 */
function countPartialMelds(naturals: TileType[], jings: number): number {
  const sorted = sortTypes(naturals);
  let score = 0;
  const used = new Array<boolean>(sorted.length).fill(false);

  // Complete melds first
  for (let i = 0; i < sorted.length; i++) {
    if (used[i]) continue;
    const t = sorted[i];
    let found = false;

    // Pung
    let sameCnt = 0;
    for (let j = i + 1; j < sorted.length && !used[j]; j++) {
      if (sorted[j] === t) {
        sameCnt++;
        if (sameCnt >= 2) break;
      }
    }
    if (sameCnt >= 2) {
      let removed = 2;
      for (let j = i + 1; j < sorted.length && removed > 0; j++) {
        if (sorted[j] === t && !used[j]) {
          used[j] = true;
          removed--;
        }
      }
      used[i] = true;
      score++;
      found = true;
    }

    // Chow
    if (!found && isSuit(t)) {
      const rank = getRank(t)!;
      const suit = t[1];
      if (rank <= 7) {
        const t2 = `${rank + 1}${suit}` as TileType;
        const t3 = `${rank + 2}${suit}` as TileType;
        const i2 = sorted.findIndex((x, k) => x === t2 && !used[k] && k > i);
        const i3 = sorted.findIndex((x, k) => x === t3 && !used[k] && k > i);
        if (i2 !== -1 && i3 !== -1) {
          used[i] = true;
          used[i2] = true;
          used[i3] = true;
          score++;
          found = true;
        }
      }
    }
  }

  // Partial melds (pairs and adjacent pairs) for remaining
  // (simplified: each wildcard can upgrade a partial to a complete)
  const remaining = sorted.filter((_, i) => !used[i]);
  const pairBonus = Math.min(
    1,
    Math.floor(remaining.filter((t, i, a) => a.indexOf(t) !== i).length),
  );
  score += Math.min(4 - score, pairBonus);
  score += Math.min(4 - score, Math.floor(jings / 1)); // each jing can complete a partial

  return Math.min(4, score);
}

function computePairsShanten(naturals: TileType[], jings: number): number {
  const counts = new Map<TileType, number>();
  for (const t of naturals) counts.set(t, (counts.get(t) ?? 0) + 1);

  let pairs = 0;
  let singles = 0;
  for (const cnt of counts.values()) {
    pairs += Math.floor(cnt / 2);
    singles += cnt % 2;
  }

  const jingPairsUsable = Math.min(singles, jings);
  const pairsTotal = pairs + jingPairsUsable;
  return Math.max(0, 6 - pairsTotal);
}
