/**
 * Tile constants, type helpers, and wall factory.
 */
import type { TileId, TileType } from './types';

// ── Ordered tile type list (34 types) ─────────────────────────────────────────

export const SUIT_MAN: TileType[] = ['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m'];
export const SUIT_PIN: TileType[] = ['1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p'];
export const SUIT_SOU: TileType[] = ['1s', '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s'];
export const WINDS: TileType[] = ['east', 'south', 'west', 'north'];
export const DRAGONS: TileType[] = ['zhong', 'fa', 'bai'];

/** All 34 unique tile types in canonical order. */
export const TILE_TYPES: TileType[] = [...SUIT_MAN, ...SUIT_PIN, ...SUIT_SOU, ...WINDS, ...DRAGONS];

// Build a fast lookup: TileType → its index in TILE_TYPES (0–33)
const TYPE_INDEX: Map<TileType, number> = new Map(TILE_TYPES.map((t, i) => [t, i]));

// ── TileId ↔ TileType conversion ──────────────────────────────────────────────

/**
 * Return the canonical type for a given physical tile ID (0–135).
 * Formula: typeIndex = Math.floor(id / 4)
 */
export function typeOf(id: TileId): TileType {
  return TILE_TYPES[Math.floor(id / 4)];
}

/**
 * Return the physical tile ID for a given type and copy index (0–3).
 */
export function idOf(type: TileType, copy: 0 | 1 | 2 | 3): TileId {
  const idx = TYPE_INDEX.get(type);
  if (idx === undefined) throw new Error(`Unknown tile type: ${String(type)}`);
  return idx * 4 + copy;
}

/**
 * Return the canonical comparison index of a TileType (0–33).
 * Used for sorting.
 */
export function typeIndex(type: TileType): number {
  const idx = TYPE_INDEX.get(type);
  if (idx === undefined) throw new Error(`Unknown tile type: ${String(type)}`);
  return idx;
}

/** Returns a new copy of the array sorted in canonical order; does not mutate the input. */
export function sortTypes(types: TileType[]): TileType[] {
  return types.slice().sort((a, b) => typeIndex(a) - typeIndex(b));
}

// ── Tile category helpers ─────────────────────────────────────────────────────

const HONOR_SET = new Set<TileType>([...WINDS, ...DRAGONS]);

/** True for Wind and Dragon tiles (i.e., not a suit tile). */
export function isHonor(t: TileType): boolean {
  return HONOR_SET.has(t);
}

/** True for man, pin, or sou tiles. */
export function isSuit(t: TileType): boolean {
  return !isHonor(t);
}

/** True for terminal tiles (1 or 9 in any suit). */
export function isTerminal(t: TileType): boolean {
  return t[0] === '1' || t[0] === '9';
}

/** True for terminal or honor tiles (used for Duan Yao / Quan Dai Yao checks). */
export function isTerminalOrHonor(t: TileType): boolean {
  return isTerminal(t) || isHonor(t);
}

type Suit3 = 'man' | 'pin' | 'sou';
type SuitSuffix = 'm' | 'p' | 's';

const SUIT_SUFFIX_MAP: Record<SuitSuffix, Suit3> = { m: 'man', p: 'pin', s: 'sou' };

/**
 * Return the suit of a suit tile ('man' | 'pin' | 'sou'), or null for honors.
 */
export function getSuit(t: TileType): Suit3 | null {
  if (isHonor(t)) return null;
  return SUIT_SUFFIX_MAP[t[1] as SuitSuffix] ?? null;
}

/**
 * Return the numerical rank (1–9) of a suit tile, or null for honors.
 */
export function getRank(t: TileType): number | null {
  if (isHonor(t)) return null;
  return parseInt(t[0], 10);
}

// ── Tile type arithmetic (used for Jing calculation and Chow building) ────────

/**
 * Return the tile type that is N steps above `t` in its category
 * (wrapping around within the category).
 */
export function stepAbove(t: TileType, n = 1): TileType {
  if (isSuit(t)) {
    const rank = getRank(t)!;
    const suit = t[1]; // 'm' | 'p' | 's'
    const newRank = ((rank - 1 + n) % 9) + 1;
    return `${newRank}${suit}` as TileType;
  }
  if (WINDS.includes(t)) {
    const idx = WINDS.indexOf(t);
    return WINDS[(idx + n) % 4];
  }
  // Dragons
  const idx = DRAGONS.indexOf(t);
  return DRAGONS[(idx + n) % 3];
}

/**
 * For two suit tiles in the same suit, return the distance (steps) from `from` to `to`
 * (0–8, not wrapping).  Returns null if not same suit or if `to` < `from`.
 */
export function suitDistance(from: TileType, to: TileType): number | null {
  if (isHonor(from) || isHonor(to)) return null;
  if (from[1] !== to[1]) return null;
  const d = getRank(to)! - getRank(from)!;
  return d >= 0 ? d : null;
}

// ── Honor Chow sequences ──────────────────────────────────────────────────────

/**
 * All valid Wind chow sequences (including wrap-around).
 * In Nanchang Mahjong, three non-repeating Wind tiles form a valid Chow.
 */
export const WIND_CHOWS: readonly [TileType, TileType, TileType][] = [
  ['east', 'south', 'west'],
  ['south', 'west', 'north'],
  ['west', 'north', 'east'],
  ['north', 'east', 'south'],
];

/**
 * The Dragon chow sequence: zhong → fa → bai.
 * In Nanchang Mahjong, the three different Dragon tiles form a valid Chow.
 */
export const DRAGON_CHOW: readonly [TileType, TileType, TileType] = ['zhong', 'fa', 'bai'];

/**
 * Return all honor Chow sequences (wind or dragon) that contain tile `t`.
 * Returns an empty array if `t` is not an honor tile.
 */
export function getHonorChowsContaining(t: TileType): [TileType, TileType, TileType][] {
  if (!isHonor(t)) return [];
  const result: [TileType, TileType, TileType][] = [];
  for (const chow of WIND_CHOWS) {
    if ((chow as readonly TileType[]).includes(t))
      // Spread into a fresh array so callers cannot accidentally mutate the global constant.
      result.push([...chow] as [TileType, TileType, TileType]);
  }
  if ((DRAGON_CHOW as readonly TileType[]).includes(t))
    result.push([...DRAGON_CHOW] as [TileType, TileType, TileType]);
  return result;
}

// ── Wall factory ──────────────────────────────────────────────────────────────

/**
 * Build the full 136-tile wall in canonical order (unsorted physical IDs 0–135).
 * Call seededShuffle from prng.ts to randomise before dealing.
 */
export function buildWall(): TileId[] {
  const wall: TileId[] = [];
  for (let i = 0; i < 136; i++) wall.push(i);
  return wall;
}
