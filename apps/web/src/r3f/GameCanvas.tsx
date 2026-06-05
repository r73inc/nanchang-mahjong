/**
 * GameCanvas.tsx
 *
 * The React Three Fiber canvas that replaces the DOM GameTable tile layout.
 *
 * Architecture:
 *   <GameCanvas>          — the <Canvas> wrapper, mounts/unmounts with the route
 *     <Suspense>          — suspends while textures / GLB are loading
 *       <GameScene>       — inner R3F component; all hooks must live here (inside Canvas)
 *         <FeltSurface3D> — green felt plane
 *         <TileHand3D>    — viewer's 13-14 interactive tiles at Z+HAND_DIST
 *         <OpponentHand3D> × 3  — face-down opponent tile rows
 *         <DiscardPool3D>  × 4  — flat discard grids per seat
 *         <OpenMelds3D>    × n  — flat open meld rows per seat
 *
 * DOM overlays (status bar, SideRail, ActionToast, ConcedeSheet) live OUTSIDE
 * this component in game-page.tsx, layered over the canvas via `position: absolute`.
 *
 * Camera: position (0, 14, 10), lookAt (0, 0, 0), FOV 48°
 *   Viewer's tiles at Z+5 project to the bottom of the viewport.
 *   Across opponent at Z-5 projects to the top.
 *   Right/left at X±5 project to the sides.
 */

import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import type { ClientGameState, TileType } from '@nanchang/shared';
import { useThemeStore } from '../stores/theme.store';
import { FELT_CONFIGS } from '../lib/theme.utils';
import { themeToVariant } from './utils/tile-texture-map';
import { useTileTextures } from './hooks/useTileTextures';
import { computeTableLayout } from './utils/table-layout';
import { FeltSurface3D } from './components/FeltSurface3D';
import { TileHand3D } from './components/TileHand3D';
import { OpponentHand3D } from './components/OpponentHand3D';
import { DiscardPool3D } from './components/DiscardPool3D';
import { OpenMelds3D } from './components/OpenMelds3D';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Warm ivory-gold fill light color — matches the felt lamp aesthetic. */
const WARM_LIGHT_COLOR = '#f5e6c0';

// ── Inner scene (must be inside <Canvas> to call R3F hooks) ──────────────────

interface GameSceneProps {
  snapshot: ClientGameState;
  selectedTileIdx: number | null;
  onSelectTile: (idx: number) => void;
  onDiscard: (tile: TileType) => void;
}

function GameScene({ snapshot, selectedTileIdx, onSelectTile, onDiscard }: GameSceneProps) {
  // Theme values (Zustand works inside Canvas — it's just React context)
  const felt = useThemeStore((s) => s.felt);
  const tilePalette = useThemeStore((s) => s.tilePalette);

  const palette = themeToVariant(tilePalette);
  const feltColor = FELT_CONFIGS[felt].top;

  // Load + configure all tile SVG textures. Suspends until all 35 are ready.
  const { faceMap, backTexture } = useTileTextures(palette);

  // Compute tile world positions from the current snapshot.
  // computeTableLayout is a cheap pure function — safe to call on every render.
  const layout = computeTableLayout(snapshot);

  // Seat indices relative to the viewer
  const viewerSeat = (snapshot.viewerSeat ?? 0) as 0 | 1 | 2 | 3;
  const rightSeat = ((viewerSeat + 1) % 4) as 0 | 1 | 2 | 3;
  const acrossSeat = ((viewerSeat + 2) % 4) as 0 | 1 | 2 | 3;
  const leftSeat = ((viewerSeat + 3) % 4) as 0 | 1 | 2 | 3;

  const viewerHand = snapshot.seats[viewerSeat].hand ?? [];
  const isMyTurn = snapshot.currentSeat === viewerSeat && snapshot.phase === 'playing';

  // Jing (spirit/wildcard) tile type set — recalculated only when jing changes
  const jingTypes = useMemo(() => {
    const s = new Set<string>();
    if (snapshot.jingPrimary) s.add(snapshot.jingPrimary);
    if (snapshot.jingSecondary) s.add(snapshot.jingSecondary);
    return s;
  }, [snapshot.jingPrimary, snapshot.jingSecondary]);

  return (
    <>
      {/* ── Lighting ──────────────────────────────────────────────────────── */}
      {/* Ambient fill: prevents completely unlit backs/sides */}
      <ambientLight intensity={0.45} />

      {/* Main key light from above-right; casts shadow map */}
      <directionalLight
        position={[5, 14, 8]}
        intensity={1.4}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={40}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />

      {/* Warm table-lamp fill from directly above the centre */}
      <pointLight position={[0, 8, 0]} intensity={0.35} color={WARM_LIGHT_COLOR} />

      {/* IBL environment — provides specular reflections on ceramic clearcoat */}
      <Environment preset="studio" />

      {/* ── Table surface ─────────────────────────────────────────────────── */}
      <FeltSurface3D color={feltColor} />

      {/* ── Viewer's interactive hand ─────────────────────────────────────── */}
      <TileHand3D
        tiles={viewerHand}
        poses={layout.viewerHand}
        faceMap={faceMap}
        backTexture={backTexture}
        jingTypes={jingTypes}
        selectedTileIdx={selectedTileIdx}
        onSelect={onSelectTile}
        onDiscard={onDiscard}
        isMyTurn={isMyTurn}
      />

      {/* ── Opponent hands (face-down) ────────────────────────────────────── */}
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

export interface GameCanvasProps {
  snapshot: ClientGameState;
  selectedTileIdx: number | null;
  onSelectTile: (idx: number) => void;
  onDiscard: (tile: TileType) => void;
}

/**
 * Full-screen 3D game table. Mount it inside a `position: relative` container;
 * DOM overlays go above it using `position: absolute` with a z-index.
 *
 * The canvas is `position: absolute; inset: 0` via the `style` prop so it fills
 * its parent without disturbing the normal document flow.
 */
export function GameCanvas({
  snapshot,
  selectedTileIdx,
  onSelectTile,
  onDiscard,
}: GameCanvasProps) {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 14, 10], fov: 48, near: 0.1, far: 80 }}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.1,
      }}
      style={{ width: '100%', height: '100%' }}
    >
      {/*
       * Suspense fallback is null — the outer DOM LoadingScreen shows while the
       * snapshot hasn't arrived yet, and the canvas background fills while
       * textures resolve. Both cases are brief on a normal connection.
       */}
      <Suspense fallback={null}>
        <GameScene
          snapshot={snapshot}
          selectedTileIdx={selectedTileIdx}
          onSelectTile={onSelectTile}
          onDiscard={onDiscard}
        />
      </Suspense>
    </Canvas>
  );
}
