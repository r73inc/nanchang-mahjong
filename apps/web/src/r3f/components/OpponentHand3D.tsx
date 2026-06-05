/**
 * OpponentHand3D.tsx
 *
 * A row of face-down tiles for one opponent.
 * Only `count` and `poses` are needed — no tile types (hidden from viewer).
 */

import * as THREE from 'three';
import type { TilePose } from '../utils/table-layout';
import type { TileTextureMap } from '../hooks/useTileTextures';
import { MahjongTile3D } from './MahjongTile3D';

// ── Types ─────────────────────────────────────────────────────────────────────

interface OpponentHand3DProps {
  count: number;
  poses: TilePose[];
  backTexture: THREE.Texture;
}

// Stable empty face map — face-down tiles never consult faceMap
const EMPTY_FACE_MAP: TileTextureMap = new Map();

const HIDDEN: TilePose = { x: 0, y: -10, z: 0, rx: 0, ry: 0, rz: 0 };

// ── Component ─────────────────────────────────────────────────────────────────

export function OpponentHand3D({ count, poses, backTexture }: OpponentHand3DProps) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <MahjongTile3D
          key={`opp-hand-${i}`}
          tileType={null}
          faceMap={EMPTY_FACE_MAP}
          backTexture={backTexture}
          pose={poses[i] ?? HIDDEN}
        />
      ))}
    </>
  );
}
