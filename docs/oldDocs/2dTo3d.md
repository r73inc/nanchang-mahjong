# 2D → 3D Migration Plan: Nanchang Mahjong Presentation Layer

**Branch:** `feat/3d-ui`  
**Scope:** Replace the DOM `GameTable` component with a React Three Fiber scene. All other routes, all other DOM overlays, and the entire backend remain untouched.

---

## 0. Guiding Principles

| Principle                          | Detail                                                                                                                                                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Additive, not destructive**      | `mahjong-tile.tsx` (DOM) stays as-is; it is still used in Learn, Replay, History pages. Only `GameTable` inside `game-page.tsx` is replaced.                                                                          |
| **Overlays stay DOM**              | Status bar, SideRail, ActionToast, ConcedeSheet, ReconnectingOverlay, JingRevealScreen, GameEndScreen are all `position: absolute` DOM elements layered over the canvas. No Three.js HTML rendering needed for those. |
| **Server authority never changes** | `useGame` hook and `game.store.ts` are untouched. The 3D scene is a pure _consumer_ of `ClientGameState`.                                                                                                             |
| **Zero re-renders for animation**  | Tile animations (draw, discard flight, claim slide) run inside `useFrame` via refs. Zustand transient subscriptions supply targets; React setState is never called in the animation loop.                             |
| **TypeScript throughout**          | Every R3F file is `.tsx`. Layout math lives in pure `.ts` files that are independently testable with Vitest.                                                                                                          |

---

## 1. Dependencies

Add to `apps/web/package.json`:

```jsonc
// Runtime
"three": "^0.165.0",
"@react-three/fiber": "^8.17.0",
"@react-three/drei": "^9.109.0",

// Dev / types
"@types/three": "^0.165.0"
```

Optional (post-processing — add only when Jing glow is implemented):

```jsonc
"@react-three/postprocessing": "^2.16.0",
"postprocessing": "^6.36.0"
```

Run: `pnpm install` (workspace root).

---

## 2. Folder Structure

Only `apps/web/src/` changes are shown. Existing files not listed are untouched.

```
apps/web/src/
│
├── r3f/                               ← NEW: all 3D rendering code lives here
│   │
│   ├── GameCanvas.tsx                 ← <Canvas> root. Camera, lights, scene graph.
│   │                                    Consumes useGameStore via transient sub.
│   │
│   ├── components/
│   │   ├── MahjongTile3D.tsx          ← Single tile mesh. Props: tileType, faceDown,
│   │   │                                isJing, isSelected, isDrawn, onClick.
│   │   ├── TileHand3D.tsx             ← Viewer's interactive hand arc (13-14 tiles).
│   │   ├── OpponentHand3D.tsx         ← Face-down hand for one opponent.
│   │   ├── DiscardPool3D.tsx          ← Grid of discards for one seat.
│   │   ├── OpenMelds3D.tsx            ← Row of open meld groups for one seat.
│   │   ├── WallSegment3D.tsx          ← One side of the wall (face-down stack).
│   │   └── FeltSurface3D.tsx          ← Table felt plane + optional center emblem.
│   │
│   ├── hooks/
│   │   ├── useTileTextures.ts         ← Preloads all 68 SVG textures (34 types × 2
│   │   │                                palettes) via useTexture(). Returns
│   │   │                                Map<TileType, THREE.Texture>.
│   │   ├── useTileGeometry.ts         ← useGLTF('/models/mjtile.glb'). Extracts
│   │   │                                BoxGeometry (or GLB geometry) + identifies
│   │   │                                material slot indices for face vs. body.
│   │   └── useGameLayout.ts           ← Zustand transient sub → calls tableLayout()
│   │                                    → stores TileLayout ref. Used by useFrame.
│   │
│   └── utils/
│       ├── tile-texture-map.ts        ← TileType → SVG filename. Pure TS, no deps.
│       └── table-layout.ts            ← Pure layout math: snapshot → {id: Vector3+Euler}[]
│                                        Independently unit-testable.
│
├── pages/
│   └── game/
│       └── game-page.tsx              ← MODIFIED: GameTable() body replaced with
│                                        <GameCanvas> + DOM overlay stack.
│
└── components/
    └── mahjong-tile.tsx               ← UNCHANGED. Still used outside of GamePage.
```

---

## 3. Phase-by-Phase Implementation Plan

### Phase A — Scaffold & Asset Inspection (No visible change)

**Goal:** Install deps, confirm GLB model structure, write the texture map utility.

#### A1. Inspect mjtile.glb material slots

Load the GLB in a throwaway R3F scene and `console.log` its structure:

```tsx
// Temporary debug component — delete after inspection
function InspectModel() {
  const { nodes, materials } = useGLTF('/models/mjtile.glb');
  useEffect(() => {
    console.log('NODES:', Object.keys(nodes));
    Object.entries(nodes).forEach(([name, node]) => {
      if ((node as THREE.Mesh).isMesh) {
        const mesh = node as THREE.Mesh;
        console.log(`Mesh "${name}":`, {
          geometry: mesh.geometry.attributes,
          material: Array.isArray(mesh.material)
            ? mesh.material.map((m, i) => `[${i}] ${m.name}`)
            : mesh.material.name,
        });
      }
    });
  }, []);
  return null;
}
```

**Expected output:** The GLB likely has 2–3 material slots:

