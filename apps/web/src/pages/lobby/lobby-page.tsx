/**
 * LobbyPage — the "Play with Friends" entry point.
 *
 * Two paths:
 *  • Create a new room → navigate to /room/:code
 *  • Enter a room code → navigate to /room/:code
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BotDifficulty } from '@nanchang/shared';

/** localStorage key shared with game-page.tsx */
const ACTIVE_GAME_KEY = 'mj:active-game';
const MINUS_GLYPH = '−' as const;
const PLUS_GLYPH = '+' as const;
import { ScreenShell } from '../../components/ui/screen-shell';
import { useI18n } from '../../i18n';
import { useRoomActions } from '../../hooks/use-room';
import { useRoomStore } from '../../stores/room.store';
import { connectSocket } from '../../lib/socket';
import { useAuthStore } from '../../stores/auth.store';

export function LobbyPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { createRoom, joinRoom } = useRoomActions();
  const loading = useRoomStore((s) => s.loading);
  const error = useRoomStore((s) => s.error);

  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [code, setCode] = useState('');

  // Bot config state
  const [botCount, setBotCount] = useState(0);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('easy');

  // Rejoin card — shown when a gameId was stored by game-page before navigating away.
  const [activeGameId, setActiveGameId] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_GAME_KEY),
  );

  function handleDismissRejoin() {
    localStorage.removeItem(ACTIVE_GAME_KEY);
    setActiveGameId(null);
  }

  const accessToken = useAuthStore((s) => s.accessToken);

  /** Ensure the socket is connected before navigating to the room screen. */
  function ensureSocket() {
    if (accessToken) {
      connectSocket(accessToken);
    }
  }

  async function handleCreate() {
    ensureSocket();
    const room = await createRoom(
      botCount > 0 ? { count: botCount, difficulty: botDifficulty } : undefined,
    );
    if (room) {
      navigate(`/room/${room.code}`);
    }
  }

  async function handleJoin() {
    if (!code.trim()) return;
    ensureSocket();
    const room = await joinRoom(code);
    if (room) {
      navigate(`/room/${room.code}`);
    }
  }

  return (
    <ScreenShell title={t('joinRoom')} onBack={() => navigate('/home')}>
      <div className="px-4 py-6 flex flex-col gap-6">
        {/* ── Rejoin in-progress game ─────────────────────────────────── */}
        {activeGameId && (
          <div
            className="rounded-2xl p-5 relative"
            data-testid="rejoin-card"
            style={{
              background: 'rgba(90,125,140,0.12)',
              border: '1px solid rgba(90,125,140,0.5)',
            }}
          >
            {/* Dismiss button */}
            <button
              onClick={handleDismissRejoin}
              aria-label={t('lobbyRejoinDismiss')}
              className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full text-mj-bone/40 hover:text-mj-bone/70"
              style={{ background: 'rgba(var(--felt-ink-rgb),0.07)' }}
            >
              <svg
                aria-hidden="true"
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="1" y1="1" x2="11" y2="11" />
                <line x1="11" y1="1" x2="1" y2="11" />
              </svg>
            </button>
            <h2 className="text-base font-bold text-mj-bone mb-1 pr-8">{t('lobbyRejoinBanner')}</h2>
            <p className="text-xs text-mj-bone/60 mb-4">{t('lobbyRejoinSub')}</p>
            <button
              onClick={() => navigate(`/game/${activeGameId}`)}
              className="w-full py-3.5 rounded-[14px] font-bold text-sm"
              style={{
                background: 'rgba(90,125,140,0.35)',
                border: '1px solid rgba(90,125,140,0.6)',
                color: '#d4eaf5',
              }}
            >
              {t('lobbyRejoin')}
            </button>
          </div>
        )}

        {error && (
          <div
            className="px-4 py-3 rounded-xl text-sm font-semibold text-mj-loss-light"
            style={{
              background: 'rgba(192,57,43,0.12)',
              border: '1px solid rgba(192,57,43,0.4)',
            }}
          >
            {error}
          </div>
        )}

        {/* Create a room */}
        <div
          className="rounded-2xl p-5"
          style={{
            background: 'rgba(201,169,97,0.08)',
            border: '1px solid rgba(201,169,97,0.3)',
          }}
        >
          <h2 className="text-base font-bold text-mj-bone mb-1">{t('createRoom')}</h2>
          <p className="text-xs text-mj-bone/60 mb-4">{t('createRoomSub')}</p>

          {/* ── Bot count stepper ──────────────────────────────────────── */}
          <div className="mb-3">
            <p className="text-[11px] font-semibold tracking-wider text-mj-bone/65 mb-1.5">
              {t('botCountLabel')}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setBotCount((n) => Math.max(0, n - 1))}
                disabled={botCount === 0}
                aria-label="Decrease bot count"
                className="w-8 h-8 rounded-lg font-bold text-base flex items-center justify-center"
                style={{
                  background:
                    botCount === 0 ? 'rgba(var(--felt-ink-rgb),0.04)' : 'rgba(201,169,97,0.15)',
                  border:
                    botCount === 0
                      ? '1px solid rgba(var(--felt-ink-rgb),0.1)'
                      : '1px solid rgba(201,169,97,0.4)',
                  color: botCount === 0 ? 'rgba(var(--felt-ink-rgb),0.25)' : '#c9a961',
                }}
              >
                {MINUS_GLYPH}
              </button>
              <span
                className="w-6 text-center font-bold text-sm text-mj-bone tabular-nums"
                aria-live="polite"
                aria-label={`${botCount} computer players`}
              >
                {botCount}
              </span>
              <button
                onClick={() => setBotCount((n) => Math.min(3, n + 1))}
                disabled={botCount === 3}
                aria-label="Increase bot count"
                className="w-8 h-8 rounded-lg font-bold text-base flex items-center justify-center"
                style={{
                  background:
                    botCount === 3 ? 'rgba(var(--felt-ink-rgb),0.04)' : 'rgba(201,169,97,0.15)',
                  border:
                    botCount === 3
                      ? '1px solid rgba(var(--felt-ink-rgb),0.1)'
                      : '1px solid rgba(201,169,97,0.4)',
                  color: botCount === 3 ? 'rgba(var(--felt-ink-rgb),0.25)' : '#c9a961',
                }}
              >
                {PLUS_GLYPH}
              </button>
              {botCount === 0 && (
                <span className="text-xs text-mj-bone/40 ml-1">{t('botCountNone')}</span>
              )}
            </div>
          </div>

          {/* ── Difficulty toggle — only shown when bots > 0 ─────────── */}
          {botCount > 0 && (
            <div className="mb-4">
              <p className="text-[11px] font-semibold tracking-wider text-mj-bone/65 mb-1.5">
                {t('botDifficultyLabel')}
              </p>
              <div className="flex gap-2" role="group" aria-label={t('botDifficultyLabel')}>
                {(['easy', 'normal'] as BotDifficulty[]).map((diff) => {
                  const active = botDifficulty === diff;
                  return (
                    <button
                      key={diff}
                      onClick={() => setBotDifficulty(diff)}
                      aria-pressed={active}
                      className="px-3 py-1.5 rounded-full text-xs font-bold"
                      style={{
                        background: active
                          ? 'rgba(201,169,97,0.25)'
                          : 'rgba(var(--felt-ink-rgb),0.06)',
                        border: active
                          ? '1px solid rgba(201,169,97,0.6)'
                          : '1px solid rgba(var(--felt-ink-rgb),0.12)',
                        color: active ? '#c9a961' : 'rgba(var(--felt-ink-rgb),0.45)',
                      }}
                    >
                      {diff === 'easy' ? t('botDifficultyEasy') : t('botDifficultyNormal')}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button
            onClick={handleCreate}
            disabled={loading}
            className="w-full py-3.5 rounded-[14px] font-bold text-sm text-mj-ink"
            style={{
              background: loading
                ? 'rgba(201,169,97,0.5)'
                : 'linear-gradient(180deg,#c9a961 0%,#a88a45 100%)',
              boxShadow: loading ? 'none' : '0 6px 18px rgba(201,169,97,0.3)',
            }}
          >
            {loading ? t('creating') : t('createRoom')}
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-mj-bone/15" />
          <span className="text-xs text-mj-bone/40 font-semibold">OR</span>
          <div className="flex-1 h-px bg-mj-bone/15" />
        </div>

        {/* Join by code */}
        <div
          className="rounded-2xl p-5"
          style={{
            background: 'rgba(var(--felt-ink-rgb),0.04)',
            border: '1px solid rgba(var(--felt-ink-rgb),0.1)',
          }}
        >
          <h2 className="text-base font-bold text-mj-bone mb-1">{t('joinRoom')}</h2>
          <p className="text-xs text-mj-bone/60 mb-4">{t('joinRoomSub')}</p>

          {mode !== 'join' ? (
            <button
              onClick={() => setMode('join')}
              className="w-full py-3.5 rounded-[14px] font-semibold text-sm text-mj-bone/80"
              style={{
                background: 'rgba(var(--felt-ink-rgb),0.06)',
                border: '1px solid rgba(var(--felt-ink-rgb),0.12)',
              }}
            >
              {t('joinRoom')}
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                placeholder={t('roomCodePlaceholder')}
                maxLength={7}
                autoFocus
                className="w-full px-4 py-3 rounded-xl text-base font-bold text-center tracking-widest"
                style={{
                  background: 'rgba(var(--felt-ink-rgb),0.07)',
                  border: '1px solid rgba(201,169,97,0.4)',
                  color: '#c9a961',
                  outline: 'none',
                }}
                aria-label={t('roomCodeLabel')}
              />
              <button
                onClick={handleJoin}
                disabled={loading || !code.trim()}
                className="w-full py-3.5 rounded-[14px] font-bold text-sm text-mj-bone"
                style={{
                  background:
                    loading || !code.trim()
                      ? 'rgba(var(--felt-ink-rgb),0.06)'
                      : 'rgba(201,169,97,0.2)',
                  border:
                    loading || !code.trim()
                      ? '1px solid rgba(var(--felt-ink-rgb),0.1)'
                      : '1px solid rgba(201,169,97,0.5)',
                  color: loading || !code.trim() ? 'rgba(var(--felt-ink-rgb),0.4)' : '#c9a961',
                }}
              >
                {loading ? t('joining') : t('joinRoom')}
              </button>
            </div>
          )}
        </div>
      </div>
    </ScreenShell>
  );
}
