/**
 * OpenMelds3D.tsx
 *
 * Renders one open meld (pung = 3 tiles, kong = 4, chow = 3) as a flat,
 * face-up row. One instance per meld per seat.
 */

import * as THREE from 'three';
import type { Meld } from '@nanchang/shared';
import type { TilePose } from '../utils/table-layout';
import type { TileTextureMap } from '../hooks/useTileTextures';
import { MahjongTile3D } from './MahjongTile3D';

// ── Types ─────────────────────────────────────────────────────────────────────

interface OpenMelds3DProps {
  meld: Meld;
  poses: TilePose[];
  faceMap: TileTextureMap;
  backTexture: THREE.Texture;
  jingTypes: Set<string>;
}

const HIDDEN: TilePose = { x: 0, y: -10, z: 0, rx: 0, ry: 0, rz: 0 };

// ── Component ─────────────────────────────────────────────────────────────────

export function OpenMelds3D({ meld, poses, faceMap, backTexture, jingTypes }: OpenMelds3DProps) {
  return (
    <>
      {meld.tiles.map((tile, i) => (
        <MahjongTile3D
          key={`meld-tile-${i}`}
          tileType={tile}
          faceMap={faceMap}
          backTexture={backTexture}
          pose={poses[i] ?? HIDDEN}
          isJing={jingTypes.has(tile)}
        />
      ))}
    </>
  );
}
