/**
 * tile-texture-map.ts
 *
 * Maps every engine TileType to the correct FluffyStuff SVG filename and
 * builds the public URL for use with Three.js TextureLoader / useTexture().
 *
 * FluffyStuff tile sets are pre-placed at:
 *   apps/web/public/textures/Tiles/Regular/*.svg  (classic + sepia palettes)
 *   apps/web/public/textures/Tiles/Black/*.svg    (dark palette)
 *
 * Wind tile naming follows Japanese mahjong conventions used by FluffyStuff:
 *   East  → Ton   (東 ton-puu)
 *   South → Nan   (南 nan-puu)
 *   West  → Shaa  (西 sha-puu)
 *   North → Pei   (北 pei-puu)
 *
 * This file is pure TypeScript with no runtime deps — safe to import in tests
 * without a WebGL or browser context.
 */

import type { TileType } from '@nanchang/shared';

// ── Mapping table ─────────────────────────────────────────────────────────────

/** Engine TileType → FluffyStuff SVG base filename (no extension, no path). */
const TILE_TO_FLUFFY: Record<TileType, string> = {
  // Man / Character (萬)
  '1m': 'Man1',
  '2m': 'Man2',
  '3m': 'Man3',
  '4m': 'Man4',
  '5m': 'Man5',
  '6m': 'Man6',
  '7m': 'Man7',
  '8m': 'Man8',
  '9m': 'Man9',
  // Pin / Dot (筒)
  '1p': 'Pin1',
  '2p': 'Pin2',
  '3p': 'Pin3',
  '4p': 'Pin4',
  '5p': 'Pin5',
  '6p': 'Pin6',
  '7p': 'Pin7',
  '8p': 'Pin8',
  '9p': 'Pin9',
  // Sou / Bamboo (條)
  '1s': 'Sou1',
  '2s': 'Sou2',
  '3s': 'Sou3',
  '4s': 'Sou4',
  '5s': 'Sou5',
  '6s': 'Sou6',
  '7s': 'Sou7',
  '8s': 'Sou8',
  '9s': 'Sou9',
  // Winds (Japanese naming used by FluffyStuff)
  east: 'Ton',
  south: 'Nan',
  west: 'Shaa',
  north: 'Pei',
  // Dragons
  zhong: 'Chun', // 中 Red Dragon
  fa: 'Hatsu', // 發 Green Dragon
  bai: 'Haku', // 白 White Dragon
};

// ── Public API ────────────────────────────────────────────────────────────────

/** FluffyStuff palette variant. */
export type TilePaletteVariant = 'Regular' | 'Black';

/**
 * Returns the public URL for a tile's face SVG texture.
 *
 * @example
 *   tileTexturePath('1m', 'Regular')  →  '/textures/Tiles/Regular/Man1.svg'
 *   tileTexturePath('east', 'Black')  →  '/textures/Tiles/Black/Ton.svg'
 */
export function tileTexturePath(tile: TileType, palette: TilePaletteVariant = 'Regular'): string {
  // TILE_TO_FLUFFY is Record<TileType, string> so TypeScript guarantees completeness,
  // but at runtime an incorrect cast or future schema change could pass an unknown value.
  // The cast to `string | undefined` enables the runtime safety check without losing
  // the compile-time Record guarantee for callers with correct types.
  const name = (TILE_TO_FLUFFY as Record<string, string | undefined>)[tile as string];
  if (!name) {
    console.warn(`[tileTexturePath] Unknown tile type "${String(tile)}" — using blank fallback`);
    return `/textures/Tiles/${palette}/Blank.svg`;
  }
  return `/textures/Tiles/${palette}/${name}.svg`;
}

/**
 * Returns the URL for the tile back (face-down) texture.
 *
 * @example
 *   backTexturePath('Regular')  →  '/textures/Tiles/Regular/Back.svg'
 */
export function backTexturePath(palette: TilePaletteVariant = 'Regular'): string {
  return `/textures/Tiles/${palette}/Back.svg`;
}

/**
 * All 34 distinct face texture paths for a given palette, in a stable order.
 * Used for bulk preloading via useTexture([...allFaceTexturePaths('Regular')]).
 */
export function allFaceTexturePaths(palette: TilePaletteVariant): string[] {
  return ALL_TILE_TYPES.map((t) => tileTexturePath(t, palette));
}

/**
 * All 34 engine TileType values, in a stable canonical order.
 * Used as the index into the array returned by useTexture() during preload.
 */
export const ALL_TILE_TYPES: readonly TileType[] = [
  '1m',
  '2m',
  '3m',
  '4m',
  '5m',
  '6m',
  '7m',
  '8m',
  '9m',
  '1p',
  '2p',
  '3p',
  '4p',
  '5p',
  '6p',
  '7p',
  '8p',
  '9p',
  '1s',
  '2s',
  '3s',
  '4s',
  '5s',
  '6s',
  '7s',
  '8s',
  '9s',
  'east',
  'south',
  'west',
  'north',
  'zhong',
  'fa',
  'bai',
] as const;

/**
 * Derives the correct TilePaletteVariant from the app's ThemeStore tilePalette.
 * 'classic' and 'sepia' use the Regular (white-background) texture set.
 * 'dark' uses the Black texture set.
 */
export function themeToVariant(
  tilePalette:
    | 'classic'
    | 'sepia'
    | 'dark'
    | 'lime'
    | 'frosted-blue'
    | 'tomato-jam'
    | 'pastel-petal'
    | 'radioactive-grass'
    | 'indigo-ink',
): TilePaletteVariant {
  return tilePalette === 'dark' || tilePalette === 'tomato-jam' || tilePalette === 'indigo-ink'
    ? 'Black'
    : 'Regular';
}
