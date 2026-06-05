/**
 * GameCanvas.tsx
 *
 * The React Three Fiber canvas that renders the shared 3D game table.
 *
 * What's IN the 3D canvas:
 *   - Felt surface (green plane)
 *   - Tile wall (remaining draw tiles shown as a rectangular frame)
 *   - Opponent hands (face-down tile rows, 3 opponents)
 *   - Discard pools (all 4 seats, flat face-up)
 *   - Open melds (all seats, flat face-up)
 *
 * What's NOT in the canvas (handled as DOM overlays in game-page.tsx):
 *   - Viewer's own hand → ViewerHandHUD (DOM, larger tiles, drag-to-reorder)
 *   - Status bar, claim rail, action toasts, nameplates, etc.
 *
 * ── Lighting philosophy ───────────────────────────────────────────────────────
 *
 * All tile meshes (body + face stamp) now use MeshBasicMaterial — they are
 * completely unlit and always render at full brightness regardless of lighting
 * or tile orientation. This permanently fixes BUG-03 (clearcoat blow-out on
 * flat tiles) and IMP-02 (over-reflective tile bodies).
 *
 * Scene lighting only affects the felt surface (MeshStandardMaterial). A soft
 * ambient + a single low-intensity directional fill give the felt subtle depth
 * without harsh specular. The heavy studio IBL Environment has been removed.
 *
 * ── Phase G selector pattern preserved ───────────────────────────────────────
 *
 * GameScene reads `snapshot` directly from the Zustand store with slice
 * selectors — re-renders only on game-state changes, not when claimWindow,
 * toast, or connection-status update in the parent.
 */

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../stores/game.store';
import { useThemeStore } from '../stores/theme.store';
import { FELT_CONFIGS } from '../lib/theme.utils';
import { themeToVariant } from './utils/tile-texture-map';
import { useTileTextures } from './hooks/useTileTextures';
import { computeTableLayout } from './utils/table-layout';
import { FeltSurface3D } from './components/FeltSurface3D';
import { TileWall3D } from './components/TileWall3D';
import { OpponentHand3D } from './components/OpponentHand3D';
import { DiscardPool3D } from './components/DiscardPool3D';
import { OpenMelds3D } from './components/OpenMelds3D';

// ── Inner scene (must be inside <Canvas> to call R3F hooks) ──────────────────

/**
 * The R3F scene graph. Lives inside <Canvas> to access R3F context.
 *
 * No longer handles the viewer's hand — that is a DOM overlay (ViewerHandHUD)
 * in game-page.tsx. This component only renders the shared table elements:
 * felt, wall, opponent hands, discards, open melds.
 */
