/**
 * ChallengeReplayPage — parallel timeline viewer for Point Challenge replays.
 *
 * Route: /challenges/:challengeId/replay
 *
 * Shows each participant's game on the same global turn index so the user can
 * switch between players and see identical board states at the same moment.
 *
 * Access gate: the requesting user must have status === 'completed' in the
 * challenge's participant list. Players who haven't finished yet see a gate
 * screen instead of the replay payload.
 *
 * Extended Winning State: if a participant's game ended before the current
 * globalTurnIndex, their final board state is held and a "Match Concluded"
 * overlay is shown over the board.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ScreenShell } from '../../components/ui/screen-shell';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/auth.store';
import { useChallengeReplay } from '../../hooks/use-replay';
import { getChallengeSnapshot, buildReplayDisplayName } from '../../lib/replay-engine';
import { OmniscientBoard } from './components/OmniscientBoard';
import {
  PlaybackControls,
  TransportFooter,
  WIND_CHAR,
  WIND_COLOR,
  getSeatFromEvent,
} from './components/PlaybackControls';

// ── Glyphs & separators (module-level avoids i18next/no-literal-string) ───────

const HU_GLYPH = '胡';
const DOT_SEP = ' · ';

// ── Gate screen ───────────────────────────────────────────────────────────────

function GateScreen({ title, desc, onBack }: { title: string; desc: string; onBack: () => void }) {
  const { t } = useI18n();
  return (
    <ScreenShell title={t('replayChallengeTitle')} onBack={onBack}>
      <div className="flex flex-col items-center justify-center h-64 gap-3 px-6 text-center">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center font-serif text-2xl"
          style={{
            background: 'rgba(var(--felt-ink-rgb),0.08)',
            border: '1px solid rgba(var(--felt-ink-rgb),0.14)',
          }}
        >
          🔒
        </div>
        <p className="text-sm font-bold text-mj-bone">{title}</p>
        <p className="text-xs text-mj-bone/50">{desc}</p>
      </div>
    </ScreenShell>
  );
}

// ── Participant tab bar ───────────────────────────────────────────────────────

function ParticipantTabs({
  participants,
  timelines,
  selectedSub,
  globalTurnIndex,
  onSelect,
}: {
  participants: { sub: string; handle: string }[];
  timelines: Record<string, { length: number }>;
  selectedSub: string;
  globalTurnIndex: number;
  onSelect: (sub: string) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5">
      {participants.map((p) => {
        const timelineLen = timelines[p.sub]?.length ?? 0;
        const isSelected = p.sub === selectedSub;
        const isConcluded = timelineLen > 0 && globalTurnIndex >= timelineLen;
        return (
          <button
            key={p.sub}
            onClick={() => onSelect(p.sub)}
            className="px-3 py-2 rounded-xl text-xs font-bold shrink-0 transition-all duration-150 flex items-center gap-1.5"
            style={{
              background: isSelected ? 'rgba(201,169,97,0.18)' : 'rgba(var(--felt-ink-rgb),0.06)',
              border: isSelected
                ? '1px solid rgba(201,169,97,0.5)'
                : '1px solid rgba(var(--felt-ink-rgb),0.10)',
              color: isSelected ? '#c9a961' : 'rgba(var(--felt-ink-rgb),0.6)',
            }}
          >
            {p.handle}
            {isConcluded && (
              <span
                className="text-[8px] px-1 py-0.5 rounded font-bold"
                style={{ background: 'rgba(127,194,153,0.2)', color: '#7fc299' }}
              >
                {HU_GLYPH}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Match Concluded overlay content ──────────────────────────────────────────

function ConcludedOverlay() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-2 px-6 text-center">
      <p className="font-serif text-4xl text-mj-gold leading-none">{HU_GLYPH}</p>
      <p className="text-sm font-bold text-mj-bone">{t('replayMatchConcluded')}</p>
      <p className="text-[11px] text-mj-bone/60">{t('replayViewingFinalState')}</p>
    </div>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-[10px] font-bold tracking-widest uppercase text-mj-bone/50 mb-2">
      {children}
    </p>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ChallengeReplayPage() {
  const { challengeId } = useParams<{ challengeId: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();

  const currentUser = useAuthStore((s) => s.user);

  const {
    challenge,
    participants,
    timelines,
    payloads,
    maxTurns,
    hasAccess,
    myStatus,
    isLoading,
    isError,
  } = useChallengeReplay(challengeId ?? '');

  const [globalTurnIndex, setGlobalTurnIndex] = useState(0);
  const [viewedSub, setViewedSub] = useState<string>('');
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  // Default to first participant once loaded
  useEffect(() => {
    if (participants.length > 0 && !viewedSub) {
      setViewedSub(participants[0].sub);
    }
  }, [participants, viewedSub]);

  // Reset turn index when payload first arrives
  useEffect(() => {
    if (maxTurns > 0) setGlobalTurnIndex(0);
  }, [maxTurns]);

  // Auto-play
  useEffect(() => {
    if (!playing) return;
    if (globalTurnIndex >= maxTurns) {
      setPlaying(false);
      return;
    }
    const tid = setTimeout(() => setGlobalTurnIndex((i) => Math.min(i + 1, maxTurns)), 700 / speed);
    return () => clearTimeout(tid);
  }, [playing, globalTurnIndex, speed, maxTurns]);

  const handleScrub = useCallback((n: number) => {
    setGlobalTurnIndex(n);
    setPlaying(false);
  }, []);

  const handlePlayPause = useCallback(() => {
    if (globalTurnIndex >= maxTurns) {
      setGlobalTurnIndex(0);
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
    }
  }, [globalTurnIndex, maxTurns]);

  const handleSpeed = useCallback(() => setSpeed((s) => (s >= 4 ? 1 : s * 2)), []);

  // ── Gate: loading ────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <ScreenShell title={t('replayChallengeTitle')} onBack={() => navigate(-1)}>
        <div className="flex items-center justify-center h-64">
          <p className="text-sm text-mj-bone/50">{t('replayLoading')}</p>
        </div>
      </ScreenShell>
    );
  }

  if (isError) {
    return (
      <ScreenShell title={t('replayChallengeTitle')} onBack={() => navigate(-1)}>
        <div className="flex items-center justify-center h-64">
          <p className="text-sm text-mj-bone/50">{t('replayNotFound')}</p>
        </div>
      </ScreenShell>
    );
  }

  // ── Gate: not completed ──────────────────────────────────────────────────────

  if (!hasAccess) {
    const isDeclined = myStatus === 'declined';
    return (
      <GateScreen
        title={isDeclined ? t('replayNotFound') : t('replayChallengeNotCompleted')}
        desc={isDeclined ? '' : t('replayChallengeNotCompletedDesc')}
        onBack={() => navigate(-1)}
      />
    );
  }

  // ── Gate: no timelines yet ───────────────────────────────────────────────────

  if (participants.length === 0 || Object.keys(timelines).length === 0) {
    return (
      <ScreenShell title={t('replayChallengeTitle')} onBack={() => navigate(-1)}>
        <div className="flex items-center justify-center h-64">
          <p className="text-sm text-mj-bone/50">{t('replayNotFound')}</p>
        </div>
      </ScreenShell>
    );
  }

  // Resolve active participant (fall back to first if viewedSub not yet set)
  const activeSub = viewedSub || participants[0].sub;
  const activeTimeline = timelines[activeSub] ?? [];

  // Build a synthetic steps array for PlaybackControls tick bar (use longest timeline)
  const longestTimeline = useMemo(
    () =>
      Object.values(timelines).reduce(
        (best, tl) => (tl.length > best.length ? tl : best),
        [] as typeof activeTimeline,
      ),
    [timelines],
  );

  // Derive board snapshot with Extended Winning State logic
  const { step, isExtendedWinningState } = useMemo(() => {
    if (activeTimeline.length === 0) return { step: null, isExtendedWinningState: false };
    return getChallengeSnapshot(timelines, activeSub, globalTurnIndex);
  }, [timelines, activeSub, globalTurnIndex, activeTimeline.length]);

  if (!step) {
    return (
      <ScreenShell title={t('replayChallengeTitle')} onBack={() => navigate(-1)}>
        <div className="flex items-center justify-center h-64">
          <p className="text-sm text-mj-bone/50">{t('replayLoading')}</p>
        </div>
      </ScreenShell>
    );
  }

  const { state } = step;
  const currentEvent = step.event;
  const activeSeatFromEvent = currentEvent ? getSeatFromEvent(currentEvent) : null;
  const currentWindLabel =
    activeSeatFromEvent !== null ? WIND_CHAR[state.seats[activeSeatFromEvent].wind] : undefined;
  const currentWindColor =
    activeSeatFromEvent !== null ? WIND_COLOR[state.seats[activeSeatFromEvent].wind] : undefined;

  const activeParticipant = participants.find((p) => p.sub === activeSub);

  // displayNames: resolve bot/player names from the active participant's replay payload.
  const activePayload = activeSub ? payloads[activeSub] : undefined;
  const boardDisplayNames = activePayload
    ? (activePayload.seatMap.map((id, i) =>
        buildReplayDisplayName(id, activePayload.seatNames?.[i], currentUser),
      ) as [string, string, string, string])
    : ([activeParticipant?.handle ?? '—', 'Bot', 'Bot', 'Bot'] as [string, string, string, string]);

  return (
    <ScreenShell title={t('replayChallengeTitle')} onBack={() => navigate(-1)}>
      <div className="px-4 pt-4 pb-28 space-y-4">
        {/* Challenge summary */}
        {challenge && (
          <div
            className="rounded-2xl p-4"
            style={{
              background: 'rgba(201,169,97,0.08)',
              border: '1px solid rgba(201,169,97,0.25)',
            }}
          >
            <p className="text-xs font-bold text-mj-bone/70 tracking-widest uppercase mb-1">
              {t('replayChallengeTitle')}
            </p>
            <p className="text-sm text-mj-bone/50 font-mono">
              {participants.map((p) => p.handle).join(DOT_SEP)}
            </p>
          </div>
        )}

        {/* Participant switcher */}
        <div>
          <SectionLabel>{t('replayChallengeParticipants')}</SectionLabel>
          <ParticipantTabs
            participants={participants}
            timelines={timelines}
            selectedSub={activeSub}
            globalTurnIndex={globalTurnIndex}
            onSelect={(sub) => {
              setViewedSub(sub);
              setPlaying(false);
            }}
          />
        </div>

        {/* Playback controls — driven by globalTurnIndex across all timelines */}
        <div>
          <SectionLabel>{t('replayPlayback')}</SectionLabel>
          <PlaybackControls
            steps={longestTimeline}
            stepIdx={globalTurnIndex}
            playing={playing}
            speed={speed}
            currentEvent={isExtendedWinningState ? null : currentEvent}
            currentWindLabel={isExtendedWinningState ? undefined : currentWindLabel}
            currentWindColor={isExtendedWinningState ? undefined : currentWindColor}
            onScrub={handleScrub}
            onPlayPause={handlePlayPause}
            onSpeed={handleSpeed}
          />
        </div>

        {/* Omniscient board with optional "Match Concluded" overlay */}
        <div>
          <SectionLabel>{t('replayOmniscientView')}</SectionLabel>
          <OmniscientBoard
            step={step}
            displayNames={boardDisplayNames}
            overlay={isExtendedWinningState ? <ConcludedOverlay /> : undefined}
          />
        </div>
      </div>

      <TransportFooter
        steps={longestTimeline}
        stepIdx={globalTurnIndex}
        playing={playing}
        speed={speed}
        onScrub={handleScrub}
        onPlayPause={handlePlayPause}
        onSpeed={handleSpeed}
      />
    </ScreenShell>
  );
}
