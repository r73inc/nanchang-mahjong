/**
 * ReplayPage — omniscient step-by-step replay of a finished game.
 *
 * Route: /replay/:id
 *
 * All four players' hands are shown face-up simultaneously (omniscient view).
 * The discard pool strips claimed tiles so the visual state reflects reality.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ScreenShell } from '../../components/ui/screen-shell';
import { MahjongTile2D } from '../../components/2d/MahjongTile2D';
import { useI18n } from '../../i18n';
import { useReplay } from '../../hooks/use-replay';
import { buildOmniscientTimeline, buildReplayDisplayName } from '../../lib/replay-engine';
import { useAuthStore } from '../../stores/auth.store';
import { OmniscientBoard } from './components/OmniscientBoard';
import {
  PlaybackControls,
  TransportFooter,
  WIND_CHAR,
  WIND_COLOR,
  getSeatFromEvent,
} from './components/PlaybackControls';
import { AiSummaryPanel } from '../../components/AiSummaryPanel';
import { useGameSummary, useRequestGameSummary } from '../../hooks/use-replay';
import type { GameEvent, TileType } from '@nanchang/shared';

// ── Glyphs & separators (module-level avoids i18next/no-literal-string) ───────

const HU_GLYPH = '胡';
const BRAND_NAME = 'NANCHANG MAHJONG';
const SHARE_GLYPH = '分享';
const DOT_SEP = ' · ';

// ── Helpers ───────────────────────────────────────────────────────────────────

const DATE_FORMAT_OPTS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-[10px] font-bold tracking-widest uppercase text-mj-bone/50 mb-2">
      {children}
    </p>
  );
}

// ── Share sheet ───────────────────────────────────────────────────────────────

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
      style={{ background: 'rgba(var(--felt-ink-rgb),0.82)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-5 space-y-4"
        style={{
          background: 'rgba(var(--felt-ink-rgb),0.98)',
          border: '1px solid rgba(201,169,97,0.4)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
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

// ── Page ──────────────────────────────────────────────────────────────────────

export function ReplayPage() {
  const { id: gameId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const currentUser = useAuthStore((s) => s.user);

  const { data: payload, isLoading, isError } = useReplay(gameId ?? '');
  const { data: summary, isLoading: summaryLoading } = useGameSummary(gameId ?? '');
  const requestSummary = useRequestGameSummary();

  const timeline = useMemo(() => (payload ? buildOmniscientTimeline(payload) : []), [payload]);

  const [stepIdx, setStepIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showShare, setShowShare] = useState(false);

  useEffect(() => {
    if (timeline.length > 0) setStepIdx(0);
  }, [timeline]);

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

  const handleScrub = useCallback((n: number) => {
    setStepIdx(n);
    setPlaying(false);
  }, []);

  const handlePlayPause = useCallback(() => {
    if (stepIdx >= timeline.length - 1) {
      setStepIdx(0);
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
    }
  }, [stepIdx, timeline.length]);

  const handleSpeed = useCallback(() => setSpeed((s) => (s >= 4 ? 1 : s * 2)), []);

  // ── Loading / error ──────────────────────────────────────────────────────────

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

  // Winner info
  const winEvent = payload.hands
    .flatMap((h) => h.events)
    .find((e): e is Extract<GameEvent, { kind: 'win' }> => e.kind === 'win');
  const winnerSeat = winEvent?.seat;
  const winnerWind = winnerSeat !== undefined ? lastStep.state.seats[winnerSeat].wind : null;

  // Jing tiles from the final state
  const jingPrimary = lastStep.state.jingPrimary as TileType | undefined;
  const jingSecondary = lastStep.state.jingSecondary as TileType | undefined;

  // Display names: bot IDs → "BotName · Difficulty"; human subs → handle or "Player"
  const displayNames = payload.seatMap.map((id, i) =>
    buildReplayDisplayName(id, payload.seatNames?.[i], currentUser),
  ) as [string, string, string, string];

  const resultColor = payload.result === 'win' ? '#7fc299' : 'rgba(var(--felt-ink-rgb),0.6)';

  // Playback control props
  const currentEvent = step.event;
  const activeSeat = currentEvent ? getSeatFromEvent(currentEvent) : null;
  const currentWindLabel =
    activeSeat !== null ? WIND_CHAR[state.seats[activeSeat].wind] : undefined;
  const currentWindColor =
    activeSeat !== null ? WIND_COLOR[state.seats[activeSeat].wind] : undefined;

  return (
    <ScreenShell title={t('replayTitle')} onBack={() => navigate(-1)}>
      <div className="px-4 pt-4 pb-28 space-y-4">
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
                {displayNames.join(DOT_SEP)}
              </p>
              <p className="text-[11px] text-mj-bone/50 mt-0.5">
                {new Date(payload.endedAt).toLocaleString(undefined, DATE_FORMAT_OPTS)}
              </p>
              <p className="text-[10px] text-mj-bone/40 mt-1 font-mono">
                <span className="font-bold tracking-widest uppercase mr-1.5">
                  {t('replayFinalScores')}
                </span>
                <span style={{ color: resultColor }}>
                  {payload.finalScores.map((s) => (s >= 0 ? `+${s}` : String(s))).join(' / ')}
                </span>
              </p>
            </div>
          </div>

          {/* Jing tiles */}
          {jingPrimary && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-mj-gold/20">
              <span className="text-[9px] font-bold tracking-widest uppercase text-mj-bone/40">
                {t('replayJingIndicator')}
              </span>
              <MahjongTile2D tile={jingPrimary} size="xs" isJing />
              {jingSecondary && <MahjongTile2D tile={jingSecondary} size="xs" isJing />}
            </div>
          )}
        </div>

        {/* AI commentary */}
        <AiSummaryPanel
          summary={summary}
          isLoading={summaryLoading}
          isRequesting={requestSummary.isPending}
          onRequest={() => void requestSummary.mutate(gameId ?? '')}
        />

        {/* Playback controls — step callout + scrubber only; transport is in fixed footer */}
        <div>
          <SectionLabel>{t('replayPlayback')}</SectionLabel>
          <PlaybackControls
            steps={timeline}
            stepIdx={stepIdx}
            playing={playing}
            speed={speed}
            currentEvent={currentEvent}
            currentWindLabel={currentWindLabel}
            currentWindColor={currentWindColor}
            onScrub={handleScrub}
            onPlayPause={handlePlayPause}
            onSpeed={handleSpeed}
          />
        </div>

        {/* Omniscient board */}
        <div>
          <SectionLabel>{t('replayOmniscientView')}</SectionLabel>
          <OmniscientBoard step={step} displayNames={displayNames} />
        </div>

        {/* Share */}
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

      <TransportFooter
        steps={timeline}
        stepIdx={stepIdx}
        playing={playing}
        speed={speed}
        onScrub={handleScrub}
        onPlayPause={handlePlayPause}
        onSpeed={handleSpeed}
      />
    </ScreenShell>
  );
}
