/**
 * OmniscientBoard — four-seat compass layout with all hands face-up.
 *
 * Renders the full table state at a single OmniscientReplayStep:
 *   - All 4 hands shown face-up (no fog-of-war)
 *   - Open melds per seat
 *   - Discard pool with claimed tiles filtered out
 *   - Active-seat highlight when an action is in progress
 *
 * Seat-to-position mapping (matches standard table compass):
 *   Seat 0 → bottom  (South from viewer's perspective)
 *   Seat 1 → right
 *   Seat 2 → top
 *   Seat 3 → left
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
  ACTION_TEXT_CLASS,
  getSeatFromEvent,
} from './PlaybackControls';

// Events that carry a tile field — used to avoid `as object` casts
type EventWithTile = Extract<GameEvent, { tile: TileType }>;

// ── Wind badge ────────────────────────────────────────────────────────────────

function WindBadge({ wind, size = 'sm' }: { wind: SeatWind; size?: 'sm' | 'xs' }) {
  const dim = size === 'sm' ? 'w-7 h-7 text-sm' : 'w-5 h-5 text-[10px]';
  return (
    <div
      className={`${dim} ${WIND_BG_CLASS[wind]} rounded-lg flex items-center justify-center font-serif font-bold text-white shrink-0`}
    >
      {WIND_CHAR[wind]}
    </div>
  );
}

// ── Open melds strip ──────────────────────────────────────────────────────────

function OpenMeldsStrip({
  melds,
  tileSize,
}: {
  melds: GameState['seats'][number]['openMelds'];
  tileSize: 'xs' | 'xxs';
}) {
  if (melds.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {melds.map((meld, i) => (
        <div key={i} className="flex gap-px">
          {meld.tiles.map((tile, j) => (
            <MahjongTile2D key={j} tile={tile as TileType} size={tileSize} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Discard pool for one seat ─────────────────────────────────────────────────

function SeatDiscardPool({
  seat,
  state,
  claimedIndices,
  align,
}: {
  seat: 0 | 1 | 2 | 3;
  state: GameState;
  claimedIndices: ReadonlySet<number>;
  align: 'start' | 'end' | 'center';
}) {
  const seatState = state.seats[seat];
  const visibleDiscards = seatState.discards.filter((_, idx) => !claimedIndices.has(idx));

  return (
    <div className={`flex flex-col items-${align} gap-0.5`}>
      <div className="flex items-center gap-1">
        <WindBadge wind={seatState.wind} size="xs" />
        {claimedIndices.size > 0 && (
          <span className="font-mono text-[8px] text-mj-bone/30">-{claimedIndices.size}</span>
        )}
      </div>
      <div className={`flex flex-wrap gap-px justify-${align}`}>
        {visibleDiscards.map((tile, n) => (
          <MahjongTile2D key={n} tile={tile as TileType} size="xxs" />
        ))}
        {visibleDiscards.length === 0 && <span className="text-[9px] text-mj-bone/25">—</span>}
      </div>
    </div>
  );
}

// ── Hand strip ────────────────────────────────────────────────────────────────

function HandStrip({
  seat,
  state,
  tileSize,
  isActive,
}: {
  seat: 0 | 1 | 2 | 3;
  state: GameState;
  tileSize: 'sm' | 'xs' | 'xxs';
  isActive: boolean;
}) {
  const seatState = state.seats[seat];
  return (
    <div className="flex items-start gap-1.5">
      <WindBadge wind={seatState.wind} size={tileSize === 'sm' ? 'sm' : 'xs'} />
      <div>
        <div
          className={`flex flex-wrap gap-px transition-all duration-150${isActive ? ' drop-shadow-[0_0_6px_rgba(201,169,97,0.5)]' : ''}`}
        >
          {seatState.hand.map((tile, n) => (
            <MahjongTile2D key={n} tile={tile as TileType} size={tileSize} />
          ))}
        </div>
        <OpenMeldsStrip melds={seatState.openMelds} tileSize={tileSize === 'sm' ? 'xs' : 'xxs'} />
      </div>
    </div>
  );
}

// ── Central discard pool ──────────────────────────────────────────────────────

function CentralDiscardPool({
  state,
  claimedDiscardIndices,
}: {
  state: GameState;
  claimedDiscardIndices: OmniscientReplayStep['claimedDiscardIndices'];
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-xl p-2 h-full flex flex-col gap-1 min-w-[120px] border border-[rgba(var(--felt-ink-rgb),0.08)] bg-[rgba(var(--felt-ink-rgb),0.05)]">
      <p className="text-[8px] font-bold tracking-widest uppercase text-mj-bone/30 text-center">
        {t('replayDiscardPool')}
      </p>

      {/* Top: seat 2 discards */}
      <div className="flex justify-center">
        <SeatDiscardPool
          seat={2}
          state={state}
          claimedIndices={claimedDiscardIndices[2]}
          align="center"
        />
      </div>

      {/* Middle row: seat 3 (left) and seat 1 (right) */}
      <div className="flex justify-between gap-2 flex-1">
        <SeatDiscardPool
          seat={3}
          state={state}
          claimedIndices={claimedDiscardIndices[3]}
          align="start"
        />
        <SeatDiscardPool
          seat={1}
          state={state}
          claimedIndices={claimedDiscardIndices[1]}
          align="end"
        />
      </div>

      {/* Bottom: seat 0 discards */}
      <div className="flex justify-center">
        <SeatDiscardPool
          seat={0}
          state={state}
          claimedIndices={claimedDiscardIndices[0]}
          align="center"
        />
      </div>
    </div>
  );
}

