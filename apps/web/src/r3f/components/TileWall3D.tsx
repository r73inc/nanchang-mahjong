/**
 * TileWall3D.tsx
 *
 * Renders the remaining draw wall as four sides of stacked face-down tiles
 * arranged around the center of the felt, just inside the discard area.
 *
 * ── Layout ───────────────────────────────────────────────────────────────────
 *
 *   4 sides × 17 stacks × 2 layers = 136 total tile slots (the full set).
 *   Wall sits at ±WALL_DIST from the table center, just inside the discard
 *   area (DISCARD_START = 2.6). Standing tiles don't overlap flat discards.
 *
 *   Side order in the instance array:
 *     0 – 33  : South (near viewer)   z = +WALL_DIST
 *     34 – 67 : East  (right)         x = +WALL_DIST
 *     68 – 101: North (across)        z = −WALL_DIST
 *    102 – 135: West  (left)          x = −WALL_DIST
 *
 *   Within each side: bottom layer first (indices 0–16), top layer second
 *   (indices 17–33). This keeps each pair of vertically-stacked tiles adjacent
 *   in the buffer, so the wall "melts" from one end as tiles are drawn.
 *
 * ── Rendering ────────────────────────────────────────────────────────────────
 *
 *   Uses a single THREE.InstancedMesh for one draw call regardless of wall
 *   count. Instances for tiles that have already been drawn are scaled to 0.
 *   We show the LAST `wallCount` tiles in the array so the wall drains from
 *   the South side first (South → East → North → West), matching the typical
 *   clockwise draw direction.
 *
 *   Tiles are plain BoxGeometry with a flat MeshBasicMaterial — no GLB, no
 *   textures, no animations. Wall tiles are decorative only (no interaction).
 */

import { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';

// ── Dimensions (must match table-layout.ts / useTileGeometry.ts) ──────────────

const TILE_W = 0.55; // TILE_WIDTH
const TILE_H = 0.733; // TILE_HEIGHT
const TILE_D = 0.298; // TILE_DEPTH
const STANDING_Y = TILE_H / 2; // centre of standing tile above felt

// ── Wall constants ─────────────────────────────────────────────────────────────

const STACKS = 17; // tile stacks per side
const LAYERS = 2; // tiles stacked vertically per stack
const WALL_DIST = 1.85; // distance from origin to wall centre-line
const STRIDE = TILE_W + 0.04; // horizontal gap between stacks (0.59 u)
const HALF = ((STACKS - 1) / 2) * STRIDE; // half-width of one wall side
const TOTAL = STACKS * LAYERS * 4; // 136

// ── Pre-computed per-instance data ────────────────────────────────────────────

interface WallSlot {
  x: number;
  y: number;
  z: number;
  ry: number;
}

/**
 * All 136 wall positions, computed once at module load.
 *
 * ry derivation (right-hand rule, Y up):
 *   Local +Z is the tile's face direction (front). We want faces pointing
 *   INWARD (toward the centre, so players can see the tile backs outward).
 *
 *   South  (z=+WALL_DIST) → face must point to −Z → ry = Math.PI
 *   East   (x=+WALL_DIST) → face must point to −X → ry = −Math.PI/2
 *   North  (z=−WALL_DIST) → face must point to +Z → ry = 0
 *   West   (x=−WALL_DIST) → face must point to +X → ry = +Math.PI/2
 */
const WALL_SLOTS: WallSlot[] = (() => {
  const sides = [
    { cx: 0, cz: +WALL_DIST, ry: Math.PI, dx: 1, dz: 0 }, // South
    { cx: +WALL_DIST, cz: 0, ry: -Math.PI / 2, dx: 0, dz: 1 }, // East
    { cx: 0, cz: -WALL_DIST, ry: 0, dx: 1, dz: 0 }, // North
    { cx: -WALL_DIST, cz: 0, ry: Math.PI / 2, dx: 0, dz: 1 }, // West
  ];

  const result: WallSlot[] = [];

  for (const side of sides) {
    for (let layer = 0; layer < LAYERS; layer++) {
      const y = STANDING_Y + layer * TILE_H;
      for (let s = 0; s < STACKS; s++) {
        const col = s * STRIDE - HALF;
        result.push({
          x: side.cx + col * side.dx,
          y,
          z: side.cz + col * side.dz,
          ry: side.ry,
        });
      }
    }
  }

  return result;
})();

// ── Shared geometry (created once, never disposed) ────────────────────────────

const WALL_GEO = new THREE.BoxGeometry(TILE_W, TILE_H, TILE_D);

/** A zero-scale matrix to hide unused instances without incurring draw cost. */
const ZERO_MAT4 = new THREE.Matrix4().makeScale(0, 0, 0);

// ── Component ─────────────────────────────────────────────────────────────────

interface TileWall3DProps {
  /** Number of tiles remaining in the draw wall (from snapshot.wallCount). */
  wallCount: number;
  /** Back-face SVG texture — applied to all wall tile instances. */
  backTexture: THREE.Texture;
}

export function TileWall3D({ wallCount, backTexture }: TileWall3DProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);

  // Reusable Object3D for matrix composition — avoids per-frame allocations.
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Per-component material so the Back.svg texture is applied to every instance.
  // Disposed on unmount to free GPU memory.
  const wallMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ map: backTexture }),
    [backTexture],
  );
  useEffect(() => () => wallMaterial.dispose(), [wallMaterial]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // Show the LAST `wallCount` slots so tiles drain from the South side first.
    const show = Math.min(Math.max(0, wallCount), TOTAL);
    const firstVisible = TOTAL - show;

    for (let i = 0; i < TOTAL; i++) {
      if (i >= firstVisible) {
        const slot = WALL_SLOTS[i];
        dummy.position.set(slot.x, slot.y, slot.z);
        dummy.rotation.set(0, slot.ry, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      } else {
        mesh.setMatrixAt(i, ZERO_MAT4);
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
  }, [wallCount, dummy]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[WALL_GEO, wallMaterial, TOTAL]}
      frustumCulled={false} // wall spans the whole table — skip frustum check
    />
  );
}
