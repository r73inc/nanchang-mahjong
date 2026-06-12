/**
 * RoomsService — all DynamoDB operations for room lifecycle.
 *
 * DDB layout (single-table, per PLAN §2.3):
 *   ROOM#<id> / META       — room metadata, GSI-1 on room code, TTL
 *   ROOM#<id> / SEAT#<n>   — one item per occupied seat (0–3)
 */

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DynamoDBService, DK } from '../database/dynamodb.service';
import type {
  RoomState,
  RoomSeat,
  RoomSettings,
  RoomStatus,
  BotDifficulty,
} from '@nanchang/shared';
import type { CreateRoomDto } from './dto/create-room.dto';

// ── Types stored in DDB ───────────────────────────────────────────────────────

interface RoomMetaItem {
  PK: string;
  SK: 'META';
  roomId: string;
  code: string;
  hostUserId: string;
  status: RoomStatus;
  settings: RoomSettings;
  createdAt: string;
  idleAt: string;
  ttl: number;
  gameId?: string;
  gsi1pk: string;
  gsi1sk: 'META';
}

interface RoomSeatItem {
  PK: string;
  SK: string; // 'SEAT#0' – 'SEAT#3'
  roomId: string;
  seatIdx: number;
  userId: string;
  handle: string;
  ready: boolean;
  joinedAt: string;
  isBot?: boolean;
  botDifficulty?: BotDifficulty;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class RoomsService {
  /** Room TTL: 30 min of idleness. Refreshed on any mutation. */
  private readonly ROOM_TTL_SECONDS = 30 * 60;

  /** Characters used for code generation (no O/0, I/1/L to avoid confusion). */
  private readonly CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

  constructor(private readonly db: DynamoDBService) {}

  // ── Private helpers ─────────────────────────────────────────────────────────

  private generateCode(): string {
    let s = '';
    for (let i = 0; i < 6; i++) {
      s += this.CODE_CHARS[Math.floor(Math.random() * this.CODE_CHARS.length)];
    }
    // Format as XX-XXXX to match the design (e.g. "NX-3K8M")
    return `${s.slice(0, 2)}-${s.slice(2)}`;
  }

  private ttlFromNow(): number {
    return Math.floor(Date.now() / 1000) + this.ROOM_TTL_SECONDS;
  }

  private assembleRoom(meta: RoomMetaItem, seatItems: RoomSeatItem[]): RoomState {
    const seats: RoomSeat[] = [0, 1, 2, 3].map((idx) => {
      const s = seatItems.find((si) => si.seatIdx === idx);
      if (!s) {
        return {
          seatIdx: idx,
          userId: null,
          handle: null,
          ready: false,
          isHost: false,
        };
      }
      return {
        seatIdx: idx,
        userId: s.userId,
        handle: s.handle,
        ready: s.ready,
        isHost: s.userId === meta.hostUserId,
        isBot: s.isBot,
        botDifficulty: s.botDifficulty,
      };
    });

    return {
      roomId: meta.roomId,
      code: meta.code,
      hostUserId: meta.hostUserId,
      status: meta.status,
      seats,
      settings: meta.settings,
      createdAt: meta.createdAt,
      gameId: meta.gameId,
    };
  }

  /** Query all items for a room (META + SEAT#*) and assemble into RoomState. */
  private async queryRoom(roomId: string): Promise<RoomState | null> {
    const res = await this.db.query({
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `ROOM#${roomId}` },
    });

    const items = (res.Items ?? []) as Array<RoomMetaItem | RoomSeatItem>;
    const meta = items.find((i) => i.SK === 'META') as RoomMetaItem | undefined;
    if (!meta) return null;

    const seatItems = items.filter(
      (i) => typeof i.SK === 'string' && i.SK.startsWith('SEAT#'),
    ) as RoomSeatItem[];

    return this.assembleRoom(meta, seatItems);
  }