// ── Seat highlight helper ─────────────────────────────────────────────────────

function seatHighlightClass(isActive: boolean, event: GameEvent | null): string {
  if (!isActive || !event) return 'border border-transparent';
  const bg = ACTION_BG_CLASS[event.kind] ?? 'bg-mj-gold/10';
  const border = ACTION_BORDER_CLASS[event.kind] ?? 'border-mj-gold/20';
  return `border ${bg} ${border}`;
}

// ── Main component ────────────────────────────────────────────────────────────

export interface OmniscientBoardProps {
  step: OmniscientReplayStep;
  seatMap: [string, string, string, string];
  /** Optional banner rendered over the board (e.g. "Match Concluded"). */
  overlay?: React.ReactNode;
}

export function OmniscientBoard({ step, seatMap, overlay }: OmniscientBoardProps) {
  const { t } = useI18n();
  const { state, event, claimedDiscardIndices } = step;

  const activeSeat = event ? getSeatFromEvent(event) : null;

  return (
    <div className="rounded-2xl overflow-hidden relative border border-[rgba(var(--felt-ink-rgb),0.10)] bg-[rgba(var(--felt-ink-rgb),0.03)]">
      {/* Active-action banner */}
      {event && (
        <div
          className={`px-3 py-1.5 flex items-center gap-2 border-b ${ACTION_BG_CLASS[event.kind] ?? 'bg-mj-gold/10'} ${ACTION_BORDER_CLASS[event.kind] ?? 'border-mj-gold/20'}`}
        >
          <div
            className={`w-5 h-5 rounded flex items-center justify-center font-serif text-[10px] font-bold text-white shrink-0 ${
              activeSeat !== null ? WIND_BG_CLASS[state.seats[activeSeat].wind] : 'bg-[#888]'
            }`}
          >
            {activeSeat !== null ? WIND_CHAR[state.seats[activeSeat].wind] : '?'}
          </div>
          <span
            className={`text-[11px] font-bold ${ACTION_TEXT_CLASS[event.kind] ?? 'text-mj-gold'}`}
          >
            {activeSeat !== null ? seatMap[activeSeat] : ''}
          </span>
          {'tile' in event && <MahjongTile2D tile={(event as EventWithTile).tile} size="xs" />}
        </div>
      )}

      <div className="p-2 space-y-2">
        {/* ── Top seat (seat 2) ──────────────────────────────────────────── */}
        <div className={`rounded-xl p-2 ${seatHighlightClass(activeSeat === 2, event)}`}>
          <p className="text-[8px] text-mj-bone/30 font-bold tracking-widest uppercase mb-1">
            {seatMap[2]}
          </p>
          <HandStrip seat={2} state={state} tileSize="xs" isActive={activeSeat === 2} />
        </div>

        {/* ── Middle row: side seats + discard pool ─────────────────────── */}
        <div className="flex gap-2 items-stretch">
          {/* Seat 3 — left */}
          <div
            className={`rounded-xl p-2 flex flex-col justify-center shrink-0 min-w-16 ${seatHighlightClass(activeSeat === 3, event)}`}
          >
            <p className="text-[8px] text-mj-bone/30 font-bold tracking-widest uppercase mb-1 truncate max-w-[60px]">
              {seatMap[3]}
            </p>
            <HandStrip seat={3} state={state} tileSize="xxs" isActive={activeSeat === 3} />
          </div>

          {/* Center discard pool */}
          <div className="flex-1">
            <CentralDiscardPool state={state} claimedDiscardIndices={claimedDiscardIndices} />
          </div>

          {/* Seat 1 — right */}
          <div
            className={`rounded-xl p-2 flex flex-col justify-center shrink-0 min-w-16 ${seatHighlightClass(activeSeat === 1, event)}`}
          >
            <p className="text-[8px] text-mj-bone/30 font-bold tracking-widest uppercase mb-1 truncate max-w-[60px]">
              {seatMap[1]}
            </p>
            <HandStrip seat={1} state={state} tileSize="xxs" isActive={activeSeat === 1} />
          </div>
        </div>

        {/* ── Bottom seat (seat 0) ───────────────────────────────────────── */}
        <div className={`rounded-xl p-2 ${seatHighlightClass(activeSeat === 0, event)}`}>
          <p className="text-[8px] text-mj-bone/30 font-bold tracking-widest uppercase mb-1">
            {seatMap[0]}
          </p>
          <HandStrip seat={0} state={state} tileSize="sm" isActive={activeSeat === 0} />
        </div>
      </div>

      {/* Jing indicator strip */}
      {state.jingPrimary && (
        <div className="px-3 py-1.5 flex items-center gap-2 border-t border-[rgba(var(--felt-ink-rgb),0.08)]">
          <span className="text-[9px] font-bold tracking-widest uppercase text-mj-bone/30">
            {t('replayJingIndicator')}
          </span>
          <MahjongTile2D tile={state.jingPrimary as TileType} size="xxs" isJing />
          {state.jingSecondary && (
            <MahjongTile2D tile={state.jingSecondary as TileType} size="xxs" isJing />
          )}
        </div>
      )}

      {/* Overlay (e.g. "Match Concluded") */}
      {overlay && (
        <div className="absolute inset-0 flex items-center justify-center bg-[rgba(var(--felt-ink-rgb),0.82)] backdrop-blur-sm">
          {overlay}
        </div>
      )}
    </div>
  );
}
