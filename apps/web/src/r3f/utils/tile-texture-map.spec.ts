/**
 * tile-texture-map.spec.ts
 *
 * Unit tests for the TileType → SVG path mapping utility.
 * Pure TS — no browser, no WebGL context needed.
 *
 * NOTE: The Black palette SVG set has been removed from the project.
 * Only the Regular palette is available; tests for Black paths are removed.
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
  it('always returns Regular (Black assets removed from project)', () => {
    expect(themeToVariant('dark')).toBe('Regular');
    expect(themeToVariant('classic')).toBe('Regular');
    expect(themeToVariant('sepia')).toBe('Regular');
  });
});
