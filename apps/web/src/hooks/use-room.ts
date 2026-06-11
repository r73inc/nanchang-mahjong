/**
 * use-room.ts — all room-related actions and socket subscription.
 *
 * Call `useRoomSubscription(roomId)` inside RoomPage to receive
 * real-time updates. Call the returned action functions to mutate room state
 * via REST (which also triggers server-side socket broadcasts).
 */

import { useEffect, useCallback } from 'react';
import { api, getApiErrorMessage } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useRoomStore } from '../stores/room.store';
import type {
  RoomState,
  WsRoomUpdatePayload,
  WsRoomStartedPayload,
  BotDifficulty,
} from '@nanchang/shared';

// ── REST action hooks ─────────────────────────────────────────────────────────

export function useRoomActions() {
  const { setRoom, setLoading, setError } = useRoomStore();

  const createRoom = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post<RoomState>('/rooms', {});
      setRoom(data);
      return data;
    } catch (err) {
      setError(getApiErrorMessage(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, [setRoom, setLoading, setError]);

  const joinRoom = useCallback(
    async (code: string) => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.post<RoomState>(`/rooms/${code.trim().toUpperCase()}/join`);
        setRoom(data);
        return data;
      } catch (err) {
        setError(getApiErrorMessage(err));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [setRoom, setLoading, setError],
  );

  const leaveRoom = useCallback(async (roomId: string) => {
    try {
      await api.delete(`/rooms/${roomId}/leave`);
    } catch {
      // Ignore — room may already be gone
    }
  }, []);

  const setReady = useCallback(
    async (roomId: string, ready: boolean) => {
      try {
        const { data } = await api.patch<RoomState>(`/rooms/${roomId}/ready`, { ready });
        setRoom(data);
        return data;
      } catch (err) {
        setError(getApiErrorMessage(err));
        return null;
      }
    },
    [setRoom, setError],
  );

  const kickSeat = useCallback(
    async (roomId: string, seatIdx: number) => {
      try {
        const { data } = await api.delete<RoomState>(`/rooms/${roomId}/seats/${seatIdx}`);
        setRoom(data);
      } catch (err) {
        setError(getApiErrorMessage(err));
      }
    },
    [setRoom, setError],
  );

  const addBotToSeat = useCallback(
    async (roomId: string, seatIdx: number, difficulty: BotDifficulty) => {
      try {
        const { data } = await api.post<RoomState>(`/rooms/${roomId}/seats/${seatIdx}/bot`, {
          difficulty,
        });
        setRoom(data);
      } catch (err) {
        setError(getApiErrorMessage(err));
      }
    },
    [setRoom, setError],
  );

  const startGame = useCallback(
    async (roomId: string) => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.post<{ roomId: string; gameId: string }>(
          `/rooms/${roomId}/start`,
        );
        return data;
      } catch (err) {
        setError(getApiErrorMessage(err));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [setLoading, setError],
  );

  const getRoomByCode = useCallback(
    async (code: string) => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get<RoomState>(`/rooms/${code.trim().toUpperCase()}`);
        setRoom(data);
        return data;
      } catch (err) {
        setError(getApiErrorMessage(err));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [setRoom, setLoading, setError],
  );

  const updateSettings = useCallback(
    async (
      roomId: string,
      updates: {
        viewMode?: '2D' | '3D';
        ruleTopBottomJing?: boolean;
        rounds?: 'east' | 'east+south';
        terminationType?: 'rounds' | 'bust';
        claimWindowSecs?: number;
      },
    ) => {
      try {
        const { data } = await api.patch<RoomState>(`/rooms/${roomId}/settings`, updates);
        setRoom(data);
        return data;
      } catch (err) {
        setError(getApiErrorMessage(err));
        return null;
      }
    },
    [setRoom, setError],
  );

  return {
    createRoom,
    joinRoom,
    leaveRoom,
    setReady,
    kickSeat,
    addBotToSeat,
    startGame,
    getRoomByCode,
    updateSettings,
  };
}

// ── Socket subscription ────────────────────────────────────────────────────────

/**
 * Subscribe to real-time room updates for `roomId`.
 * Call inside the RoomPage component; subscription is cleaned up on unmount.
 */
export function useRoomSubscription(
  roomId: string | undefined,
  onStarted?: (payload: WsRoomStartedPayload) => void,
) {
  const { setRoom } = useRoomStore();

  useEffect(() => {
    if (!roomId) return;

    let socket: ReturnType<typeof getSocket> | null = null;
    try {
      socket = getSocket();
    } catch {
      // Socket not initialised (e.g. test environment) — no-op
      return;
    }

    socket.emit('room:subscribe', { roomId });

    const handleUpdate = (payload: WsRoomUpdatePayload) => {
      setRoom(payload.room);
    };

    const handleStarted = (payload: WsRoomStartedPayload) => {
      onStarted?.(payload);
    };

    socket.on('room:update', handleUpdate);
    socket.on('room:started', handleStarted);

    return () => {
      socket?.emit('room:unsubscribe', { roomId });
      socket?.off('room:update', handleUpdate);
      socket?.off('room:started', handleStarted);
    };
  }, [roomId, setRoom, onStarted]);
}
