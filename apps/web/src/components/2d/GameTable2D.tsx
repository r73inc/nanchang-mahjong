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

import { useState, useEffect, useRef } from 'react';
import { MotionConfig } from 'framer-motion';
import type { TileType } from '@nanchang/shared';
import { useGameStore } from '../../stores/game.store';
import { DiscardContext } from './DiscardContext';
import { Table2DScaleContext, computeTileScale } from './Table2DContext';
import { seatConfig } from './layout-2d';
import { FeltSurface2D } from './FeltSurface2D';
import { SeatLabel2D } from './SeatLabel2D';
import { OpponentHand2D } from './OpponentHand2D';
import { CenterDiscards2D } from './CenterDiscards2D';
import { OpenMelds2D } from './OpenMelds2D';
import { PlayerHand2D } from './PlayerHand2D';

// ── Module-level constants (avoids i18next/no-literal-string on JSX props) ───

/** MotionConfig reducedMotion value — "user" honours OS prefers-reduced-motion. */
const REDUCED_MOTION = 'user' as const;

// ── Props ─────────────────────────────────────────────────────────────────────

export interface GameTable2DProps {
  /** Wired from game-page.tsx's useGame().discard */
  onDiscard: (tile: TileType) => void;
}

// ── Seat indices ──────────────────────────────────────────────────────────────

const SEAT_INDICES = [0, 1, 2, 3] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export function GameTable2D({ onDiscard }: GameTable2DProps) {
  const snapshot = useGameStore((s) => s.snapshot);
  const viewerSeat = (snapshot?.viewerSeat ?? 0) as 0 | 1 | 2 | 3;

  // ── Discard-flight context ────────────────────────────────────────────────
  const [lastDiscardId, setLastDiscardId] = useState<string | null>(null);

  // ── Responsive tile scaling (BUG-2D-02) ──────────────────────────────────
  // ResizeObserver tracks the container's actual pixel dimensions and recomputes
  // tileScale whenever the window resizes (or when the layout changes due to
  // melds being added/removed).
  const tableRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      // Guard against zero-size during initial mount
      if (width > 0 && height > 0) {
        setDims({ w: width, h: height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tileScale = computeTileScale(dims.w, dims.h);

  return (
    <Table2DScaleContext.Provider value={{ tileScale }}>
      <DiscardContext.Provider value={{ lastDiscardId, setLastDiscardId }}>
        <MotionConfig reducedMotion={REDUCED_MOTION}>
          <div
            ref={tableRef}
            className="w-full h-full relative overflow-hidden"
            data-testid="game-table-2d"
            style={{
              display: 'grid',
              // Side columns fixed at 22% each; center column fills the rest.
              gridTemplateColumns: '22% 1fr 22%',
              // Top row and center row share remaining height (1:2 ratio).
              // Bottom row is auto-sized to its content — grows when melds are
              // added so the viewer's hand is never pushed off-screen.
              gridTemplateRows: 'minmax(0, 1fr) minmax(0, 2fr) auto',
              // The viewer's bottom zone spans all three columns so PlayerHand2D
              // gets the full table width (critical on narrow/mobile viewports).
              // Corner cells in the top row use '.' (null) to avoid the
              // invalid-area bug where repeating a name in non-adjacent cells
              // silently discards the entire gridTemplateAreas declaration.
              gridTemplateAreas: `
                ".      top      ."
                "left   center   right"
                "bottom bottom   bottom"
              `,
            }}
          >
            {/* ── Felt background — spans entire grid ─────────────────── */}
            <div style={{ gridColumn: '1 / -1', gridRow: '1 / -1', position: 'relative' }}>
              <FeltSurface2D />
            </div>

            {/* ── Centre discard pools (BUG-2D-03) ─────────────────────── */}
            {/* All four DiscardPool2D instances live here so tiles land on  */}
            {/* the felt surface, not inside the rotated seat zone strips.   */}
            <CenterDiscards2D />

            {/* ── Seat zones ────────────────────────────────────────────── */}
            {SEAT_INDICES.map((seatIdx) => {
              const cfg = seatConfig(seatIdx, viewerSeat);
              const isViewer = cfg.role === 'bottom';

              if (isViewer) {
                // Viewer zone spans full width (all three columns via "bottom bottom bottom").
                // Content stacks vertically: inner melds/discards at top, interactive hand at bottom.
                return (
                  <div
                    key={seatIdx}
                    style={{
                      gridArea: cfg.gridArea,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      padding: '4px 8px',
                      position: 'relative',
                      zIndex: 1,
                      // No overflow:hidden — selected tiles raise upward and
                      // must remain visible above the zone boundary.
                    }}
                  >
                    {/* Inner edge: viewer's open melds (discards moved to CenterDiscards2D) */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <OpenMelds2D seatIdx={seatIdx} role={cfg.role} />
                    </div>

                    {/* Outer edge: the viewer's interactive hand */}
                    <PlayerHand2D onDiscard={onDiscard} />
                  </div>
                );
              }

              // Opponent zone: rotated flex container.
              // DOM child order is REVERSED from intended visual order because
              // CSS rotateZ flips which end of the flex axis is "outer" vs "inner".
              // For all three rotations (180°, ±90°): DOM-first → visual inner edge,
              // DOM-last → visual outer edge.
              return (
                <div
                  key={seatIdx}
                  style={{
                    gridArea: cfg.gridArea,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 2px',
                    transform: cfg.containerTransform,
                    position: 'relative',
                    zIndex: 1,
                    // No overflow:hidden — for right/left seats the container is
                    // 22% wide in local space. overflow:hidden would clip the
                    // rotated tile row to zero visible area before rotation applies.
                  }}
                >
                  {/*
                   * DOM-FIRST → visual INNER edge (closest to centre felt).
                   * OpenMelds is innermost (faces compass rose, like real table).
                   * OpponentHand is just outward of melds, grouped together.
                   * When no melds exist OpenMelds2D returns null and the hand
                   * alone is still anchored at the inner edge — never off-screen.
                   */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <OpenMelds2D seatIdx={seatIdx} role={cfg.role} />
                    <OpponentHand2D seatIdx={seatIdx} role={cfg.role} />
                  </div>

                  {/* DOM-LAST → visual OUTER edge (screen perimeter nameplate). */}
                  <SeatLabel2D seatIdx={seatIdx} />
                </div>
              );
            })}
          </div>
        </MotionConfig>
      </DiscardContext.Provider>
    </Table2DScaleContext.Provider>
  );
}
