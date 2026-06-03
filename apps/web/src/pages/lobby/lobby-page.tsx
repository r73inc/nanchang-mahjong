/**
 * LobbyPage — the "Play with Friends" entry point.
 *
 * Two paths:
 *  • Create a new room → navigate to /room/:code
 *  • Enter a room code → navigate to /room/:code
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
    }
  }

  return (
    <ScreenShell title={t('joinRoom')} onBack={() => navigate('/home')}>
      <div className="px-4 py-6 flex flex-col gap-6">
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
            background: 'rgba(245,239,223,0.04)',
            border: '1px solid rgba(245,239,223,0.1)',
          }}
        >
          <h2 className="text-base font-bold text-mj-bone mb-1">{t('joinRoom')}</h2>
          <p className="text-xs text-mj-bone/60 mb-4">{t('joinRoomSub')}</p>

          {mode !== 'join' ? (
            <button
              onClick={() => setMode('join')}
              className="w-full py-3.5 rounded-[14px] font-semibold text-sm text-mj-bone/80"
              style={{
                background: 'rgba(245,239,223,0.06)',
                border: '1px solid rgba(245,239,223,0.12)',
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
                  background: 'rgba(245,239,223,0.07)',
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
                    loading || !code.trim() ? 'rgba(245,239,223,0.06)' : 'rgba(201,169,97,0.2)',
                  border:
                    loading || !code.trim()
                      ? '1px solid rgba(245,239,223,0.1)'
                      : '1px solid rgba(201,169,97,0.5)',
                  color: loading || !code.trim() ? 'rgba(245,239,223,0.4)' : '#c9a961',
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
