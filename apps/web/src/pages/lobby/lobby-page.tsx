/**
 * LobbyPage — the "Play with Friends" entry point.
 *
 * Two paths:
 *  • Create a new room → navigate to /room/:code
 *  • Enter a room code → navigate to /room/:code
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

/** localStorage key shared with game-page.tsx */
const ACTIVE_GAME_KEY = 'mj:active-game';
import { ScreenShell } from '../../components/ui/screen-shell';
import { useI18n } from '../../i18n';
import { useRoomActions } from '../../hooks/use-room';
import { useRoomStore } from '../../stores/room.store';
import { useJoinRestore } from '../../hooks/use-saves';
import { connectSocket } from '../../lib/socket';
import { useAuthStore } from '../../stores/auth.store';

export function LobbyPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { createRoom, joinRoom } = useRoomActions();
  const loading = useRoomStore((s) => s.loading);
  const error = useRoomStore((s) => s.error);
  const setRoomError = useRoomStore((s) => s.setError);
  const joinRestore = useJoinRestore();

  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [code, setCode] = useState('');

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
    const room = await createRoom();
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
      return;
    }
    // Room not found — check if the code is a saved-game restore code instead.
    try {
      const { gameId } = await joinRestore.mutateAsync(code);
      setRoomError(null); // clear the "room not found" error before navigating
      navigate(`/game/${gameId}`);
    } catch {
      // Not a restore code either — the room store error is already showing.
    }
  }

  return (
    <ScreenShell title={t('joinRoom')} onBack={() => navigate('/play')}>
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

          <button
            onClick={handleCreate}
            disabled={loading}
            className={`w-full py-3.5 rounded-[14px] font-bold text-sm text-mj-ink${loading ? '' : ' btn-heirloom-sm'}`}
            style={loading ? { background: 'rgba(201,169,97,0.5)' } : undefined}
          >
            {loading ? t('creating') : t('createRoom')}
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-mj-bone/15" />
          <span className="text-xs text-mj-bone/55 font-semibold">{t('lobbyOrDivider')}</span>
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
                onChange={(e) => {
                  // Strip any existing dashes, uppercase, cap at 6 raw chars,
                  // then re-insert the dash at position 2 (XX-XXXX format).
                  const raw = e.target.value.replace(/-/g, '').toUpperCase().slice(0, 6);
                  setCode(raw.length >= 2 ? `${raw.slice(0, 2)}-${raw.slice(2)}` : raw);
                }}
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
                disabled={loading || joinRestore.isPending || !code.trim()}
                className="w-full py-3.5 rounded-[14px] font-bold text-sm text-mj-bone"
                style={{
                  background:
                    loading || joinRestore.isPending || !code.trim()
                      ? 'rgba(var(--felt-ink-rgb),0.06)'
                      : 'rgba(201,169,97,0.2)',
                  border:
                    loading || joinRestore.isPending || !code.trim()
                      ? '1px solid rgba(var(--felt-ink-rgb),0.1)'
                      : '1px solid rgba(201,169,97,0.5)',
                  color:
                    loading || joinRestore.isPending || !code.trim()
                      ? 'rgba(var(--felt-ink-rgb),0.4)'
                      : '#c9a961',
                }}
              >
                {loading || joinRestore.isPending ? t('joining') : t('joinRoom')}
              </button>
            </div>
          )}
        </div>
      </div>
    </ScreenShell>
  );
}
