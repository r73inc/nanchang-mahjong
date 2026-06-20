/**
 * PlaybackControls — scrubber, transport buttons, speed, and step callout.
 * Shared between General and Challenge replay views.
 */

import { useCallback } from 'react';
import { MahjongTile2D } from '../../../components/2d/MahjongTile2D';
import { useI18n } from '../../../i18n';
import type { StringKey } from '../../../i18n/strings';
import type { GameEvent, SeatWind, TileType } from '@nanchang/shared';

// ── UI glyphs (module-level constants avoid i18next/no-literal-string) ────────

const PLAY_ICON = '▶';
const PAUSE_ICON = '❚❚';
const TIMES_SIGN = '×';
const TICK_COLOR_WIN = '#7fc299';
const TICK_COLOR_CLAIM = '#c9a961';

// ── Constants shared with parent views ────────────────────────────────────────

export const WIND_CHAR: Record<SeatWind, string> = {
  east: '東',
  south: '南',
  west: '西',
  north: '北',
};

export const WIND_COLOR: Record<SeatWind, string> = {
  east: '#c9a961',
  south: '#a36d3e',
  west: '#5a7d8c',
  north: '#7d4f4f',
};

export const ACTION_COLOR: Partial<Record<GameEvent['kind'], string>> = {
  discard: '#c9a961',
  pung: '#c9a961',
  kong_open: '#a36d3e',
  kong_concealed: '#a36d3e',
  kong_added: '#a36d3e',
  chow: '#5a7d8c',
  win: '#7fc299',
  concede: '#e88080',
};

// Tailwind class equivalents — all strings appear literally so JIT includes them.

export const WIND_BG_CLASS: Record<SeatWind, string> = {
  east: 'bg-mj-east',
  south: 'bg-mj-south',
  west: 'bg-mj-west',
  north: 'bg-mj-north',
};

export const ACTION_BG_CLASS: Partial<Record<GameEvent['kind'], string>> = {
  discard: 'bg-mj-gold/10',
  pung: 'bg-mj-gold/10',
  kong_open: 'bg-mj-south/10',
  kong_concealed: 'bg-mj-south/10',
  kong_added: 'bg-mj-south/10',
  chow: 'bg-mj-west/10',
  win: 'bg-mj-win/10',
  concede: 'bg-mj-loss-light/10',
};

export const ACTION_BORDER_CLASS: Partial<Record<GameEvent['kind'], string>> = {
  discard: 'border-mj-gold/20',
  pung: 'border-mj-gold/20',
  kong_open: 'border-mj-south/20',
  kong_concealed: 'border-mj-south/20',
  kong_added: 'border-mj-south/20',
  chow: 'border-mj-west/20',
  win: 'border-mj-win/20',
  concede: 'border-mj-loss-light/20',
};

