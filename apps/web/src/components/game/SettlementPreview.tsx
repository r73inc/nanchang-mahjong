import { useState } from 'react';
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
  otherSeatName: string;
}

/** Compute every individual player-to-player transfer for seat `i`. */
function buildTransferLines(
  seat: number,
  settlementPreview: SettlementPreviewPayload,
  seatNames: string[],
): TransferLine[] {
  const lines: TransferLine[] = [];
  for (let j = 0; j < 4; j++) {
    if (j === seat) continue;
    const jName = seatNames[j];
    // 2pt tile — i receives from j because i holds the tile
    if (settlementPreview.seatCounts[seat] > 0) {
      lines.push({
        tile: settlementPreview.settlementTile,
        direction: 'received',
        amount: settlementPreview.seatCounts[seat] * 2,
        otherSeatName: jName,
      });
    }
    // 2pt tile — i pays j because j holds the tile
    if (settlementPreview.seatCounts[j] > 0) {
      lines.push({
        tile: settlementPreview.settlementTile,
        direction: 'paid',
        amount: settlementPreview.seatCounts[j] * 2,
        otherSeatName: jName,
      });
    }
    // 1pt tile — i receives from j
    if (settlementPreview.nextTileSeatCounts[seat] > 0) {
      lines.push({
        tile: settlementPreview.nextTile,
        direction: 'received',
        amount: settlementPreview.nextTileSeatCounts[seat],
        otherSeatName: jName,
      });
    }
    // 1pt tile — i pays j
    if (settlementPreview.nextTileSeatCounts[j] > 0) {
      lines.push({
        tile: settlementPreview.nextTile,
        direction: 'paid',
        amount: settlementPreview.nextTileSeatCounts[j],
        otherSeatName: jName,
      });
    }
  }
  return lines;
}

interface SettlementPreviewProps {
  settlementPreview: SettlementPreviewPayload;
  snapshot: ClientGameState;
  viewerSeat: number | null;
}

export function SettlementPreview({
  settlementPreview,
  snapshot,
  viewerSeat,
}: SettlementPreviewProps) {
  const { t } = useI18n();
  const [expandedSeat, setExpandedSeat] = useState<number | null>(null);

  const toggleExpand = (seat: number) => {
    setExpandedSeat(expandedSeat === seat ? null : seat);
  };

  const seatNames = snapshot.seats.map((s) => s.seatName);

  const seatDeltas = settlementPreview.delta.map((delta2pt, i) => ({
    seat: i,
    totalDelta: delta2pt + settlementPreview.nextTileDelta[i],
    transfers: buildTransferLines(i, settlementPreview, seatNames),
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
                className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all ${
                  isViewer ? 'bg-mj-gold/15 border border-mj-gold/30' : 'bg-white/5'
                } ${isExpanded ? 'rounded-b-none' : ''}`}
              >
                <div className="flex items-center gap-2 flex-1 text-left">
                  <span className="text-sm font-bold" style={{ color: WIND_COLOR[wind] }}>
                    {WIND_CHAR[wind]}
                  </span>
                  <span className="text-xs text-mj-bone/60">{snapshot.seats[seat].seatName}</span>
                  {isViewer && (
                    <span className="text-mj-bone/40 font-normal text-xs ml-auto">
                      {t('preGameYou')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-bold tabular-nums ${
                      totalDelta > 0
                        ? 'text-emerald-400'
                        : totalDelta < 0
                          ? 'text-red-400'
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
                  className={`flex flex-col gap-2 px-4 py-2.5 border-t rounded-b-xl ${
                    isViewer ? 'bg-mj-gold/10 border-mj-gold/20' : 'bg-white/3 border-white/10'
                  }`}
                >
                  {transfers.map((line, li) => (
                    <div key={li} className="flex items-center gap-2 text-xs">
                      <MahjongTile2D tile={line.tile} size="xs" interactive={false} />
                      <span className="text-mj-bone/60 flex-1 text-left">
                        {line.direction === 'received'
                          ? t('settlementReceivedFrom', String(line.amount), line.otherSeatName)
                          : t('settlementPaidTo', String(line.amount), line.otherSeatName)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
