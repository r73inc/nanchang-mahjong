/**
 * SeatLabel2D — nameplate chip for one seat in the 2.5D DOM game table.
 *
 * Shows: wind-colour dot, dealer badge, score, AFK badge, connectivity dot.
 * Matches the visual style of the existing `Nameplate` component in game-page.tsx
 * but is positioned by GameTable2D inside each seat's CSS Grid area.
 *
 * Reads from Zustand so GameTable2D doesn't need to prop-drill snapshot fields.
 */

import { useI18n } from '../../i18n';
import { useGameStore } from '../../stores/game.store';

// ── Wind display tables ───────────────────────────────────────────────────────
// Module-level constants satisfy i18next/no-literal-string (variable refs in JSX)

type SeatWind = 'east' | 'south' | 'west' | 'north';

const WIND_CHAR: Record<SeatWind, string> = {
  east: '東',
  south: '南',
  west: '西',
  north: '北',
};

const WIND_COLOR: Record<SeatWind, string> = {
  east: '#c9a961',
  south: '#a36d3e',
  west: '#5a7d8c',
  north: '#7d4f4f',
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface SeatLabel2DProps {
  seatIdx: 0 | 1 | 2 | 3;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SeatLabel2D({ seatIdx }: SeatLabel2DProps) {
  const snapshot = useGameStore((s) => s.snapshot);
  const { t } = useI18n();

  if (!snapshot) return null;

  const seat = snapshot.seats[seatIdx];
  const isActive = snapshot.currentSeat === seatIdx;
  const isDealer = snapshot.dealerSeat === seatIdx;
  const windColor = WIND_COLOR[seat.wind];

  return (
    <div
      data-testid={`seat-label-${seatIdx}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 6px',
        borderRadius: 6,
        fontSize: 10,
        background: isActive ? 'rgba(201,169,97,0.18)' : 'rgba(245,239,223,0.05)',
        border: `1px solid ${isActive ? 'rgba(201,169,97,0.5)' : 'rgba(245,239,223,0.1)'}`,
        boxShadow: isActive ? '0 0 8px rgba(201,169,97,0.2)' : 'none',
        whiteSpace: 'nowrap',
      }}
    >
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

      {/* Wind character */}
      <span aria-hidden="true" style={{ color: windColor, fontFamily: 'serif' }}>
        {WIND_CHAR[seat.wind]}
      </span>

      {/* Dealer badge */}
      {isDealer && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            padding: '0 3px',
            borderRadius: 3,
            background: 'rgba(201,169,97,0.3)',
            color: '#c9a961',
          }}
        >
          {t('gameDealerBadge')}
        </span>
      )}

      {/* Score */}
      <span style={{ color: 'rgba(245,239,223,0.6)', fontVariantNumeric: 'tabular-nums' }}>
        {seat.score}
      </span>

      {/* Bot chip — shown instead of AFK/disconnect indicators */}
      {seat.isBot ? (
        <span
          aria-label={t(
            seat.botDifficulty === 'normal' ? 'botDifficultyNormalFull' : 'botDifficultyEasyFull',
          )}
          style={{
            fontSize: 8,
            fontWeight: 700,
            padding: '0 3px',
            borderRadius: 3,
            background: 'rgba(90,125,140,0.3)',
            color: '#7ab5cc',
          }}
        >
          {t('botBadge')}
        </span>
      ) : (
        <>
          {/* AFK indicator */}
          {seat.afk && (
            <span style={{ color: '#ef5350', fontSize: 9 }}>{t('gameWaitingTurn')}</span>
          )}

          {/* Disconnected dot */}
          {!seat.connected && (
            <span
              aria-label={t('gameReconnecting')}
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: '#ef5350',
                flexShrink: 0,
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