function GameScene() {
  // ── Store reads (slice selectors — re-render only on these changes) ──────
  const snapshot = useGameStore((s) => s.snapshot);

  // ── Theme ────────────────────────────────────────────────────────────────
  const felt = useThemeStore((s) => s.felt);
  const tilePalette = useThemeStore((s) => s.tilePalette);

  const palette = themeToVariant(tilePalette);
  const feltColor = FELT_CONFIGS[felt].top;

  // ── Asset loading ─────────────────────────────────────────────────────────
  const { faceMap, backTexture } = useTileTextures(palette);

  // Guard — canvas may mount before the first server snapshot arrives.
  if (!snapshot) return null;

  // ── Layout ────────────────────────────────────────────────────────────────
  const layout = computeTableLayout(snapshot);

  // ── Seat indices ──────────────────────────────────────────────────────────
  const viewerSeat = (snapshot.viewerSeat ?? 0) as 0 | 1 | 2 | 3;
  const rightSeat = ((viewerSeat + 1) % 4) as 0 | 1 | 2 | 3;
  const acrossSeat = ((viewerSeat + 2) % 4) as 0 | 1 | 2 | 3;
  const leftSeat = ((viewerSeat + 3) % 4) as 0 | 1 | 2 | 3;

  // ── Jing types (for golden highlight on discard / meld tiles) ─────────────
  const jingTypes = new Set<string>();
  if (snapshot.jingPrimary) jingTypes.add(snapshot.jingPrimary);
  if (snapshot.jingSecondary) jingTypes.add(snapshot.jingSecondary);

  return (
    <>
      {/* ── Lighting ─────────────────────────────────────────────────────── */}
      {/*
       * Only the felt surface (MeshStandardMaterial) responds to these lights.
       * All tile meshes use MeshBasicMaterial and ignore lighting entirely,
       * so there's no risk of specular blow-out on tiles from these sources.
       *
       * Ambient: base fill so the felt isn't pure black in shadow regions.
       * Directional: gentle top-right fill for subtle felt depth/texture.
       */}
      <ambientLight intensity={0.75} />
      <directionalLight position={[4, 12, 6]} intensity={0.5} />

      {/* ── Table surface ────────────────────────────────────────────────── */}
      <FeltSurface3D color={feltColor} />

      {/* ── Draw wall ────────────────────────────────────────────────────── */}
      {/* InstancedMesh of 136 slots; visible count = snapshot.wallCount */}
      <TileWall3D wallCount={snapshot.wallCount} backTexture={backTexture} />

      {/* ── Opponent hands (face-down) ───────────────────────────────────── */}
      <OpponentHand3D
        count={snapshot.seats[acrossSeat].handCount}
        poses={layout.opponentHands.across}
        backTexture={backTexture}
      />
      <OpponentHand3D
        count={snapshot.seats[rightSeat].handCount}
        poses={layout.opponentHands.right}
        backTexture={backTexture}
      />
      <OpponentHand3D
        count={snapshot.seats[leftSeat].handCount}
        poses={layout.opponentHands.left}
        backTexture={backTexture}
      />

      {/* ── Discard pools — one per seat ─────────────────────────────────── */}
      {snapshot.seats.map((seat, idx) => (
        <DiscardPool3D
          key={`discards-${idx}`}
          discards={seat.discards}
          poses={layout.discards[idx] ?? []}
          faceMap={faceMap}
          backTexture={backTexture}
          jingTypes={jingTypes}
          isLastDiscard={snapshot.discardedBySeat === idx}
        />
      ))}

      {/* ── Open melds — one component per meld per seat ─────────────────── */}
      {snapshot.seats.map((seat, seatIdx) =>
        seat.openMelds.map((meld, meldIdx) => (
          <OpenMelds3D
            key={`meld-${seatIdx}-${meldIdx}`}
            meld={meld}
            poses={layout.openMelds[seatIdx]?.[meldIdx] ?? []}
            faceMap={faceMap}
            backTexture={backTexture}
            jingTypes={jingTypes}
          />
        )),
      )}
    </>
  );
}

// ── Public canvas component ───────────────────────────────────────────────────

/**
 * Full-screen 3D game table. Mount it inside a `position: relative` container;
 * DOM overlays go above it using `position: absolute` with a higher z-index.
 *
 * The viewer's hand is intentionally NOT rendered here — it lives in
 * ViewerHandHUD (DOM) in game-page.tsx for larger, draggable tiles closer to
 * the camera. The canvas is still full-screen but only shows the shared table.
 *
 * Shadows are disabled — MeshBasicMaterial tiles don't cast/receive shadows,
 * and the overhead isn't worth it for the felt alone.
 */
export function GameCanvas() {
  return (
    <Canvas
      camera={{ position: [0, 8, 13], fov: 58, near: 0.1, far: 80 }}
      gl={{ antialias: true, toneMapping: THREE.NoToneMapping }}
      style={{ width: '100%', height: '100%' }}
      onCreated={({ raycaster }) => {
        raycaster.firstHitOnly = true;
      }}
    >
      <Suspense fallback={null}>
        <GameScene />
      </Suspense>
    </Canvas>
  );
}
