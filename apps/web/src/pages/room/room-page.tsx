/**
 * RoomPage — the waiting room (seat list, ready toggle, host controls).
 *
 * Driven entirely by the room store, which is kept in sync with the server
 * via `useRoomSubscription`. REST mutations (ready, start, kick, leave) are
 * made through `useRoomActions`.
 */

import { useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ScreenShell } from '../../components/ui/screen-shell';
import { useI18n } from '../../i18n';
import { useRoomStore } from '../../stores/room.store';
import { useRoomActions, useRoomSubscription } from '../../hooks/use-room';
import { useAuthStore } from '../../stores/auth.store';
import { Spinner } from '../../components/ui/spinner';
import type { WsRoomStartedPayload } from '@nanchang/shared';

// Wind symbols in seat-index order (East/South/West/North)
const WIND_SYMBOLS = ['東', '南', '西', '北'];

// API values for the view-mode toggle — not i18n strings
const VIEW_MODES = ['3D', '2D'] as const;
type ViewMode = (typeof VIEW_MODES)[number];

// API values for the rounds toggle
const ROUNDS_OPTIONS = ['east', 'east+south'] as const;
type RoundsOption = (typeof ROUNDS_OPTIONS)[number];

// API values for the termination-type toggle
const TERMINATION_OPTIONS = ['rounds', 'bust'] as const;
type TerminationOption = (typeof TERMINATION_OPTIONS)[number];

// Claim window options in seconds (0 = unlimited)
const CLAIM_WINDOW_OPTIONS = [5, 8, 15, 30, 0] as const;
type ClaimWindowOption = (typeof CLAIM_WINDOW_OPTIONS)[number];

