/**
 * RoomsGateway — Socket.IO gateway for real-time room state broadcasts.
 *
 * Clients subscribe to a room's updates via the `room:subscribe` event.
 * When room state changes (REST mutations + disconnect), the server emits
 * `room:update` to all sockets in that room's socket.io room.
 *
 * Auth is enforced at the transport level by WsAuthAdapter (main.ts), so
 * socket.data.user is guaranteed to be populated here.
 */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import type { RoomState, WsRoomUpdatePayload, WsRoomStartedPayload } from '@nanchang/shared';
import type { WsUser } from '../common/adapters/ws-auth.adapter';
import { RoomsService } from './rooms.service';

@WebSocketGateway({ cors: { origin: '*' } })
export class RoomsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(RoomsGateway.name);

  /**
   * Deferred leave timers keyed by `${roomId}:${userId}`.
   * A browser refresh triggers a disconnect + reconnect in quick succession.
   * We hold off on calling leaveRoom for 15 s so that a page reload can
   * resubscribe before the seat is removed. The timer is cancelled in
   * handleSubscribe when the same user rejoins the same room.
   */
  private readonly pendingLeaves = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly roomsService: RoomsService) {}

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  handleConnection(client: Socket) {
    const user = client.data.user as WsUser | undefined;
    if (!user) {
      // WsAuthAdapter rejects unauthenticated connections before they reach here,
      // but be defensive anyway.
      client.disconnect();
      return;
    }
    this.logger.debug(`WS connected: ${user.handle} (${client.id})`);
  }

  handleDisconnect(client: Socket) {
    const user = client.data.user as WsUser | undefined;
    const roomId = client.data.roomId as string | undefined;

    if (!user || !roomId) return;

    this.logger.debug(
      `WS disconnected: ${user.handle} — scheduling deferred leave for room ${roomId}`,
    );

    const key = `${roomId}:${user.sub}`;
    const timer = setTimeout(() => {
      this.pendingLeaves.delete(key);
      void this.roomsService
        .leaveRoom(roomId, user.sub)
        .then((updated) => {
          if (updated) this.broadcastRoomUpdate(roomId, updated);
        })
        .catch(() => {
          // Room may have already been cleaned up; silently ignore
        });
    }, 15_000);

    this.pendingLeaves.set(key, timer);
  }

  // ── Message handlers ────────────────────────────────────────────────────────

  /**
   * Client subscribes to real-time updates for a specific room.
   * `socket.data.roomId` is set so `handleDisconnect` knows which room to
   * clean up when this connection drops.
   *
   * Also cancels any pending deferred leave for this user+room — this is the
   * reconnection path after a browser refresh.
   */
  @SubscribeMessage('room:subscribe')
  handleSubscribe(client: Socket, payload: { roomId: string }) {
    const { roomId } = payload;
    if (!roomId) return;

    // Cancel any pending leave if this user is rejoining the same room.
    const user = client.data.user as WsUser | undefined;
    if (user) {
      const key = `${roomId}:${user.sub}`;
      const pending = this.pendingLeaves.get(key);
      if (pending) {
        clearTimeout(pending);
        this.pendingLeaves.delete(key);
        this.logger.debug(
          `Reconnect: cancelled pending leave for ${user.handle} in room ${roomId}`,
        );
      }
    }

    // Leave any previously subscribed room first (one subscription at a time)
    const prev = client.data.roomId as string | undefined;
    if (prev && prev !== roomId) {
      void client.leave(`room:${prev}`);
    }

    client.data.roomId = roomId;
    void client.join(`room:${roomId}`);
    this.logger.debug(`Socket ${client.id} subscribed to room ${roomId}`);
  }

  @SubscribeMessage('room:unsubscribe')
  handleUnsubscribe(client: Socket, payload: { roomId: string }) {
    const { roomId } = payload;
    client.data.roomId = undefined;
    void client.leave(`room:${roomId}`);
  }

  // ── Outbound broadcasts (called by controller after REST mutations) ──────────

  broadcastRoomUpdate(roomId: string, room: RoomState) {
    const payload: WsRoomUpdatePayload = { room };
    this.server.to(`room:${roomId}`).emit('room:update', payload);
  }

  broadcastRoomStarted(roomId: string, gameId: string) {
    const payload: WsRoomStartedPayload = { roomId, gameId };
    this.server.to(`room:${roomId}`).emit('room:started', payload);
  }

  /** Emit an event directly to all sockets owned by a specific user. */
  emitToUser(userId: string, event: string, payload: unknown): void {
    const sockets = this.server.sockets.sockets;
    for (const [, socket] of sockets) {
      const user = socket.data.user as WsUser | undefined;
      if (user?.sub === userId) {
        socket.emit(event, payload);
      }
    }
  }
}
