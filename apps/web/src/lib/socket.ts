/**
 * socket.ts — Socket.IO client singleton.
 *
 * Connects to the current origin (Vite dev proxy forwards /socket.io to :3001).
 * Auth token is passed in the handshake so the WsAuthAdapter can verify it.
 *
 * Usage:
 *   import { getSocket, connectSocket, disconnectSocket } from '@/lib/socket';
 *
 *   // Connect with the current access token (call once after sign-in)
 *   connectSocket(accessToken);
 *
 *   // Get the live socket to subscribe / emit
 *   const socket = getSocket();
 *   socket.on('room:update', handler);
 *
 *   // Sign-out / teardown
 *   disconnectSocket();
 */

import { io, type Socket } from 'socket.io-client';
import type {
  WsRoomUpdatePayload,
  WsRoomStartedPayload,
  WsRoomErrorPayload,
} from '@nanchang/shared';

// Re-export typed event payload types for convenience
export type { WsRoomUpdatePayload, WsRoomStartedPayload, WsRoomErrorPayload };

let socket: Socket | null = null;

/**
 * Initialise and connect the singleton socket with the given access token.
 * Safe to call multiple times — subsequent calls update the auth token and
 * reconnect if needed (e.g. after a silent token refresh).
 */
export function connectSocket(accessToken: string): Socket {
  if (socket?.connected && (socket.auth as Record<string, unknown>)?.token === accessToken) {
    return socket;
  }

  if (socket) {
    socket.auth = { token: accessToken };
    if (!socket.connected) socket.connect();
    return socket;
  }

  socket = io({
    // Empty string → connect to current host (works with Vite /socket.io proxy in dev
    // and same-origin in prod).
    path: '/socket.io',
    auth: { token: accessToken },
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
  });

  return socket;
}

/** Return the current socket (or throw if not yet initialised). */
export function getSocket(): Socket {
  if (!socket) throw new Error('Socket not initialised — call connectSocket() first');
  return socket;
}

/**
 * Disconnect and destroy the singleton.
 * Call on sign-out to ensure the next user starts with a clean connection.
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