- Slot 0: Body (sides + back face) — static dark/ivory material
- Slot 1: Front face — this is where we apply the SVG texture
- Slot 2 (if present): Beveled edges

Document the actual slot indices in `useTileGeometry.ts` as constants:

```typescript
export const FACE_MATERIAL_SLOT = 1; // UPDATE after inspection
export const BODY_MATERIAL_SLOT = 0;
```

#### A2. Write `tile-texture-map.ts`

Maps every engine `TileType` to the correct FluffyStuff SVG filename, plus the path builder:

```typescript
// apps/web/src/r3f/utils/tile-texture-map.ts

import type { TileType } from '@nanchang/shared';

/** Maps engine TileType → FluffyStuff SVG base filename (no extension, no path). */
const TILE_TO_FLUFFY: Record<TileType, string> = {
  // Man / Character (萬)
  '1m': 'Man1',
  '2m': 'Man2',
  '3m': 'Man3',
  '4m': 'Man4',
  '5m': 'Man5',
  '6m': 'Man6',
  '7m': 'Man7',
  '8m': 'Man8',
  '9m': 'Man9',
  // Pin / Dot (筒)
  '1p': 'Pin1',
  '2p': 'Pin2',
  '3p': 'Pin3',
  '4p': 'Pin4',
  '5p': 'Pin5',
  '6p': 'Pin6',
  '7p': 'Pin7',
  '8p': 'Pin8',
  '9p': 'Pin9',
  // Sou / Bamboo (條)
  '1s': 'Sou1',
  '2s': 'Sou2',
  '3s': 'Sou3',
  '4s': 'Sou4',
  '5s': 'Sou5',
  '6s': 'Sou6',
  '7s': 'Sou7',
  '8s': 'Sou8',
  '9s': 'Sou9',
  // Winds — Japanese naming used by FluffyStuff
  east: 'Ton', // 東 Ton-puu
  south: 'Nan', // 南 Nan-puu
  west: 'Shaa', // 西 Sha-puu
  north: 'Pei', // 北 Pei-puu
  // Dragons
  zhong: 'Chun', // 中 Red Dragon
  fa: 'Hatsu', // 發 Green Dragon
  bai: 'Haku', // 白 White Dragon
};

export type TilePaletteVariant = 'Regular' | 'Black';

/**
 * Returns the public URL for a tile's face SVG texture.
 * @example tileTexturePath('1m', 'Regular') → '/textures/Tiles/Regular/Man1.svg'
 */
export function tileTexturePath(tile: TileType, palette: TilePaletteVariant = 'Regular'): string {
  return `/textures/Tiles/${palette}/${TILE_TO_FLUFFY[tile]}.svg`;
}

export const BACK_TEXTURE_PATH = (palette: TilePaletteVariant) =>
  `/textures/Tiles/${palette}/Back.svg`;

export const BLANK_TEXTURE_PATH = (palette: TilePaletteVariant) =>
  `/textures/Tiles/${palette}/Blank.svg`;

/** All 34 face texture paths for a given palette — used for bulk preloading. */
export function allFaceTexturePaths(palette: TilePaletteVariant): string[] {
  return (Object.keys(TILE_TO_FLUFFY) as TileType[]).map((t) => tileTexturePath(t, palette));
}
```

> **Palette switching:** The user's `ThemeStore` exposes a `tilePalette` field (`'classic' | 'sepia' | 'dark'`). Map that to `'Regular'` or `'Black'` variant:
>
> ```typescript
> const paletteVariant: TilePaletteVariant =
>   themeStore.tilePalette === 'dark' ? 'Black' : 'Regular';
> ```

---

### Phase B — Asset Loading Hooks

#### B1. `useTileGeometry.ts`

```typescript
// apps/web/src/r3f/hooks/useTileGeometry.ts
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useMemo } from 'react';

// Set after Phase A1 inspection:
export const FACE_MATERIAL_SLOT = 1;
export const BODY_MATERIAL_SLOT = 0;

export interface TileGeometryResult {
  geometry: THREE.BufferGeometry;
  /** Base (non-face) material — ivory/ceramic body. Clone and reuse. */
  bodyMaterial: THREE.MeshPhysicalMaterial;
}

export function useTileGeometry(): TileGeometryResult {
  const { nodes } = useGLTF('/models/mjtile.glb');

  return useMemo(() => {
    // Replace 'TileMesh' with the actual node name discovered in Phase A1.
    const mesh = nodes['TileMesh'] as THREE.Mesh;

    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0xf5efe0, // ivory
      roughness: 0.18, // semi-gloss (ceramic/melamine)
      metalness: 0.0,
      clearcoat: 0.75, // glazed ceramic clearcoat
      clearcoatRoughness: 0.06,
      reflectivity: 0.5,
    });

    return { geometry: mesh.geometry, bodyMaterial: bodyMat };
  }, [nodes]);
}

// Preload at module level so Suspense fires before first render:
useGLTF.preload('/models/mjtile.glb');
```

#### B2. `useTileTextures.ts`

Preloads all tile face textures using `@react-three/drei`'s `useTexture`, which wraps Three.js `TextureLoader` and integrates with React `Suspense`. SVGs are rasterized by the browser as `<img>` → canvas → `WebGLTexture`.

