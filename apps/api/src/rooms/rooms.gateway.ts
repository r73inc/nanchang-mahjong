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

  async handleDisconnect(client: Socket) {
    const user = client.data.user as WsUser | undefined;
    const roomId = client.data.roomId as string | undefined;

    if (!user || !roomId) return;

    this.logger.debug(`WS disconnected: ${user.handle} — leaving room ${roomId}`);

    try {
      const updated = await this.roomsService.leaveRoom(roomId, user.sub);
      if (updated) {
        this.broadcastRoomUpdate(roomId, updated);
      } else {
        // Room was deleted — no one left to notify
      }
    } catch {
      // Room may have already been cleaned up; silently ignore
    }
  }

  // ── Message handlers ────────────────────────────────────────────────────────

  /**
   * Client subscribes to real-time updates for a specific room.
   * `socket.data.roomId` is set so `handleDisconnect` knows which room to
   * clean up when this connection drops.
   */
  @SubscribeMessage('room:subscribe')
  handleSubscribe(client: Socket, payload: { roomId: string }) {
    const { roomId } = payload;
    if (!roomId) return;

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
}
