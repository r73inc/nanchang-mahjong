/**
 * OpponentBadge2D — compact opponent info badge for the mobile game table.
 *
 * Replaces the per-seat OpponentHand2D (face-down tile row) on mobile.
 * Rendered in MobileGameTable2D at the top/left/right positions.
 *
 * Shows:
 *  - Wind-coloured dot + wind character
 *  - Score
 *  - Tile count (🀫 ×N)
 *  - Active-seat gold ring (class `mj-opponent-badge-active` — suppressed
 *    in prefers-reduced-motion via index.css rule added in PR 14A)
 *  - AFK indicator (amber dot)
 *  - Disconnect indicator (red dot)
 *  - Open melds (if any) — compact xs-size strip below the badge
 *
 * Reads from Zustand directly (same pattern as SeatLabel2D).
 */

import { useGameStore } from '../../stores/game.store';
import { useI18n } from '../../i18n';
import { OpenMelds2D } from './OpenMelds2D';

// ── Wind display tables ───────────────────────────────────────────────────────

type SeatWind = 'east' | 'south' | 'west' | 'north';

const WIND_COLOR: Record<SeatWind, string> = {
  east: '#c9a961',
  south: '#a36d3e',
  west: '#5a7d8c',
  north: '#7d4f4f',
};

// ── Module-level string constants (i18next/no-literal-string) ────────────────

const TILE_BACK_GLYPH = '🀫' as const;
const TIMES_GLYPH = '×' as const;

// ── Props ─────────────────────────────────────────────────────────────────────

export interface OpponentBadge2DProps {
  seatIdx: 0 | 1 | 2 | 3;
  /** Visual position — determines badge orientation/padding. */
  position: 'top' | 'left' | 'right';
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OpponentBadge2D({ seatIdx, position }: OpponentBadge2DProps) {
  const snapshot = useGameStore((s) => s.snapshot);
  const { t } = useI18n();

  if (!snapshot) return null;

  const seat = snapshot.seats[seatIdx];
  const isActive = snapshot.currentSeat === seatIdx;
  const isDealer = snapshot.dealerSeat === seatIdx;
  const windColor = WIND_COLOR[seat.wind];

  return (
    <div
      data-testid={`opponent-badge-${seatIdx}`}
      style={{
        display: 'flex',
        flexDirection: position === 'top' ? 'row' : 'column',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {/* ── Main badge pill ─────────────────────────────────────────────── */}
      <div
        className={isActive ? 'mj-opponent-badge-active' : undefined}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
          padding: '4px 6px',
          borderRadius: 8,
          background: isActive ? 'rgba(201,169,97,0.15)' : 'rgba(var(--felt-ink-rgb),0.05)',
          border: `1px solid ${isActive ? 'rgba(201,169,97,0.5)' : 'rgba(var(--felt-ink-rgb),0.1)'}`,
          boxShadow: isActive ? '0 0 0 2px #c9a961' : 'none',
          minWidth: 44,
        }}
      >
        {/* Wind dot + character row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {/* Wind colour dot */}
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
          {/* Player / bot name */}
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
          {/* Dealer badge */}
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
              D
            </span>
          )}
        </div>

        {/* Score */}
        <span
          style={{
            color: 'rgba(var(--felt-ink-rgb),0.7)',
            fontSize: 10,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {seat.score}
        </span>

        {/* Tile count */}
        <span
          data-testid={`badge-tile-count-${seatIdx}`}
          aria-label={`${seat.handCount} tiles`}
          style={{ fontSize: 10, color: 'rgba(var(--felt-ink-rgb),0.5)' }}
        >
          {TILE_BACK_GLYPH}
          {TIMES_GLYPH}
          {seat.handCount}
        </span>

        {/* Bot chip — replaces AFK/disconnect indicators */}
        {seat.isBot ? (
          <span
            aria-label={t(
              seat.botDifficulty === 'normal' ? 'botDifficultyNormalFull' : 'botDifficultyEasyFull',
            )}
            style={{
              fontSize: 8,
              fontWeight: 700,
              padding: '1px 3px',
              borderRadius: 3,
              background: 'rgba(90,125,140,0.3)',
              color: '#7ab5cc',
            }}
          >
            {t('botBadge')}
          </span>
        ) : (
          /* Human seat — show AFK / disconnect dots as before */
          (seat.afk || !seat.connected) && (
            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              {seat.afk && (
                <span
                  data-testid={`badge-afk-${seatIdx}`}
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: '#f59e0b',
                    flexShrink: 0,
                  }}
                  aria-label="Away from keyboard"
                />
              )}
              {!seat.connected && (
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: '#ef5350',
                    flexShrink: 0,
                  }}
                  aria-label="Disconnected"
                />
              )}
            </div>
          )
        )}
      </div>

      {/* ── Open melds — compact xs-size strip ──────────────────────────── */}
      {seat.openMelds.length > 0 && (
        <div data-testid={`badge-melds-${seatIdx}`}>
          <OpenMelds2D seatIdx={seatIdx} role="bottom" compact />
        </div>
      )}
    </div>
  );
}