```typescript
// apps/web/src/r3f/hooks/useTileTextures.ts
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import type { TileType } from '@nanchang/shared';
import { allFaceTexturePaths, tileTexturePath, BACK_TEXTURE_PATH } from '../utils/tile-texture-map';

export type TileTextureMap = Map<TileType, THREE.Texture>;

// All 34 tiles, Regular palette — extend for Black palette below
const ALL_REGULAR_PATHS = allFaceTexturePaths('Regular');
const ALL_BLACK_PATHS = allFaceTexturePaths('Black');

/**
 * Preloads all tile textures for both palettes.
 * Must be called inside a <Suspense> boundary — suspends until all are loaded.
 * Returns a lookup map: TileType → Texture.
 */
export function useTileTextures(palette: 'Regular' | 'Black'): {
  faceMap: TileTextureMap;
  backTexture: THREE.Texture;
} {
  const paths = palette === 'Regular' ? ALL_REGULAR_PATHS : ALL_BLACK_PATHS;
  const backPath = BACK_TEXTURE_PATH(palette);

  // useTexture with an array suspends until all textures resolve:
  const textures = useTexture([...paths, backPath]) as THREE.Texture[];

  const TILE_TYPES = [
    '1m',
    '2m',
    '3m',
    '4m',
    '5m',
    '6m',
    '7m',
    '8m',
    '9m',
    '1p',
    '2p',
    '3p',
    '4p',
    '5p',
    '6p',
    '7p',
    '8p',
    '9p',
    '1s',
    '2s',
    '3s',
    '4s',
    '5s',
    '6s',
    '7s',
    '8s',
    '9s',
    'east',
    'south',
    'west',
    'north',
    'zhong',
    'fa',
    'bai',
  ] as TileType[];

  const faceMap: TileTextureMap = new Map();
  TILE_TYPES.forEach((tile, i) => {
    const tex = textures[i];
    // Flip Y so SVG is right-side up on the mesh face:
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    faceMap.set(tile, tex);
  });

  const backTexture = textures[textures.length - 1];
  backTexture.flipY = false;
  backTexture.colorSpace = THREE.SRGBColorSpace;

  return { faceMap, backTexture };
}
```

> **SVG resolution note:** `TextureLoader` rasterizes SVGs at their natural viewport size. If the SVG has no explicit `width`/`height`, it defaults to 300×150. To guarantee crisp textures, either add `width="512" height="512"` to the FluffyStuff SVGs, or pre-rasterize them to PNG at build time using a Vite plugin. A pragmatic first step is to set `anisotropy: renderer.capabilities.getMaxAnisotropy()` on each loaded texture.

---

### Phase C — Layout Math

This is the heart of the migration. All 3D positions are derived from `ClientGameState` by a pure function — no Three.js imports, fully unit-testable.

#### C1. Coordinate system

```
   Y (up)
   |
   |         Z- (far/across opponent)
   |        /
   +-------+--------→ X (viewer's right)
          /
        Z+ (near/viewer)

Camera: position (0, 14, 10), lookAt (0, 0, 0), FOV 48°

Table surface: Y = 0 plane
Tile dimensions (world units, 1u ≈ 3.5cm):
  width  = 0.55   (≈ 19mm physical)
  height = 0.75   (≈ 26mm physical)  [the long axis, standing = Z-depth]
  depth  = 0.35   (≈ 12mm physical)  [tile thickness when standing]

Gap between tiles in a row: 0.04u
```

#### C2. Seat mapping

At runtime, the viewer's seat can be 0–3. The compass is always rotated so the viewer is "south" (bottom of screen, Z+). Use `getCompassSeats(viewerSeat)` (already in `game-page.tsx`) to find `right`, `across`, `left` absolute seat indices.

Map compass positions to world anchor points:

```
viewer  → anchor (0,  0, +5.5)  face-up hand
across  → anchor (0,  0, -5.5)  face-down hand
right   → anchor (+5.5, 0, 0)   face-down hand, rotated 90° on Y
left    → anchor (-5.5, 0, 0)   face-down hand, rotated -90° on Y
```

#### C3. `table-layout.ts` — pure layout types and functions

