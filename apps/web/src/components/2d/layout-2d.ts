/**
 * layout-2d.ts — pure coordinate geometry for the 2.5D DOM table.
 *
 * No React, no DOM, no Three.js imports. All positions are expressed as
 * design-unit values at an 800 × 600 reference canvas so the table scales
 * fluidly via CSS percentage / container-query sizing.
 *
 * Seat role assignment (clockwise from viewer):
 *   offset 0 → 'bottom'  (viewer)
 *   offset 1 → 'right'
 *   offset 2 → 'top'
 *   offset 3 → 'left'
 *
 * containerTransform encodes the Z-rotation applied to the entire seat zone
 * so every tile, discard grid, and meld row inside that zone faces inward
 * toward the felt center. The box-shadow directional offsets on each
 * MahjongTile2D must compensate for this rotation (see Phase D).
 */

// ── Constants ──────────────────────────────────────────────────────────────────

/** Locked table aspect ratio (width / height). Design canvas: 800 × 600 px. */
export const TABLE_ASPECT = 4 / 3;

// ── Types ──────────────────────────────────────────────────────────────────────

export type SeatRole = 'bottom' | 'right' | 'top' | 'left';

export interface SeatConfig {
  role: SeatRole;
  /** CSS `transform` value applied to the entire seat zone container div. */
  containerTransform: string;
  /** CSS `grid-area` name — matches the template in GameTable2D. */
  gridArea: string;
}

export interface DiscardGridSpec {
  /** Number of tile columns before wrapping to the next row. */
  cols: number;
  /** Tile size category for MahjongTile2D. Always 'sm' in the discard pool. */
  tileSize: 'sm';
  /** Pixel gap between tiles (at 800 px reference width). */
  gap: number;
}

export interface HandLayoutSpec {
  /** 'lg' for the viewer's own hand; 'xs' for face-down opponent rows. */
  tileSize: 'lg' | 'xs';
  /** Pixel gap between tiles in the row. */
  gap: number;
}

export interface MeldLayoutSpec {
  tileSize: 'md';
  /** Gap between tiles within one meld group. */
  gap: number;
  /** Gap between distinct meld groups. */
  groupGap: number;
  /** Vertical offset (px, negative = up) for the kong bonus tile. */
  kongOffset: number;
}

// ── Internal lookup tables ─────────────────────────────────────────────────────

const ROLES: readonly SeatRole[] = ['bottom', 'right', 'top', 'left'];

const GRID_AREAS: Record<SeatRole, string> = {
  bottom: 'bottom',
  right: 'right',
  top: 'top',
  left: 'left',
};

/**
 * Z-axis rotation for each seat zone so its contents face the table center.
 * Phase D's MahjongTile2D compensates with inverse-rotated box-shadow offsets
 * so the simulated overhead light source stays uniform across the board.
 */
const CONTAINER_TRANSFORMS: Record<SeatRole, string> = {
  bottom: 'none',
  right: 'rotateZ(-90deg)',
  top: 'rotateZ(180deg)',
  left: 'rotateZ(90deg)',
};

const DISCARD_SPEC: DiscardGridSpec = { cols: 6, tileSize: 'sm', gap: 2 };

const HAND_SPECS: Record<SeatRole, HandLayoutSpec> = {
  bottom: { tileSize: 'lg', gap: 4 },
  right: { tileSize: 'xs', gap: 2 },
  top: { tileSize: 'xs', gap: 2 },
  left: { tileSize: 'xs', gap: 2 },
};

const MELD_SPEC: MeldLayoutSpec = {
  tileSize: 'md',
  gap: 1,
  groupGap: 6,
  kongOffset: -8,
};

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns the display role and CSS positioning hints for a seat.
 *
 * @param seatIdx   - The absolute seat index (0–3) from the server snapshot.
 * @param viewerSeat - The viewer's own seat index (0–3).
 */
export function seatConfig(seatIdx: 0 | 1 | 2 | 3, viewerSeat: 0 | 1 | 2 | 3): SeatConfig {
  const offset = ((seatIdx - viewerSeat + 4) % 4) as 0 | 1 | 2 | 3;
  const role = ROLES[offset];
  return {
    role,
    containerTransform: CONTAINER_TRANSFORMS[role],
    gridArea: GRID_AREAS[role],
  };
}

/**
 * Discard pool grid spec. All four seats share the same spec because the
 * zone container carries the rotation — the grid itself is always horizontal.
 */
export function discardGrid(_role: SeatRole): DiscardGridSpec {
  return DISCARD_SPEC;
}

/**
 * Hand row layout. The viewer's bottom hand uses large tiles; opponent
 * rows use extra-small face-down tiles.
 */
export function handLayout(role: SeatRole): HandLayoutSpec {
  return HAND_SPECS[role];
}

/**
 * Open meld layout. Same spec for every seat; zone container handles rotation.
 */
export function meldLayout(_role: SeatRole): MeldLayoutSpec {
  return MELD_SPEC;
}
