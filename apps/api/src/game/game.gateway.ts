/**
 * GameGateway — Socket.IO gateway for real-time gameplay.
 *
 * Thin gateway: validate inbound payloads via shared zod schemas,
 * authorize, rate-limit, and delegate to GameService.
 *
 * Auth is enforced at the transport level by WsAuthAdapter (main.ts),
 * so socket.data.user is guaranteed to be populated on every connection.
 */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import {
  JoinPayloadSchema,
  DiscardPayloadSchema,
  ClaimPayloadSchema,
  KongConcealedPayloadSchema,
  RollDicePayloadSchema,
} from '@nanchang/shared';
import type { WsUser } from '../common/adapters/ws-auth.adapter';
import { GameService } from './game.service';
import { WsThrottle } from './ws-throttle';

// ── Per-event rate limits (tokens / window) ───────────────────────────────────
// Limit  | Event
// --------|------------------
// 2/s     | game:discard
// 4/s     | game:claim, game:pass
// 3/10s   | game:join
// 2/s     | game:kong-*
// 2/s     | game:concede, game:reveal-jing

@WebSocketGateway({ cors: { origin: '*' } })
export class GameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(GameGateway.name);

  /** Per-socket per-event token buckets. */
  private readonly throttle = new WsThrottle({
    'game:join': { limit: 3, windowMs: 10_000 },
    'game:discard': { limit: 2, windowMs: 1_000 },
    'game:claim': { limit: 4, windowMs: 1_000 },
    'game:pass': { limit: 4, windowMs: 1_000 },
    'game:kong-concealed': { limit: 2, windowMs: 1_000 },
    'game:kong-add': { limit: 2, windowMs: 1_000 },
    'game:tsumo': { limit: 2, windowMs: 1_000 },
    'game:concede': { limit: 2, windowMs: 1_000 },
    'game:reveal-jing': { limit: 2, windowMs: 1_000 },
    'game:advance-pre-game': { limit: 3, windowMs: 2_000 },
    'game:advance-hand': { limit: 2, windowMs: 2_000 },
    'game:save-and-quit': { limit: 1, windowMs: 10_000 },
    'game:rematch': { limit: 1, windowMs: 10_000 },
    'game:roll-dice': { limit: 2, windowMs: 1_000 },
  });

  constructor(private readonly gameService: GameService) {}

  afterInit(server: Server): void {
    this.gameService.setServer(server);
    this.logger.log('GameGateway initialised');
  }

  handleConnection(socket: Socket): void {
    const user = socket.data.user as WsUser | undefined;
    if (!user) {
      socket.disconnect();
      return;
    }
    this.logger.debug(`WS game:connected — ${user.handle} (${socket.id})`);
  }

  handleDisconnect(socket: Socket): void {
    const user = socket.data.user as WsUser | undefined;
    if (user) {
      this.logger.debug(`WS game:disconnected — ${user.handle} (${socket.id})`);
    }
    this.throttle.clearSocket(socket.id);
    this.gameService.handleDisconnect(socket.id);
  }

  // ── Inbound handlers ─────────────────────────────────────────────────────────

  @SubscribeMessage('game:join')
  async handleJoin(socket: Socket, raw: unknown): Promise<void> {
    if (!this.checkRate(socket, 'game:join')) return;
    const user = this.getUser(socket);
    if (!user) return;

    const parsed = JoinPayloadSchema.safeParse(raw);
    if (!parsed.success) return this.emitError(socket, 'INVALID_PAYLOAD');

    const { gameId, spectate } = parsed.data;
    await this.gameService.joinGame(socket, user.sub, gameId, spectate ?? false);
  }

  @SubscribeMessage('game:reveal-jing')
  handleRevealJing(socket: Socket, raw: unknown): void {
    if (!this.checkRate(socket, 'game:reveal-jing')) return;
    const user = this.getUser(socket);
    if (!user) return;

    const gameId = (raw as Record<string, unknown>)?.gameId as string | undefined;
    if (!gameId) return this.emitError(socket, 'INVALID_PAYLOAD');

    this.gameService.handleRevealJing(socket, user.sub, gameId);
  }

  @SubscribeMessage('game:discard')
  handleDiscard(socket: Socket, raw: unknown): void {
    if (!this.checkRate(socket, 'game:discard')) return;
    const user = this.getUser(socket);
    if (!user) return;

    const parsed = DiscardPayloadSchema.safeParse(raw);
    if (!parsed.success) return this.emitError(socket, 'INVALID_PAYLOAD');

    const gameId = socket.data.gameId as string | undefined;
    if (!gameId) return this.emitError(socket, 'NOT_IN_GAME');

    this.gameService.handleDiscard(socket, user.sub, gameId, parsed.data.tile);
  }

  @SubscribeMessage('game:claim')
  handleClaim(socket: Socket, raw: unknown): void {
    if (!this.checkRate(socket, 'game:claim')) return;
    const user = this.getUser(socket);
    if (!user) return;

    const parsed = ClaimPayloadSchema.safeParse(raw);
    if (!parsed.success) return this.emitError(socket, 'INVALID_PAYLOAD');

    const gameId = socket.data.gameId as string | undefined;
    if (!gameId) return this.emitError(socket, 'NOT_IN_GAME');

    this.gameService.handleClaim(socket, user.sub, gameId, parsed.data.kind, parsed.data.sequence);
  }

  @SubscribeMessage('game:pass')
  handlePass(socket: Socket): void {
    if (!this.checkRate(socket, 'game:pass')) return;
    const user = this.getUser(socket);
    if (!user) return;

    const gameId = socket.data.gameId as string | undefined;
    if (!gameId) return this.emitError(socket, 'NOT_IN_GAME');

    this.gameService.handlePass(socket, user.sub, gameId);
  }

  @SubscribeMessage('game:kong-concealed')
  handleKongConcealed(socket: Socket, raw: unknown): void {
    if (!this.checkRate(socket, 'game:kong-concealed')) return;
    const user = this.getUser(socket);
    if (!user) return;

    const parsed = KongConcealedPayloadSchema.safeParse(raw);
    if (!parsed.success) return this.emitError(socket, 'INVALID_PAYLOAD');

    const gameId = socket.data.gameId as string | undefined;
    if (!gameId) return this.emitError(socket, 'NOT_IN_GAME');

    this.gameService.handleKongConcealed(socket, user.sub, gameId, parsed.data.tile);
  }

  @SubscribeMessage('game:kong-add')
  handleKongAdd(socket: Socket, raw: unknown): void {
    if (!this.checkRate(socket, 'game:kong-add')) return;
    const user = this.getUser(socket);
    if (!user) return;

    const parsed = KongConcealedPayloadSchema.safeParse(raw);
    if (!parsed.success) return this.emitError(socket, 'INVALID_PAYLOAD');

    const gameId = socket.data.gameId as string | undefined;
    if (!gameId) return this.emitError(socket, 'NOT_IN_GAME');

    this.gameService.handleKongAdd(socket, user.sub, gameId, parsed.data.tile);
  }

  @SubscribeMessage('game:tsumo')
  handleTsumo(socket: Socket): void {
    if (!this.checkRate(socket, 'game:tsumo')) return;
    const user = this.getUser(socket);
    if (!user) return;

    const gameId = socket.data.gameId as string | undefined;
    if (!gameId) return this.emitError(socket, 'NOT_IN_GAME');

    this.gameService.handleTsumo(socket, user.sub, gameId);
  }

  @SubscribeMessage('game:concede')
  handleConcede(socket: Socket): void {
    if (!this.checkRate(socket, 'game:concede')) return;
    const user = this.getUser(socket);
    if (!user) return;

    const gameId = socket.data.gameId as string | undefined;
    if (!gameId) return this.emitError(socket, 'NOT_IN_GAME');

    this.gameService.handleConcede(socket, user.sub, gameId);
  }

  @SubscribeMessage('game:save-and-quit')
  async handleSaveAndQuit(socket: Socket): Promise<void> {
    if (!this.checkRate(socket, 'game:save-and-quit')) return;
    const user = this.getUser(socket);
    if (!user) return;

    const gameId = socket.data.gameId as string | undefined;
    if (!gameId) return this.emitError(socket, 'NOT_IN_GAME');

    await this.gameService.handleSaveAndQuit(socket, user.sub, gameId);
  }

  @SubscribeMessage('game:start-restore')
  handleStartRestore(socket: Socket): void {
    const user = this.getUser(socket);
    if (!user) return;

    const gameId = socket.data.gameId as string | undefined;
    if (!gameId) return this.emitError(socket, 'NOT_IN_GAME');

    this.gameService.handleStartRestore(socket, user.sub, gameId);
  }

  @SubscribeMessage('game:roll-dice')
  handleRollDice(socket: Socket, raw: unknown): void {
    if (!this.checkRate(socket, 'game:roll-dice')) return;
    const user = this.getUser(socket);
    if (!user) return;

    const parsed = RollDicePayloadSchema.safeParse(raw ?? {});
    if (!parsed.success) return this.emitError(socket, 'INVALID_PAYLOAD');

    const gameId = socket.data.gameId as string | undefined;
    if (!gameId) return this.emitError(socket, 'NOT_IN_GAME');

    this.gameService.handleRollDice(socket, user.sub, gameId);
  }

  @SubscribeMessage('game:advance-pre-game')
  handleAdvancePreGame(socket: Socket, raw: unknown): void {
    if (!this.checkRate(socket, 'game:advance-pre-game')) return;
    const user = this.getUser(socket);
    if (!user) return;

    const gameId = (raw as Record<string, unknown>)?.gameId as string | undefined;
    if (!gameId) return this.emitError(socket, 'INVALID_PAYLOAD');

    this.gameService.handleAdvancePreGame(socket, user.sub, gameId);
  }

  @SubscribeMessage('game:advance-hand')
  handleAdvanceHand(socket: Socket, raw: unknown): void {
    if (!this.checkRate(socket, 'game:advance-hand')) return;
    const user = this.getUser(socket);
    if (!user) return;

    const gameId = (raw as Record<string, unknown>)?.gameId as string | undefined;
    if (!gameId) return this.emitError(socket, 'INVALID_PAYLOAD');

    this.gameService.handleAdvanceHand(socket, user.sub, gameId);
  }

  @SubscribeMessage('game:rematch')
  async handleRematch(socket: Socket): Promise<void> {
    if (!this.checkRate(socket, 'game:rematch')) return;
    const user = this.getUser(socket);
    if (!user) return;

    const gameId = socket.data.gameId as string | undefined;
    if (!gameId) return this.emitError(socket, 'NOT_IN_GAME');

    await this.gameService.requestRematch(socket, user.sub, gameId);
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private getUser(socket: Socket): WsUser | null {
    const user = socket.data.user as WsUser | undefined;
    if (!user) {
      socket.disconnect();
      return null;
    }
    return user;
  }

  private checkRate(socket: Socket, event: string): boolean {
    if (this.throttle.allow(socket.id, event)) return true;
    this.emitError(socket, 'TOO_FAST');
    return false;
  }

  private emitError(socket: Socket, code: string, message?: string): void {
    socket.emit('game:error', { code, message: message ?? code });
  }

  /**
   * Store the gameId on the socket so subsequent events can look it up
   * without re-parsing the payload. Called by GameService.joinGame.
   */
  setSocketGameId(socketId: string, gameId: string): void {
    const sockets = this.server?.sockets.sockets;
    const socket = sockets?.get(socketId);
    if (socket) {
      socket.data.gameId = gameId;
    }
  }
}
