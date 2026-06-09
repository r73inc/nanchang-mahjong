/**
 * MobilePlayerBadge2D — compact viewer self-info badge for mobile landscape mode.
 *
 * Shows the viewer's own wind, score, and active-turn highlight. Pinned to the
 * top-left corner of MobileGameTable2D, below the status bar, so the bottom
 * edge of the screen is unobstructed by player metadata.
 *
 * Mirrors the visual design of OpponentBadge2D for visual consistency across
 * all four player positions.
 */

import { useGameStore } from '../../stores/game.store';
import type { SeatWind } from '@nanchang/shared';

// ── Wind display tables ───────────────────────────────────────────────────────

const WIND_COLOR: Record<SeatWind, string> = {
  east: '#c9a961',
  south: '#a36d3e',
  west: '#5a7d8c',
  north: '#7d4f4f',
};

// ── Module-level string constants (i18next/no-literal-string) ────────────────

const DEALER_CHAR = 'D' as const;

// ── Component ─────────────────────────────────────────────────────────────────

export function MobilePlayerBadge2D() {
  const snapshot = useGameStore((s) => s.snapshot);
  if (!snapshot) return null;

  const viewerSeat = (snapshot.viewerSeat ?? 0) as 0 | 1 | 2 | 3;
  const seat = snapshot.seats[viewerSeat];
  const isMyTurn = snapshot.currentSeat === viewerSeat && snapshot.phase === 'playing';
  const isDealer = snapshot.dealerSeat === viewerSeat;
  const windColor = WIND_COLOR[seat.wind];

  return (
    <div
      data-testid="mobile-player-badge"
      className={isMyTurn ? 'mj-opponent-badge-active' : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        padding: '4px 6px',
        borderRadius: 8,
        background: isMyTurn ? 'rgba(201,169,97,0.15)' : 'rgba(245,239,223,0.05)',
        border: `1px solid ${isMyTurn ? 'rgba(201,169,97,0.5)' : 'rgba(245,239,223,0.1)'}`,
        boxShadow: isMyTurn ? '0 0 0 2px #c9a961' : 'none',
        minWidth: 44,
      }}
    >
      {/* Wind dot + character row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span
          aria-hidden="true"
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: windColor,
            flexShrink: 0,
          }}
        />
        <span
          aria-hidden="true"
          style={{
            color: windColor,
            fontSize: 10,
            fontWeight: 700,
            maxWidth: 56,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {seat.seatName}
        </span>
        {isDealer && (
          <span
            style={{
              fontSize: 8,
              fontWeight: 700,
              padding: '0 2px',
              borderRadius: 2,
              background: 'rgba(201,169,97,0.3)',
              color: '#c9a961',
            }}
          >
            {DEALER_CHAR}
          </span>
        )}
      </div>

      {/* Score */}
      <span
        style={{
          color: 'rgba(245,239,223,0.7)',
          fontSize: 10,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {seat.score}
      </span>
    </div>
  );
}
