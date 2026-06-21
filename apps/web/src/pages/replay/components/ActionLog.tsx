/**
 * ActionLog — scrollable move history list.
 * Shared between General and Challenge replay views.
 */

import { useEffect, useRef } from 'react';
import { MahjongTile2D } from '../../../components/2d/MahjongTile2D';
import { useI18n } from '../../../i18n';
import type { GameEvent, SeatWind, TileType } from '@nanchang/shared';
import {
  WIND_CHAR,
  WIND_BG_CLASS,
  ACTION_TEXT_CLASS,
  getSeatFromEvent,
  eventLabel,
} from './PlaybackControls';

// Fallback class for event kinds not covered by ACTION_TEXT_CLASS
const ACTION_TEXT_DEFAULT = 'text-mj-bone/60';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ActionLogStep {
  event: GameEvent | null;
  state: { seats: Array<{ wind: SeatWind }> };
  handIdx: number;
}

export interface ActionLogProps {
  steps: ActionLogStep[];
  currentIdx: number;
  onPick: (n: number) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ActionLog({ steps, currentIdx, onPick }: ActionLogProps) {
  const { t } = useI18n();
  const logRef = useRef<HTMLDivElement>(null);

  // Keep current row in view
  useEffect(() => {
    if (!logRef.current) return;
    const row = logRef.current.querySelector<HTMLElement>(`[data-step="${currentIdx}"]`);
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentIdx]);

  return (
    <div
      ref={logRef}
      className="rounded-xl overflow-y-auto max-h-60 border border-mj-ink/[8%] bg-mj-ink/[2%]"
    >
      {steps.map((s, n) => {
        if (!s.event) return null;
        const past = n <= currentIdx;
        const isCurrent = n === currentIdx;
        const seat = getSeatFromEvent(s.event);
        const seatWind = s.state.seats[seat].wind;
        const accentClass = ACTION_TEXT_CLASS[s.event.kind] ?? ACTION_TEXT_DEFAULT;

        return (
          <button
            key={n}
            data-step={n}
            onClick={() => onPick(n)}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left border-b border-b-mj-ink/[4%] border-l-[3px] ${
              isCurrent ? 'bg-mj-gold/12 border-l-mj-gold' : 'border-l-transparent'
            } ${past ? 'text-mj-bone' : 'text-mj-ink/35'}`}
          >
            <span className="font-mono text-[9px] font-bold text-mj-bone/40 w-5 shrink-0">
              {String(n).padStart(2, '0')}
            </span>
            <div
              className={`w-4 h-4 rounded shrink-0 flex items-center justify-center font-serif text-[9px] font-bold text-white ${WIND_BG_CLASS[seatWind]} ${past ? '' : 'opacity-40'}`}
            >
              {WIND_CHAR[seatWind]}
            </div>
            <span className="flex-1 text-[11px] font-medium">
              <span className="opacity-70">{WIND_CHAR[seatWind]}</span>
              <span className={`font-bold ml-1.5 ${accentClass}`}>
                {eventLabel(s.event.kind, t)}
              </span>
            </span>
            {'tile' in s.event && s.event.tile && (
              <span className={past ? '' : 'opacity-35'}>
                <MahjongTile2D tile={s.event.tile as TileType} size="xs" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
