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
 *   │ [PlayerBadge TL]  [TopBadge — horizontally centred] │
 *   │                                                      │
 *   │ [LeftBadge]  [CombinedDiscardPool/MobileDiscardPool] [RightBadge]
 *   │              [round wind watermark beneath]          │
 *   │                                                      │
 *   │  ━━━━━━[OpenMelds strip — above hand]━━━━━━━━━━━━  │
 *   │  ━━━━━━━━━━━[PlayerHand — full width]━━━━━━━━━━━━  │
 *   └─────────────────────────────────────────────────────┘  ← ~375 px tall
 *
 * Drag-and-drop reordering:
 *  - native-landscape: coordinates are correct as-is (device rotated natively).
 *  - css-landscape:    MotionConfig.transformPagePoint remaps physical portrait
 *    touch coordinates to the rotated visual space so drag tracks correctly.
 *    Formula: physical (px, py) → visual (py, −px) for a 90° CW rotation.
 *
 * PlayerHand2D uses confirmMode=true so a separate floating "Discard" button
 * is required to fire a discard — dragging never accidentally discards a tile.
 *
 * Item 1 audit: SeatLabel2D is NOT used in this component. OpponentBadge2D
 * provides all opponent info. Any prior duplicate-badge symptom was caused by
 * the orientation hook returning 'desktop' for phones in landscape (fixed in
 * PR #64 by navigator.maxTouchPoints detection).
 */

import { MotionConfig } from 'framer-motion';
import type { TileType } from '@nanchang/shared';
import type { SeatWind } from '@nanchang/shared';
import { useGameStore } from '../../stores/game.store';
import { useAuthStore } from '../../stores/auth.store';
import { useI18n } from '../../i18n';
import { DiscardContext } from './DiscardContext';
import { useState } from 'react';
import { FeltSurface2D } from './FeltSurface2D';
import { MahjongTile2D } from './MahjongTile2D';
import { OpponentBadge2D } from './OpponentBadge2D';
import { MobileDiscardPool2D } from './MobileDiscardPool2D';
import { OpenMelds2D } from './OpenMelds2D';
import { PlayerHand2D } from './PlayerHand2D';

// ── Module-level constants ────────────────────────────────────────────────────

const REDUCED_MOTION = 'user' as const;

/**
 * Touch coordinate transform for css-landscape mode.
 *
 * ForcedLandscapeWrapper applies rotate(90deg) clockwise, which maps:
 *   physical Y axis (portrait, downward)  → visual X axis (landscape, rightward)
 *   physical X axis (portrait, rightward) → visual Y axis (landscape, downward, inverted)
 *
 * So a finger dragged physically downward moves a tile visually to the right.
 * Passing this to MotionConfig.transformPagePoint corrects Framer Motion's
 * drag tracking for all Reorder.Group/Item descendants.
 */
const CSS_LANDSCAPE_POINT_TRANSFORM = (point: { x: number; y: number }) => ({
  x: point.y,
  y: -point.x,
});

// ── i18n key constants (avoids i18next/no-literal-string on JSX text nodes) ──

const I18N_SCORE_STRIP = 'mobileScoreStrip' as const;

/** Width reserved on each side for left/right opponent badges. */
const BADGE_W = 52;

/** Extra horizontal inset for the discard pool — reduces tiles per row by ~2 on each side. */
const DISCARD_EXTRA_PAD = 30;

/** i18n key for the last-discard corner label. */
const LAST_DISCARD_LABEL = 'lastDiscardLabel' as const;

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

// ── MobileScoreStrip2D ───────────────────────────────────────────────────────
// Compact one-liner showing the viewer's handle and current score.
// Floats just above the PlayerHand2D tile row, pointer-events: none so it
// never blocks tile taps. Reads handle from auth store (not in snapshot)
// and score from the game snapshot.

function MobileScoreStrip2D() {
  const { t } = useI18n();
  const snapshot = useGameStore((s) => s.snapshot);
  const handle = useAuthStore((s) => s.user?.handle ?? '');
  if (!snapshot) return null;

  const viewerSeat = (snapshot.viewerSeat ?? 0) as 0 | 1 | 2 | 3;
  const seat = snapshot.seats[viewerSeat];

  return (
    <span
      data-testid="mobile-score-strip"
      style={{
        color: 'rgba(var(--felt-ink-rgb),0.6)',
        fontSize: 10,
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '0.02em',
        textShadow: '0 1px 2px rgba(0,0,0,0.9)',
        whiteSpace: 'nowrap',
      }}
    >
      {t(I18N_SCORE_STRIP, handle, seat.score.toLocaleString())}
    </span>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface MobileGameTable2DProps {
  onDiscard: (tile: TileType) => void;
  /**
   * True when the parent ForcedLandscapeWrapper is active (mode === 'css-landscape').
   * Injects transformPagePoint into MotionConfig so Framer Motion drag tracking
   * correctly maps physical portrait touch coordinates to the rotated visual space.
   * False for native-landscape (device rotated natively; coordinates are correct).
   */
  isCssLandscape?: boolean;
  /** True after player dismissed the TsumoBar — re-enables tile interaction. */
  tsumoSuppressed?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MobileGameTable2D({
  onDiscard,
  isCssLandscape = false,
  tsumoSuppressed,
}: MobileGameTable2DProps) {
  const { t } = useI18n();
  const snapshot = useGameStore((s) => s.snapshot);

  // ── Discard-flight context ────────────────────────────────────────────────
  const [lastDiscardId, setLastDiscardId] = useState<string | null>(null);

  if (!snapshot) return null;

  const viewerSeat = (snapshot.viewerSeat ?? 0) as 0 | 1 | 2 | 3;

  // Derive the most recently discarded tile for the corner indicator (IMP-010).
  const lastDiscardTile =
    snapshot.discardedBySeat !== null
      ? (snapshot.seats[snapshot.discardedBySeat].discards.at(-1) ?? null)
      : null;
  const { right: rightSeat, across: acrossSeat, left: leftSeat } = getCompassSeats(viewerSeat);

  return (
    <DiscardContext.Provider value={{ lastDiscardId, setLastDiscardId }}>
      {/*
       * transformPagePoint corrects Framer Motion drag coordinates for
       * css-landscape mode (ForcedLandscapeWrapper rotates content 90° CW).
       * Omitted in native-landscape (device is physically rotated; coords are fine).
       */}
      <MotionConfig
        reducedMotion={REDUCED_MOTION}
        transformPagePoint={isCssLandscape ? CSS_LANDSCAPE_POINT_TRANSFORM : undefined}
      >
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
          {/* Extra horizontal inset (DISCARD_EXTRA_PAD) reduces the first     */}
          {/* row tile count by ~2, preventing overlap with side badges.        */}
          <div
            style={{
              position: 'absolute',
              top: STATUS_H + 8,
              bottom: HAND_H_FALLBACK,
              left: `calc(${BADGE_W + DISCARD_EXTRA_PAD}px + var(--mj-safe-left, 0px))`,
              right: `calc(${BADGE_W + DISCARD_EXTRA_PAD}px + var(--mj-safe-right, 0px))`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1,
            }}
          >
            <MobileDiscardPool2D />
          </div>

          {/* ── Last-discard corner indicator (IMP-010) ───────────────────── */}
          {/* Shows the most recently played tile in the top-left of the felt  */}
          {/* for quick reference during claim windows and between turns.      */}
          {lastDiscardTile && (
            <div
              style={{
                position: 'absolute',
                top: STATUS_H + 6,
                left: `calc(${BADGE_W}px + var(--mj-safe-left, 0px) + 4px)`,
                zIndex: 2,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
                pointerEvents: 'none',
              }}
            >
              <span
                style={{
                  fontSize: 7,
                  color: 'rgba(var(--felt-ink-rgb),0.4)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  lineHeight: 1,
                }}
              >
                {t(LAST_DISCARD_LABEL)}
              </span>
              <MahjongTile2D tile={lastDiscardTile} size="xs" role="bottom" interactive={false} />
            </div>
          )}

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

          {/* ── Viewer score strip — floats just above the hand tiles ────── */}
          {/* Compact "Name: Score pts" text. pointer-events:none so it never  */}
          {/* blocks tile selection. Sits at the top of the hand strip area.   */}
          <div
            style={{
              position: 'absolute',
              bottom: `calc(var(--mj-hand-height, ${HAND_H_FALLBACK}px) + var(--mj-safe-bottom, 0px) + 2px)`,
              left: 0,
              right: 0,
              display: 'flex',
              justifyContent: 'center',
              zIndex: 4,
              pointerEvents: 'none',
            }}
          >
            <MobileScoreStrip2D />
          </div>

          {/* ── Viewer hand — full width, pins to bottom ─────────────────── */}
          {/* confirmMode=true: drag freely reorders tiles (coordinate fix     */}
          {/* applied via MotionConfig.transformPagePoint for css-landscape).   */}
          {/* A floating "Discard" button above the selected tile is the only   */}
          {/* way to fire a discard — no accidental discard during sorting.     */}
          <div
            style={{
              position: 'absolute',
              bottom: 'var(--mj-safe-bottom, 0px)',
              left: 0,
              right: 0,
              zIndex: 3,
            }}
          >
            <PlayerHand2D onDiscard={onDiscard} confirmMode tsumoSuppressed={tsumoSuppressed} />
          </div>
        </div>
      </MotionConfig>
    </DiscardContext.Provider>
  );
}
