/**
 * use-game.ts — socket subscription and action helpers for the live game.
 *
 * Call `useGame(gameId)` inside GamePage. It:
 *  - Emits game:join to subscribe (and re-emits on reconnect to resync).
 *  - Subscribes to all game:* events and writes them to the Zustand store.
 *  - Manages the 1.5s reconnecting overlay timer (PLAN §7.5).
 *  - Returns typed action functions (discard, claim, pass, concede, revealJing).
 *
 * The hook never calls connectSocket() — the socket must be alive by the time
 * this hook's effect runs. GamePage now guarantees this by calling
 * connectSocket() in an earlier useEffect (declared before useGame) so the
 * singleton exists even when entering from the challenge flow without a room.
 * On each mount it calls getSocket() and subscribes; cleanup on unmount removes
 * all listeners.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket } from '../lib/socket';
import { useGameStore } from '../stores/game.store';
import { useSound } from './use-sound';
import type { TileType, ClientGameState } from '@nanchang/shared';

// Delay before showing the reconnecting overlay (PLAN §7.5: 1.5s)
const RECONNECT_OVERLAY_DELAY_MS = 1500;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useGame(gameId: string, spectate = false) {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const {
    snapshot,
    ended,
    settlementPreview,
    handReveal,
    finalHandReveal,
    rematchRoomCode,
    selectedTileIdx,
    claimWindow,
    connection,
    pendingMove,
    toast,
    gameError,
    diceAnimation,
    setSnapshot,
    setEnded,
    setSettlementPreview,
    setHandReveal,
    setFinalHandReveal,
    setRematchRoomCode,
    setConnection,
    setClaimWindow,
    setViewerClaimSubmitted,
    selectTile,
    setPendingMove,
    setToast,
    setGameError,
    setDiceAnimation,
    canTsumo,
    canAddToKong,
    setYourTurnFlash,
    setCanTsumo,
    setCanAddToKong,
    setLastDiscard,
    reset,
  } = useGameStore();

  const {
    playDiceRoll,
    playShuffle,
    playTilePlace,
    playCallOutChow,
    playCallOutPung,
    playCallOutKong,
  } = useSound();
  // Stable ref so event handlers inside useEffect always call the current
  // callback without adding sound deps to the effect dependency array.
  const soundRef = useRef({
    playDiceRoll,
    playShuffle,
    playTilePlace,
    playCallOutChow,
    playCallOutPung,
    playCallOutKong,
  });
  soundRef.current = {
    playDiceRoll,
    playShuffle,
    playTilePlace,
    playCallOutChow,
    playCallOutPung,
    playCallOutKong,
  };

  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Snapshot queue: snapshots received during dice animation are held here and
  // flushed after onDiceAnimationComplete fires to prevent the wall updating
  // before the animation finishes.
  const snapshotQueueRef = useRef<ClientGameState[]>([]);
  const isDiceAnimatingRef = useRef(false);

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
    const handleSnapshot = (payload: { state: ClientGameState }) => {
      if (isDiceAnimatingRef.current) {
        // Queue snapshot until dice animation completes
        snapshotQueueRef.current.push(payload.state);
      } else {
        setSnapshot(payload.state);
      }
    };

    const handleClaimWindow = (payload: {
      actions: import('@nanchang/shared').ClaimAction[];
      deadline: number;
    }) => {
      setClaimWindow({ actions: payload.actions, deadline: payload.deadline });
    };

    const handleContested = (_payload: {
      kind: 'win' | 'pung' | 'kong' | 'chow';
      seat: 0 | 1 | 2 | 3;
    }) => {
      // The game:event that follows immediately carries richer information
      // (winning seat, action kind, and whether the viewer was outbid).
      // No separate toast here — that 600ms flash would race with and cancel
      // the 2500ms game:event toast.
    };

    // game:event — every successful public action is broadcast here.
    // We show a prominent toast for claims and wins so all players are notified.
    // We also maintain lastDiscard here (NOT from snapshot.pendingDiscard) to
    // avoid the React 18 batching race where discard+pass snapshots collapse into
    // one render with pendingDiscard already null. See game.store.ts for details.
    const handleGameEvent = (payload: { event: import('@nanchang/shared').PublicGameEvent }) => {
      const { event } = payload;

      // ── Dice roll animation ───────────────────────────────────────────────
      if (event.kind === 'dice_roll') {
        soundRef.current.playDiceRoll();
        isDiceAnimatingRef.current = true;
        setDiceAnimation({
          dice: event.dice as [number, number],
          purpose: event.purpose,
          roller: event.roller,
        });
        // Return early — dice roll events don't affect the discard/toast logic below
        return;
      }

      // ── Last-discard tracking ─────────────────────────────────────────────
      if (event.kind === 'discard') {
        // For opponent/bot discards play the tile-place sound here.
        // The viewer's own discard is covered by discardWithSound in game-page.tsx
        // (plays immediately on click rather than waiting for the server echo).
        const viewerSeat = useGameStore.getState().snapshot?.viewerSeat ?? null;
        if (event.seat !== viewerSeat) soundRef.current.playTilePlace();
        // A tile has landed in the discard pool — start pulsing it.
        // Kept until the next discard or a claim that removes it.
        setLastDiscard({ seat: event.seat, tile: event.tile });
      } else if (
        event.kind === 'pung' ||
        event.kind === 'chow' ||
        event.kind === 'kong_open' ||
        event.kind === 'win'
      ) {
        // The pending discard was claimed and removed from the discard pool.
        setLastDiscard(null);
      }
      // Note: 'draw' intentionally does NOT clear lastDiscard. Both the discard
      // and draw events fire in the same server tick for no-claim turns, so if
      // we cleared on draw the pulse would never appear (same-batch problem).
      // The pulse stays until the next seat discards (replacing lastDiscard) or
      // a claim removes it.

      // ── Callout sounds ────────────────────────────────────────────────────
      if (event.kind === 'chow') soundRef.current.playCallOutChow();
      else if (event.kind === 'pung') soundRef.current.playCallOutPung();
      else if (
        event.kind === 'kong_open' ||
        event.kind === 'kong_concealed' ||
        event.kind === 'kong_added'
      )
        soundRef.current.playCallOutKong();

      // ── Toast handling ────────────────────────────────────────────────────
      if (event.kind === 'opening_jing_settlement') {
        // Compute the viewer's own score delta (null for spectators)
        const currentSnapshot = useGameStore.getState().snapshot;
        const viewerSeat = currentSnapshot?.viewerSeat ?? null;
        const settlementDelta = viewerSeat !== null ? event.scoreDelta[viewerSeat] : 0;
        setToast({
          kind: 'opening_settlement',
          seat: 0, // seat is required by type; not meaningful for this toast
          settlementTile: event.settlementTile,
          settlementDelta,
        });
        setTimeout(() => setToast(null), 4000);
      } else if (
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
          // Detect when the viewer submitted a claim but lost to a higher-priority
          // claim from another seat (e.g. viewer tried to Pung, someone else won).
          const { viewerClaimSubmitted, snapshot: snap } = useGameStore.getState();
          const viewerSeat = snap?.viewerSeat ?? null;
          const isClaimEvent =
            event.kind === 'pung' ||
            event.kind === 'chow' ||
            event.kind === 'kong_open' ||
            event.kind === 'win';
          const outbidBy =
            isClaimEvent &&
            viewerClaimSubmitted !== null &&
            viewerSeat !== null &&
            seat !== viewerSeat
              ? viewerClaimSubmitted
              : undefined;
          // Always clear the pending claim — window is resolved either way.
          if (viewerClaimSubmitted !== null) setViewerClaimSubmitted(null);
          setToast({ kind: event.kind, seat, ...(outbidBy ? { outbidBy } : {}) });
          setTimeout(() => setToast(null), outbidBy ? 3500 : 2500);
        }
      }
    };

    const handleEnded = (payload: Parameters<typeof setEnded>[0]) => {
      // Preserve the last hand's reveal for the post-results "View Hand
      // Details" screen (BUG-025), then clear the blocking slice so
      // GameEndScreen can render unblocked. endSession emits game:ended
      // without a subsequent snapshot, so handReveal would otherwise remain
      // set and permanently hide the end screen.
      const reveal = useGameStore.getState().handReveal;
      if (reveal) setFinalHandReveal(reveal);
      setHandReveal(null);
      setEnded(payload);
    };

    const handleSettlementPreview = (
      payload: import('@nanchang/shared').SettlementPreviewPayload,
    ) => {
      setSettlementPreview(payload);
    };

    const handleHandReveal = (payload: import('@nanchang/shared').HandRevealPayload) => {
      setHandReveal(payload);
    };

    const handleRematchReady = (payload: { roomId: string; roomCode: string }) => {
      setRematchRoomCode(payload.roomCode);
    };

    const handleSaved = () => {
      // Server saved the game — navigate all players back to home.
      navigateRef.current('/');
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

    // game:your-turn — fires when the server gives the viewer a fresh draw.
    // Show the centre-screen flash for 2s; only act on the viewer's own seat.
    const handleYourTurn = (payload: { seat: 0 | 1 | 2 | 3 }) => {
      const viewerSeat = useGameStore.getState().snapshot?.viewerSeat ?? null;
      if (viewerSeat === payload.seat) {
        setYourTurnFlash(true);
        setTimeout(() => setYourTurnFlash(false), 2000);
      }
    };

    // game:can-tsumo — server notifies the active player that their 14-tile hand
    // is a winning hand. The UI shows a "Declare Win" button; the player may also
    // choose to discard normally and continue playing.
    const handleCanTsumo = (payload: { seat: 0 | 1 | 2 | 3 }) => {
      const viewerSeat = useGameStore.getState().snapshot?.viewerSeat ?? null;
      if (viewerSeat === payload.seat) {
        setCanTsumo(true);
      }
    };

    // game:can-add-to-kong — server notifies the active player that their drawn
    // tile can extend an existing open pung to a kong (BUG-058).
    const handleCanAddToKong = (payload: {
      seat: 0 | 1 | 2 | 3;
      tile: import('@nanchang/shared').TileType;
    }) => {
      const viewerSeat = useGameStore.getState().snapshot?.viewerSeat ?? null;
      if (viewerSeat === payload.seat) {
        setCanAddToKong(payload.tile);
      }
    };

    // AFK warning — broadcast to the affected seat's socket (handled server-side);
    // on the FE we just need a toast/alert if it's us.
    // We rely on game:snapshot reflecting the afk flag; no extra state needed here.

    s.on('game:snapshot', handleSnapshot);
    s.on('game:your-turn', handleYourTurn);
    s.on('game:can-tsumo', handleCanTsumo);
    s.on('game:can-add-to-kong', handleCanAddToKong);
    s.on('game:claim-window', handleClaimWindow);
    s.on('game:rob-kong-window', handleClaimWindow); // same UI
    s.on('game:contested', handleContested);
    s.on('game:event', handleGameEvent);
    s.on('game:ended', handleEnded);
    s.on('game:settlement-preview', handleSettlementPreview);
    s.on('game:hand-reveal', handleHandReveal);
    s.on('game:rematch-ready', handleRematchReady);
    s.on('game:saved', handleSaved);
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
      // Clear stale error/pending state so the game UI renders cleanly on reconnect.
      // Without this, a game:error received before the disconnect (e.g. NOT_YOUR_TURN
      // from a race) would persist and show GameErrorScreen after the socket recovers.
      setGameError(null);
      setPendingMove(false);
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
    // Only emit if the socket is already connected; if it is still in the
    // connecting state (e.g. GamePage just called connectSocket() in its
    // earlier effect), handleConnect above will emit once the connection is
    // established, avoiding a double game:join.
    if (s.connected) {
      s.emit('game:join', { gameId, spectate });
    }

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      s.off('game:snapshot', handleSnapshot);
      s.off('game:your-turn', handleYourTurn);
      s.off('game:can-tsumo', handleCanTsumo);
      s.off('game:can-add-to-kong', handleCanAddToKong);
      s.off('game:claim-window', handleClaimWindow);
      s.off('game:rob-kong-window', handleClaimWindow);
      s.off('game:contested', handleContested);
      s.off('game:event', handleGameEvent);
      s.off('game:ended', handleEnded);
      s.off('game:settlement-preview', handleSettlementPreview);
      s.off('game:hand-reveal', handleHandReveal);
      s.off('game:rematch-ready', handleRematchReady);
      s.off('game:saved', handleSaved);
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
      setCanTsumo(false);
      setCanAddToKong(null);
      try {
        getSocket().emit('game:discard', { tile });
      } catch {
        setPendingMove(false);
      }
    },
    [setPendingMove, selectTile, setCanTsumo, setCanAddToKong],
  );

  const claim = useCallback(
    (kind: 'win' | 'pung' | 'kong' | 'chow', sequence?: [TileType, TileType, TileType]) => {
      setClaimWindow(null); // optimistically close the window
      setViewerClaimSubmitted(kind); // track so we can detect if outbid later
      try {
        getSocket().emit('game:claim', { kind, sequence });
      } catch {
        /* ignore — server will time out */
      }
    },
    [setClaimWindow, setViewerClaimSubmitted],
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

  /** Host advances the pre-game reveal by one step (hands → settlement → jing → start). */
  const advancePreGame = useCallback(() => {
    try {
      getSocket().emit('game:advance-pre-game', { gameId });
    } catch {
      /* ignore */
    }
  }, [gameId]);

  /** Host advances past the hand-reveal screen to the next hand (or session end). */
  const advanceHand = useCallback(() => {
    try {
      getSocket().emit('game:advance-hand', { gameId });
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

  /** Emit game:roll-dice — the active roller triggers their dice roll. */
  const rollDice = useCallback(() => {
    try {
      getSocket().emit('game:roll-dice', {});
    } catch {
      /* ignore */
    }
  }, []);

  /**
   * Called by DiceRollOverlay when the Framer Motion animation completes.
   * Flushes any queued snapshots and clears the animation state.
   */
  const onDiceAnimationComplete = useCallback(() => {
    // Guard: Framer Motion fires onAnimationComplete for exit animations too.
    // Skip if already handled (isDiceAnimatingRef was cleared by the enter callback).
    if (!isDiceAnimatingRef.current) return;
    isDiceAnimatingRef.current = false;
    // Flush queued snapshots in order
    const queue = snapshotQueueRef.current.splice(0);
    for (const state of queue) {
      setSnapshot(state);
    }
    setDiceAnimation(null);
  }, [setSnapshot, setDiceAnimation]);

  const saveAndQuit = useCallback(() => {
    try {
      getSocket().emit('game:save-and-quit', {});
    } catch {
      /* ignore */
    }
  }, []);

  const declareTsumo = useCallback(() => {
    setCanTsumo(false);
    setCanAddToKong(null);
    try {
      getSocket().emit('game:tsumo', {});
    } catch {
      /* ignore */
    }
  }, [setCanTsumo, setCanAddToKong]);

  const kongConcealed = useCallback(
    (tile: TileType) => {
      setCanAddToKong(null);
      try {
        getSocket().emit('game:kong-concealed', { tile });
      } catch {
        /* ignore */
      }
    },
    [setCanAddToKong],
  );

  const kongAdd = useCallback(
    (tile: TileType) => {
      setCanAddToKong(null);
      try {
        getSocket().emit('game:kong-add', { tile });
      } catch {
        /* ignore */
      }
    },
    [setCanAddToKong],
  );

  return {
    snapshot,
    ended,
    settlementPreview,
    handReveal,
    finalHandReveal,
    rematchRoomCode,
    selectedTileIdx,
    claimWindow,
    connection,
    pendingMove,
    toast,
    gameError,
    canTsumo,
    canAddToKong,
    diceAnimation,
    // Actions
    selectTile,
    discard,
    claim,
    pass,
    concede,
    saveAndQuit,
    revealJing,
    advancePreGame,
    advanceHand,
    declareTsumo,
    kongConcealed,
    kongAdd,
    requestRematch,
    rollDice,
    onDiceAnimationComplete,
  };
}