```typescript
// apps/web/src/r3f/utils/table-layout.ts
//
// Pure math — no Three.js, no React. Returns plain {x,y,z,rx,ry,rz} tuples
// so this module is testable with Vitest without a WebGL context.

import type { ClientGameState } from '@nanchang/shared';

export interface TilePose {
  x: number;
  y: number;
  z: number; // position
  rx: number;
  ry: number;
  rz: number; // euler rotation (radians)
}

export interface TableLayout {
  /** Viewer's hand: index → pose (tile standing upright, interactive) */
  viewerHand: TilePose[];
  /** Each opponent's hidden tiles: compassPosition → pose[] */
  opponentHand: Record<'right' | 'across' | 'left', TilePose[]>;
  /** Each seat's discard pile: seatIndex 0-3 → pose[] */
  discards: TilePose[][];
  /** Each seat's open melds: seatIndex 0-3 → meld[] → tile pose[] */
  openMelds: TilePose[][][];
  /** Wall segments: 4 sides → pose[] */
  wall: TilePose[][];
}

const TW = 0.55; // tile width
const TH = 0.75; // tile height (long axis)
const TD = 0.35; // tile depth (thickness)
const GAP = 0.04;

/** Viewer's hand: arc of tiles standing upright at z=+5.5 */
function viewerHandPoses(count: number): TilePose[] {
  const stride = TW + GAP;
  const totalWidth = count * stride - GAP;
  const startX = -totalWidth / 2 + TW / 2;
  return Array.from({ length: count }, (_, i) => ({
    x: startX + i * stride,
    y: TD / 2, // sit on table surface
    z: 5.5,
    rx: -Math.PI / 2, // stand upright, face toward viewer
    ry: 0,
    rz: 0,
  }));
}

/** Face-down opponent hand (tiles standing, backs facing viewer) */
function opponentHandPoses(count: number, compassPos: 'right' | 'across' | 'left'): TilePose[] {
  const stride = TW + GAP;
  const totalWidth = count * stride - GAP;
  const startX = -totalWidth / 2 + TW / 2;

  const rotations: Record<string, { x: number; z: number; ry: number }> = {
    across: { x: 0, z: -5.5, ry: Math.PI }, // flipped, far end
    right: { x: 5.5, z: 0, ry: Math.PI * 1.5 }, // rotated 90°
    left: { x: -5.5, z: 0, ry: Math.PI / 2 },
  };

  const { x: cx, z: cz, ry } = rotations[compassPos];

  return Array.from({ length: count }, (_, i) => {
    const offset = startX + i * stride;
    return {
      x: compassPos === 'across' ? offset : cx,
      y: TD / 2,
      z: compassPos === 'across' ? cz : offset,
      rx: -Math.PI / 2,
      ry,
      rz: 0,
    };
  });
}

/** Discard grid: rows of up to 8 tiles, face-up flat on table */
function discardPoses(count: number, seatIndex: number, viewerSeat: number): TilePose[] {
  // Each seat's discard zone is one quadrant of the center
  const compassOffset = (seatIndex - viewerSeat + 4) % 4; // 0=viewer,1=right,2=across,3=left
  const quadrant = [
    { bx: 0.0, bz: 1.0, ry: 0 }, // viewer (bottom)
    { bx: 1.0, bz: 0.0, ry: Math.PI / 2 }, // right
    { bx: 0.0, bz: -1.0, ry: Math.PI }, // across
    { bx: -1.0, bz: 0.0, ry: -Math.PI / 2 }, // left
  ][compassOffset];

  const COLS = 8;
  const stride = TW + GAP;

  return Array.from({ length: count }, (_, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    return {
      x:
        quadrant.bx !== 0
          ? quadrant.bx + row * stride * Math.sign(quadrant.bx)
          : (col - COLS / 2 + 0.5) * stride,
      y: 0.01, // just above felt
      z:
        quadrant.bz !== 0
          ? quadrant.bz + row * stride * Math.sign(quadrant.bz)
          : (col - COLS / 2 + 0.5) * stride,
      rx: 0,
      ry: quadrant.ry,
      rz: 0,
    };
  });
}

/** Open meld row: 3-4 tiles face-up, positioned in front of hand */
function openMeldPoses(
  meldTiles: number,
  meldIndex: number,
  seatIndex: number,
  viewerSeat: number,
): TilePose[] {
  const compassOffset = (seatIndex - viewerSeat + 4) % 4;
  const quadrant = [
    { bx: 0, bz: 4.5, ry: 0 },
    { bx: 4.5, bz: 0, ry: Math.PI / 2 },
    { bx: 0, bz: -4.5, ry: Math.PI },
    { bx: -4.5, bz: 0, ry: -Math.PI / 2 },
  ][compassOffset];

  const meldGroupOffset = meldIndex * (meldTiles * (TW + GAP) + 0.2);
  const stride = TW + GAP;

  return Array.from({ length: meldTiles }, (_, i) => ({
    x:
      quadrant.bx !== 0
        ? quadrant.bx + meldGroupOffset
        : (i - meldTiles / 2 + 0.5) * stride + meldGroupOffset,
    y: 0.01,
    z: quadrant.bz !== 0 ? quadrant.bz + meldGroupOffset : (i - meldTiles / 2 + 0.5) * stride,
    rx: 0,
    ry: quadrant.ry,
    rz: 0,
  }));
}

/**
 * Main entry point. Takes a ClientGameState and viewer seat, returns a full TableLayout.
 * Pure function — safe to call in tests, in useFrame, or in Zustand subscribers.
 */
export function computeTableLayout(snapshot: ClientGameState): TableLayout {
  const viewerSeat = snapshot.viewerSeat ?? 0;
  const {
    right: rightIdx,
    across: acrossIdx,
    left: leftIdx,
  } = {
    right: ((viewerSeat + 1) % 4) as 0 | 1 | 2 | 3,
    across: ((viewerSeat + 2) % 4) as 0 | 1 | 2 | 3,
    left: ((viewerSeat + 3) % 4) as 0 | 1 | 2 | 3,
  };

  const viewerHandCount = snapshot.seats[viewerSeat].hand?.length ?? 0;

  const discards = snapshot.seats.map((seat, idx) =>
    discardPoses(seat.discards.length, idx, viewerSeat),
  );

  const openMelds = snapshot.seats.map((seat, idx) =>
    seat.openMelds.map((meld, meldIdx) =>
      openMeldPoses(meld.tiles.length, meldIdx, idx, viewerSeat),
    ),
  );

  return {
    viewerHand: viewerHandPoses(viewerHandCount),
    opponentHand: {
      right: opponentHandPoses(snapshot.seats[rightIdx].handCount, 'right'),
      across: opponentHandPoses(snapshot.seats[acrossIdx].handCount, 'across'),
      left: opponentHandPoses(snapshot.seats[leftIdx].handCount, 'left'),
    },
    discards,
    openMelds,
    wall: [], // Phase D: wall rendering
  };
}
```

