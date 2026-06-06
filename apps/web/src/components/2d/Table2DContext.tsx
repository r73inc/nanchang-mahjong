/**
 * Table2DContext — provides a single `tileScale` factor to all 2.5D tile
 * components so they resize proportionally to the actual table pixel dimensions.
 *
 * Scale = 1.0 at the 800 × 600 reference canvas.
 * Scale < 1.0 when the viewport is smaller (tiles shrink uniformly).
 * Scale is always clamped to [TILE_SCALE_MIN, 1.0] — tiles never grow larger
 * than the reference size, and never become invisible.
 *
 * Components outside a GameTable2D (Learn, Replay, History) render without a
 * Provider and receive the default scale of 1.0 automatically.
 */

import { createContext, useContext } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Table2DScaleValue {
  /**
   * Multiplier applied to every pixel dimension in MahjongTile2D (width,
   * height, border-radius, shadow offsets, font-size, etc.).
   */
  tileScale: number;
}

// ── Context + hook ────────────────────────────────────────────────────────────

const DEFAULT_SCALE: Table2DScaleValue = { tileScale: 1 };

export const Table2DScaleContext = createContext<Table2DScaleValue>(DEFAULT_SCALE);

/**
 * Returns the current tile scale factor.
 * Falls back to 1.0 when rendered outside a GameTable2D.
 */
export function useTable2DScale(): Table2DScaleValue {
  return useContext(Table2DScaleContext);
}

// ── Scale computation (pure, no React deps — exported for tests) ──────────────

/** Absolute minimum tile scale regardless of viewport size. */
export const TILE_SCALE_MIN = 0.25;

/**
 * Computes the tile scale factor from the actual table pixel dimensions.
 *
 * Two constraints are evaluated and the tightest wins:
 *
 * 1. **Opponent hand constraint** (left/right seats rotate 90°, so their visual
 *    width = center-row HEIGHT ≈ 50% of tableH). For 13 xs tiles (28 px) +
 *    12 × 2 px gaps = 388 px at reference.
 *
 * 2. **Viewer hand constraint** (spans full table width). For 14 lg tiles
 *    (56 px) + 13 × 4 px gaps = 836 px at reference.
 *
 * Returns a value in [TILE_SCALE_MIN, 1.0].
 */
export function computeTileScale(tableW: number, tableH: number): number {
  // xs tile reference width (see TILE_DIMS.xs.w in MahjongTile2D)
  const XS_W = 28;
  // lg tile reference width (see TILE_DIMS.lg.w in MahjongTile2D)
  const LG_W = 56;

  // Opponent: available visual width ≈ 50% of tableH minus label/padding (48 px)
  // and 12 fixed 2 px gaps totalling 24 px, spread across 13 tiles.
  const oppAvail = tableH * 0.5 - 48;
  const oppTileW = Math.max(XS_W * TILE_SCALE_MIN, (oppAvail - 24) / 13);
  const oppScale = oppTileW / XS_W;

  // Viewer: available width = tableW minus horizontal padding (32 px)
  // and 13 fixed 4 px gaps totalling 52 px, spread across 14 tiles.
  const viewerAvail = tableW - 32;
  const viewerTileW = Math.max(LG_W * TILE_SCALE_MIN, (viewerAvail - 52) / 14);
  const viewerScale = viewerTileW / LG_W;

  return Math.min(1.0, oppScale, viewerScale);
}
