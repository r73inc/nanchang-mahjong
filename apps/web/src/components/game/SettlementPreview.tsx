import { useState } from 'react';
import { MahjongTile2D } from '../2d/MahjongTile2D';
import { useI18n } from '../../i18n';
import type { SettlementPreviewPayload, ClientGameState, SeatWind } from '@nanchang/shared';

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

const MULT_CHAR = '×' as const;

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

  const calculateTotalDeltas = () => {
    return settlementPreview.delta.map((delta2pt, i) => ({
      seat: i,
      delta2pt,
      count2pt: settlementPreview.seatCounts[i],
      delta1pt: settlementPreview.nextTileDelta[i],
      count1pt: settlementPreview.nextTileSeatCounts[i],
      totalDelta: delta2pt + settlementPreview.nextTileDelta[i],
    }));
  };

  const seatDeltas = calculateTotalDeltas();

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
        {seatDeltas.map(({ seat, totalDelta, delta2pt, count2pt, delta1pt, count1pt }) => {
          const wind = snapshot.seats[seat].wind;
          const isViewer = viewerSeat !== null && seat === viewerSeat;
          const isExpanded = expandedSeat === seat;

          return (
            <div key={seat}>
              {/* Main row */}
              <button
                onClick={() => toggleExpand(seat)}
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
                  {(count2pt > 0 || count1pt > 0) && (
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

              {/* Expanded details */}
              {isExpanded && (count2pt > 0 || count1pt > 0) && (
                <div
                  className={`flex flex-col gap-2 px-4 py-2.5 border-t rounded-b-xl ${
                    isViewer ? 'bg-mj-gold/10 border-mj-gold/20' : 'bg-white/3 border-white/10'
                  }`}
                >
                  {/* 2pt settlement tile breakdown */}
                  {count2pt > 0 && (
                    <div className="flex items-center gap-2 text-xs">
                      <MahjongTile2D
                        tile={settlementPreview.settlementTile}
                        size="xs"
                        interactive={false}
                      />
                      <span className="text-mj-bone/60 flex-1">
                        {MULT_CHAR}
                        {count2pt} {t('preGameBonusTile2pt')}
                      </span>
                      <span
                        className={`font-bold tabular-nums ${
                          delta2pt > 0
                            ? 'text-emerald-400'
                            : delta2pt < 0
                              ? 'text-red-400'
                              : 'text-mj-bone/40'
                        }`}
                      >
                        {delta2pt > 0 ? '+' : ''}
                        {delta2pt * count2pt}
                      </span>
                    </div>
                  )}

                  {/* 1pt indicator tile breakdown */}
                  {count1pt > 0 && (
                    <div className="flex items-center gap-2 text-xs">
                      <MahjongTile2D
                        tile={settlementPreview.nextTile}
                        size="xs"
                        interactive={false}
                      />
                      <span className="text-mj-bone/60 flex-1">
                        {MULT_CHAR}
                        {count1pt} {t('preGameBonusTile1pt')}
                      </span>
                      <span
                        className={`font-bold tabular-nums ${
                          delta1pt > 0
                            ? 'text-emerald-400'
                            : delta1pt < 0
                              ? 'text-red-400'
                              : 'text-mj-bone/40'
                        }`}
                      >
                        {delta1pt > 0 ? '+' : ''}
                        {delta1pt * count1pt}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
