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
 * Phase G: GameScene no longer receives `snapshot` or `selectedTileIdx` as props.
 * It reads them directly from the Zustand store using selector hooks, so the 3D
 * scene only re-renders when those specific slices change — not when claimWindow,
 * toast, connection status, or other unrelated state updates.
 *
 * Camera: position (0, 14, 10), lookAt (0, 0, 0), FOV 48°
 *   Viewer's tiles at Z+5 project to the bottom of the viewport.
 *   Across opponent at Z-5 projects to the top.
 *   Right/left at X±5 project to the sides.
 */

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import type { TileType } from '@nanchang/shared';
import { useGameStore } from '../stores/game.store';
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
  /** Select-tile callback — invoked when viewer first taps a tile. */
  onSelectTile: (idx: number) => void;
  /** Discard callback — invoked on the second tap of an already-selected tile. */
  onDiscard: (tile: TileType) => void;
}

/**
 * The R3F scene graph. Lives inside <Canvas> to access R3F context.
 *
 * Reads `snapshot` and `selectedTileIdx` directly from the Zustand store with
 * selector hooks — re-renders only when those slices change, not when the
 * parent GameTable re-renders due to claimWindow, toast, or connection updates.
 */
function GameScene({ onSelectTile, onDiscard }: GameSceneProps) {
  // ── Store reads (slice selectors → re-render only on these changes) ─────────
  const snapshot = useGameStore((s) => s.snapshot);
  const selectedTileIdx = useGameStore((s) => s.selectedTileIdx);

  // ── Theme ────────────────────────────────────────────────────────────────────
  const felt = useThemeStore((s) => s.felt);
  const tilePalette = useThemeStore((s) => s.tilePalette);

  const palette = themeToVariant(tilePalette);
  const feltColor = FELT_CONFIGS[felt].top;

  // ── Asset loading ────────────────────────────────────────────────────────────
  // Load + configure all tile SVG textures. Suspends until all 35 are ready.
  const { faceMap, backTexture } = useTileTextures(palette);

  // Guard — canvas may mount before the server sends the first snapshot.
  // Return null so the Suspense fallback (canvas bg) shows instead of
  // crashing on snapshot.seats access.
  if (!snapshot) return null;

  // ── Layout ───────────────────────────────────────────────────────────────────
  // computeTableLayout is a cheap pure function — safe to call on every render
  // of GameScene, which now only happens when `snapshot` or `selectedTileIdx`
  // change (not on every game-page re-render).
  const layout = computeTableLayout(snapshot);

  // ── Seat indices ─────────────────────────────────────────────────────────────
  const viewerSeat = (snapshot.viewerSeat ?? 0) as 0 | 1 | 2 | 3;
  const rightSeat = ((viewerSeat + 1) % 4) as 0 | 1 | 2 | 3;
  const acrossSeat = ((viewerSeat + 2) % 4) as 0 | 1 | 2 | 3;
  const leftSeat = ((viewerSeat + 3) % 4) as 0 | 1 | 2 | 3;

  const viewerHand = snapshot.seats[viewerSeat].hand ?? [];
  const isMyTurn = snapshot.currentSeat === viewerSeat && snapshot.phase === 'playing';

  // ── Jing types ───────────────────────────────────────────────────────────────
  // Derived inline — `snapshot` is already memoized by the selector;
  // useMemo would add overhead without benefit here.
  const jingTypes = new Set<string>();
  if (snapshot.jingPrimary) jingTypes.add(snapshot.jingPrimary);
  if (snapshot.jingSecondary) jingTypes.add(snapshot.jingSecondary);

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
  /**
   * Callback invoked when the viewer first taps a tile (select mode).
   * Lives in use-game.ts / game-page.tsx — no game logic here.
   */
  onSelectTile: (idx: number) => void;
  /**
   * Callback invoked when the viewer taps an already-selected tile (discard).
   * Lives in use-game.ts / game-page.tsx — no game logic here.
   */
  onDiscard: (tile: TileType) => void;
}

/**
 * Full-screen 3D game table. Mount it inside a `position: relative` container;
 * DOM overlays go above it using `position: absolute` with a z-index.
 *
 * The canvas is `position: absolute; inset: 0` via the `style` prop so it fills
 * its parent without disturbing the normal document flow.
 *
 * `snapshot` and `selectedTileIdx` are intentionally NOT props — GameScene reads
 * them directly from the Zustand store so the canvas only re-renders when game
 * state changes, not when the parent re-renders for other reasons (claim window
 * appearing, toast triggering, reconnect overlay, etc.).
 */
export function GameCanvas({ onSelectTile, onDiscard }: GameCanvasProps) {
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
      onCreated={({ raycaster }) => {
        // Stop scanning once the closest mesh is found — halves raycasting
        // cost per pointer-move event on scenes with 50+ tile meshes.
        // Visual meshes (body, face stamp, outline) all use NOOP_RAYCAST, so
        // only the interactive hit-boxes are ever tested.
        raycaster.firstHitOnly = true;
      }}
    >
      {/*
       * Suspense fallback is null — the outer DOM LoadingScreen shows while the
       * snapshot hasn't arrived yet, and the canvas background fills while
       * textures resolve. Both cases are brief on a normal connection.
       */}
      <Suspense fallback={null}>
        <GameScene onSelectTile={onSelectTile} onDiscard={onDiscard} />
      </Suspense>
    </Canvas>
  );
}