---

### Phase D — `MahjongTile3D` Component

The atomic building block. One instance per visible tile.

```tsx
// apps/web/src/r3f/components/MahjongTile3D.tsx

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { TileType } from '@nanchang/shared';
import { useTileGeometry, FACE_MATERIAL_SLOT } from '../hooks/useTileGeometry';
import type { TileTextureMap } from '../hooks/useTileTextures';
import type { TilePose } from '../utils/table-layout';

interface MahjongTile3DProps {
  tileType: TileType | null; // null = face-down (hidden)
  faceTextures: TileTextureMap;
  backTexture: THREE.Texture;
  pose: TilePose;
  isJing?: boolean;
  isSelected?: boolean;
  isDrawn?: boolean;
  interactive?: boolean;
  onClick?: () => void;
}

export function MahjongTile3D({
  tileType,
  faceTextures,
  backTexture,
  pose,
  isJing = false,
  isSelected = false,
  isDrawn = false,
  interactive = false,
  onClick,
}: MahjongTile3DProps) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const { geometry, bodyMaterial } = useTileGeometry();

  // Build the multi-material array for this tile.
  // Slot FACE_MATERIAL_SLOT gets the SVG texture; all others get bodyMaterial.
  const materials = useMemo(() => {
    const faceTexture = tileType ? faceTextures.get(tileType) : backTexture;

    const faceMat = new THREE.MeshPhysicalMaterial({
      map: faceTexture ?? null,
      roughness: 0.22,
      metalness: 0.0,
      clearcoat: 0.6,
      clearcoatRoughness: 0.08,
      emissive: new THREE.Color(isJing ? '#c9a961' : '#000000'),
      emissiveIntensity: isJing ? 0.3 : 0.0,
    });

    // Build slot array: body for most slots, faceMat for FACE_MATERIAL_SLOT
    // Actual slot count determined by Phase A1 inspection.
    return [bodyMaterial.clone(), faceMat]; // adjust if 3 slots
  }, [tileType, faceTextures, backTexture, bodyMaterial, isJing]);

  // Smooth position animation — lerp toward pose target every frame
  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    mesh.position.lerp(
      { x: pose.x, y: pose.y + (isSelected ? 0.4 : 0), z: pose.z } as THREE.Vector3Like,
      Math.min(1, delta * 12),
    );

    // Euler targets
    mesh.rotation.x += (pose.rx - mesh.rotation.x) * Math.min(1, delta * 12);
    mesh.rotation.y += (pose.ry - mesh.rotation.y) * Math.min(1, delta * 12);
    mesh.rotation.z += (pose.rz - mesh.rotation.z) * Math.min(1, delta * 12);

    // Jing pulsing emissive
    if (isJing && Array.isArray(mesh.material)) {
      const faceMat = mesh.material[FACE_MATERIAL_SLOT] as THREE.MeshPhysicalMaterial;
      faceMat.emissiveIntensity = 0.25 + 0.2 * Math.sin(Date.now() * 0.003);
    }

    // Hover/selected scale
    const targetScale = isSelected ? 1.08 : 1.0;
    mesh.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), delta * 16);
  });

  // Set initial pose immediately on mount (no lerp on first frame)
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.position.set(pose.x, pose.y, pose.z);
    mesh.rotation.set(pose.rx, pose.ry, pose.rz);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={materials}
      castShadow
      receiveShadow
      onClick={
        interactive && onClick
          ? (e) => {
              e.stopPropagation();
              onClick();
            }
          : undefined
      }
      onPointerEnter={
        interactive
          ? () => {
              document.body.style.cursor = 'pointer';
            }
          : undefined
      }
      onPointerLeave={
        interactive
          ? () => {
              document.body.style.cursor = '';
            }
          : undefined
      }
    />
  );
}
```

---

### Phase E — `GameCanvas.tsx` (Scene Root)

The canvas that replaces `GameTable`'s DOM content. DOM overlays sit on top via CSS stacking.

