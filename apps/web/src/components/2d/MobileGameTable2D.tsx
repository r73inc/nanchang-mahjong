/**
 * MobileGameTable2D — absolute-positioned game table for mobile landscape mode.
 *
 * Activated when `GameTable2D` receives `isMobile={true}` (set by game-page.tsx
 * when `useOrientation()` returns `mode === 'css-landscape'` or
 * `mode === 'native-landscape'`).
 *
 * No CSS Grid. All elements are `position: absolute` within a `relative`
 * container that fills the CSS-rotated wrapper (≈812 × 375 px effective):
 *
 *   ┌─────────────────────────────────────────────────────┐  ← ~812 px wide
 *   │ [status bar managed by game-page.tsx z-10 overlay]  │
 *   │             [TopBadge — horizontally centred]        │
 *   │                                                      │
 *   │ [LeftBadge]  [CombinedDiscardPool/MobileDiscardPool] [RightBadge]
 *   │              [round wind watermark beneath]          │
 *   │                                                      │
 *   │  ━━━━━━[OpenMelds strip — above hand]━━━━━━━━━━━━  │
 *   │  ━━━━━━━━━━━[PlayerHand — full width]━━━━━━━━━━━━  │
 *   └─────────────────────────────────────────────────────┘  ← ~375 px tall
 *
 * Drag is disabled on PlayerHand2D (disableDrag={true}) because CSS rotate(90deg)
 * swaps the physical X/Y axes making Framer Motion drag coordinates incorrect.
 * Players use tap-to-select → tap-to-discard exclusively on mobile.
 */

import { MotionConfig } from 'framer-motion';
import type { TileType } from '@nanchang/shared';
import type { SeatWind } from '@nanchang/shared';
import { useGameStore } from '../../stores/game.store';
import { DiscardContext } from './DiscardContext';
import { useState } from 'react';
import { FeltSurface2D } from './FeltSurface2D';
import { OpponentBadge2D } from './OpponentBadge2D';
import { MobileDiscardPool2D } from './MobileDiscardPool2D';
import { OpenMelds2D } from './OpenMelds2D';
import { PlayerHand2D } from './PlayerHand2D';

// ── Module-level constants ────────────────────────────────────────────────────

const REDUCED_MOTION = 'user' as const;

/** Width reserved on each side for left/right opponent badges. */
const BADGE_W = 52;

/** Status bar height (managed by game-page.tsx overlay, z-10). */
const STATUS_H = 32;

/** Fallback hand strip height; overridden by --mj-hand-height in PR 14C. */
const HAND_H_FALLBACK = 90;

const WIND_CHAR: Record<SeatWind, string> = {
  east: '東',
  south: '南',
  west: '西',
  north: '北',
};

// ── Compass helper ────────────────────────────────────────────────────────────

function getCompassSeats(viewerSeat: 0 | 1 | 2 | 3) {
  return {
    right: ((viewerSeat + 1) % 4) as 0 | 1 | 2 | 3,
    across: ((viewerSeat + 2) % 4) as 0 | 1 | 2 | 3,
    left: ((viewerSeat + 3) % 4) as 0 | 1 | 2 | 3,
  };
}

// ── Round watermark ───────────────────────────────────────────────────────────

function RoundWatermark() {
  const snapshot = useGameStore((s) => s.snapshot);
  if (!snapshot) return null;
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 0,
        fontFamily: 'serif',
        fontWeight: 700,
        fontSize: 72,
        opacity: 0.06,
        color: '#c9a961',
        userSelect: 'none',
      }}
    >
      {WIND_CHAR[snapshot.roundWind]}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface MobileGameTable2DProps {
  onDiscard: (tile: TileType) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MobileGameTable2D({ onDiscard }: MobileGameTable2DProps) {
  const snapshot = useGameStore((s) => s.snapshot);

  // ── Discard-flight context ────────────────────────────────────────────────
  const [lastDiscardId, setLastDiscardId] = useState<string | null>(null);

  if (!snapshot) return null;

  const viewerSeat = (snapshot.viewerSeat ?? 0) as 0 | 1 | 2 | 3;
  const { right: rightSeat, across: acrossSeat, left: leftSeat } = getCompassSeats(viewerSeat);

  return (
    <DiscardContext.Provider value={{ lastDiscardId, setLastDiscardId }}>
      <MotionConfig reducedMotion={REDUCED_MOTION}>
        <div
          data-testid="mobile-game-table-2d"
          style={{ position: 'relative', width: '100%', height: '100%' }}
        >
          {/* ── Background ──────────────────────────────────────────────── */}
          <FeltSurface2D />

          {/* ── Round watermark — decorative centred behind discard pool ── */}
          <RoundWatermark />

          {/* ── Top opponent badge ───────────────────────────────────────── */}
          <div
            style={{
              position: 'absolute',
              top: STATUS_H + 8,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 2,
            }}
          >
            <OpponentBadge2D seatIdx={acrossSeat} position="top" />
          </div>

          {/* ── Left opponent badge ──────────────────────────────────────── */}
          <div
            style={{
              position: 'absolute',
              left: 'var(--mj-safe-left, 0px)',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 2,
            }}
          >
            <OpponentBadge2D seatIdx={leftSeat} position="left" />
          </div>

          {/* ── Right opponent badge ─────────────────────────────────────── */}
          <div
            style={{
              position: 'absolute',
              right: 'var(--mj-safe-right, 0px)',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 2,
            }}
          >
            <OpponentBadge2D seatIdx={rightSeat} position="right" />
          </div>

          {/* ── Combined discard pool — fills available centre felt ───────── */}
          {/* Bounded away from opponent badges and the hand strip.           */}
          <div
            style={{
              position: 'absolute',
              top: STATUS_H + 8,
              bottom: HAND_H_FALLBACK,
              left: `calc(${BADGE_W}px + var(--mj-safe-left, 0px))`,
              right: `calc(${BADGE_W}px + var(--mj-safe-right, 0px))`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1,
            }}
          >
            <MobileDiscardPool2D />
          </div>

          {/* ── Viewer open melds — thin strip just above the hand ─────────── */}
          <div
            style={{
              position: 'absolute',
              bottom: `var(--mj-hand-height, ${HAND_H_FALLBACK}px)`,
              left: `calc(${BADGE_W}px + var(--mj-safe-left, 0px))`,
              right: `calc(${BADGE_W}px + var(--mj-safe-right, 0px))`,
              display: 'flex',
              justifyContent: 'center',
              zIndex: 2,
            }}
          >
            <OpenMelds2D seatIdx={viewerSeat} role="bottom" compact />
          </div>

          {/* ── Viewer hand — full width, pins to bottom ─────────────────── */}
          {/* disableDrag={true}: CSS rotation makes Framer Motion drag        */}
          {/* coordinates incorrect (physical X/Y axes are swapped 90°).      */}
          {/* Players use tap-to-select → tap-to-discard exclusively.         */}
          <div
            style={{
              position: 'absolute',
              bottom: 'var(--mj-safe-bottom, 0px)',
              left: 0,
              right: 0,
              zIndex: 3,
            }}
          >
            <PlayerHand2D onDiscard={onDiscard} disableDrag />
          </div>
        </div>
      </MotionConfig>
    </DiscardContext.Provider>
  );
}
