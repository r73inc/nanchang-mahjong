/**
 * Call eligibility: can a player Pung, Kong, Chow, or Win off a discard?
 *
 * All functions are pure. jingTypes is required so wildcard-assisted calls
 * are evaluated correctly (e.g., pung with 1 natural + 1 Jing + 1 discarded).
 */
import { getRank, isHonor, TILE_TYPES, getHonorChowsContaining } from './tiles';
import { isWinningHand } from './hand';
import { separateJing } from './jing';
import type { TileType } from './types';

// ── Win ───────────────────────────────────────────────────────────────────────

/**
 * True if adding `tile` to `hand` creates a winning hand when combined with
 * any already-played open meld tiles.
 *
 * `openMeldTiles` should be the flat list of all tile types in the player's
 * open melds (e.g. three pungs → 9 tiles). Defaults to [] for a fully
 * concealed hand where `hand` is expected to have 13 tiles.
 *
 * The total tile count must equal 14 (openMeldTiles + hand + tile = 14).
 * This accounts for players who have melded sets and therefore hold fewer
 * than 13 concealed tiles — a common source of missed win opportunities.
 */
export function canWin(
  hand: TileType[],
  tile: TileType,
  jingTypes: TileType[],
  openMeldTiles: TileType[] = [],
): boolean {
  const fullHand = [...openMeldTiles, ...hand, tile];
  if (fullHand.length !== 14) return false;
  return isWinningHand(fullHand, jingTypes);
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
export function canPung(hand: TileType[], discarded: TileType, jingTypes: TileType[]): boolean {
  const { naturals, jingCount } = separateJing(hand, jingTypes);
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
 * Rules §3.2: wildcards may NOT substitute in Kongs (only in Chow, Pung, Pair).
 * Requires 3 exact copies of the discarded tile in hand (no jing substitution).
 * Spirit Kong (discarded tile is itself a jing type, player holds 3 copies) is
 * covered naturally: hand.filter(t => t === discarded) counts all matching tiles.
 */
export function canKongFromDiscard(
  hand: TileType[],
  discarded: TileType,
  _jingTypes: TileType[],
): boolean {
  return hand.filter((t) => t === discarded).length >= 3;
}

/**
 * Find all tile types the player can declare a **concealed Kong** with (from their draw).
 *
 * Rules §3.2: wildcards may NOT substitute in Kongs.
 * Valid cases:
 *   - 4 natural copies of the same non-jing tile type
 *   - Spirit Kong (杠精): 4 copies of the same jing tile type (not wildcard use — the
 *     jings ARE the tile being konged)
 */
export function concealedKongOptions(hand: TileType[], jingTypes: TileType[]): TileType[] {
  const { naturals } = separateJing(hand, jingTypes);
  const options: TileType[] = [];
  const seen = new Set<TileType>();

  const counts = new Map<TileType, number>();
  for (const t of naturals) counts.set(t, (counts.get(t) ?? 0) + 1);

  // 4 natural copies of the same type
  for (const [t, cnt] of counts) {
    if (cnt >= 4 && !seen.has(t)) {
      options.push(t);
      seen.add(t);
    }
  }

  // Spirit Kong: 4 copies of the same jing tile type
  for (const jt of jingTypes) {
    const jtCount = hand.filter((t) => t === jt).length;
    if (jtCount >= 4 && !seen.has(jt)) {
      options.push(jt);
      seen.add(jt);
    }
  }

  return options;
}

/**
 * Find all tile types the player can add to an existing open Pung to make a Kong.
 * `openPungTile` is the TileType of the open Pung.
 *
 * Rules §3.2: wildcards may NOT substitute in Kongs. An open pung is a revealed meld,
 * so only the exact matching tile may be added — no jing substitution.
 * Spirit Pung (open pung of jing tiles): the 4th jing tile IS the matching tile,
 * so the raw hand is checked directly — separateJing must not be used here.
 */
export function addToKongOptions(
  hand: TileType[],
  openPungTile: TileType,
  _jingTypes: TileType[],
): TileType[] {
  return hand.includes(openPungTile) ? [openPungTile] : [];
}

// ── Chow ──────────────────────────────────────────────────────────────────────

/**
 * Return all valid Chow combinations the player can form with the discarded tile.
 * The player must be immediately after the discarder.
 *
 * Each returned array is a [lower, mid, upper] TileType triple forming the chow.
 * The discard can appear at any position in the triple.
 *
 * Honor Chow: In Nanchang Mahjong, three non-repeating Wind tiles or the three
 * Dragon tiles also form a valid Chow sequence.
 */
export function chowOptions(
  hand: TileType[],
  discarded: TileType,
  jingTypes: TileType[],
): Array<[TileType, TileType, TileType]> {
  if (isHonor(discarded)) {
    // Honor Chow: check all wind/dragon sequences containing the discarded tile
    const { naturals: hn, jingCount: hjCount } = separateJing(hand, jingTypes);
    const honorChows = getHonorChowsContaining(discarded);
    return honorChows.filter((chow) => {
      let jingsNeeded = 0;
      const naturalsLeft = [...hn];
      for (const tile of chow) {
        if (tile === discarded) continue; // this comes from the discard, not the hand
        const idx = naturalsLeft.indexOf(tile);
        if (idx !== -1) {
          naturalsLeft.splice(idx, 1);
        } else if (jingsNeeded < hjCount) {
          jingsNeeded++;
        } else {
          return false;
        }
      }
      return true;
    });
  }

  const { naturals, jingCount } = separateJing(hand, jingTypes);
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
export function tenpaiTiles(hand: TileType[], jingTypes: TileType[]): TileType[] {
  if (hand.length !== 13) return [];

  const winning: TileType[] = [];
  for (const candidate of TILE_TYPES) {
    if (canWin(hand, candidate, jingTypes)) {
      winning.push(candidate);
    }
  }

  return [...new Set(winning)];
}

/**
 * True if a player's 13-tile hand can win off any tile (is in tenpai).
 */
export function isTenpai(hand: TileType[], jingTypes: TileType[]): boolean {
  return tenpaiTiles(hand, jingTypes).length > 0;
}
