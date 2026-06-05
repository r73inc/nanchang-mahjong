/**
 * useTileTextures.ts
 *
 * Preloads all tile face SVG textures for a given palette variant and returns
 * a Map<TileType, THREE.Texture> for use by MahjongTile3D.
 *
 * Must be called inside a <Canvas> with a surrounding <Suspense> boundary —
 * useTexture() suspends the component tree until all 35 textures are fetched.
 *
 * Usage:
 *   const { faceMap, backTexture } = useTileTextures('Regular');
 *   const faceTex = faceMap.get('1m');   // THREE.Texture for Man-1
 *
 * Texture configuration applied on load:
 *   - flipY = false  (SVGs are top-to-bottom; WebGL expects bottom-to-top)
 *   - colorSpace = THREE.SRGBColorSpace  (correct gamma for CSS-style colours)
 *   - anisotropy = renderer max  (sharpens tiles viewed at oblique angles)
 */

import { useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { TileType } from '@nanchang/shared';
import {
  ALL_TILE_TYPES,
  allFaceTexturePaths,
  backTexturePath,
  type TilePaletteVariant,
} from '../utils/tile-texture-map';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Map from engine TileType to a fully configured THREE.Texture. */
export type TileTextureMap = Map<TileType, THREE.Texture>;

export interface TileTexturesResult {
  /** Face texture for each of the 34 distinct tile types. */
  faceMap: TileTextureMap;
  /** The tile back texture — used for face-down (opponent/wall) tiles. */
  backTexture: THREE.Texture;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Loads and configures all tile textures for the specified palette.
 *
 * @param palette  'Regular' (light ivory) or 'Black' (dark theme)
 *
 * Implementation notes:
 * - Paths are passed to useTexture() in ALL_TILE_TYPES order (34 face + 1 back).
 * - Texture indices are therefore stable: faceTextures[i] → ALL_TILE_TYPES[i].
 * - Switching palette remounts with new URLs; drei caches by URL so swapping
 *   back is instant on second call.
 */
export function useTileTextures(palette: TilePaletteVariant): TileTexturesResult {
  const { gl } = useThree();

  // Build the complete ordered path array once per palette change.
  const paths = useMemo(
    () => [...allFaceTexturePaths(palette), backTexturePath(palette)],
    [palette],
  );

  // useTexture with an array suspends until ALL textures are loaded.
  const rawTextures = useTexture(paths) as THREE.Texture[];

  // Configure each texture and assemble the map.
  return useMemo(() => {
    const maxAnisotropy = gl.capabilities.getMaxAnisotropy();

    rawTextures.forEach((tex) => {
      // Three.js default (flipY = true) flips the image vertically before
      // uploading to the GPU, compensating for WebGL's bottom-to-top texture
      // addressing. SVGs loaded via the browser Image API are top-to-bottom,
      // so the default flip is exactly what we need — do NOT set flipY = false
      // or the tile characters appear upside-down (BUG-02 fix).
      tex.flipY = true;
      // Treat SVG colours as sRGB so they match CSS colour expectations.
      tex.colorSpace = THREE.SRGBColorSpace;
      // Anisotropic filtering sharpens tiles viewed at shallow angles.
      tex.anisotropy = maxAnisotropy;
      tex.needsUpdate = true;
    });

    // Build the face map: index-aligned with ALL_TILE_TYPES order.
    const faceMap: TileTextureMap = new Map();
    ALL_TILE_TYPES.forEach((tile, i) => {
      faceMap.set(tile, rawTextures[i]);
    });

    // Back texture is appended after the 34 face textures.
    const backTexture = rawTextures[ALL_TILE_TYPES.length];

    return { faceMap, backTexture };
  }, [rawTextures, gl]);
}
