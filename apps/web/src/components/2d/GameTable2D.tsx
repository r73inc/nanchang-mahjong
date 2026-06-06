/**
 * GameTable2D — 2.5D DOM game table compositor.
 *
 * Reads viewerSeat from Zustand and uses seatConfig() to assign each seat
 * to its CSS Grid area with the correct containerTransform. All four zones are
 * populated in Phase F; the bottom zone (viewer) contains PlayerHand2D.
 *
 * Phase G additions:
 *  - MotionConfig reducedMotion="user" — all Framer Motion animations inside
 *    the table respect the OS prefers-reduced-motion preference.
 *  - DiscardContext.Provider — bridges PlayerHand2D's ephemeral tile IDs to
 *    DiscardPool2D for the shared-element discard-flight layoutId animation.
 *
 * CSS Grid template areas:
 *
 *   "top-corner  top         top-corner"
 *   "left        center      right"
 *   "btm-corner  bottom      btm-corner"
 *
 * Each non-bottom seat zone is a rotated flex column:
 *   SeatLabel2D  (outer edge — farthest from table center in local coords)
 *   OpponentHand2D
 *   DiscardPool2D
 *   OpenMelds2D  (inner edge — closest to table center)
 *
 * The viewer's bottom zone is a reversed column:
 *   OpenMelds2D + DiscardPool2D  (inner — toward table center)
 *   PlayerHand2D                 (outer — at screen bottom edge)
 */

import { useState } from 'react';
import { MotionConfig } from 'framer-motion';
import type { TileType } from '@nanchang/shared';
import { useGameStore } from '../../stores/game.store';
import { DiscardContext } from './DiscardContext';
import { seatConfig } from './layout-2d';
import { FeltSurface2D } from './FeltSurface2D';
import { SeatLabel2D } from './SeatLabel2D';
import { OpponentHand2D } from './OpponentHand2D';
import { DiscardPool2D } from './DiscardPool2D';
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
  // lastDiscardId is written by PlayerHand2D just before firing onDiscard.
  // DiscardPool2D reads it to assign the matching layoutId to the newest tile.
  const [lastDiscardId, setLastDiscardId] = useState<string | null>(null);

  return (
    <DiscardContext.Provider value={{ lastDiscardId, setLastDiscardId }}>
      <MotionConfig reducedMotion={REDUCED_MOTION}>
        <div
          className="w-full h-full relative overflow-hidden"
          data-testid="game-table-2d"
          style={{
            display: 'grid',
            gridTemplateColumns: '22% 56% 22%',
            gridTemplateRows: '22% 56% 22%',
            // Corner cells are unused — use '.' (null cell) to avoid repeating
            // the same area name in non-adjacent cells, which would make the
            // entire grid-template-areas declaration invalid (CSS requires each
            // named area to be a single rectangular region). An invalid
            // grid-template-areas causes all gridArea placements to fail and
            // every seat zone falls back to auto-placement at the top-left.
            gridTemplateAreas: `
              ". top    ."
              "left       center right"
              ".          bottom ."
            `,
          }}
        >
          {/* ── Felt background — spans entire grid ─────────────────────── */}
          <div style={{ gridColumn: '1 / -1', gridRow: '1 / -1', position: 'relative' }}>
            <FeltSurface2D />
          </div>

          {/* ── Seat zones ────────────────────────────────────────────────── */}
          {SEAT_INDICES.map((seatIdx) => {
            const cfg = seatConfig(seatIdx, viewerSeat);
            const isViewer = cfg.role === 'bottom';

            if (isViewer) {
              // Viewer zone: player hand at outer edge, discards/melds toward center
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
                    position: 'relative',
                    zIndex: 1,
                    // No overflow:hidden — PlayerHand2D tiles raise upward on
                    // selection and would be clipped. The outer wrapper handles
                    // viewport clipping.
                  }}
                >
                  {/* Inner edge: viewer's open melds + discards */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <OpenMelds2D seatIdx={seatIdx} role={cfg.role} />
                    <DiscardPool2D seatIdx={seatIdx} role={cfg.role} />
                  </div>

                  {/* Outer edge: the viewer's interactive hand */}
                  <PlayerHand2D onDiscard={onDiscard} />
                </div>
              );
            }

            // Opponent zone: rotated container with label → hand → discards → melds
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
                  // 22% wide in local space but the tile row is ~390px. Setting
                  // overflow:hidden clips the row to zero visible area after the
                  // rotateZ transform. The outer wrapper handles viewport clipping.
                }}
              >
                {/* Outer edge: nameplate */}
                <SeatLabel2D seatIdx={seatIdx} />

                {/* Face-down hand */}
                <OpponentHand2D seatIdx={seatIdx} role={cfg.role} />

                {/* Discard pool */}
                <DiscardPool2D seatIdx={seatIdx} role={cfg.role} />

                {/* Inner edge: open melds */}
                <OpenMelds2D seatIdx={seatIdx} role={cfg.role} />
              </div>
            );
          })}
        </div>
      </MotionConfig>
    </DiscardContext.Provider>
  );
}
