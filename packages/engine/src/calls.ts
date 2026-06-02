/**
 * Call eligibility: can a player Pung, Kong, Chow, or Win off a discard?
 *
 * All functions are pure. jingType is required so wildcard-assisted calls
 * are evaluated correctly (e.g., pung with 1 natural + 1 Jing + 1 discarded).
 */
import { getRank, isHonor, TILE_TYPES } from './tiles';
import { isWinningHand } from './hand';
import { separateJing } from './jing';
import type { TileType } from './types';

// ── Win ───────────────────────────────────────────────────────────────────────

/**
 * True if adding `tile` to `hand` (13 tiles) creates a winning hand.
 */
export function canWin(hand: TileType[], tile: TileType, jingType: TileType): boolean {
  if (hand.length !== 13) return false;
  return isWinningHand([...hand, tile], jingType);
}

// ── Pung ──────────────────────────────────────────────────────────────────────

/**
 * True if the player can Pung (call 3-of-a-kind) using the discarded tile.
 *
 * Requirements:
 *   - Hand must have ≥2 tiles that, combined with the discard, form a triplet.
 *   - Each of those 2 tiles can be natural (same type) or Jing.
 *   - The claimed triplet must contain ≥1 natural tile (the discard itself counts).
 *   - The resulting 11-tile hand must be shapeable towards a win (not enforced here —
 *     callers are responsible for ensuring the call makes sense strategically).
 */
export function canPung(hand: TileType[], discarded: TileType, jingType: TileType): boolean {
  const { naturals, jingCount } = separateJing(hand, jingType);
  const naturalCount = naturals.filter((t) => t === discarded).length;

  // Option 1: 2 naturals matching the discard
  if (naturalCount >= 2) return true;
  // Option 2: 1 natural + 1 jing (discard is the natural anchor)
  if (naturalCount >= 1 && jingCount >= 1) return true;
  // Option 3: 0 naturals + 2 jings — BUT meld must have ≥1 natural → discard IS natural ✓
  if (jingCount >= 2) return true;

  return false;
}

// ── Kong ──────────────────────────────────────────────────────────────────────

/**
 * True if the player can declare an open Kong off the discarded tile.
 *
 * Requirements: hand has 3 tiles (natural + jing combinations) matching the discard.
 * The quadruplet must have ≥1 natural (discard itself satisfies this).
 */
export function canKongFromDiscard(
  hand: TileType[],
  discarded: TileType,
  jingType: TileType,
): boolean {
  const { naturals, jingCount } = separateJing(hand, jingType);
  const naturalCount = naturals.filter((t) => t === discarded).length;

  if (naturalCount >= 3) return true;
  if (naturalCount === 2 && jingCount >= 1) return true;
  if (naturalCount === 1 && jingCount >= 2) return true;
  if (naturalCount === 0 && jingCount >= 3) return true; // 3 jings + 1 natural discard ✓

  return false;
}

/**
 * Find all tile types the player can declare a **concealed Kong** with (from their draw).
 * Returns the list of tile types that have 4 copies in hand (natural or jing-counted).
 */
export function concealedKongOptions(hand: TileType[], jingType: TileType): TileType[] {
  const { naturals, jingCount } = separateJing(hand, jingType);
  if (hand.length < 14) return [];

  const options: TileType[] = [];
  const seen = new Set<TileType>();
  const counts = new Map<TileType, number>();
  for (const t of naturals) counts.set(t, (counts.get(t) ?? 0) + 1);

  // All 4 naturals
  for (const [t, cnt] of counts) {
    if (cnt >= 4 && !seen.has(t)) {
      options.push(t);
      seen.add(t);
    }
  }

  // 4 jings → jing kong (special)
  if (jingCount >= 4) {
    options.push(jingType);
  }

  // 3 naturals + 1 jing
  for (const [t, cnt] of counts) {
    if (cnt >= 3 && jingCount >= 1 && !seen.has(t)) {
      options.push(t);
      seen.add(t);
    }
  }

  return options;
}

/**
 * Find all tile types the player can add to an existing open Pung to make a Kong.
 * `pungTiles` is the TileType of the open Pung.
 */
export function addToKongOptions(
  hand: TileType[],
  openPungTile: TileType,
  jingType: TileType,
): TileType[] {
  const { naturals, jingCount } = separateJing(hand, jingType);
  // Has the natural tile in hand?
  if (naturals.includes(openPungTile)) return [openPungTile];
  // Has a jing to fill in?
  if (jingCount > 0) return [jingType]; // player can add their jing (treated as the pung tile)
  return [];
}

// ── Chow ──────────────────────────────────────────────────────────────────────

/**
 * Return all valid Chow combinations the player can form with the discarded tile.
 * The player must be immediately after the discarder.
 *
 * Each returned array is a [lower, mid, upper] TileType triple forming the chow.
 * The discard can appear at any position in the triple.
 */
export function chowOptions(
  hand: TileType[],
  discarded: TileType,
  jingType: TileType,
): Array<[TileType, TileType, TileType]> {
  if (isHonor(discarded)) return []; // honors can't form chows

  const { naturals, jingCount } = separateJing(hand, jingType);
  const rank = getRank(discarded)!;
  const suit = discarded[1]; // 'm' | 'p' | 's'

  const options: Array<[TileType, TileType, TileType]> = [];

  // Possible sequences that include `discarded` (discard at pos 0, 1, or 2):
  const sequences: Array<[number, number, number]> = [];
  if (rank >= 1 && rank <= 7) sequences.push([rank, rank + 1, rank + 2]);
  if (rank >= 2 && rank <= 8) sequences.push([rank - 1, rank, rank + 1]);
  if (rank >= 3 && rank <= 9) sequences.push([rank - 2, rank - 1, rank]);

  for (const [r1, r2, r3] of sequences) {
    const t1 = `${r1}${suit}` as TileType;
    const t2 = `${r2}${suit}` as TileType;
    const t3 = `${r3}${suit}` as TileType;

    // Tiles needed from hand (all three minus the discard itself)
    const needed = [t1, t2, t3].filter((t) => t !== discarded);
    let tempNaturals = [...naturals];
    let tempJings = jingCount;
    let ok = true;

    for (const need of needed) {
      const idx = tempNaturals.indexOf(need);
      if (idx !== -1) {
        tempNaturals = [...tempNaturals.slice(0, idx), ...tempNaturals.slice(idx + 1)];
      } else if (tempJings > 0) {
        tempJings--;
      } else {
        ok = false;
        break;
      }
    }

    if (ok) options.push([t1, t2, t3]);
  }

  return options;
}

// ── Tenpai check ──────────────────────────────────────────────────────────────

/**
 * True if the player's 13-tile hand is in tenpai (one tile away from winning).
 * Returns the set of tiles that would complete the hand.
 */
export function tenpaiTiles(hand: TileType[], jingType: TileType): TileType[] {
  if (hand.length !== 13) return [];

  const winning: TileType[] = [];

  // Try every possible draw
  for (const candidate of TILE_TYPES) {
    if (canWin(hand, candidate, jingType)) {
      winning.push(candidate);
    }
    // Also try jing itself as a draw
    if (candidate === jingType) continue; // already tried above
  }

  return [...new Set(winning)];
}

/**
 * True if a player's 13-tile hand can win off any tile (is in tenpai).
 */
export function isTenpai(hand: TileType[], jingType: TileType): boolean {
  return tenpaiTiles(hand, jingType).length > 0;
}
