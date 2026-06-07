/**
 * use-game.ts — socket subscription and action helpers for the live game.
 *
 * Call `useGame(gameId)` inside GamePage. It:
 *  - Emits game:join to subscribe (and re-emits on reconnect to resync).
 *  - Subscribes to all game:* events and writes them to the Zustand store.
 *  - Manages the 1.5s reconnecting overlay timer (PLAN §7.5).
 *  - Returns typed action functions (discard, claim, pass, concede, revealJing).
 *
 * The hook never calls connectSocket() — the socket is already alive from the
 * Room page. On each mount it calls getSocket() and subscribes; cleanup on
 * unmount removes all listeners.
 */

import { useEffect, useRef, useCallback } from 'react';
import { getSocket } from '../lib/socket';
import { useGameStore } from '../stores/game.store';
import type { TileType } from '@nanchang/shared';

// Delay before showing the reconnecting overlay (PLAN §7.5: 1.5s)
const RECONNECT_OVERLAY_DELAY_MS = 1500;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useGame(gameId: string, spectate = false) {
  const {
    snapshot,
    ended,
    rematchRoomCode,
    selectedTileIdx,
    claimWindow,
    connection,
    pendingMove,
    toast,
    gameError,
    setSnapshot,
    setEnded,
    setRematchRoomCode,
    setConnection,
    setClaimWindow,
    selectTile,
    setPendingMove,
    setToast,
    setGameError,
    reset,
  } = useGameStore();

  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let socket: ReturnType<typeof getSocket> | null = null;
    try {
      socket = getSocket();
    } catch {
      // Not yet connected (e.g. test environment) — skip
      return;
    }

    const s = socket;

    // ── Game state events ─────────────────────────────────────────────────────
    // IMPORTANT: Register ALL listeners BEFORE emitting game:join.
    // Although network latency makes the race essentially impossible in practice,
    // registering first is the correct pattern and eliminates any theoretical risk
    // of missing the game:snapshot response in low-latency (localhost) environments.
    const handleSnapshot = (payload: { state: Parameters<typeof setSnapshot>[0] }) => {
      setSnapshot(payload.state);
    };

    const handleClaimWindow = (payload: {
      actions: import('@nanchang/shared').ClaimAction[];
      deadline: number;
    }) => {
      setClaimWindow({ actions: payload.actions, deadline: payload.deadline });
    };

    const handleContested = (payload: {
      kind: 'win' | 'pung' | 'kong' | 'chow';
      seat: 0 | 1 | 2 | 3;
    }) => {
      // Short flash (600ms) showing the losing seat — mostly a FYI indicator.
      setToast({ kind: 'contested', seat: payload.seat });
      setTimeout(() => setToast(null), 600);
    };

    // game:event — every successful public action is broadcast here.
    // We show a prominent toast for claims and wins so all players are notified.
    const handleGameEvent = (payload: { event: import('@nanchang/shared').PublicGameEvent }) => {
      const { event } = payload;
      if (
        event.kind === 'pung' ||
        event.kind === 'chow' ||
        event.kind === 'kong_open' ||
        event.kind === 'kong_concealed' ||
        event.kind === 'kong_added' ||
        event.kind === 'win' ||
        event.kind === 'concede'
      ) {
        const seat = 'seat' in event ? event.seat : null;
        if (seat !== null) {
          setToast({ kind: event.kind, seat });
          setTimeout(() => setToast(null), 2500);
        }
      }
    };

    const handleEnded = (payload: Parameters<typeof setEnded>[0]) => {
      setEnded(payload);
    };

    const handleRematchReady = (payload: { roomId: string; roomCode: string }) => {
      setRematchRoomCode(payload.roomCode);
    };

    // game:error — log to console so backend rejections are visible during debugging.
    // Surface ALL error codes in the store so GamePage renders an error screen
    // instead of leaving the user stuck on a perpetual LoadingScreen.
    // Previously only GAME_NOT_FOUND and NOT_IN_GAME were handled; TOO_FAST,
    // INVALID_PAYLOAD, NOT_HOST, ENGINE_ERROR, etc. were silently dropped.
    const handleError = (payload: { code: string; message?: string }) => {
      console.warn('[game:error]', payload.code, payload.message ?? '');
      setGameError(payload.code);
    };

    // AFK warning — broadcast to the affected seat's socket (handled server-side);
    // on the FE we just need a toast/alert if it's us.
    // We rely on game:snapshot reflecting the afk flag; no extra state needed here.

    s.on('game:snapshot', handleSnapshot);
    s.on('game:claim-window', handleClaimWindow);
    s.on('game:rob-kong-window', handleClaimWindow); // same UI
    s.on('game:contested', handleContested);
    s.on('game:event', handleGameEvent);
    s.on('game:ended', handleEnded);
    s.on('game:rematch-ready', handleRematchReady);
    s.on('game:error', handleError);

    // ── Connection management ─────────────────────────────────────────────────
    // Registered before game:join so reconnect logic is wired before the
    // server can respond with connect/disconnect events.
    const handleDisconnect = () => {
      // Start the 1.5s timer before showing the overlay (PLAN §7.5)
      reconnectTimerRef.current = setTimeout(() => {
        setConnection('reconnecting');
      }, RECONNECT_OVERLAY_DELAY_MS);
    };

    const handleConnect = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      setConnection('live');
      // Re-join to get a fresh snapshot (PLAN §7.5: reconnection = re-join)
      s.emit('game:join', { gameId, spectate });
    };

    const handleConnectError = () => {
      setConnection('lost');
    };

    s.on('disconnect', handleDisconnect);
    s.on('connect', handleConnect);
    s.on('connect_error', handleConnectError);

    // ── Join ──────────────────────────────────────────────────────────────────
    // Emit AFTER all listeners are registered so we cannot miss game:snapshot
    // even if the server responds before this effect resumes execution.
    s.emit('game:join', { gameId, spectate });

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      s.off('game:snapshot', handleSnapshot);
      s.off('game:claim-window', handleClaimWindow);
      s.off('game:rob-kong-window', handleClaimWindow);
      s.off('game:contested', handleContested);
      s.off('game:event', handleGameEvent);
      s.off('game:ended', handleEnded);
      s.off('game:rematch-ready', handleRematchReady);
      s.off('game:error', handleError);
      s.off('disconnect', handleDisconnect);
      s.off('connect', handleConnect);
      s.off('connect_error', handleConnectError);

      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);

      reset();
    };
  }, [gameId, spectate]); // only re-subscribe when the game or spectate flag changes

  // ── Actions ───────────────────────────────────────────────────────────────

  const discard = useCallback(
    (tile: TileType) => {
      setPendingMove(true);
      selectTile(null);
      try {
        getSocket().emit('game:discard', { tile });
      } catch {
        setPendingMove(false);
      }
    },
    [setPendingMove, selectTile],
  );

  const claim = useCallback(
    (kind: 'win' | 'pung' | 'kong' | 'chow', sequence?: [TileType, TileType, TileType]) => {
      setClaimWindow(null); // optimistically close the window
      try {
        getSocket().emit('game:claim', { kind, sequence });
      } catch {
        /* ignore — server will time out */
      }
    },
    [setClaimWindow],
  );

  const pass = useCallback(() => {
    setClaimWindow(null);
    try {
      getSocket().emit('game:pass', {});
    } catch {
      /* ignore */
    }
  }, [setClaimWindow]);

  const concede = useCallback(() => {
    try {
      getSocket().emit('game:concede', {});
    } catch {
      /* ignore */
    }
  }, []);

  const revealJing = useCallback(() => {
    try {
      getSocket().emit('game:reveal-jing', { gameId });
    } catch {
      /* ignore */
    }
  }, [gameId]);

  const requestRematch = useCallback(() => {
    try {
      getSocket().emit('game:rematch', {});
    } catch {
      /* ignore */
    }
  }, []);

  const kongConcealed = useCallback((tile: TileType) => {
    try {
      getSocket().emit('game:kong-concealed', { tile });
    } catch {
      /* ignore */
    }
  }, []);

  const kongAdd = useCallback((tile: TileType) => {
    try {
      getSocket().emit('game:kong-add', { tile });
    } catch {
      /* ignore */
    }
  }, []);

  return {
    snapshot,
    ended,
    rematchRoomCode,
    selectedTileIdx,
    claimWindow,
    connection,
    pendingMove,
    toast,
    gameError,
    // Actions
    selectTile,
    discard,
    claim,
    pass,
    concede,
    revealJing,
    kongConcealed,
    kongAdd,
    requestRematch,
  };
}
