/**
 * tile-texture-map.spec.ts
 *
 * Unit tests for the TileType → SVG path mapping utility.
 * Pure TS — no browser, no WebGL context needed.
 */

import { describe, it, expect } from 'vitest';
import {
  tileTexturePath,
  backTexturePath,
  allFaceTexturePaths,
  themeToVariant,
  ALL_TILE_TYPES,
} from './tile-texture-map';
import type { TileType } from '@nanchang/shared';

// ── tileTexturePath ───────────────────────────────────────────────────────────

describe('tileTexturePath', () => {
  it('maps Man tiles to ManN.svg in Regular palette', () => {
    expect(tileTexturePath('1m')).toBe('/textures/Tiles/Regular/Man1.svg');
    expect(tileTexturePath('9m')).toBe('/textures/Tiles/Regular/Man9.svg');
  });

  it('maps Pin tiles to PinN.svg', () => {
    expect(tileTexturePath('1p')).toBe('/textures/Tiles/Regular/Pin1.svg');
    expect(tileTexturePath('9p')).toBe('/textures/Tiles/Regular/Pin9.svg');
  });

  it('maps Sou tiles to SouN.svg', () => {
    expect(tileTexturePath('1s')).toBe('/textures/Tiles/Regular/Sou1.svg');
    expect(tileTexturePath('9s')).toBe('/textures/Tiles/Regular/Sou9.svg');
  });

  it('maps wind tiles using Japanese names', () => {
    expect(tileTexturePath('east')).toBe('/textures/Tiles/Regular/Ton.svg');
    expect(tileTexturePath('south')).toBe('/textures/Tiles/Regular/Nan.svg');
    expect(tileTexturePath('west')).toBe('/textures/Tiles/Regular/Shaa.svg');
    expect(tileTexturePath('north')).toBe('/textures/Tiles/Regular/Pei.svg');
  });

  it('maps dragon tiles correctly', () => {
    expect(tileTexturePath('zhong')).toBe('/textures/Tiles/Regular/Chun.svg');
    expect(tileTexturePath('fa')).toBe('/textures/Tiles/Regular/Hatsu.svg');
    expect(tileTexturePath('bai')).toBe('/textures/Tiles/Regular/Haku.svg');
  });

  it('defaults to Regular palette when palette is omitted', () => {
    expect(tileTexturePath('5p')).toContain('/Regular/');
  });

  it('produces no duplicate paths across all 34 tile types', () => {
    const paths = ALL_TILE_TYPES.map((t) => tileTexturePath(t, 'Regular'));
    const unique = new Set(paths);
    expect(unique.size).toBe(34);
  });
});

// ── backTexturePath ───────────────────────────────────────────────────────────

describe('backTexturePath', () => {
  it('returns Regular Back.svg by default', () => {
    expect(backTexturePath()).toBe('/textures/Tiles/Regular/Back.svg');
  });

  it('returns Regular Back.svg when palette is explicitly Regular', () => {
    expect(backTexturePath('Regular')).toBe('/textures/Tiles/Regular/Back.svg');
  });

  it('returns Black Back.svg for the Black palette', () => {
    expect(backTexturePath('Black')).toBe('/textures/Tiles/Black/Back.svg');
  });
});

// ── allFaceTexturePaths ───────────────────────────────────────────────────────

