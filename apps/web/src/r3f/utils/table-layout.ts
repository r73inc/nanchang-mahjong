/**
 * table-layout.ts
 *
 * Pure layout math: maps a ClientGameState to world-space TilePose values for
 * every tile group on the 3D mahjong table.
 *
 * NO Three.js, NO React imports — safe to test with plain Vitest (no WebGL).
 * All constants match useTileGeometry.ts exactly (comments reference the source).
 *
 * ── Coordinate System ────────────────────────────────────────────────────────
 *
 *   Y (up)
 *   │          Z- (far — "across" opponent)
 *   │         ╱
 *   └─────────────→ X (viewer's right)
 *            ╲
 *             Z+ (near — viewer's hand)
 *
 *   Camera: position (0, 8, 13), lookAt (0, 0, 0), FOV 58°
 *   Felt surface: Y = 0 plane
 *
 * ── Tile Dimensions (world units) ────────────────────────────────────────────
 *
 *   These values are derived from the GLB bounding box × TILE_SCALE (Phase A).
 *   They MUST match the constants exported from useTileGeometry.ts.
 *
 *   TILE_SCALE  = 0.55 / 24 ≈ 0.0229
 *   TILE_WIDTH  = 24 × TILE_SCALE = 0.55    (X span)
 *   TILE_HEIGHT = 32 × TILE_SCALE = 0.733   (Y span when standing)
 *   TILE_DEPTH  = 13 × TILE_SCALE = 0.298   (Z span — thickness)
 *
 * ── Rotation Conventions ─────────────────────────────────────────────────────
 *
 *   Standing tile (hand): rx=0, face (Z+) points toward its player.
 *     Viewer's tiles (Z+5.0):  ry=0         face points to +Z (toward camera)
 *     Across tiles  (Z−5.0):  ry=Math.PI   face points to −Z (away from camera)
 *     Right tiles   (X+5.0):  ry=−π/2      face points to +X (right)
 *     Left tiles    (X−5.0):  ry=+π/2      face points to −X (left)
 *
 *   Flat tile (discards / open melds):
 *     rx = −π/2  →  face (original +Z) maps to +Y (face visible from above)
 *     ry varies by seat — keeps text readable from each player's side.
 */

import type { ClientGameState } from '@nanchang/shared';

// ── Constants ─────────────────────────────────────────────────────────────────
// Must match useTileGeometry.ts — any change there must be reflected here.

const TW = 0.55; // TILE_WIDTH
const TH = 0.733; // TILE_HEIGHT
const TD = 0.298; // TILE_DEPTH

/** Y position for a STANDING tile so its bottom rests on the felt (Y=0). */
export const STANDING_Y = TH / 2; // 0.3665

/** Y position for a FLAT (lying) tile so its bottom rests on the felt. */
export const FLAT_Y = TD / 2; // 0.149

/** Gap between adjacent tiles in a row. */
const TILE_GAP = 0.04;

/** Per-tile stride in the column direction (hand rows, discard columns). */
export const TILE_STRIDE_W = TW + TILE_GAP; // 0.59

/** Per-tile stride in the row direction (discard rows grow outward). */
export const TILE_STRIDE_H = TH + 0.05; // 0.783

/** Z / X coordinate of the hand anchor (player's tile rack). */
export const HAND_DIST = 5.0;

/** Z / X coordinate where the first discard row starts (nearest center edge). */
export const DISCARD_START = 2.6;

/** Z / X coordinate of the open-meld row (between hand and discards). */
export const MELD_DIST = 4.0;

/** Number of discards per row before wrapping to a new row. */
export const DISCARD_COLS = 6;

// ── Types ─────────────────────────────────────────────────────────────────────

/** World-space position and Euler rotation for a single tile or tile group. */
export interface TilePose {
  x: number;
  y: number;
  z: number;
  /** Euler X rotation in radians (XYZ order). */
  rx: number;
  /** Euler Y rotation in radians. */
  ry: number;
  /** Euler Z rotation in radians. */
  rz: number;
}

export interface TableLayout {
  /** Viewer's own hand — 13 or 14 tiles, standing upright, face toward viewer. */
  viewerHand: TilePose[];

  /** Face-down opponent hands, keyed by compass position relative to viewer. */
  opponentHands: {
    right: TilePose[];
    across: TilePose[];
    left: TilePose[];
  };

  /**
   * Discard piles for all 4 seats, indexed by absolute seat index [0..3].
   * Tiles lie flat, face up.
   */
  discards: TilePose[][];

  /**
   * Open melds for all 4 seats, indexed by [seatIndex][meldIndex].
   * Each inner array is the tile poses for one meld (3 or 4 tiles).
   */
  openMelds: TilePose[][][];
}