  /** Refresh the room TTL in META (call after any player activity). */
  private async refreshTtl(roomId: string): Promise<void> {
    await this.db.update({
      Key: DK.room(roomId),
      UpdateExpression: 'SET #ttl = :ttl, idleAt = :now',
      ExpressionAttributeNames: { '#ttl': 'ttl' },
      ExpressionAttributeValues: {
        ':ttl': this.ttlFromNow(),
        ':now': new Date().toISOString(),
      },
    });
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  async createRoom(hostUserId: string, handle: string, dto?: CreateRoomDto): Promise<RoomState> {
    const roomId = randomUUID();
    const code = this.generateCode();
    const now = new Date().toISOString();
    const ttl = this.ttlFromNow();

    const settings: RoomSettings = {
      rounds: dto?.settings?.rounds ?? 'east+south',
      terminationType: dto?.settings?.terminationType ?? 'rounds',
      startingScore: dto?.settings?.startingScore ?? 0,
      timerSecs: dto?.settings?.timerSecs ?? 30,
      minFan: dto?.settings?.minFan ?? 1,
      viewMode: dto?.settings?.viewMode ?? '2D',
      ruleTopBottomJing: dto?.settings?.ruleTopBottomJing ?? false,
      claimWindowSecs: dto?.settings?.claimWindowSecs ?? 8,
    };

    // Build bot seat items (seats filled from the high end: 3, 2, 1).
    // Each bot is pre-marked ready so the host can start without waiting for them.
    const botCount = Math.min(dto?.bots?.count ?? 0, 3);
    const botDifficulty: BotDifficulty = dto?.bots?.difficulty ?? 'easy';
    const botSeatPuts = Array.from({ length: botCount }, (_, i) => {
      const seatIdx = 3 - i; // seats 3, 2, 1 for bots 1, 2, 3
      const botNumber = i + 1;
      return {
        Put: {
          TableName: this.db.tableName,
          Item: {
            ...DK.roomSeat(roomId, seatIdx),
            roomId,
            seatIdx,
            userId: `bot-${botDifficulty}-${seatIdx}`,
            handle: `Bot ${botNumber}`,
            ready: true,
            joinedAt: now,
            isBot: true,
            botDifficulty,
          },
        },
      };
    });

    await this.db.transactWrite({
      TransactItems: [
        {
          Put: {
            TableName: this.db.tableName,
            Item: {
              ...DK.room(roomId),
              roomId,
              code,
              hostUserId,
              status: 'waiting',
              settings,
              createdAt: now,
              idleAt: now,
              ttl,
              gsi1pk: `ROOM_CODE#${code.replace(/-/g, '')}`,
              gsi1sk: 'META',
            },
            // Prevent overwriting an existing room (shouldn't happen with UUID, but defensive)
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
        {
          Put: {
            TableName: this.db.tableName,
            Item: {
              ...DK.roomSeat(roomId, 0),
              roomId,
              seatIdx: 0,
              userId: hostUserId,
              handle,
              ready: false,
              joinedAt: now,
            },
          },
        },
        ...botSeatPuts,
      ],
    });

    return (await this.queryRoom(roomId))!;
  }

  async getRoomById(roomId: string): Promise<RoomState | null> {
    return this.queryRoom(roomId);
  }

  async getRoomByCode(code: string): Promise<RoomState | null> {
    const normalized = code.replace(/-/g, '').toUpperCase();

    const res = await this.db.query({
      IndexName: 'gsi1',
      KeyConditionExpression: 'gsi1pk = :pk AND gsi1sk = :sk',
      ExpressionAttributeValues: {
        ':pk': `ROOM_CODE#${normalized}`,
        ':sk': 'META',
      },
    });

    const meta = (res.Items ?? [])[0] as RoomMetaItem | undefined;
    if (!meta) return null;
    if (meta.status === 'finished') return null;

    return this.queryRoom(meta.roomId);
  }

  async joinRoom(code: string, userId: string, handle: string): Promise<RoomState> {
    const room = await this.getRoomByCode(code);
    if (!room) throw new NotFoundException('Room not found');
    if (room.status !== 'waiting')
      throw new BadRequestException('Room is no longer accepting players');

    // Player already in room?
    const existing = room.seats.find((s) => s.userId === userId);
    if (existing) {
      // Idempotent: already seated, just return current state
      return room;
    }

    // Find first empty seat
    const emptySeat = room.seats.find((s) => s.userId === null);
    if (!emptySeat) throw new ConflictException('Room is full');

    const now = new Date().toISOString();

    await this.db.transactWrite({
      TransactItems: [
        {
          Put: {
            TableName: this.db.tableName,
            Item: {
              ...DK.roomSeat(room.roomId, emptySeat.seatIdx),
              roomId: room.roomId,
              seatIdx: emptySeat.seatIdx,
              userId,
              handle,
              ready: false,
              joinedAt: now,
            },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
        {
          Update: {
            TableName: this.db.tableName,
            Key: DK.room(room.roomId),
            UpdateExpression: 'SET #ttl = :ttl, idleAt = :now',
            ExpressionAttributeNames: { '#ttl': 'ttl' },
            ExpressionAttributeValues: {
              ':ttl': this.ttlFromNow(),
              ':now': now,
            },
          },
        },
      ],
    });

    return (await this.queryRoom(room.roomId))!;
  }

  /**
   * Remove a player from their seat. If the departing player was the host and
   * other seats are occupied, the host role is transferred to the next occupied
   * seat (lowest index first).
   *
   * Returns the updated RoomState, or null if the room was deleted (no one left).
   */
  async leaveRoom(roomId: string, userId: string): Promise<RoomState | null> {
    const room = await this.queryRoom(roomId);
    if (!room) return null;
    if (room.status !== 'waiting') return null; // can't leave a game in progress via this path

    const departing = room.seats.find((s) => s.userId === userId);
    if (!departing) return room; // not in this room, no-op

    const remaining = room.seats.filter((s) => s.userId !== null && s.userId !== userId);

    // Last person leaving → delete the room entirely
    if (remaining.length === 0) {
      await this.db.transactWrite({
        TransactItems: [
          { Delete: { TableName: this.db.tableName, Key: DK.roomSeat(roomId, departing.seatIdx) } },
          { Delete: { TableName: this.db.tableName, Key: DK.room(roomId) } },
        ],
      });
      return null;
    }

    const now = new Date().toISOString();
    const newHost = remaining[0].userId!;

    await this.db.transactWrite({
      TransactItems: [
        { Delete: { TableName: this.db.tableName, Key: DK.roomSeat(roomId, departing.seatIdx) } },
        {
          Update: {
            TableName: this.db.tableName,
            Key: DK.room(roomId),
            UpdateExpression: 'SET hostUserId = :host, #ttl = :ttl, idleAt = :now',
            ExpressionAttributeNames: { '#ttl': 'ttl' },
            ExpressionAttributeValues: {
              ':host': newHost,
              ':ttl': this.ttlFromNow(),
              ':now': now,
            },
          },
        },
      ],
    });

    return (await this.queryRoom(roomId))!;
  }

  /**
   * Host kicks a player by seat index.
   * Returns the updated room state and the userId of the kicked player so the
   * caller can emit a targeted socket event to that player.
   */
  async kickSeat(
    roomId: string,
    seatIdx: number,
    requestingUserId: string,
  ): Promise<{ room: RoomState; kickedUserId: string }> {
    const room = await this.queryRoom(roomId);
    if (!room) throw new NotFoundException('Room not found');
    if (room.hostUserId !== requestingUserId)
      throw new ForbiddenException('Only the host can kick');
    if (room.status !== 'waiting') throw new BadRequestException('Cannot kick during a game');

    const seat = room.seats[seatIdx];
    if (!seat?.userId) throw new BadRequestException('Seat is empty');
    if (seat.userId === requestingUserId) throw new BadRequestException('Cannot kick yourself');

    const kickedUserId = seat.userId;

    await this.db.transactWrite({
      TransactItems: [
        { Delete: { TableName: this.db.tableName, Key: DK.roomSeat(roomId, seatIdx) } },
        {
          Update: {
            TableName: this.db.tableName,
            Key: DK.room(roomId),
            UpdateExpression: 'SET #ttl = :ttl, idleAt = :now',
            ExpressionAttributeNames: { '#ttl': 'ttl' },
            ExpressionAttributeValues: {
              ':ttl': this.ttlFromNow(),
              ':now': new Date().toISOString(),
            },
          },
        },
      ],
    });

    const updatedRoom = (await this.queryRoom(roomId))!;
    return { room: updatedRoom, kickedUserId };
  }

  /**
   * Host adds a bot to a specific empty seat.
   * The bot is named "Bot <seatIdx>" so each seat has a deterministic name.
   */
  async addBotToSeat(
    roomId: string,
    seatIdx: number,
    difficulty: BotDifficulty,
    requestingUserId: string,
  ): Promise<RoomState> {
    const room = await this.queryRoom(roomId);
    if (!room) throw new NotFoundException('Room not found');
    if (room.hostUserId !== requestingUserId)
      throw new ForbiddenException('Only the host can add bots');
    if (room.status !== 'waiting')
      throw new BadRequestException('Cannot change seats during a game');

    const seat = room.seats[seatIdx];
    if (!seat) throw new BadRequestException('Invalid seat index');
    if (seat.userId !== null) throw new ConflictException('Seat is already occupied');

    const now = new Date().toISOString();

    await this.db.transactWrite({
      TransactItems: [
        {
          Put: {
            TableName: this.db.tableName,
            Item: {
              ...DK.roomSeat(roomId, seatIdx),
              roomId,
              seatIdx,
              userId: `bot-${difficulty}-${seatIdx}`,
              handle: `Bot ${seatIdx}`,
              ready: true,
              joinedAt: now,
              isBot: true,
              botDifficulty: difficulty,
            },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
        {
          Update: {
            TableName: this.db.tableName,
            Key: DK.room(roomId),
            UpdateExpression: 'SET #ttl = :ttl, idleAt = :now',
            ExpressionAttributeNames: { '#ttl': 'ttl' },
            ExpressionAttributeValues: {
              ':ttl': this.ttlFromNow(),
              ':now': now,
            },
          },
        },
      ],
    });

    return (await this.queryRoom(roomId))!;
  }

  /**
   * Toggle a player's ready status.
   */
  async setReady(roomId: string, userId: string, ready: boolean): Promise<RoomState> {
    const room = await this.queryRoom(roomId);
    if (!room) throw new NotFoundException('Room not found');
    if (room.status !== 'waiting') throw new BadRequestException('Game already started');

    const seat = room.seats.find((s) => s.userId === userId);
    if (!seat) throw new ForbiddenException('Not in this room');

    await this.db.update({
      Key: DK.roomSeat(roomId, seat.seatIdx),
      UpdateExpression: 'SET ready = :ready',
      ExpressionAttributeValues: { ':ready': ready },
    });

    await this.refreshTtl(roomId);
    return (await this.queryRoom(roomId))!;
  }

  /**
   * Host starts the game. Requires all 4 seats filled and all players ready.
   * Returns the roomId + a newly generated gameId (Phase 7 GameService takes it from here).
   */
  async startGame(
    roomId: string,
    requestingUserId: string,
  ): Promise<{ room: RoomState; gameId: string }> {
    const room = await this.queryRoom(roomId);
    if (!room) throw new NotFoundException('Room not found');
    if (room.hostUserId !== requestingUserId)
      throw new ForbiddenException('Only the host can start');
    if (room.status !== 'waiting') throw new BadRequestException('Game already started');

    const occupiedSeats = room.seats.filter((s) => s.userId !== null);
    if (occupiedSeats.length < 4) {
      throw new BadRequestException('Need 4 players to start');
    }
    // The host is implicitly ready — they signal readiness by clicking Start.
    if (!occupiedSeats.every((s) => s.isHost || s.ready)) {
      throw new BadRequestException('All players must be ready');
    }

    const gameId = randomUUID();

    await this.db.update({
      Key: DK.room(roomId),
      UpdateExpression: 'SET #status = :status, gameId = :gameId, #ttl = :ttl',
      ExpressionAttributeNames: { '#status': 'status', '#ttl': 'ttl' },
      ExpressionAttributeValues: {
        ':status': 'playing',
        ':gameId': gameId,
        ':ttl': this.ttlFromNow(),
      },
    });

    const updated = (await this.queryRoom(roomId))!;
    return { room: updated, gameId };
  }

  /**
   * Update mutable pre-game settings. Only the host may call this, and only
   * while the room is still in the 'waiting' state.
   * Supports: viewMode, ruleTopBottomJing, rounds, terminationType, claimWindowSecs.
   */
  async updateSettings(
    roomId: string,
    requestingUserId: string,
    updates: {
      viewMode?: '2D' | '3D';
      ruleTopBottomJing?: boolean;
      rounds?: 'east' | 'east+south';
      terminationType?: 'rounds' | 'bust';
      claimWindowSecs?: number;
    },
  ): Promise<RoomState> {
    const room = await this.queryRoom(roomId);
    if (!room) throw new NotFoundException('Room not found');
    if (room.hostUserId !== requestingUserId)
      throw new ForbiddenException('Only the host can update settings');
    if (room.status !== 'waiting')
      throw new BadRequestException('Cannot change settings after game starts');

    const setParts: string[] = ['#ttl = :ttl', 'idleAt = :now'];
    const names: Record<string, string> = { '#ttl': 'ttl' };
    const values: Record<string, unknown> = {
      ':ttl': this.ttlFromNow(),
      ':now': new Date().toISOString(),
    };

    if (updates.viewMode !== undefined) {
      setParts.push('settings.viewMode = :viewMode');
      values[':viewMode'] = updates.viewMode;
    }
    if (updates.ruleTopBottomJing !== undefined) {
      setParts.push('settings.ruleTopBottomJing = :ruleTopBottomJing');
      values[':ruleTopBottomJing'] = updates.ruleTopBottomJing;
    }
    if (updates.rounds !== undefined) {
      setParts.push('settings.rounds = :rounds');
      values[':rounds'] = updates.rounds;
    }
    if (updates.terminationType !== undefined) {
      setParts.push('settings.terminationType = :terminationType');
      values[':terminationType'] = updates.terminationType;
    }
    if (updates.claimWindowSecs !== undefined) {
      setParts.push('settings.claimWindowSecs = :claimWindowSecs');
      values[':claimWindowSecs'] = updates.claimWindowSecs;
    }

    await this.db.update({
      Key: DK.room(roomId),
      UpdateExpression: `SET ${setParts.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    });

    return (await this.queryRoom(roomId))!;
  }
}
