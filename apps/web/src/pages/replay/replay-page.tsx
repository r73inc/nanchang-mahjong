/**
 * ReplayPage — step-by-step replay of a finished game.
 *
 * Route: /replay/:id
 *
 * Fetches the ReplayGamePayload from GET /replays/:id, pre-computes a
 * GameState timeline using replayHand() from the engine, then renders:
 *   - Summary header (result, date, players)
 *   - Final winning hand strip
 *   - Scrub bar + play/pause/speed transport
 *   - Per-seat discard pools at the current step
 *   - Scrollable move log
 *   - Share sheet (copies the replay URL)
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ScreenShell } from '../../components/ui/screen-shell';
import { MahjongTile2D } from '../../components/2d/MahjongTile2D';
import { useI18n } from '../../i18n';
import type { StringKey } from '../../i18n/strings';
import { useReplay } from '../../hooks/use-replay';
import { buildTimeline } from '../../lib/replay-engine';
import type { GameEvent, SeatWind, TileType } from '@nanchang/shared';

// ── Constants ─────────────────────────────────────────────────────────────────

const WIND_CHAR: Record<SeatWind, string> = { east: '東', south: '南', west: '西', north: '北' };
const WIND_COLOR: Record<SeatWind, string> = {
  east: '#c9a961',
  south: '#a36d3e',
  west: '#5a7d8c',
  north: '#7d4f4f',
};

const DATE_FORMAT_OPTS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

const PLAY_ICON = '▶';
const PAUSE_ICON = '❚❚';
const TIMES_SIGN = '×';
const HU_GLYPH = '胡';
const BRAND_NAME = 'NANCHANG MAHJONG';
const SHARE_GLYPH = '分享';

const ACTION_COLOR: Partial<Record<GameEvent['kind'], string>> = {
  discard: '#c9a961',
  pung: '#c9a961',
  kong_open: '#a36d3e',
  kong_concealed: '#a36d3e',
  kong_added: '#a36d3e',
  chow: '#5a7d8c',
  win: '#7fc299',
  concede: '#e88080',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSeat(event: GameEvent): 0 | 1 | 2 | 3 {
  return 'seat' in event ? (event as { seat: 0 | 1 | 2 | 3 }).seat : 0;
}

function eventLabel(kind: GameEvent['kind'], t: (key: StringKey) => string): string {
  const map: Partial<Record<GameEvent['kind'], string>> = {
    draw: t('replayEventDraw'),
    discard: t('replayEventDiscard'),
    pung: t('replayEventPung'),
    kong_open: t('replayEventKong'),
    kong_concealed: t('replayEventKong'),
    kong_added: t('replayEventKong'),
    chow: t('replayEventChow'),
    win: t('replayEventWin'),
    concede: t('replayEventConcede'),
    draw_game: t('replayEventDrawGame'),
    jing_indicator: '',
  };
  return map[kind] ?? kind;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold tracking-widest uppercase text-mj-bone/50 mb-2">
      {children as string}
    </p>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ReplayPage() {
  const { id: gameId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();

  const { data: payload, isLoading, isError } = useReplay(gameId ?? '');

  // Pre-compute timeline from payload
  const timeline = useMemo(() => (payload ? buildTimeline(payload) : []), [payload]);

  // Playback state
  const [stepIdx, setStepIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showShare, setShowShare] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // Reset to start when payload changes
  useEffect(() => {
    if (timeline.length > 0) setStepIdx(0);
  }, [timeline]);

  // Playback timer
  useEffect(() => {
    if (!playing) return;
    if (stepIdx >= timeline.length - 1) {
      setPlaying(false);
      return;
    }
    const tid = setTimeout(
      () => setStepIdx((i) => Math.min(i + 1, timeline.length - 1)),
      700 / speed,
    );
    return () => clearTimeout(tid);
  }, [playing, stepIdx, speed, timeline.length]);

  // Keep current move row in view
  useEffect(() => {
    if (!logRef.current) return;
    const row = logRef.current.querySelector<HTMLElement>(`[data-step="${stepIdx}"]`);
    if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [stepIdx]);

  const handleScrub = useCallback((n: number) => {
    setStepIdx(n);
    setPlaying(false);
  }, []);

  // ── Loading / error states ──────────────────────────────────────────────────

  if (isLoading) {
    return (
      <ScreenShell title={t('replayTitle')} onBack={() => navigate(-1)}>
        <div className="flex items-center justify-center h-64">
          <p className="text-sm text-mj-bone/50">{t('replayLoading')}</p>
        </div>
      </ScreenShell>
    );
  }

  if (isError || !payload || timeline.length === 0) {
    return (
      <ScreenShell title={t('replayTitle')} onBack={() => navigate(-1)}>
        <div className="flex items-center justify-center h-64">
          <p className="text-sm text-mj-bone/50">{t('replayNotFound')}</p>
        </div>
      </ScreenShell>
    );
  }

  const step = timeline[stepIdx];
  const { state } = step;
  const lastStep = timeline[timeline.length - 1];

  // Derive winner info from payload
  const winEvent = payload.hands
    .flatMap((h) => h.events)
    .find((e): e is Extract<GameEvent, { kind: 'win' }> => e.kind === 'win');
  const winnerSeat = winEvent?.seat;
  const winnerWind = winnerSeat !== undefined ? state.seats[winnerSeat].wind : null;

  // Final winning hand (from last state)
  const finalHand: TileType[] = [];
  const winningTile: TileType | null =
    winEvent && 'tile' in winEvent ? ((winEvent as { tile: TileType }).tile ?? null) : null;

  if (winnerSeat !== undefined) {
    const lastState = lastStep.state;
    const winnerSeatState = lastState.seats[winnerSeat];
    finalHand.push(...winnerSeatState.openMelds.flatMap((m) => m.tiles));
    finalHand.push(...winnerSeatState.hand);
    if (winningTile && !finalHand.includes(winningTile)) finalHand.push(winningTile);
  }

  const resultColor = payload.result === 'win' ? '#7fc299' : 'rgba(var(--felt-ink-rgb),0.6)';

  return (
    <ScreenShell title={t('replayTitle')} onBack={() => navigate(-1)}>
      <div className="px-4 pt-4 pb-10 space-y-4">
        {/* Summary header */}
        <div
          className="rounded-2xl p-4"
          style={{
            background: 'rgba(201,169,97,0.08)',
            border: '1px solid rgba(201,169,97,0.25)',
          }}
        >
          <div className="flex items-center gap-3">
            {winnerWind && (
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center font-serif text-lg font-bold text-white shrink-0"
                style={{ background: WIND_COLOR[winnerWind] }}
              >
                {WIND_CHAR[winnerWind]}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-mj-bone truncate">
                {payload.seatMap.length} {payload.result}
              </p>
              <p className="text-[11px] text-mj-bone/50 mt-0.5">
                {new Date(payload.endedAt).toLocaleString(undefined, DATE_FORMAT_OPTS)}
              </p>
            </div>
            <p className="font-mono text-sm font-bold" style={{ color: resultColor }}>
              {payload.finalScores.map((s) => (s >= 0 ? `+${s}` : String(s))).join(' / ')}
            </p>
          </div>
        </div>

        {/* Final winning hand strip */}
        {finalHand.length > 0 && (
          <div>
            <SectionLabel>{t('replayFinalHand')}</SectionLabel>
            <div
              className="rounded-xl p-3 overflow-x-auto"
              style={{
                background: 'rgba(var(--felt-ink-rgb),0.04)',
                border: '1px solid rgba(var(--felt-ink-rgb),0.08)',
              }}
            >
              <div className="flex gap-0.5 items-center min-w-fit">
                {finalHand.map((tile, n) => {
                  const isWin = tile === winningTile && n === finalHand.length - 1;
                  return (
                    <div
                      key={n}
                      className="relative"
                      style={
                        isWin
                          ? {
                              boxShadow: '0 0 0 2px #c9a961, 0 4px 10px rgba(201,169,97,0.4)',
                              borderRadius: 6,
                            }
                          : undefined
                      }
                    >
                      <MahjongTile2D tile={tile} size="sm" />
                    </div>
                  );
                })}
              </div>
              {winningTile && (
                <p className="text-[9px] font-bold tracking-widest text-mj-bone/40 uppercase mt-2 text-right font-mono">
                  {t('replayWinTileLabel')}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Playback controls */}
        <div>
          <SectionLabel>{t('replayPlayback')}</SectionLabel>
          <div
            className="rounded-xl p-3 space-y-3"
            style={{
              background: 'rgba(var(--felt-ink-rgb),0.04)',
              border: '1px solid rgba(var(--felt-ink-rgb),0.08)',
            }}
          >
            {/* Current step callout */}
            {step.event && (
              <div
                className="rounded-xl px-3 py-2 flex items-center gap-3"
                style={{
                  background: `${ACTION_COLOR[step.event.kind] ?? 'rgba(var(--felt-ink-rgb),0.1)'}18`,
                  border: `1px solid ${ACTION_COLOR[step.event.kind] ?? 'rgba(var(--felt-ink-rgb),0.15)'}55`,
                }}
              >
                <span
                  className="font-mono text-[10px] font-bold text-mj-bone/40 shrink-0"
                  aria-label={`step ${stepIdx + 1}`}
                >
                  {String(stepIdx + 1).padStart(2, '0')}/{timeline.length}
                </span>
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center font-serif text-xs font-bold text-white shrink-0"
                  style={{ background: WIND_COLOR[state.seats[getSeat(step.event)].wind] }}
                >
                  {WIND_CHAR[state.seats[getSeat(step.event)].wind]}
                </div>
                <span
                  className="text-xs font-bold flex-1"
                  style={{ color: ACTION_COLOR[step.event.kind] ?? '#f5efdf' }}
                >
                  {eventLabel(step.event.kind, t)}
                </span>
                {'tile' in step.event && step.event.tile && (
                  <MahjongTile2D tile={step.event.tile as TileType} size="xs" />
                )}
              </div>
            )}

            {/* Tick scrubber */}
            <div>
              <input
                type="range"
                min={0}
                max={timeline.length - 1}
                value={stepIdx}
                onChange={(e) => handleScrub(parseInt(e.target.value, 10))}
                className="w-full h-7"
                style={{ accentColor: '#c9a961' }}
                aria-label="replay scrubber"
              />
              {/* Tick markers for non-trivial moves */}
              <TickBar steps={timeline} idx={stepIdx} onPick={handleScrub} />
            </div>

            {/* Transport row */}
            <div className="flex items-center gap-2">
              <TransportBtn onClick={() => handleScrub(0)} label="⏮" />
              <TransportBtn onClick={() => handleScrub(Math.max(0, stepIdx - 1))} label="‹" />
              <TransportBtn
                onClick={() => setPlaying((p) => !p)}
                label={playing ? PAUSE_ICON : PLAY_ICON}
                primary
              />
              <TransportBtn
                onClick={() => handleScrub(Math.min(timeline.length - 1, stepIdx + 1))}
                label="›"
              />
              <TransportBtn onClick={() => handleScrub(timeline.length - 1)} label="⏭" />
              <div className="flex-1" />
              <button
                onClick={() => setSpeed((s) => (s >= 4 ? 1 : s * 2))}
                className="px-3 h-9 rounded-[10px] text-[11px] font-bold font-mono text-mj-bone/80"
                style={{
                  background: 'rgba(var(--felt-ink-rgb),0.06)',
                  border: '1px solid rgba(var(--felt-ink-rgb),0.12)',
                }}
                aria-label={`speed ${speed}x`}
              >
                {speed}
                {TIMES_SIGN}
              </button>
            </div>
          </div>
        </div>

        {/* Discard pools at this step */}
        <div>
          <SectionLabel>{t('replayDiscards')}</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {([0, 1, 2, 3] as const).map((seatN) => {
              const seatState = state.seats[seatN];
              return (
                <div
                  key={seatN}
                  className="rounded-xl p-2"
                  style={{
                    background: 'rgba(var(--felt-ink-rgb),0.03)',
                    border: '1px solid rgba(var(--felt-ink-rgb),0.07)',
                    minHeight: 76,
                  }}
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <div
                      className="w-5 h-5 rounded-md flex items-center justify-center font-serif text-[10px] font-bold text-white"
                      style={{ background: WIND_COLOR[seatState.wind] }}
                    >
                      {WIND_CHAR[seatState.wind]}
                    </div>
                    <span className="text-[10px] font-bold text-mj-bone/70">
                      {WIND_CHAR[seatState.wind]}
                    </span>
                    <span className="flex-1" />
                    <span className="font-mono text-[9px] text-mj-bone/40">
                      {seatState.discards.length}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-px">
                    {seatState.discards.slice(-10).map((tile, n) => (
                      <MahjongTile2D key={n} tile={tile} size="xs" />
                    ))}
                    {seatState.discards.length === 0 && (
                      <span className="text-[10px] text-mj-bone/30 px-1">—</span>
                    )}
                  </div>
                  {seatState.openMelds.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2 pt-1.5 border-t border-mj-bone/5">
                      {seatState.openMelds.map((meld, n) => (
                        <span
                          key={n}
                          className="text-[8px] font-bold px-1.5 py-0.5 rounded"
                          style={{
                            background: ACTION_COLOR[meld.kind as GameEvent['kind']] + '22',
                            color: ACTION_COLOR[meld.kind as GameEvent['kind']] ?? '#c9a961',
                          }}
                        >
                          {meld.kind.toUpperCase()}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Move log */}
        <div>
          <SectionLabel>{t('replayMoveLog')}</SectionLabel>
          <div
            ref={logRef}
            className="rounded-xl overflow-y-auto"
            style={{
              maxHeight: 260,
              border: '1px solid rgba(var(--felt-ink-rgb),0.08)',
              background: 'rgba(var(--felt-ink-rgb),0.02)',
            }}
          >
            {timeline.map((s, n) => {
              if (!s.event) return null; // skip initial deal state
              const past = n <= stepIdx;
              const isCurrent = n === stepIdx;
              const seatWind = s.state.seats[getSeat(s.event)].wind;
              const accentColor = ACTION_COLOR[s.event.kind] ?? 'rgba(var(--felt-ink-rgb),0.7)';
              return (
                <button
                  key={n}
                  data-step={n}
                  onClick={() => handleScrub(n)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left"
                  style={{
                    background: isCurrent ? 'rgba(201,169,97,0.12)' : 'transparent',
                    borderBottom: '1px solid rgba(var(--felt-ink-rgb),0.04)',
                    borderLeft: isCurrent ? '3px solid #c9a961' : '3px solid transparent',
                    color: past ? '#f5efdf' : 'rgba(var(--felt-ink-rgb),0.35)',
                  }}
                >
                  <span className="font-mono text-[9px] font-bold text-mj-bone/40 w-5 shrink-0">
                    {String(n).padStart(2, '0')}
                  </span>
                  <div
                    className="w-4 h-4 rounded shrink-0 flex items-center justify-center font-serif text-[9px] font-bold text-white"
                    style={{
                      background: WIND_COLOR[seatWind],
                      opacity: past ? 1 : 0.4,
                    }}
                  >
                    {WIND_CHAR[seatWind]}
                  </div>
                  <span className="flex-1 text-[11px] font-medium">
                    <span className="opacity-70">{WIND_CHAR[seatWind]}</span>
                    <span className="font-bold ml-1.5" style={{ color: accentColor }}>
                      {eventLabel(s.event.kind, t)}
                    </span>
                  </span>
                  {'tile' in s.event && s.event.tile && (
                    <span style={{ opacity: past ? 1 : 0.35 }}>
                      <MahjongTile2D tile={s.event.tile as TileType} size="xs" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Share button */}
        <button
          onClick={() => setShowShare(true)}
          className="w-full py-3.5 rounded-xl flex items-center justify-center gap-2 text-sm font-bold"
          style={{
            background: 'rgba(201,169,97,0.14)',
            border: '1px solid rgba(201,169,97,0.4)',
            color: '#c9a961',
          }}
        >
          <span className="font-serif text-base">{SHARE_GLYPH}</span>
          {t('replayShare')}
        </button>
      </div>

      {showShare && <ShareSheet gameId={gameId ?? ''} onClose={() => setShowShare(false)} />}
    </ScreenShell>
  );
}

// ── TickBar ───────────────────────────────────────────────────────────────────

function tickColor(kind: GameEvent['kind'], isPast: boolean): string {
  if (kind === 'win') return '#7fc299';
  if (
    kind === 'pung' ||
    kind === 'kong_open' ||
    kind === 'kong_concealed' ||
    kind === 'kong_added' ||
    kind === 'chow'
  )
    return '#c9a961';
  return isPast ? 'rgba(var(--felt-ink-rgb),0.45)' : 'rgba(var(--felt-ink-rgb),0.12)';
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
        const color = tickColor(s.event.kind, isPast);
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

// ── TransportBtn ──────────────────────────────────────────────────────────────

function TransportBtn({
  onClick,
  label,
  primary = false,
}: {
  onClick: () => void;
  label: string;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="h-9 rounded-[10px] flex items-center justify-center font-bold text-sm"
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

// ── ShareSheet ────────────────────────────────────────────────────────────────

function ShareSheet({ gameId, onClose }: { gameId: string; onClose: () => void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    const url = `${window.location.origin}/replay/${gameId}`;
    try {
      void navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, [gameId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(5,18,12,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-5 space-y-4"
        style={{
          background: 'rgba(20,46,38,0.98)',
          border: '1px solid rgba(201,169,97,0.4)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Minimal share card preview */}
        <div
          className="rounded-xl p-4 text-center space-y-1"
          style={{
            background: 'linear-gradient(160deg,#0d3b2e 0%,#061a14 100%)',
            border: '1px solid rgba(201,169,97,0.3)',
          }}
        >
          <p className="font-serif text-3xl text-mj-gold leading-none">{HU_GLYPH}</p>
          <p className="font-mono text-[9px] tracking-[3px] text-mj-bone/50 font-bold">
            {BRAND_NAME}
          </p>
          <p className="text-xs text-mj-bone/60 font-mono pt-1">{`/replay/${gameId}`}</p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={copy}
            className="py-3 rounded-xl font-bold text-sm"
            style={{
              background: 'linear-gradient(180deg,#c9a961 0%,#a88a45 100%)',
              color: '#1f2937',
              boxShadow: '0 4px 12px rgba(201,169,97,0.3)',
            }}
          >
            {copied ? t('replayCopied') : t('replayCopyLink')}
          </button>
          <button
            onClick={onClose}
            className="py-3 rounded-xl text-sm font-semibold text-mj-bone/70"
            style={{ border: '1px solid rgba(var(--felt-ink-rgb),0.15)' }}
          >
            {t('replayClose')}
          </button>
        </div>
      </div>
    </div>
  );
}
