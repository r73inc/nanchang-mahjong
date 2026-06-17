/**
 * DesktopGameTable2D — the original 2.5D DOM game table compositor.
 *
 * This is the desktop variant of the game table, extracted from GameTable2D
 * in PR 14B so that GameTable2D can act as a thin dispatcher between desktop
 * and mobile layouts.
 *
 * All existing behaviour is preserved verbatim. Refer to GameTable2D.tsx for
 * the full architecture notes and bug-fix commentary.
 *
 * CSS Grid template areas:
 *
 *   ".      top      ."
 *   "left   center   right"
 *   "bottom bottom   bottom"   ← viewer spans full width
 *
 * Each opponent seat zone is a rotated flex column.
 */

import { useState, useEffect, useRef } from 'react';
import { MotionConfig } from 'framer-motion';
import type { TileType } from '@nanchang/shared';
import { useGameStore } from '../../stores/game.store';
import { DiscardContext } from './DiscardContext';
import { Table2DScaleContext, computeTileScale } from './Table2DContext';
import { seatConfig } from './layout-2d';
import { FeltSurface2D } from './FeltSurface2D';
import { OpponentHand2D } from './OpponentHand2D';
import { CenterDiscards2D } from './CenterDiscards2D';
import { OpenMelds2D } from './OpenMelds2D';
import { PlayerHand2D } from './PlayerHand2D';

// ── Module-level constants (avoids i18next/no-literal-string on JSX props) ───

/** MotionConfig reducedMotion value — "user" honours OS prefers-reduced-motion. */
const REDUCED_MOTION = 'user' as const;

// ── Seat indices ──────────────────────────────────────────────────────────────

const SEAT_INDICES = [0, 1, 2, 3] as const;

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DesktopGameTable2DProps {
  onDiscard: (tile: TileType) => void;
  tsumoSuppressed?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DesktopGameTable2D({ onDiscard, tsumoSuppressed }: DesktopGameTable2DProps) {
  const snapshot = useGameStore((s) => s.snapshot);
  const viewerSeat = (snapshot?.viewerSeat ?? 0) as 0 | 1 | 2 | 3;

  // ── Discard-flight context ────────────────────────────────────────────────
  const [lastDiscardId, setLastDiscardId] = useState<string | null>(null);

  // ── Responsive tile scaling (BUG-2D-02) ──────────────────────────────────
  const tableRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
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
              gridTemplateColumns: '22% 1fr 22%',
              gridTemplateRows: 'minmax(0, 1fr) minmax(0, 2fr) auto',
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
            <CenterDiscards2D />

            {/* ── Seat zones ────────────────────────────────────────────── */}
            {SEAT_INDICES.map((seatIdx) => {
              const cfg = seatConfig(seatIdx, viewerSeat);
              const isViewer = cfg.role === 'bottom';

              if (isViewer) {
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
                    }}
                  >
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
                    <PlayerHand2D onDiscard={onDiscard} tsumoSuppressed={tsumoSuppressed} />
                  </div>
                );
              }

              return (
                <div
                  key={seatIdx}
                  style={{
                    gridArea: cfg.gridArea,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px 2px',
                    transform: cfg.containerTransform,
                    position: 'relative',
                    zIndex: 1,
                  }}
                >
                  <OpenMelds2D seatIdx={seatIdx} role={cfg.role} />
                  <OpponentHand2D seatIdx={seatIdx} role={cfg.role} />
                </div>
              );
            })}
          </div>
        </MotionConfig>
      </DiscardContext.Provider>
    </Table2DScaleContext.Provider>
  );
}