export const ACTION_TEXT_CLASS: Partial<Record<GameEvent['kind'], string>> = {
  discard: 'text-mj-gold',
  pung: 'text-mj-gold',
  kong_open: 'text-mj-south',
  kong_concealed: 'text-mj-south',
  kong_added: 'text-mj-south',
  chow: 'text-mj-west',
  win: 'text-mj-win',
  concede: 'text-mj-loss-light',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getSeatFromEvent(event: GameEvent): 0 | 1 | 2 | 3 {
  return 'seat' in event ? (event as { seat: 0 | 1 | 2 | 3 }).seat : 0;
}

const EVENT_KEY_MAP: Partial<Record<GameEvent['kind'], StringKey>> = {
  draw: 'replayEventDraw',
  discard: 'replayEventDiscard',
  pung: 'replayEventPung',
  kong_open: 'replayEventKong',
  kong_concealed: 'replayEventKong',
  kong_added: 'replayEventKong',
  chow: 'replayEventChow',
  win: 'replayEventWin',
  concede: 'replayEventConcede',
  draw_game: 'replayEventDrawGame',
};

export function eventLabel(kind: GameEvent['kind'], t: (k: StringKey) => string): string {
  const key = EVENT_KEY_MAP[kind];
  return key ? t(key) : kind;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TransportBtn({
  onClick,
  label,
  primary = false,
  disabled = false,
}: {
  onClick: () => void;
  label: string;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-9 rounded-[10px] flex items-center justify-center font-bold text-sm disabled:opacity-40"
      style={{
        width: primary ? 48 : 40,
        background: primary ? '#c9a961' : 'rgba(var(--felt-ink-rgb),0.06)',
        border: `1px solid ${primary ? '#c9a961' : 'rgba(var(--felt-ink-rgb),0.12)'}`,
        color: primary ? '#1f2937' : '#f5efdf',
      }}
    >
      {label}
    </button>
  );
}

function TickBar({
  steps,
  idx,
  onPick,
}: {
  steps: { event: GameEvent | null }[];
  idx: number;
  onPick: (n: number) => void;
}) {
  return (
    <div className="relative h-3.5 flex items-center -mt-2">
      <div className="absolute inset-x-0 h-px bg-mj-bone/10" />
      {steps.map((s, n) => {
        if (!s.event) return null;
        const pct = steps.length > 1 ? (n / (steps.length - 1)) * 100 : 0;
        const isBig =
          s.event.kind !== 'draw' &&
          s.event.kind !== 'discard' &&
          s.event.kind !== 'jing_indicator';
        const isPast = n <= idx;
        const isCurrent = n === idx;
        let color: string;
        if (s.event.kind === 'win') color = TICK_COLOR_WIN;
        else if (isBig) color = TICK_COLOR_CLAIM;
        else color = isPast ? 'rgba(var(--felt-ink-rgb),0.45)' : 'rgba(var(--felt-ink-rgb),0.12)';
        return (
          <button
            key={n}
            onClick={() => onPick(n)}
            aria-label={`step ${n}`}
            className="absolute border-none p-0 cursor-pointer"
            style={{
              left: `${pct}%`,
              transform: 'translateX(-50%)',
              width: isBig ? 8 : 4,
              height: isBig ? 10 : 5,
              borderRadius: isBig ? 2 : 1,
              background: color,
              outline: isCurrent ? '2px solid #c9a961' : 'none',
              outlineOffset: 1,
            }}
          />
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export interface PlaybackControlsProps {
  steps: { event: GameEvent | null }[];
  stepIdx: number;
  playing: boolean;
  speed: number;
  currentEvent: GameEvent | null;
  currentWindLabel?: string;
  currentWindColor?: string;
  onScrub: (n: number) => void;
  onPlayPause: () => void;
  onSpeed: () => void;
}

export function PlaybackControls({
  steps,
  stepIdx,
  playing,
  speed,
  currentEvent,
  currentWindLabel,
  currentWindColor,
  onScrub,
  onPlayPause,
  onSpeed,
}: PlaybackControlsProps) {
  const { t } = useI18n();

  const handleScrub = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onScrub(parseInt(e.target.value, 10)),
    [onScrub],
  );

  const eventKind = currentEvent?.kind;
  const accentColor = eventKind
    ? (ACTION_COLOR[eventKind] ?? 'rgba(var(--felt-ink-rgb),0.7)')
    : undefined;

  return (
    <div
      className="rounded-xl p-3 space-y-3"
      style={{
        background: 'rgba(var(--felt-ink-rgb),0.04)',
        border: '1px solid rgba(var(--felt-ink-rgb),0.08)',
      }}
    >
      {/* Step callout */}
      {currentEvent && (
        <div
          className="rounded-xl px-3 py-2 flex items-center gap-3"
          style={{
            background: `${accentColor ?? 'rgba(var(--felt-ink-rgb),0.1)'}18`,
            border: `1px solid ${accentColor ?? 'rgba(var(--felt-ink-rgb),0.15)'}55`,
          }}
        >
          <span className="font-mono text-[10px] font-bold text-mj-bone/40 shrink-0">
            {String(stepIdx + 1).padStart(2, '0')}/{steps.length}
          </span>
          {currentWindLabel && currentWindColor && (
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center font-serif text-xs font-bold text-white shrink-0"
              style={{ background: currentWindColor }}
            >
              {currentWindLabel}
            </div>
          )}
          <span className="text-xs font-bold flex-1" style={{ color: accentColor ?? '#f5efdf' }}>
            {eventLabel(currentEvent.kind, t)}
          </span>
          {'tile' in currentEvent && currentEvent.tile && (
            <MahjongTile2D tile={currentEvent.tile as TileType} size="xs" />
          )}
        </div>
      )}

      {/* Scrubber */}
      <div>
        <input
          type="range"
          min={0}
          max={Math.max(0, steps.length - 1)}
          value={stepIdx}
          onChange={handleScrub}
          className="w-full h-7"
          style={{ accentColor: '#c9a961' }}
          aria-label={t('replayPlayback')}
        />
        <TickBar steps={steps} idx={stepIdx} onPick={onScrub} />
      </div>

      {/* Transport row */}
      <div className="flex items-center gap-2">
        <TransportBtn onClick={() => onScrub(0)} label="⏮" disabled={stepIdx === 0} />
        <TransportBtn
          onClick={() => onScrub(Math.max(0, stepIdx - 1))}
          label="‹"
          disabled={stepIdx === 0}
        />
        <TransportBtn onClick={onPlayPause} label={playing ? PAUSE_ICON : PLAY_ICON} primary />
        <TransportBtn
          onClick={() => onScrub(Math.min(steps.length - 1, stepIdx + 1))}
          label="›"
          disabled={stepIdx >= steps.length - 1}
        />
        <TransportBtn
          onClick={() => onScrub(steps.length - 1)}
          label="⏭"
          disabled={stepIdx >= steps.length - 1}
        />
        <div className="flex-1" />
        <button
          onClick={onSpeed}
          className="px-3 h-9 rounded-[10px] text-[11px] font-bold font-mono text-mj-bone/80"
          style={{
            background: 'rgba(var(--felt-ink-rgb),0.06)',
            border: '1px solid rgba(var(--felt-ink-rgb),0.12)',
          }}
        >
          {speed}
          {TIMES_SIGN}
        </button>
      </div>
    </div>
  );
}