describe('allFaceTexturePaths', () => {
  it('returns exactly 34 paths', () => {
    expect(allFaceTexturePaths('Regular')).toHaveLength(34);
  });

  it('all paths start with /textures/Tiles/Regular/', () => {
    for (const p of allFaceTexturePaths('Regular')) {
      expect(p).toMatch(/^\/textures\/Tiles\/Regular\/.+\.svg$/);
    }
  });

  it('all paths are unique within the Regular palette', () => {
    const paths = allFaceTexturePaths('Regular');
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('returns 34 unique paths for the Black palette', () => {
    const paths = allFaceTexturePaths('Black');
    expect(paths).toHaveLength(34);
    expect(new Set(paths).size).toBe(34);
  });

  it('all Black paths start with /textures/Tiles/Black/', () => {
    for (const p of allFaceTexturePaths('Black')) {
      expect(p).toMatch(/^\/textures\/Tiles\/Black\/.+\.svg$/);
    }
  });

  it('order matches ALL_TILE_TYPES order (stable index for useTexture preload)', () => {
    const paths = allFaceTexturePaths('Regular');
    ALL_TILE_TYPES.forEach((tile, i) => {
      expect(paths[i]).toBe(tileTexturePath(tile, 'Regular'));
    });
  });
});

// ── ALL_TILE_TYPES ────────────────────────────────────────────────────────────

describe('ALL_TILE_TYPES', () => {
  it('contains exactly 34 entries', () => {
    expect(ALL_TILE_TYPES).toHaveLength(34);
  });

  it('contains all 9 Man tiles', () => {
    for (let i = 1; i <= 9; i++) {
      expect(ALL_TILE_TYPES).toContain(`${i}m` as TileType);
    }
  });

  it('contains all 9 Pin tiles', () => {
    for (let i = 1; i <= 9; i++) {
      expect(ALL_TILE_TYPES).toContain(`${i}p` as TileType);
    }
  });

  it('contains all 9 Sou tiles', () => {
    for (let i = 1; i <= 9; i++) {
      expect(ALL_TILE_TYPES).toContain(`${i}s` as TileType);
    }
  });

  it('contains all 4 wind tiles', () => {
    expect(ALL_TILE_TYPES).toContain('east');
    expect(ALL_TILE_TYPES).toContain('south');
    expect(ALL_TILE_TYPES).toContain('west');
    expect(ALL_TILE_TYPES).toContain('north');
  });

  it('contains all 3 dragon tiles', () => {
    expect(ALL_TILE_TYPES).toContain('zhong');
    expect(ALL_TILE_TYPES).toContain('fa');
    expect(ALL_TILE_TYPES).toContain('bai');
  });

  it('has no duplicates', () => {
    expect(new Set(ALL_TILE_TYPES).size).toBe(34);
  });
});

// ── themeToVariant ────────────────────────────────────────────────────────────

describe('themeToVariant', () => {
  // Black-texture palettes — each tested individually so a regression is
  // immediately identifiable by name rather than buried in a multi-assertion it.

  it('maps dark to Black', () => {
    expect(themeToVariant('dark')).toBe('Black');
  });

  it('maps tomato-jam to Black', () => {
    expect(themeToVariant('tomato-jam')).toBe('Black');
  });

  it('maps indigo-ink to Black', () => {
    expect(themeToVariant('indigo-ink')).toBe('Black');
  });

  // Regular-texture palettes

  it('maps classic to Regular', () => {
    expect(themeToVariant('classic')).toBe('Regular');
  });

  it('maps sepia to Regular', () => {
    expect(themeToVariant('sepia')).toBe('Regular');
  });

  it('maps lime to Regular', () => {
    expect(themeToVariant('lime')).toBe('Regular');
  });

  it('maps frosted-blue to Regular', () => {
    expect(themeToVariant('frosted-blue')).toBe('Regular');
  });

  it('maps pastel-petal to Regular', () => {
    expect(themeToVariant('pastel-petal')).toBe('Regular');
  });

  it('maps radioactive-grass to Regular', () => {
    expect(themeToVariant('radioactive-grass')).toBe('Regular');
  });

  it('returns a valid TilePaletteVariant for every known palette', () => {
    const VALID: readonly string[] = ['Regular', 'Black'];
    const ALL_PALETTES = [
      'classic',
      'sepia',
      'dark',
      'lime',
      'frosted-blue',
      'tomato-jam',
      'pastel-petal',
      'radioactive-grass',
      'indigo-ink',
    ] as const;
    for (const p of ALL_PALETTES) {
      expect(VALID).toContain(themeToVariant(p));
    }
  });

  it('falls back to Regular for any unrecognised palette value at runtime', () => {
    // Cast to bypass TypeScript so we can verify the runtime guard.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(themeToVariant('unknown-future-palette' as any)).toBe('Regular');
  });
});
