import { useState } from 'react';
import type { ReactNode } from 'react';
import { MahjongTile2D } from '../2d/MahjongTile2D';
import { useI18n } from '../../i18n';
import type {
  SettlementPreviewPayload,
  ClientGameState,
  SeatWind,
  TileType,
} from '@nanchang/shared';

const WIND_CHAR: Record<SeatWind, string> = {
  east: '東',
  south: '南',
  west: '西',
  north: '北',
};

const WIND_COLOR: Record<SeatWind, string> = {
  east: '#c9a961',
  south: '#7fc299',
  west: '#8fa8e8',
  north: '#e89a9a',
};

interface TransferLine {
  tile: TileType;
  direction: 'received' | 'paid';
  amount: number;
  /** Player name for paid rows; undefined for consolidated received rows. */
  otherSeatName?: string;
}

/**
 * Build transfer lines for seat `i`.
 *
 * Received rows are consolidated: one row per tile type showing the total
 * received from all other players (count × rate × 3).
 * Paid rows remain per-player (showing how much was paid to each player based
 * on that player's tile count).
 *
 * Sort order: received (2pt, then 1pt) then paid (1pt first, then 2pt),
 * so the most valuable receipts lead and the most expensive payments close.
 */
function buildTransferLines(
  seat: number,
  settlementPreview: SettlementPreviewPayload,
  seatNames: string[],
  multiplier: number,
): TransferLine[] {
  const lines: TransferLine[] = [];
  const otherCount = settlementPreview.seatCounts.length - 1;

  // Consolidated received rows (one per tile type, total from all other players)
  if (settlementPreview.seatCounts[seat] > 0) {
    lines.push({
      tile: settlementPreview.settlementTile,
      direction: 'received',
      amount: settlementPreview.seatCounts[seat] * 2 * otherCount * multiplier,
    });
  }
  if (settlementPreview.nextTileSeatCounts[seat] > 0) {
    lines.push({
      tile: settlementPreview.nextTile,
      direction: 'received',
      amount: settlementPreview.nextTileSeatCounts[seat] * otherCount * multiplier,
    });
  }

  // Per-player paid rows (unchanged)
  for (let j = 0; j < settlementPreview.seatCounts.length; j++) {
    if (j === seat) continue;
    const jName = seatNames[j];
    if (settlementPreview.seatCounts[j] > 0) {
      lines.push({
        tile: settlementPreview.settlementTile,
        direction: 'paid',
        amount: settlementPreview.seatCounts[j] * 2 * multiplier,
        otherSeatName: jName,
      });
    }
    if (settlementPreview.nextTileSeatCounts[j] > 0) {
      lines.push({
        tile: settlementPreview.nextTile,
        direction: 'paid',
        amount: settlementPreview.nextTileSeatCounts[j] * multiplier,
        otherSeatName: jName,
      });
    }
  }

  lines.sort((a, b) => {
    // received before paid
    if (a.direction !== b.direction) return a.direction === 'received' ? -1 : 1;
    const aIs2pt = a.tile === settlementPreview.settlementTile;
    const bIs2pt = b.tile === settlementPreview.settlementTile;
    if (aIs2pt !== bIs2pt) {
      // received: 2pt first; paid: 1pt first
      return a.direction === 'received' ? (aIs2pt ? -1 : 1) : aIs2pt ? 1 : -1;
    }
    return 0;
  });

  return lines;
}

interface SettlementPreviewProps {
  settlementPreview: SettlementPreviewPayload;
  snapshot: ClientGameState;
  viewerSeat: number | null;
  footer?: ReactNode;
}