```tsx
// apps/web/src/r3f/GameCanvas.tsx

import { Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, ContactShadows } from '@react-three/drei';
import { useGameStore } from '../stores/game.store';
import { useThemeStore } from '../stores/theme.store';
import { useTileTextures } from './hooks/useTileTextures';
import { useTileGeometry } from './hooks/useTileGeometry';
import { TileHand3D } from './components/TileHand3D';
import { OpponentHand3D } from './components/OpponentHand3D';
import { DiscardPool3D } from './components/DiscardPool3D';
import { OpenMelds3D } from './components/OpenMelds3D';
import { FeltSurface3D } from './components/FeltSurface3D';
import { computeTableLayout } from './utils/table-layout';
import type { ClientGameState } from '@nanchang/shared';

// Inner component — has access to R3F context and useFrame
function Scene({
  snapshot,
  jingTypes,
  selectedTileIdx,
  onSelectTile,
  onDiscard,
}: {
  snapshot: ClientGameState;
  jingTypes: Set<string>;
  selectedTileIdx: number | null;
  onSelectTile: (idx: number) => void;
  onDiscard: (tile: import('@nanchang/shared').TileType) => void;
}) {
  const tilePalette = useThemeStore((s) => (s.tilePalette === 'dark' ? 'Black' : 'Regular'));
  const { faceMap, backTexture } = useTileTextures(tilePalette);
  const layout = computeTableLayout(snapshot);
  const viewerSeat = snapshot.viewerSeat ?? 0;

  const viewerHand = snapshot.seats[viewerSeat].hand ?? [];
  const rightSeat = ((viewerSeat + 1) % 4) as 0 | 1 | 2 | 3;
  const acrossSeat = ((viewerSeat + 2) % 4) as 0 | 1 | 2 | 3;
  const leftSeat = ((viewerSeat + 3) % 4) as 0 | 1 | 2 | 3;

  const feltColor = useThemeStore((s) => {
    const felt = s.felt;
    const FELT_COLORS = { jade: '#0d3b2e', crimson: '#3b0d0d', slate: '#0d1a2e', navy: '#0d1f3b' };
    return FELT_COLORS[felt];
  });

  return (
    <>
      {/* Lighting rig */}
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[4, 12, 6]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <pointLight position={[0, 5, 0]} intensity={0.5} color="#f5e6c0" />

      {/* Environment for PBR reflections */}
      <Environment preset="studio" />

      {/* Table surface */}
      <FeltSurface3D color={feltColor} />

      {/* Contact shadows for depth */}
      <ContactShadows position={[0, 0.01, 0]} opacity={0.4} scale={12} blur={2.5} far={4} />

      {/* Viewer's interactive hand */}
      <TileHand3D
        tiles={viewerHand}
        poses={layout.viewerHand}
        faceTextures={faceMap}
        backTexture={backTexture}
        jingTypes={jingTypes}
        selectedTileIdx={selectedTileIdx}
        onSelect={onSelectTile}
        onDiscard={onDiscard}
        isMyTurn={snapshot.currentSeat === viewerSeat && snapshot.phase === 'playing'}
      />

      {/* Opponent hands (face-down) */}
      <OpponentHand3D
        count={snapshot.seats[acrossSeat].handCount}
        poses={layout.opponentHand.across}
        backTexture={backTexture}
      />
      <OpponentHand3D
        count={snapshot.seats[rightSeat].handCount}
        poses={layout.opponentHand.right}
        backTexture={backTexture}
      />
      <OpponentHand3D
        count={snapshot.seats[leftSeat].handCount}
        poses={layout.opponentHand.left}
        backTexture={backTexture}
      />

      {/* Discards for all 4 seats */}
      {snapshot.seats.map((seat, idx) => (
        <DiscardPool3D
          key={idx}
          discards={seat.discards}
          poses={layout.discards[idx]}
          faceTextures={faceMap}
          backTexture={backTexture}
          jingTypes={jingTypes}
          isLastDiscard={snapshot.discardedBySeat === idx}
        />
      ))}

      {/* Open melds for all 4 seats */}
      {snapshot.seats.map((seat, idx) =>
        seat.openMelds.map((meld, meldIdx) => (
          <OpenMelds3D
            key={`${idx}-${meldIdx}`}
            meld={meld}
            poses={layout.openMelds[idx][meldIdx]}
            faceTextures={faceMap}
            backTexture={backTexture}
            jingTypes={jingTypes}
          />
        )),
      )}
    </>
  );
}

interface GameCanvasProps {
  snapshot: ClientGameState;
  selectedTileIdx: number | null;
  onSelectTile: (idx: number) => void;
  onDiscard: (tile: import('@nanchang/shared').TileType) => void;
}

export function GameCanvas({
  snapshot,
  selectedTileIdx,
  onSelectTile,
  onDiscard,
}: GameCanvasProps) {
  // Determine which tile types are Jing (spirit/wildcard) this hand
  const jingTypes = new Set<string>();
  if (snapshot.jingPrimary) jingTypes.add(snapshot.jingPrimary);
  if (snapshot.jingSecondary) jingTypes.add(snapshot.jingSecondary);

  return (
    <Canvas
      camera={{ position: [0, 14, 10], fov: 48, near: 0.1, far: 100 }}
      shadows
      gl={{ antialias: true, toneMapping: 1 /* ACESFilmicToneMapping */ }}
      style={{ width: '100%', height: '100%' }}
    >
      <Suspense fallback={null}>
        {' '}
        {/* DOM LoadingScreen shown outside canvas */}
        <Scene
          snapshot={snapshot}
          jingTypes={jingTypes}
          selectedTileIdx={selectedTileIdx}
          onSelectTile={onSelectTile}
          onDiscard={onDiscard}
        />
      </Suspense>
    </Canvas>
  );
}
```

---

### Phase F — Integrating Canvas into `game-page.tsx`

`GameTable`'s internal DOM content is replaced. All overlay components remain unchanged.

```tsx
// BEFORE (inside GamePage):
{(snapshot.phase === 'playing' || snapshot.phase === 'awaiting_claims') && (
  <GameTable snapshot={snapshot} ... />
)}

// AFTER:
{(snapshot.phase === 'playing' || snapshot.phase === 'awaiting_claims') && (
  <div className="relative h-dvh bg-mj-jade-deep overflow-hidden">
    {/* 3D canvas fills the full screen */}
    <GameCanvas
      snapshot={snapshot}
      selectedTileIdx={selectedTileIdx}
      onSelectTile={selectTile}
      onDiscard={discard}
    />

    {/* DOM overlays — absolutely positioned on top of canvas */}
    {/* Status bar */}
    <div className="absolute top-0 left-0 right-0 z-10" style={{ pointerEvents: 'none' }}>
      {/* ... status bar DOM (round wind, wall count, concede button) ... */}
      {/* NB: concede button needs pointerEvents: 'auto' */}
    </div>

    {/* Claim window rail */}
    {claimWindow && !showConcedeSheet && (
      <SideRail claimWindow={claimWindow} onClaim={claim} onPass={pass} />
    )}

    {/* Action toast */}
    {toast && <ActionToast toast={toast} snapshot={snapshot} />}

    {/* Concede sheet */}
    {showConcedeSheet && <ConcedeSheet onConfirm={handleConcede} onCancel={...} />}
  </div>
)}
```