// ── Helper: compass seat resolution ──────────────────────────────────────────

function compassSeats(viewerSeat: 0 | 1 | 2 | 3) {
  return {
    right: ((viewerSeat + 1) % 4) as 0 | 1 | 2 | 3,
    across: ((viewerSeat + 2) % 4) as 0 | 1 | 2 | 3,
    left: ((viewerSeat + 3) % 4) as 0 | 1 | 2 | 3,
  };
}

/**
 * compassOffset: how far a seat is from the viewer in turn order.
 *   0 = viewer, 1 = right, 2 = across, 3 = left
 */
function compassOffset(seatIndex: number, viewerSeat: number): 0 | 1 | 2 | 3 {
  return ((seatIndex - viewerSeat + 4) % 4) as 0 | 1 | 2 | 3;
}

// ── Hand layout ───────────────────────────────────────────────────────────────

/**
 * Row of standing tiles for one player's hand.
 * Centered on the player's axis anchor, at HAND_DIST from the center.
 *
 * @param count     Number of tiles in the hand
 * @param offset    compassOffset (0=viewer, 1=right, 2=across, 3=left)
 */
function handPoses(count: number, offset: 0 | 1 | 2 | 3): TilePose[] {
  const totalWidth = count * TILE_STRIDE_W - TILE_GAP;
  const startCol = -totalWidth / 2 + TW / 2;

  const configs: Array<{
    anchorX: number;
    anchorZ: number;
    ry: number;
    colAxisX: number;
    colAxisZ: number;
  }> = [
    // 0 — viewer (south): tiles spread along X, standing at Z=+HAND_DIST
    { anchorX: 0, anchorZ: HAND_DIST, ry: 0, colAxisX: 1, colAxisZ: 0 },
    // 1 — right (east): tiles spread along Z, standing at X=+HAND_DIST
    { anchorX: HAND_DIST, anchorZ: 0, ry: -Math.PI / 2, colAxisX: 0, colAxisZ: 1 },
    // 2 — across (north): tiles spread along X, standing at Z=-HAND_DIST
    { anchorX: 0, anchorZ: -HAND_DIST, ry: Math.PI, colAxisX: 1, colAxisZ: 0 },
    // 3 — left (west): tiles spread along Z, standing at X=-HAND_DIST
    { anchorX: -HAND_DIST, anchorZ: 0, ry: Math.PI / 2, colAxisX: 0, colAxisZ: 1 },
  ];

  const { anchorX, anchorZ, ry, colAxisX, colAxisZ } = configs[offset];

  return Array.from({ length: count }, (_, i) => {
    const col = startCol + i * TILE_STRIDE_W;
    return {
      x: anchorX + col * colAxisX,
      y: STANDING_Y,
      z: anchorZ + col * colAxisZ,
      rx: 0,
      ry,
      rz: 0,
    };
  });
}

// ── Discard layout ────────────────────────────────────────────────────────────

/**
 * Grid of flat, face-up tiles for one player's discard pile.
 * Rows build outward from center toward the player's hand.
 *
 * For viewer/across: columns run along X, rows run along Z.
 * For right/left:   columns run along Z, rows run along X.
 */
function discardPoses(count: number, offset: 0 | 1 | 2 | 3): TilePose[] {
  const configs: Array<{
    baseX: number;
    baseZ: number;
    ry: number;
    colX: number;
    colZ: number;
    rowX: number;
    rowZ: number;
  }> = [
    // 0 — viewer (south): cols along +X, rows grow toward viewer (+Z from center)
    { baseX: 0, baseZ: DISCARD_START, ry: Math.PI, colX: 1, colZ: 0, rowX: 0, rowZ: 1 },
    // 1 — right (east): cols along +Z, rows grow toward right (+X from center)
    { baseX: DISCARD_START, baseZ: 0, ry: -Math.PI / 2, colX: 0, colZ: 1, rowX: 1, rowZ: 0 },
    // 2 — across (north): cols along +X, rows grow toward across (-Z from center)
    { baseX: 0, baseZ: -DISCARD_START, ry: 0, colX: 1, colZ: 0, rowX: 0, rowZ: -1 },
    // 3 — left (west): cols along +Z, rows grow toward left (-X from center)
    { baseX: -DISCARD_START, baseZ: 0, ry: Math.PI / 2, colX: 0, colZ: 1, rowX: -1, rowZ: 0 },
  ];

  const { baseX, baseZ, ry, colX, colZ, rowX, rowZ } = configs[offset];

  // Center the column axis so the discard pile is symmetric
  const halfRow = ((DISCARD_COLS - 1) / 2) * TILE_STRIDE_W;

  return Array.from({ length: count }, (_, i) => {
    const col = i % DISCARD_COLS;
    const row = Math.floor(i / DISCARD_COLS);

    const colOffset = col * TILE_STRIDE_W - halfRow;
    const rowOffset = row * TILE_STRIDE_H;

    return {
      x: baseX + colOffset * colX + rowOffset * rowX,
      y: FLAT_Y,
      z: baseZ + colOffset * colZ + rowOffset * rowZ,
      rx: -Math.PI / 2,
      ry,
      rz: 0,
    };
  });
}

