/**
 * GameTable2D — 2.5D DOM game table compositor.
 *
 * Reads viewerSeat from Zustand and uses seatConfig() to assign each seat
 * to its CSS Grid area with the correct containerTransform.
 *
 * Phase G additions:
 *  - MotionConfig reducedMotion="user" — all Framer Motion animations inside
 *    the table respect the OS prefers-reduced-motion preference.
 *  - DiscardContext.Provider — bridges PlayerHand2D's ephemeral tile IDs to
 *    DiscardPool2D for the shared-element discard-flight layoutId animation.
 *
 * BUG-2D-02 fix — responsive scaling:
 *  - ResizeObserver tracks the table's actual pixel dimensions.
 *  - computeTileScale() derives a tileScale in [0.25, 1.0] so tiles shrink
 *    proportionally on narrow/short viewports.
 *  - Table2DScaleContext.Provider broadcasts tileScale to all MahjongTile2D
 *    instances inside the table.
 *  - Grid rows changed from fixed `22% / 56% / 22%` to
 *    `minmax(0,1fr) / minmax(0,2fr) / auto` so the viewer zone grows with
 *    its content (melds + discards + hand) instead of overflowing.
 *  - The viewer zone (role="bottom") spans all three columns so the hand
 *    uses the full table width, not just the 56% center column.
 *
 * CSS Grid template areas:
 *
 *   ".      top      ."
 *   "left   center   right"
 *   "bottom bottom   bottom"   ← viewer spans full width
 *
 * Each opponent seat zone is a rotated flex column.
 *
 * BUG-2D-04 fix — correct visual order after CSS rotation:
 *  CSS rotateZ (180°, ±90°) inverts the flex visual order: the DOM-FIRST
 *  child ends up at the visual INNER edge (closest to the centre felt) and
 *  the DOM-LAST child ends up at the visual OUTER edge (screen perimeter).
 *  This is true for ALL three opponent rotations.
 *
 *  Correct layout (DOM order → visual order after rotation):
 *    1. Sub-group [OpenMelds2D, OpponentHand2D]  → INNER edge (near centre)
 *    2. SeatLabel2D                              → OUTER edge (screen edge)
 *
 *  OpenMelds is placed first within the sub-group so it appears closest to
 *  the compass rose (matching real table layout where melds face the centre).
 *
 * The viewer's bottom zone (full-width) is a reversed column:
 *   OpenMelds2D  (inner — discards now in CombinedDiscardPool2D)
 *   PlayerHand2D (outer — at screen bottom edge)
 *
 * BUG-2D-03 fix — centre discard pools:
 *  Discards are rendered inside the `center` grid cell by CenterDiscards2D.
 *
 * BUG-2D-05 fix — combined discard pile:
 *  CenterDiscards2D now renders a single CombinedDiscardPool2D in the true
 *  centre of the felt rather than four per-seat pools near seat edges.
 */

import type { TileType } from '@nanchang/shared';
import { DesktopGameTable2D } from './DesktopGameTable2D';
import { MobileGameTable2D } from './MobileGameTable2D';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface GameTable2DProps {
  /** Wired from game-page.tsx's useGame().discard */
  onDiscard: (tile: TileType) => void;
  /**
   * True when the CSS forced-landscape wrapper is active (mode === 'css-landscape')
   * or when native fullscreen landscape is active (mode === 'native-landscape').
   * Routes to MobileGameTable2D when true, DesktopGameTable2D when false/undefined.
   */
  isMobile?: boolean;
  /**
   * True when mode === 'css-landscape' specifically (ForcedLandscapeWrapper active).
   * Passed to MobileGameTable2D so it can inject a touch coordinate transform
   * into MotionConfig, correcting Framer Motion drag tracking for the 90° rotation.
   */
  isCssLandscape?: boolean;
}

// ── Component — layout dispatcher ────────────────────────────────────────────

export function GameTable2D({ onDiscard, isMobile, isCssLandscape }: GameTable2DProps) {
  return isMobile ? (
    <MobileGameTable2D onDiscard={onDiscard} isCssLandscape={isCssLandscape} />
  ) : (
    <DesktopGameTable2D onDiscard={onDiscard} />
  );
}
