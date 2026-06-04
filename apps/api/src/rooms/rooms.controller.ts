/**
 * RoomsController — REST endpoints for room lifecycle.
 *
 * After each mutating operation, the controller broadcasts the new room state
 * via the RoomsGateway so all connected clients receive real-time updates
 * without polling.
 */

import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Patch,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { RoomsService } from './rooms.service';
import { RoomsGateway } from './rooms.gateway';
import { CreateRoomDto } from './dto/create-room.dto';
import { GameService } from '../game/game.service';

@Controller('rooms')
@UseGuards(JwtGuard)
export class RoomsController {
  constructor(
    private readonly service: RoomsService,
    private readonly gateway: RoomsGateway,
    private readonly gameService: GameService,
  ) {}

  // ── Create ─────────────────────────────────────────────────────────────────

  /** Create a new private room. The creator automatically occupies seat 0. */
  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async createRoom(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRoomDto) {
    const room = await this.service.createRoom(user.sub, user.handle, user.displayName, dto);
    return room;
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  /** Get room state by room code (case-insensitive). */
  @Get(':code')
  async getRoom(@Param('code') code: string) {
    const room = await this.service.getRoomByCode(code);
    if (!room) {
      throw new (await import('@nestjs/common')).NotFoundException('Room not found');
    }
    return room;
  }

  // ── Join ───────────────────────────────────────────────────────────────────

  /** Join an existing room by code. Idempotent: re-joining returns current state. */
  @Post(':code/join')
  @Throttle({ default: { ttl: 30_000, limit: 10 } })
  async joinRoom(@CurrentUser() user: AuthenticatedUser, @Param('code') code: string) {
    const room = await this.service.joinRoom(code, user.sub, user.handle, user.displayName);
    this.gateway.broadcastRoomUpdate(room.roomId, room);
    return room;
  }

  // ── Leave ──────────────────────────────────────────────────────────────────

  /** Voluntarily leave the room. Returns 204 (no content) if room was deleted. */
  @Delete(':roomId/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  async leaveRoom(@CurrentUser() user: AuthenticatedUser, @Param('roomId') roomId: string) {
    const updated = await this.service.leaveRoom(roomId, user.sub);
    if (updated) {
      this.gateway.broadcastRoomUpdate(roomId, updated);
    }
  }

  // ── Ready ──────────────────────────────────────────────────────────────────

  /** Toggle the current user's ready status. */
  @Patch(':roomId/ready')
  async setReady(
    @CurrentUser() user: AuthenticatedUser,
    @Param('roomId') roomId: string,
    @Body() body: { ready: boolean },
  ) {
    const room = await this.service.setReady(roomId, user.sub, body.ready);
    this.gateway.broadcastRoomUpdate(roomId, room);
    return room;
  }

  // ── Kick ───────────────────────────────────────────────────────────────────

  /** Host removes a player from their seat. */
  @Delete(':roomId/seats/:seatIdx')
  @HttpCode(HttpStatus.OK)
  async kickSeat(
    @CurrentUser() user: AuthenticatedUser,
    @Param('roomId') roomId: string,
    @Param('seatIdx', ParseIntPipe) seatIdx: number,
  ) {
    const room = await this.service.kickSeat(roomId, seatIdx, user.sub);
    this.gateway.broadcastRoomUpdate(roomId, room);
    return room;
  }

  // ── Start ──────────────────────────────────────────────────────────────────

  /** Host starts the game. Creates the authoritative GameSession and emits room:started. */
  @Post(':roomId/start')
  async startGame(@CurrentUser() user: AuthenticatedUser, @Param('roomId') roomId: string) {
    const { room, gameId } = await this.service.startGame(roomId, user.sub);

    // Build the seat map (4 players, sorted by seat index — all occupied by this point).
    const seatMap = ([0, 1, 2, 3] as const).map(
      (i) => room.seats.find((s) => s.seatIdx === i)!.userId!,
    ) as [string, string, string, string];

    // Create the in-memory GameSession using the room's pre-assigned gameId.
    await this.gameService.createGame(roomId, seatMap, room.settings, gameId);

    this.gateway.broadcastRoomUpdate(roomId, room);
    this.gateway.broadcastRoomStarted(roomId, gameId);
    return { roomId, gameId };
  }
}