// ── Open meld layout ──────────────────────────────────────────────────────────

/**
 * Row of flat, face-up tiles for one open meld (pung = 3, kong = 4, chow = 3).
 * Melds are lined up at MELD_DIST from center, grouped side-by-side.
 *
 * @param tileCount   Number of tiles in this meld (3 or 4)
 * @param meldIndex   Which meld group (0=first, 1=second, …)
 * @param offset      compassOffset for the owning seat
 */
function openMeldPoses(tileCount: number, meldIndex: number, offset: 0 | 1 | 2 | 3): TilePose[] {
  // Each meld group occupies tileCount tiles + a small inter-group gap
  const meldGroupWidth = tileCount * TILE_STRIDE_W + 0.12;
  const meldGroupOffset = meldIndex * meldGroupWidth;

  const configs: Array<{
    anchorX: number;
    anchorZ: number;
    ry: number;
    colX: number;
    colZ: number;
  }> = [
    // 0 — viewer (south): melds spread along +X from centre, sitting at Z=MELD_DIST
    { anchorX: 0, anchorZ: MELD_DIST, ry: Math.PI, colX: 1, colZ: 0 },
    // 1 — right (east)
    { anchorX: MELD_DIST, anchorZ: 0, ry: -Math.PI / 2, colX: 0, colZ: 1 },
    // 2 — across (north)
    { anchorX: 0, anchorZ: -MELD_DIST, ry: 0, colX: 1, colZ: 0 },
    // 3 — left (west)
    { anchorX: -MELD_DIST, anchorZ: 0, ry: Math.PI / 2, colX: 0, colZ: 1 },
  ];

  const { anchorX, anchorZ, ry, colX, colZ } = configs[offset];

  // Centre each meld group around its starting point
  const groupStart = meldGroupOffset;
  const tileStart = -(tileCount * TILE_STRIDE_W) / 2 + TW / 2;

  return Array.from({ length: tileCount }, (_, i) => {
    const tileOffset = tileStart + i * TILE_STRIDE_W + groupStart;
    return {
      x: anchorX + tileOffset * colX,
      y: FLAT_Y,
      z: anchorZ + tileOffset * colZ,
      rx: -Math.PI / 2,
      ry,
      rz: 0,
    };
  });
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Derives the complete 3D layout for a game snapshot.
 *
 * This is a pure function — safe to call in Vitest tests, in Zustand
 * subscribers, and inside useFrame callbacks without any side effects.
 *
 * @param snapshot  The current ClientGameState from the server
 */
export function computeTableLayout(snapshot: ClientGameState): TableLayout {
  const viewerSeat = (snapshot.viewerSeat ?? 0) as 0 | 1 | 2 | 3;
  const { right: rightSeat, across: acrossSeat, left: leftSeat } = compassSeats(viewerSeat);

  // ── Viewer's hand ────────────────────────────────────────────────────────────
  const viewerHandCount = snapshot.seats[viewerSeat].hand?.length ?? 0;

  // ── Opponent hands ───────────────────────────────────────────────────────────
  const opponentHands = {
    right: handPoses(snapshot.seats[rightSeat].handCount, 1),
    across: handPoses(snapshot.seats[acrossSeat].handCount, 2),
    left: handPoses(snapshot.seats[leftSeat].handCount, 3),
  };

  // ── Discards for all 4 seats ─────────────────────────────────────────────────
  const discards: TilePose[][] = snapshot.seats.map((seat, seatIdx) => {
    const offset = compassOffset(seatIdx, viewerSeat);
    return discardPoses(seat.discards.length, offset);
  });

  // ── Open melds for all 4 seats ───────────────────────────────────────────────
  const openMelds: TilePose[][][] = snapshot.seats.map((seat, seatIdx) => {
    const offset = compassOffset(seatIdx, viewerSeat);
    return seat.openMelds.map((meld, meldIdx) => openMeldPoses(meld.tiles.length, meldIdx, offset));
  });

  return {
    viewerHand: handPoses(viewerHandCount, 0),
    opponentHands,
    discards,
    openMelds,
  };
}
