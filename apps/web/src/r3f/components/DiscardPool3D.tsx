/**
 * DiscardPool3D.tsx
 *
 * Face-up discard pile for one seat. Tiles lie flat, face visible from above.
 * The most recently discarded tile (isLastDiscard=true) is highlighted.
 */

import * as THREE from 'three';
import type { TileType } from '@nanchang/shared';
import type { TilePose } from '../utils/table-layout';
import type { TileTextureMap } from '../hooks/useTileTextures';
import { MahjongTile3D } from './MahjongTile3D';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DiscardPool3DProps {
  discards: TileType[];
  poses: TilePose[];
  faceMap: TileTextureMap;
  backTexture: THREE.Texture;
  jingTypes: Set<string>;
  /** True when this seat is the one that just discarded (highlights last tile). */
  isLastDiscard: boolean;
}

const HIDDEN: TilePose = { x: 0, y: -10, z: 0, rx: 0, ry: 0, rz: 0 };

// ── Component ─────────────────────────────────────────────────────────────────

export function DiscardPool3D({
  discards,
  poses,
  faceMap,
  backTexture,
  jingTypes,
  isLastDiscard,
}: DiscardPool3DProps) {
  const lastIdx = discards.length - 1;

  return (
    <>
      {discards.map((tile, i) => (
        <MahjongTile3D
          key={`discard-${i}`}
          tileType={tile}
          faceMap={faceMap}
          backTexture={backTexture}
          pose={poses[i] ?? HIDDEN}
          isJing={jingTypes.has(tile)}
          // Highlight the last discarded tile so all players notice it
          isSelected={i === lastIdx && isLastDiscard}
        />
      ))}
    </>
  );
}