> **Critical:** The `<Canvas>` element gets `position: absolute; inset: 0` via its `style` prop. DOM overlays must be in the same `relative` parent with `z-index` above the canvas. For overlays that need pointer events (buttons), set `pointer-events: auto`; for purely visual overlays (status labels), use `pointer-events: none` so clicks fall through to the 3D scene.

---

### Phase G — High-Performance State Binding

For smooth 60fps animation without re-renders, use Zustand's transient subscription pattern. Add `subscribeWithSelector` middleware to `useGameStore`:

```typescript
// game.store.ts — add middleware wrap:
import { subscribeWithSelector } from 'zustand/middleware';

export const useGameStore = create<GameStore>()(
  subscribeWithSelector((set) => ({ ... })) // ← wrap existing (set) => ({}) definition
);
```

Then inside `GameCanvas` or `useGameLayout`:

```typescript
// useGameLayout.ts
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../../stores/game.store';
import { computeTableLayout, TableLayout } from '../utils/table-layout';

/**
 * Subscribes to snapshot changes outside React render cycle.
 * Returns a stable ref containing the latest computed layout.
 * Components read layoutRef.current in useFrame — zero re-renders.
 */
export function useGameLayout() {
  const layoutRef = useRef<TableLayout | null>(null);

  useEffect(() => {
    // Subscribe to snapshot slice only — fires when snapshot changes
    const unsub = useGameStore.subscribe(
      (state) => state.snapshot,
      (snapshot) => {
        if (snapshot) layoutRef.current = computeTableLayout(snapshot);
      },
      { fireImmediately: true },
    );
    return unsub;
  }, []);

  return layoutRef;
}
```

Tile meshes then lerp toward `layoutRef.current[tileId].pose` in their `useFrame` callbacks — this runs entirely in the R3F render loop with zero React overhead.

---

### Phase H — Jing (Wildcard) Visual Treatment

The Jing tile type is determined each hand by the server (`jingPrimary`, `jingSecondary` on `ClientGameState`). Any tile matching these types is a wildcard.

Three-layer visual treatment, all in shader/material code:

**Layer 1 — Emissive pulse (MeshPhysicalMaterial)**

Already wired in `MahjongTile3D.tsx`:

```typescript
// In useFrame inside MahjongTile3D:
if (isJing) {
  faceMat.emissiveIntensity = 0.25 + 0.2 * Math.sin(Date.now() * 0.003);
}
```

**Layer 2 — Gold shell outline**

Add a second slightly-larger mesh (same geometry scaled 1.04×) with:

```typescript
const outlineMat = new THREE.MeshBasicMaterial({
  color: '#c9a961',
  side: THREE.BackSide, // render inside-out = outline
  transparent: true,
  opacity: isJing ? 0.6 : 0,
});
```

**Layer 3 — Floating `<Html>` indicator** (from `@react-three/drei`)

```tsx
import { Html } from '@react-three/drei';

// Inside MahjongTile3D when isJing=true:
{
  isJing && (
    <Html position={[0, 0.6, 0]} center style={{ pointerEvents: 'none', userSelect: 'none' }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 'bold',
          color: '#c9a961',
          textShadow: '0 0 6px rgba(201,169,97,0.8)',
          fontFamily: 'serif',
        }}
      >
        节
      </div>
    </Html>
  );
}
```

> **No SVG modifications needed.** All Jing treatment is applied via Three.js material properties in code, scoped to tiles whose `TileType` matches `jingPrimary` / `jingSecondary` from the snapshot.

---

### Phase I — Raycasting & Click Interactions

R3F handles raycasting automatically via the `onClick`, `onPointerEnter`, `onPointerLeave` props on `<mesh>`. The 3D tile just calls the same callbacks as the current DOM tile.

**Viewer hand interaction — two-tap discard flow:**

```tsx
// TileHand3D.tsx
function TileHand3D({ tiles, selectedTileIdx, onSelect, onDiscard, isMyTurn, ... }) {
  const handleTileClick = (idx: number) => {
    if (!isMyTurn) return;
    if (selectedTileIdx === idx) {
      onDiscard(tiles[idx]);      // second tap = confirm discard
    } else {
      onSelect(idx);              // first tap = select
    }
  };

  return (
    <>
      {tiles.map((tile, idx) => (
        <MahjongTile3D
          key={`${tile}-${idx}`}
          tileType={tile}
          pose={poses[idx]}
          isSelected={selectedTileIdx === idx}
          interactive={isMyTurn}
          onClick={() => handleTileClick(idx)}
          ...
        />
      ))}
    </>
  );
}
```

All socket emits stay in `use-game.ts` — the 3D components only call the same `onSelect` / `onDiscard` callbacks that were previously called by the DOM `MahjongTile` onClick handlers.

---

## 4. Routing & Canvas Lifecycle