export function SettlementPreview({
  settlementPreview,
  snapshot,
  viewerSeat,
  footer,
}: SettlementPreviewProps) {
  const { t } = useI18n();
  const [expandedSeat, setExpandedSeat] = useState<number | null>(null);

  const toggleExpand = (seat: number) => {
    setExpandedSeat(expandedSeat === seat ? null : seat);
  };

  const seatNames = snapshot.seats.map((s) => s.seatName);
  const multiplier = settlementPreview.isMonopoly ? 2 : 1;

  const seatDeltas = settlementPreview.delta.map((delta2pt, i) => ({
    seat: i,
    totalDelta: (delta2pt + settlementPreview.nextTileDelta[i]) * multiplier,
    transfers: buildTransferLines(i, settlementPreview, seatNames, multiplier),
  }));

  return (
    <div className="flex flex-col items-center gap-6 min-h-dvh px-6 py-8 text-center bg-mj-bg-page overflow-y-auto">
      {/* Header */}
      <div>
        <p className="text-[11px] font-bold tracking-widest text-mj-gold/70 uppercase mb-1">
          {t('preGameBonusTile')}
        </p>
        <h1 className="text-2xl font-serif font-bold text-mj-bone">
          {t('preGameSettlementTitle')}
        </h1>
        <p className="text-sm text-mj-bone/50 mt-1">{t('preGameSettlementDesc')}</p>
        {settlementPreview.dice && (
          <p className="text-xs text-mj-gold/80 mt-2 font-semibold tracking-wide">
            🎲{' '}
            {t(
              'preGameDiceRolled',
              String(settlementPreview.dice[0]),
              String(settlementPreview.dice[1]),
            )}
          </p>
        )}
        {settlementPreview.isMonopoly && (
          <div className="inline-flex items-center gap-1 mt-2 px-3 py-1 rounded-full bg-mj-gold/[18%] border border-mj-gold/45">
            <span className="text-xs font-bold text-mj-gold tracking-wide">
              {t('settlementMonopoly')}
            </span>
          </div>
        )}
      </div>

      {/* Settlement tiles display */}
      <div className="flex items-end justify-center gap-4">
        <div className="flex flex-col items-center gap-2">
          <MahjongTile2D
            tile={settlementPreview.settlementTile}
            size="lg"
            isJing
            interactive={false}
          />
          <p className="text-[10px] text-mj-gold/70 font-bold uppercase tracking-wider">
            {t('preGameBonusTile2pt')}
          </p>
        </div>
        <div className="flex flex-col items-center gap-2 pb-1">
          <MahjongTile2D tile={settlementPreview.nextTile} size="sm" interactive={false} />
          <p className="text-[10px] text-mj-gold/50 font-bold uppercase tracking-wider">
            {t('preGameBonusTile1pt')}
          </p>
        </div>
      </div>

      {/* Consolidated settlement table */}
      <div className="flex flex-col gap-2 w-full max-w-xs">
        <p className="text-[10px] text-mj-bone/50 uppercase tracking-widest text-center mb-1">
          {t('preGameSettlementTitle')}
        </p>
        {seatDeltas.map(({ seat, totalDelta, transfers }) => {
          const wind = snapshot.seats[seat].wind;
          const isViewer = viewerSeat !== null && seat === viewerSeat;
          const isExpanded = expandedSeat === seat;
          const hasTransfers = transfers.length > 0;

          return (
            <div key={seat}>
              {/* Main row */}
              <button
                onClick={() => hasTransfers && toggleExpand(seat)}
                className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all ${isExpanded ? 'rounded-b-none' : ''} ${isViewer ? 'bg-mj-gold/15 border border-mj-gold/30' : ''}`}
                style={!isViewer ? { background: 'rgba(var(--felt-ink-rgb),0.05)' } : undefined}
              >
                <div className="flex items-center gap-2 flex-1 text-left min-w-0">
                  <span className="text-sm font-bold shrink-0" style={{ color: WIND_COLOR[wind] }}>
                    {WIND_CHAR[wind]}
                  </span>
                  <span className="text-xs text-mj-bone/60 truncate">
                    {snapshot.seats[seat].seatName}
                  </span>
                  {settlementPreview.seatCounts[seat] > 0 && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <MahjongTile2D
                        tile={settlementPreview.settlementTile}
                        size="xs"
                        interactive={false}
                        isJing
                        showJingLabel={false}
                      />
                      <span className="text-[10px] text-mj-gold/70 font-semibold">
                        {t('tileCountX', String(settlementPreview.seatCounts[seat]))}
                      </span>
                    </div>
                  )}
                  {settlementPreview.nextTileSeatCounts[seat] > 0 && settlementPreview.nextTile && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <MahjongTile2D
                        tile={settlementPreview.nextTile}
                        size="xs"
                        interactive={false}
                      />
                      <span className="text-[10px] text-mj-bone/50 font-semibold">
                        {t('tileCountX', String(settlementPreview.nextTileSeatCounts[seat]))}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-bold tabular-nums ${
                      totalDelta > 0
                        ? 'text-mj-win'
                        : totalDelta < 0
                          ? 'text-mj-loss-light'
                          : 'text-mj-bone/40'
                    }`}
                  >
                    {totalDelta > 0
                      ? t('settlementReceived', String(totalDelta))
                      : totalDelta < 0
                        ? t('settlementPaid', String(Math.abs(totalDelta)))
                        : t('settlementEven')}
                  </span>
                  {hasTransfers && (
                    <svg
                      className={`w-4 h-4 text-mj-bone/40 transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 14l-7 7m0 0l-7-7m7 7V3"
                      />
                    </svg>
                  )}
                </div>
              </button>

              {/* Expanded per-player breakdown */}
              {isExpanded && hasTransfers && (
                <div
                  className={`flex flex-col gap-2 px-4 py-2.5 border-t rounded-b-xl ${isViewer ? 'bg-mj-gold/10 border-mj-gold/20' : ''}`}
                  style={
                    !isViewer
                      ? {
                          background: 'rgba(var(--felt-ink-rgb),0.03)',
                          borderColor: 'rgba(var(--felt-ink-rgb),0.08)',
                        }
                      : undefined
                  }
                >
                  {transfers.map((line, li) => (
                    <div key={li} className="flex items-center gap-2 text-xs">
                      <MahjongTile2D tile={line.tile} size="xs" interactive={false} />
                      <span className="text-mj-bone/60 flex-1 text-left">
                        {line.direction === 'received'
                          ? t('settlementReceived', String(line.amount))
                          : t('settlementPaidTo', String(line.amount), line.otherSeatName ?? '')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {footer && <div className="flex flex-col items-center gap-3 pt-4 pb-8 px-6">{footer}</div>}
    </div>
  );
}
