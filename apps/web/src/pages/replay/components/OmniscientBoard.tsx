/**
 * OmniscientBoard — vertical stack of all four seats, face-up.
 *
 * Each seat card shows: hand tiles, open melds, and their own discard pile.
 * Claimed discard tiles are filtered out using claimedDiscardIndices.
 * Active seat is highlighted based on the current event.
 */

import { MahjongTile2D } from '../../../components/2d/MahjongTile2D';
import { useI18n } from '../../../i18n';
import type { GameEvent, GameState, SeatWind, TileType } from '@nanchang/shared';
import type { OmniscientReplayStep } from '../../../lib/replay-engine';
import {
  WIND_CHAR,
  WIND_BG_CLASS,
  ACTION_BG_CLASS,
  ACTION_BORDER_CLASS,
  getSeatFromEvent,
} from './PlaybackControls';

// ── Wind badge ────────────────────────────────────────────────────────────────

function WindBadge({ wind }: { wind: SeatWind }) {
  return (
    <div
      className={`w-6 h-6 ${WIND_BG_CLASS[wind]} rounded-md flex items-center justify-center font-serif text-[11px] font-bold text-white shrink-0`}
    >
      {WIND_CHAR[wind]}
    </div>
  );
}

// ── Per-seat card ─────────────────────────────────────────────────────────────

function SeatCard({
  seat,
  state,
  event,
  isActive,
  displayName,
}: {
  seat: 0 | 1 | 2 | 3;
  state: GameState;
  event: GameEvent | null;
  isActive: boolean;
  displayName: string;
}) {
  const seatState = state.seats[seat];

  const highlightClass =
    isActive && event
      ? `border ${ACTION_BG_CLASS[event.kind] ?? 'bg-mj-gold/10'} ${ACTION_BORDER_CLASS[event.kind] ?? 'border-mj-gold/20'}`
      : 'border border-transparent';

  return (
    <div className={`rounded-xl p-3 space-y-2 transition-colors duration-150 ${highlightClass}`}>
      {/* Name row */}
      <div className="flex items-center gap-2">
        <WindBadge wind={seatState.wind} />
        <span className="text-[11px] font-bold text-mj-bone/70 truncate">{displayName}</span>
      </div>

      {/* Hand tiles */}
      <div
        className={`flex flex-wrap gap-px transition-all duration-150${isActive ? ' drop-shadow-mj-gold' : ''}`}
      >
        {seatState.hand.map((tile, n) => (
          <MahjongTile2D key={n} tile={tile as TileType} size="xs" />
        ))}
      </div>

      {/* Open melds */}
      {seatState.openMelds.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {seatState.openMelds.map((meld, i) => (
            <div key={i} className="flex gap-px">
              {meld.tiles.map((tile, j) => (
                <MahjongTile2D key={j} tile={tile as TileType} size="xs" />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Combined discard pool ─────────────────────────────────────────────────────

function CombinedDiscardPool({
  state,
  claimedDiscardIndices,
}: {
  state: GameState;
  claimedDiscardIndices: OmniscientReplayStep['claimedDiscardIndices'];
}) {
  const { t } = useI18n();

  const allDiscards = ([0, 1, 2, 3] as const).flatMap((seat) =>
    state.seats[seat].discards
      .filter((_, idx) => !claimedDiscardIndices[seat].has(idx))
      .map((tile) => tile as TileType),
  );

  if (allDiscards.length === 0) return null;

  return (
    <div className="px-3 pb-3">
      <p className="text-[8px] font-bold tracking-widest uppercase text-mj-bone/25 mb-1">
        {t('replayDiscardPool')}
      </p>
      <div className="flex flex-wrap gap-px">
        {allDiscards.map((tile, n) => (
          <MahjongTile2D key={n} tile={tile} size="xxs" />
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export interface OmniscientBoardProps {
  step: OmniscientReplayStep;
  /** Human-readable display names for each seat. */
  displayNames: [string, string, string, string];
  /** Optional banner rendered over the board (e.g. "Match Concluded"). */
  overlay?: React.ReactNode;
}

export function OmniscientBoard({ step, displayNames, overlay }: OmniscientBoardProps) {
  const { state, event, claimedDiscardIndices } = step;

  const activeSeat = event ? getSeatFromEvent(event) : null;

  return (
    <div className="rounded-2xl overflow-hidden relative border border-mj-ink/10 bg-mj-ink/5">
      <div className="p-2 space-y-1">
        {([0, 1, 2, 3] as const).map((seat) => (
          <SeatCard
            key={seat}
            seat={seat}
            state={state}
            event={event}
            isActive={activeSeat === seat}
            displayName={displayNames[seat]}
          />
        ))}
      </div>

      <CombinedDiscardPool state={state} claimedDiscardIndices={claimedDiscardIndices} />

      {/* Overlay (e.g. "Match Concluded") */}
      {overlay && (
        <div className="absolute inset-0 flex items-center justify-center bg-mj-ink/[82%] backdrop-blur-sm">
          {overlay}
        </div>
      )}
    </div>
  );
}