The `<Canvas>` must be mounted/unmounted with the game route to prevent the WebGL context from leaking. React Router's route-based code splitting handles this naturally since `GamePage` is only rendered for `/game/:id`.

The R3F canvas does **not** interfere with any other route. Learn, History, Replay, Profile, etc. use zero Three.js code.

```tsx
// In router.tsx — no changes needed. GamePage already lazy-loaded.
// Canvas mounts when <GamePage> mounts, unmounts when route changes.
```

If multiple tabs become a concern, the socket singleton (`lib/socket.ts`) is already shared, and the canvas context is per-tab — no conflict.

---

## 5. Vite Config — No Changes Required

`@react-three/fiber` and `three` are pure ESM packages. Vite handles them correctly out of the box. GLTF files in `public/models/` are served as static assets. SVG textures in `public/textures/` are also static — `TextureLoader` fetches them via HTTP, not through Vite's asset pipeline.

If GLB binary loading is too slow on first open, add to `vite.config.ts`:

```typescript
optimizeDeps: {
  exclude: ['three'], // Let Vite handle chunking naturally
}
```

---

## 6. Testing Strategy

| Layer                 | Tool                 | What to test                                                                                                      |
| --------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `table-layout.ts`     | Vitest               | Pure math: pose coordinates for known hand counts, discard counts, compass rotations. No Three.js context needed. |
| `tile-texture-map.ts` | Vitest               | All 34 tile types produce valid paths. No duplicate paths.                                                        |
| `MahjongTile3D`       | Not tested in Vitest | Three.js mesh — skip unit testing; covered by visual regression in browser.                                       |
| `GameCanvas`          | Not tested           | R3F canvas requires WebGL; skip in CI.                                                                            |
| Socket + store        | Existing Jest/Vitest | `use-game.ts` and `game.store.ts` unchanged — existing tests remain green.                                        |

Layout math tests are the most valuable since they have zero rendering dependencies:

```typescript
// table-layout.spec.ts
import { computeTableLayout } from './table-layout';
it('viewer hand at z=5.5', () => {
  const layout = computeTableLayout(makeSnapshot({ viewerSeat: 0, handCount: 13 }));
  expect(layout.viewerHand[0].z).toBe(5.5);
});
it('across opponent at z=-5.5', () => { ... });
it('right opponent at x=5.5 rotated', () => { ... });
```

---

## 7. Migration Sequence (Step-by-step Checkpoints)

| Step                                     | Branch commit                                         | Visible result                      |
| ---------------------------------------- | ----------------------------------------------------- | ----------------------------------- |
| A: Deps + asset inspection               | `chore: install r3f deps, inspect mjtile.glb`         | No UI change; GLB node names logged |
| A: `tile-texture-map.ts`                 | `feat(r3f): tile texture map utility + tests`         | Pure TS, no render                  |
| B: `useTileGeometry` + `useTileTextures` | `feat(r3f): asset loading hooks`                      | Hooks compilable, no render         |
| C: `table-layout.ts` + tests             | `feat(r3f): layout math + vitest coverage`            | Pure TS, tests green                |
| D: `MahjongTile3D`                       | `feat(r3f): single tile mesh component`               | Testable in isolation               |
| E: `GameCanvas` scaffold                 | `feat(r3f): GameCanvas shell with felt + camera`      | Empty green table visible           |
| F: Wire into `game-page.tsx`             | `feat(r3f): replace GameTable DOM with Canvas`        | Full 3D table live                  |
| G: State binding + animation             | `feat(r3f): transient zustand sub + lerp animation`   | Smooth tile movement                |
| H: Jing effects                          | `feat(r3f): Jing emissive pulse + outline + label`    | Gold glowing spirit tiles           |
| I: Raycasting polish                     | `feat(r3f): hover states, cursor, selected tile lift` | Full interaction parity             |

Each step is a separate PR under `feat/3d-ui`.

---

## 8. What Does NOT Change

- `apps/api/` — zero modifications
- `packages/engine/` — zero modifications
- `packages/shared/` — zero modifications
- `game.store.ts` — additive only (subscribeWithSelector middleware)
- `use-game.ts` — zero modifications
- `mahjong-tile.tsx` — zero modifications (used in Learn/History/Replay)
- All DOM overlays (SideRail, ActionToast, ConcedeSheet, ReconnectingOverlay) — zero modifications
- `JingRevealScreen`, `GameEndScreen` — zero modifications (remain pure DOM)
- All i18n keys — zero modifications
- All existing tests — must remain green

---

## 9. Open Questions (Resolve in Phase A)

1. **GLB node/material names** — Run the Phase A1 inspection snippet and record the actual mesh node name and which slot index is the face.
2. **GLB geometry UV layout** — Confirm that the face slot has sensible UVs for the SVG texture to tile correctly. If UVs are missing/broken, we fall back to a `PlaneGeometry` face overlay positioned flush on top of the tile body.
3. **SVG rasterization quality** — Verify that `useTexture` rasterizes the FluffyStuff SVGs at a sufficient resolution. If pixelated, switch to `CanvasTexture` pre-rendered at 512×512.
4. **Physical tile proportions** — The world-unit dimensions in Phase C are approximate. Adjust based on how the GLB model's bounding box compares to 1 world unit.
5. **Wall rendering** — Deferred to a later step. Rendering all 68 remaining wall tiles as InstancedMesh is an optimization pass, not a blocker for playable 3D.