export function RoomPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();

  const room = useRoomStore((s) => s.room);
  const loading = useRoomStore((s) => s.loading);
  const error = useRoomStore((s) => s.error);
  const { clearRoom } = useRoomStore();

  const { getRoomByCode, leaveRoom, setReady, kickSeat, startGame, updateSettings } =
    useRoomActions();
  const user = useAuthStore((s) => s.user);

  // Fetch room on mount (in case of hard-refresh or direct navigation).
  // getRoomByCode is stable (useCallback), so including it is safe.
  useEffect(() => {
    if (code && !room) {
      void getRoomByCode(code);
    }
  }, [code, getRoomByCode, room]);

  // Handle game start
  const handleStarted = useCallback(
    (payload: WsRoomStartedPayload) => {
      navigate(`/game/${payload.gameId}`);
    },
    [navigate],
  );

  // Subscribe to real-time room updates
  useRoomSubscription(room?.roomId, handleStarted);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearRoom();
    };
  }, [clearRoom]);

  async function handleLeave() {
    if (room) {
      await leaveRoom(room.roomId);
    }
    clearRoom();
    navigate('/home');
  }

  async function handleReady() {
    if (!room || !user) return;
    const mySeat = room.seats.find((s) => s.userId === user.sub);
    if (!mySeat) return;
    await setReady(room.roomId, !mySeat.ready);
  }

  async function handleStart() {
    if (!room) return;
    const result = await startGame(room.roomId);
    if (result) {
      navigate(`/game/${result.gameId}`);
    }
  }

  async function handleKick(seatIdx: number) {
    if (!room) return;
    await kickSeat(room.roomId, seatIdx);
  }

  async function handleCopy() {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
    } catch {
      // Clipboard API not available in all browsers/contexts
    }
  }

  if (loading && !room) {
    return (
      <ScreenShell title={t('privateRoom')} onBack={handleLeave}>
        <div className="flex justify-center items-center h-40">
          <Spinner />
        </div>
      </ScreenShell>
    );
  }

  if (error && !room) {
    return (
      <ScreenShell title={t('privateRoom')} onBack={() => navigate('/home')}>
        <div className="px-4 py-8 text-center">
          <p className="text-mj-loss-light text-sm">{error}</p>
          <button
            onClick={() => navigate('/home')}
            className="mt-4 px-6 py-3 rounded-xl text-sm font-semibold text-mj-bone"
            style={{
              background: 'rgba(var(--felt-ink-rgb),0.08)',
              border: '1px solid rgba(var(--felt-ink-rgb),0.15)',
            }}
          >
            {t('back')}
          </button>
        </div>
      </ScreenShell>
    );
  }

  if (!room) return null;

  const myUserId = user?.sub;
  const isHost = myUserId === room.hostUserId;
  const mySeat = room.seats.find((s) => s.userId === myUserId);
  const filledSeats = room.seats.filter((s) => s.userId !== null);
  // Host and bots are implicitly ready — host confirms by clicking Start.
  const allReady =
    filledSeats.length === 4 && filledSeats.every((s) => s.isHost || s.isBot || s.ready);

  return (
    <ScreenShell title={t('privateRoom')} onBack={handleLeave}>
      <div className="px-4 py-4 flex flex-col gap-4">
        {/* Error banner */}
        {error && (
          <div
            className="px-4 py-3 rounded-xl text-sm font-semibold text-mj-loss-light"
            style={{ background: 'rgba(192,57,43,0.12)', border: '1px solid rgba(192,57,43,0.4)' }}
          >
            {error}
          </div>
        )}

        {/* Room code card */}
        <div
          className="rounded-2xl p-5 text-center"
          style={{ background: 'rgba(201,169,97,0.1)', border: '1px solid rgba(201,169,97,0.4)' }}
        >
          <p className="text-[11px] font-semibold tracking-widest text-mj-bone/70 mb-1.5">
            {t('roomCode')}
          </p>
          <p
            className="text-[32px] font-bold tracking-[6px] text-mj-gold font-mono"
            aria-label={`${t('roomCode')}: ${room.code}`}
          >
            {room.code}
          </p>
          <div className="flex gap-2 mt-3 justify-center">
            <button
              onClick={handleCopy}
              className="px-4 py-1.5 rounded-full text-xs font-semibold text-mj-gold"
              style={{
                background: 'rgba(201,169,97,0.18)',
                border: '1px solid rgba(201,169,97,0.4)',
              }}
            >
              {t('copy')}
            </button>
          </div>
        </div>

        {/* Waiting spinner when only 1 player */}
        {filledSeats.length === 1 && (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-[14px]"
            style={{
              background: 'rgba(var(--felt-ink-rgb),0.06)',
              border: '1px dashed rgba(201,169,97,0.35)',
            }}
          >
            <Spinner size={14} />
            <div>
              <p className="text-sm font-bold text-mj-bone">{t('waitingForPlayers')}</p>
              <p className="text-[11px] text-mj-bone/60">{t('shareCodeHint')}</p>
            </div>
          </div>
        )}

        {/* Seat list */}
        <div>
          <p className="text-[11px] font-semibold tracking-wider text-mj-bone/65 mb-2">
            {t('playersCountLabel', String(filledSeats.length))}
          </p>
          <div className="flex flex-col gap-2">
            {room.seats.map((seat) => {
              const isMe = seat.userId === myUserId;
              const isEmpty = seat.userId === null;

              return (
                <div
                  key={seat.seatIdx}
                  className="flex items-center gap-3 px-3.5 py-3 rounded-[14px]"
                  style={{
                    background: isEmpty
                      ? 'rgba(var(--felt-ink-rgb),0.02)'
                      : 'rgba(var(--felt-ink-rgb),0.06)',
                    border: isMe
                      ? '1px solid rgba(201,169,97,0.5)'
                      : '1px solid rgba(var(--felt-ink-rgb),0.1)',
                  }}
                >
                  {/* Wind badge */}
                  <div
                    className="w-9 h-9 rounded-[10px] flex items-center justify-center font-serif text-lg font-bold flex-shrink-0"
                    style={{
                      background: isEmpty
                        ? 'rgba(var(--felt-ink-rgb),0.04)'
                        : 'rgba(201,169,97,0.2)',
                      border: isEmpty
                        ? '1px dashed rgba(var(--felt-ink-rgb),0.15)'
                        : '1px solid rgba(201,169,97,0.4)',
                      color: isEmpty ? 'rgba(var(--felt-ink-rgb),0.3)' : '#c9a961',
                    }}
                    aria-hidden="true"
                  >
                    {WIND_SYMBOLS[seat.seatIdx]}
                  </div>

                  {/* Name / status */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-semibold text-mj-bone truncate">
                        {isEmpty
                          ? t('waiting')
                          : [
                              seat.displayName,
                              isMe && t('youSuffix'),
                              seat.isHost && t('hostBadge'),
                            ]
                              .filter(Boolean)
                              .join(' ')}
                      </p>
                      {/* Bot chip */}
                      {seat.isBot && (
                        <span
                          className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider flex-shrink-0"
                          style={{
                            background: 'rgba(90,125,140,0.2)',
                            border: '1px solid rgba(90,125,140,0.5)',
                            color: '#7ab5cc',
                          }}
                        >
                          {t('botBadge')}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-mj-bone/60">
                      {isEmpty
                        ? t('openSeat')
                        : seat.isBot
                          ? t(
                              seat.botDifficulty === 'normal'
                                ? 'botDifficultyNormalFull'
                                : 'botDifficultyEasyFull',
                            )
                          : seat.isHost || seat.ready
                            ? t('ready')
                            : t('notReady')}
                    </p>
                  </div>

                  {/* Ready badge — host and bots are always shown as ready */}
                  {!isEmpty && (seat.isHost || seat.isBot || seat.ready) && (
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider"
                      style={{
                        background: seat.isBot ? 'rgba(90,125,140,0.2)' : 'rgba(31,122,77,0.2)',
                        border: seat.isBot
                          ? '1px solid rgba(90,125,140,0.5)'
                          : '1px solid rgba(31,122,77,0.5)',
                        color: seat.isBot ? '#7ab5cc' : '#7fc299',
                      }}
                    >
                      {t('ready').toUpperCase()}
                    </span>
                  )}

                  {/* Host kick button — bots can be kicked like any seat */}
                  {isHost && !isEmpty && !isMe && room.status === 'waiting' && (
                    <button
                      onClick={() => handleKick(seat.seatIdx)}
                      className="text-[10px] text-mj-loss-light font-semibold px-2 py-0.5 rounded-lg"
                      style={{ background: 'rgba(192,57,43,0.12)' }}
                      aria-label={`Kick ${seat.displayName ?? ''}`}
                    >
                      {t('kickPlayerBtn')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Settings */}
        <div>
          <p className="text-[11px] font-semibold tracking-wider text-mj-bone/65 mb-2">
            {t('roundSettings')}
          </p>
          <div
            className="rounded-[14px] overflow-hidden"
            style={{
              background: 'rgba(var(--felt-ink-rgb),0.04)',
              border: '1px solid rgba(var(--felt-ink-rgb),0.1)',
            }}
          >
            {[
              { label: t('settingStyleLabel'), value: t('settingStyle') },
              { label: t('settingJingLabel'), value: t('settingJingValue') },
              {
                label: t('settingTimerLabel'),
                value: t('settingTimerValue', String(room.settings.timerSecs)),
              },
              {
                label: t('settingMinFanLabel'),
                value: t('settingMinFanValue', String(room.settings.minFan)),
              },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="flex justify-between items-center px-4 py-3 border-b last:border-b-0 text-sm"
                style={{ borderColor: 'rgba(var(--felt-ink-rgb),0.07)' }}
              >
                <span className="text-mj-bone/70">{label}</span>
                <span className="text-mj-gold font-semibold">{value}</span>
              </div>
            ))}

            {/* View mode row — interactive toggle for host, read-only label for others */}
            <div className="flex justify-between items-center px-4 py-3 text-sm">
              <span className="text-mj-bone/70">{t('settingViewModeLabel')}</span>
              {isHost && room.status === 'waiting' ? (
                <div className="flex gap-1.5" role="group" aria-label={t('settingViewModeLabel')}>
                  {VIEW_MODES.map((mode: ViewMode) => {
                    const active = room.settings.viewMode === mode;
                    return (
                      <button
                        key={mode}
                        onClick={() => updateSettings(room.roomId, { viewMode: mode })}
                        disabled={loading}
                        className="px-3 py-1 rounded-full text-xs font-bold transition-colors"
                        style={{
                          background: active
                            ? 'rgba(201,169,97,0.25)'
                            : 'rgba(var(--felt-ink-rgb),0.06)',
                          border: active
                            ? '1px solid rgba(201,169,97,0.6)'
                            : '1px solid rgba(var(--felt-ink-rgb),0.12)',
                          color: active ? '#c9a961' : 'rgba(var(--felt-ink-rgb),0.45)',
                          cursor: loading ? 'not-allowed' : 'pointer',
                        }}
                        aria-pressed={active}
                      >
                        {t(mode === '3D' ? 'settingViewMode3d' : 'settingViewMode2d')}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <span className="text-mj-gold font-semibold">
                  {t(room.settings.viewMode === '3D' ? 'settingViewMode3d' : 'settingViewMode2d')}
                </span>
              )}
            </div>

            {/* Rounds row — interactive toggle for host, read-only label for others */}
            <div
              className="flex justify-between items-center px-4 py-3 text-sm"
              style={{ borderTop: '1px solid rgba(var(--felt-ink-rgb),0.07)' }}
            >
              <span className="text-mj-bone/70">{t('settingRoundsLabel')}</span>
              {isHost && room.status === 'waiting' ? (
                <div className="flex gap-1.5" role="group" aria-label={t('settingRoundsLabel')}>
                  {ROUNDS_OPTIONS.map((opt: RoundsOption) => {
                    const active = room.settings.rounds === opt;
                    return (
                      <button
                        key={opt}
                        onClick={() => updateSettings(room.roomId, { rounds: opt })}
                        disabled={loading}
                        className="px-3 py-1 rounded-full text-xs font-bold transition-colors"
                        style={{
                          background: active
                            ? 'rgba(201,169,97,0.25)'
                            : 'rgba(var(--felt-ink-rgb),0.06)',
                          border: active
                            ? '1px solid rgba(201,169,97,0.6)'
                            : '1px solid rgba(var(--felt-ink-rgb),0.12)',
                          color: active ? '#c9a961' : 'rgba(var(--felt-ink-rgb),0.45)',
                          cursor: loading ? 'not-allowed' : 'pointer',
                        }}
                        aria-pressed={active}
                      >
                        {t(opt === 'east+south' ? 'settingRoundsEastSouth' : 'settingRoundsEast')}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <span className="text-mj-gold font-semibold">
                  {t(
                    room.settings.rounds === 'east+south'
                      ? 'settingRoundsEastSouth'
                      : 'settingRoundsEast',
                  )}
                </span>
              )}
            </div>

            {/* Termination type row — interactive toggle for host, read-only label for others */}
            <div
              className="flex justify-between items-center px-4 py-3 text-sm"
              style={{ borderTop: '1px solid rgba(var(--felt-ink-rgb),0.07)' }}
            >
              <span className="text-mj-bone/70">{t('settingTerminationLabel')}</span>
              {isHost && room.status === 'waiting' ? (
                <div
                  className="flex gap-1.5"
                  role="group"
                  aria-label={t('settingTerminationLabel')}
                >
                  {TERMINATION_OPTIONS.map((opt: TerminationOption) => {
                    const active = room.settings.terminationType === opt;
                    return (
                      <button
                        key={opt}
                        onClick={() => updateSettings(room.roomId, { terminationType: opt })}
                        disabled={loading}
                        className="px-3 py-1 rounded-full text-xs font-bold transition-colors"
                        style={{
                          background: active
                            ? 'rgba(201,169,97,0.25)'
                            : 'rgba(var(--felt-ink-rgb),0.06)',
                          border: active
                            ? '1px solid rgba(201,169,97,0.6)'
                            : '1px solid rgba(var(--felt-ink-rgb),0.12)',
                          color: active ? '#c9a961' : 'rgba(var(--felt-ink-rgb),0.45)',
                          cursor: loading ? 'not-allowed' : 'pointer',
                        }}
                        aria-pressed={active}
                      >
                        {t(opt === 'bust' ? 'settingTerminationBust' : 'settingTerminationRounds')}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <span className="text-mj-gold font-semibold">
                  {t(
                    room.settings.terminationType === 'bust'
                      ? 'settingTerminationBust'
                      : 'settingTerminationRounds',
                  )}
                </span>
              )}
            </div>

            {/* Claim window row */}
            <div
              className="flex justify-between items-center px-4 py-3 text-sm"
              style={{ borderTop: '1px solid rgba(var(--felt-ink-rgb),0.07)' }}
            >
              <span className="text-mj-bone/70">{t('settingClaimWindowLabel')}</span>
              {isHost && room.status === 'waiting' ? (
                <div
                  className="flex gap-1.5"
                  role="group"
                  aria-label={t('settingClaimWindowLabel')}
                >
                  {CLAIM_WINDOW_OPTIONS.map((opt: ClaimWindowOption) => {
                    const active = (room.settings.claimWindowSecs ?? 8) === opt;
                    const labelKey =
                      opt === 0
                        ? 'settingClaimWindowInfinite'
                        : opt === 5
                          ? 'settingClaimWindow5'
                          : opt === 8
                            ? 'settingClaimWindow8'
                            : opt === 15
                              ? 'settingClaimWindow15'
                              : 'settingClaimWindow30';
                    return (
                      <button
                        key={opt}
                        onClick={() => updateSettings(room.roomId, { claimWindowSecs: opt })}
                        disabled={loading}
                        className="px-3 py-1 rounded-full text-xs font-bold transition-colors"
                        style={{
                          background: active
                            ? 'rgba(201,169,97,0.25)'
                            : 'rgba(var(--felt-ink-rgb),0.06)',
                          border: active
                            ? '1px solid rgba(201,169,97,0.6)'
                            : '1px solid rgba(var(--felt-ink-rgb),0.12)',
                          color: active ? '#c9a961' : 'rgba(var(--felt-ink-rgb),0.45)',
                          cursor: loading ? 'not-allowed' : 'pointer',
                        }}
                        aria-pressed={active}
                      >
                        {t(labelKey)}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <span className="text-mj-gold font-semibold">
                  {t(
                    (room.settings.claimWindowSecs ?? 8) === 0
                      ? 'settingClaimWindowInfinite'
                      : (room.settings.claimWindowSecs ?? 8) === 5
                        ? 'settingClaimWindow5'
                        : (room.settings.claimWindowSecs ?? 8) === 15
                          ? 'settingClaimWindow15'
                          : (room.settings.claimWindowSecs ?? 8) === 30
                            ? 'settingClaimWindow30'
                            : 'settingClaimWindow8',
                  )}
                </span>
              )}
            </div>

            {/* Opening Spirit Flip toggle */}
            <div
              className="flex justify-between items-center px-4 py-3 text-sm"
              style={{ borderTop: '1px solid rgba(var(--felt-ink-rgb),0.07)' }}
            >
              <span className="text-mj-bone/70">{t('settingTopBottomJingLabel')}</span>
              {isHost && room.status === 'waiting' ? (
                <button
                  onClick={() =>
                    updateSettings(room.roomId, {
                      ruleTopBottomJing: !room.settings.ruleTopBottomJing,
                    })
                  }
                  disabled={loading}
                  aria-pressed={room.settings.ruleTopBottomJing}
                  className="px-3 py-1 rounded-full text-xs font-bold transition-colors"
                  style={{
                    background: room.settings.ruleTopBottomJing
                      ? 'rgba(201,169,97,0.25)'
                      : 'rgba(var(--felt-ink-rgb),0.06)',
                    border: room.settings.ruleTopBottomJing
                      ? '1px solid rgba(201,169,97,0.6)'
                      : '1px solid rgba(var(--felt-ink-rgb),0.12)',
                    color: room.settings.ruleTopBottomJing
                      ? '#c9a961'
                      : 'rgba(var(--felt-ink-rgb),0.45)',
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {t(
                    room.settings.ruleTopBottomJing
                      ? 'settingTopBottomJingOn'
                      : 'settingTopBottomJingOff',
                  )}
                </button>
              ) : (
                <span className="text-mj-gold font-semibold">
                  {t(
                    room.settings.ruleTopBottomJing
                      ? 'settingTopBottomJingOn'
                      : 'settingTopBottomJingOff',
                  )}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Ready toggle (non-host) */}
        {!isHost && mySeat && room.status === 'waiting' && (
          <button
            onClick={handleReady}
            disabled={loading}
            className="w-full py-4 rounded-[14px] font-bold text-sm"
            style={{
              background: mySeat.ready ? 'rgba(31,122,77,0.2)' : 'rgba(201,169,97,0.15)',
              border: mySeat.ready
                ? '1px solid rgba(31,122,77,0.5)'
                : '1px solid rgba(201,169,97,0.4)',
              color: mySeat.ready ? '#7fc299' : '#c9a961',
            }}
          >
            {mySeat.ready ? '✓ ' + t('ready') : t('notReady') + ' — ' + t('ready') + '?'}
          </button>
        )}

        {/* Start button (host only) */}
        {isHost && room.status === 'waiting' && (
          <button
            onClick={handleStart}
            disabled={!allReady || loading}
            className="w-full py-4 rounded-[14px] font-bold text-sm"
            style={{
              background: allReady
                ? 'linear-gradient(180deg,#c9a961 0%,#a88a45 100%)'
                : 'rgba(var(--felt-ink-rgb),0.07)',
              color: allReady ? '#1f2937' : 'rgba(var(--felt-ink-rgb),0.4)',
              border: allReady ? 'none' : '1px solid rgba(var(--felt-ink-rgb),0.1)',
              boxShadow: allReady ? '0 6px 18px rgba(201,169,97,0.3)' : 'none',
              cursor: allReady ? 'pointer' : 'not-allowed',
            }}
            aria-disabled={!allReady}
          >
            {allReady
              ? t('startMatch')
              : `${t('waiting')} ${filledSeats.filter((s) => !s.isHost && !s.isBot && !s.ready).length} ${t('notReady').toLowerCase()}`}
          </button>
        )}
      </div>
    </ScreenShell>
  );
}
