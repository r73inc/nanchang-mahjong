import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import type { TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import { RoomsService } from './rooms.service';
import { DynamoDBService } from '../database/dynamodb.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockDb() {
  return {
    tableName: 'test-table',
    get: jest.fn(),
    put: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn(),
    query: jest.fn(),
    scan: jest.fn(),
    transactWrite: jest.fn().mockResolvedValue({}),
  };
}

type MockDb = ReturnType<typeof makeMockDb>;

/** Returns the first TransactWriteCommandInput passed to db.transactWrite. */
function txInput(db: MockDb): TransactWriteCommandInput {
  return db.transactWrite.mock.calls[0][0] as TransactWriteCommandInput;
}

/** Returns the first argument passed to db.update. */
function updateInput(db: MockDb) {
  return db.update.mock.calls[0][0] as Record<string, unknown>;
}

/** Build the DDB items that `queryRoom` expects for a given room. */
function buildRoomItems(overrides: Record<string, unknown> = {}) {
  const roomId = (overrides.roomId as string) ?? 'room-1';
  const code = (overrides.code as string) ?? 'AB-1234';
  const hostUserId = (overrides.hostUserId as string) ?? 'user-host';
  const status = (overrides.status as string) ?? 'waiting';

  const meta = {
    PK: `ROOM#${roomId}`,
    SK: 'META',
    roomId,
    code,
    hostUserId,
    status,
    settings: { rounds: 'east+south', timerSecs: 8, minFan: 3 },
    createdAt: '2024-01-01T00:00:00.000Z',
    idleAt: '2024-01-01T00:00:00.000Z',
    ttl: 9999999999,
    gsi1pk: `ROOM_CODE#${code.replace('-', '')}`,
    gsi1sk: 'META',
  };

  const seat0 = {
    PK: `ROOM#${roomId}`,
    SK: 'SEAT#0',
    roomId,
    seatIdx: 0,
    userId: 'user-host',
    handle: 'hosthandle',
    ready: false,
    joinedAt: '2024-01-01T00:00:00.000Z',
  };

  return { meta, seat0, items: [meta, seat0] };
}

/** Build 4 occupied, all-ready seats for startGame tests. */
function buildFullReadyRoom(roomId = 'room-full') {
  const { meta, items } = buildRoomItems({ roomId });
  const otherSeats = [1, 2, 3].map((idx) => ({
    PK: `ROOM#${roomId}`,
    SK: `SEAT#${idx}`,
    roomId,
    seatIdx: idx,
    userId: `user-${idx}`,
    handle: `handle${idx}`,
    ready: true,
    joinedAt: '2024-01-01T00:00:00.000Z',
  }));
  // Host also ready
  const hostSeat = { ...items[1], ready: true };
  return { meta, items: [meta, hostSeat, ...otherSeats] };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RoomsService', () => {
  let service: RoomsService;
  let db: MockDb;

  beforeEach(async () => {
    db = makeMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [RoomsService, { provide: DynamoDBService, useValue: db }],
    }).compile();

    service = module.get<RoomsService>(RoomsService);
  });

  // ── createRoom ─────────────────────────────────────────────────────────────

  describe('createRoom', () => {
    it('writes META + SEAT#0 in a transaction', async () => {
      db.query.mockResolvedValue({ Items: buildRoomItems().items });

      await service.createRoom('user-host', 'hosthandle');

      expect(db.transactWrite).toHaveBeenCalledTimes(1);
      const { TransactItems } = txInput(db);
      expect(TransactItems).toHaveLength(2);
      const meta = (TransactItems![0] as { Put: { Item: Record<string, unknown> } }).Put.Item;
      const seat = (TransactItems![1] as { Put: { Item: Record<string, unknown> } }).Put.Item;
      expect(meta['SK']).toBe('META');
      expect(seat['SK']).toBe('SEAT#0');
      expect(seat['userId']).toBe('user-host');
    });

    it('returns a RoomState with the host in seat 0', async () => {
      db.query.mockResolvedValue({ Items: buildRoomItems().items });

      const room = await service.createRoom('user-host', 'hosthandle');

      expect(room.seats[0].userId).toBe('user-host');
      expect(room.seats[0].isHost).toBe(true);
      expect(room.seats[1].userId).toBeNull();
      expect(room.status).toBe('waiting');
    });

    it('generates a XX-XXXX room code', async () => {
      db.query.mockResolvedValue({ Items: buildRoomItems().items });

      await service.createRoom('user-host', 'h');

      const { TransactItems } = txInput(db);
      const meta = (TransactItems![0] as { Put: { Item: Record<string, unknown> } }).Put.Item;
      expect(meta['code']).toMatch(/^[A-Z0-9]{2}-[A-Z0-9]{4}$/);
    });

    it('merges provided settings', async () => {
      db.query.mockResolvedValue({ Items: buildRoomItems().items });

      await service.createRoom('user-host', 'h', {
        settings: { timerSecs: 15, rounds: undefined, minFan: undefined },
      });

      const { TransactItems } = txInput(db);
      const meta = (TransactItems![0] as { Put: { Item: Record<string, unknown> } }).Put.Item;
      const settings = meta['settings'] as Record<string, unknown>;
      expect(settings['timerSecs']).toBe(15);
    });
  });

  // ── getRoomByCode ──────────────────────────────────────────────────────────

  describe('getRoomByCode', () => {
    it('Room·share-code: lookup is case-insensitive and dash-tolerant', async () => {
      const { meta, items } = buildRoomItems({ code: 'AB-1234' });
      db.query.mockResolvedValueOnce({ Items: [meta] }).mockResolvedValue({ Items: items });

      const room = await service.getRoomByCode('ab-1234');
      expect(room).not.toBeNull();
      expect(room!.code).toBe('AB-1234');
    });

    it('returns null for a non-existent code', async () => {
      db.query.mockResolvedValue({ Items: [] });
      expect(await service.getRoomByCode('ZZ-9999')).toBeNull();
    });

    it('returns null when room status is finished', async () => {
      const { meta } = buildRoomItems({ status: 'finished' });
      db.query.mockResolvedValueOnce({ Items: [meta] });
      expect(await service.getRoomByCode('AB-1234')).toBeNull();
    });
  });

  // ── joinRoom ───────────────────────────────────────────────────────────────

  describe('joinRoom', () => {
    it('Room·create-join-leave: joining adds a seat', async () => {
      const { meta, items } = buildRoomItems();
      db.query
        .mockResolvedValueOnce({ Items: [meta] })
        .mockResolvedValueOnce({ Items: items })
        .mockResolvedValue({ Items: items });

      await service.joinRoom('AB-1234', 'user-2', 'h2');

      expect(db.transactWrite).toHaveBeenCalled();
      const { TransactItems } = txInput(db);
      const put = (TransactItems![0] as { Put: { Item: Record<string, unknown> } }).Put.Item;
      expect(put['userId']).toBe('user-2');
    });

    it('Room·full: 5th joiner is rejected', async () => {
      const { meta } = buildRoomItems();
      const fullSeats = [0, 1, 2, 3].map((n) => ({
        PK: 'ROOM#room-1',
        SK: `SEAT#${n}`,
        roomId: 'room-1',
        seatIdx: n,
        userId: `user-${n}`,
        handle: `h${n}`,
        ready: false,
        joinedAt: '2024-01-01T00:00:00.000Z',
      }));
      db.query
        .mockResolvedValueOnce({ Items: [meta] })
        .mockResolvedValueOnce({ Items: [meta, ...fullSeats] })
        .mockResolvedValue({ Items: [meta, ...fullSeats] });

      await expect(service.joinRoom('AB-1234', 'user-5', 'h5')).rejects.toThrow(ConflictException);
    });

    it('is idempotent when player is already seated', async () => {
      const { meta, items } = buildRoomItems();
      db.query.mockResolvedValueOnce({ Items: [meta] }).mockResolvedValue({ Items: items });

      const room = await service.joinRoom('AB-1234', 'user-host', 'hosthandle');
      expect(db.transactWrite).not.toHaveBeenCalled();
      expect(room.seats[0].userId).toBe('user-host');
    });

    it('throws NotFoundException for unknown code', async () => {
      db.query.mockResolvedValue({ Items: [] });
      await expect(service.joinRoom('ZZ-9999', 'u', 'h')).rejects.toThrow(NotFoundException);
    });
  });

  // ── leaveRoom ─────────────────────────────────────────────────────────────

  describe('leaveRoom', () => {
    it('Room·create-join-leave: removes the departing seat', async () => {
      db.query.mockResolvedValue({ Items: buildRoomItems().items });

      await service.leaveRoom('room-1', 'user-host');

      const { TransactItems } = txInput(db);
      const del = (TransactItems![0] as { Delete: { Key: Record<string, unknown> } }).Delete.Key;
      expect(del['SK']).toBe('SEAT#0');
    });

    it('deletes the room when the last player leaves', async () => {
      db.query.mockResolvedValue({ Items: buildRoomItems().items });

      const result = await service.leaveRoom('room-1', 'user-host');
      expect(result).toBeNull();

      const { TransactItems } = txInput(db);
      const deletedKeys = (
        TransactItems as Array<{ Delete: { Key: Record<string, unknown> } }>
      ).map((i) => i.Delete.Key['SK']);
      expect(deletedKeys).toContain('META');
    });

    it('Room·host-leaves: auto-promotes the next seated player', async () => {
      const { meta, seat0 } = buildRoomItems();
      const seat1 = {
        PK: 'ROOM#room-1',
        SK: 'SEAT#1',
        roomId: 'room-1',
        seatIdx: 1,
        userId: 'user-2',
        handle: 'h2',
        ready: false,
        joinedAt: '2024-01-01T00:00:00.000Z',
      };
      db.query.mockResolvedValue({ Items: [meta, seat0, seat1] });

      await service.leaveRoom('room-1', 'user-host');

      const { TransactItems } = txInput(db);
      const upd = (
        TransactItems![1] as { Update: { ExpressionAttributeValues: Record<string, unknown> } }
      ).Update.ExpressionAttributeValues;
      expect(upd[':host']).toBe('user-2');
    });
  });

  // ── setReady ───────────────────────────────────────────────────────────────

  describe('setReady', () => {
    it('updates ready flag for the seated player', async () => {
      db.query.mockResolvedValue({ Items: buildRoomItems().items });

      await service.setReady('room-1', 'user-host', true);

      const input = updateInput(db);
      const attrs = input['ExpressionAttributeValues'] as Record<string, unknown>;
      expect(attrs[':ready']).toBe(true);
    });

    it('throws ForbiddenException when player is not in the room', async () => {
      db.query.mockResolvedValue({ Items: buildRoomItems().items });

      await expect(service.setReady('room-1', 'outsider', true)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── kickSeat ───────────────────────────────────────────────────────────────

  describe('kickSeat', () => {
    it('removes the specified seat and returns the kicked userId', async () => {
      const { meta, seat0 } = buildRoomItems();
      const seat1 = {
        PK: 'ROOM#room-1',
        SK: 'SEAT#1',
        roomId: 'room-1',
        seatIdx: 1,
        userId: 'user-2',
        handle: 'h2',
        ready: false,
        joinedAt: '2024-01-01T00:00:00.000Z',
      };
      db.query.mockResolvedValue({ Items: [meta, seat0, seat1] });

      const result = await service.kickSeat('room-1', 1, 'user-host');

      const { TransactItems } = txInput(db);
      const del = (TransactItems![0] as { Delete: { Key: Record<string, unknown> } }).Delete.Key;
      expect(del['SK']).toBe('SEAT#1');
      expect(result.kickedUserId).toBe('user-2');
    });

    it('throws ForbiddenException when caller is not host', async () => {
      db.query.mockResolvedValue({ Items: buildRoomItems().items });

      await expect(service.kickSeat('room-1', 0, 'not-host')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── startGame ─────────────────────────────────────────────────────────────

  describe('startGame', () => {
    it('Room·full + all ready → starts and returns gameId', async () => {
      db.query.mockResolvedValue({ Items: buildFullReadyRoom('room-full').items });

      const { gameId } = await service.startGame('room-full', 'user-host');

      expect(typeof gameId).toBe('string');
      expect(gameId.length).toBeGreaterThan(0);
      const input = updateInput(db);
      const attrs = input['ExpressionAttributeValues'] as Record<string, unknown>;
      expect(attrs[':status']).toBe('playing');
    });

    it('throws when fewer than 4 players', async () => {
      db.query.mockResolvedValue({ Items: buildRoomItems().items });
      await expect(service.startGame('room-1', 'user-host')).rejects.toThrow(BadRequestException);
    });

    it('throws when a player is not ready', async () => {
      const { items } = buildFullReadyRoom('room-full');
      const seat3 = items.find((i) => i.SK === 'SEAT#3') as Record<string, unknown>;
      seat3['ready'] = false;
      db.query.mockResolvedValue({ Items: items });

      await expect(service.startGame('room-full', 'user-host')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws when caller is not host', async () => {
      db.query.mockResolvedValue({ Items: buildFullReadyRoom().items });
      await expect(service.startGame('room-full', 'user-not-host')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── Room·ttl ───────────────────────────────────────────────────────────────

  describe('Room·ttl', () => {
    it('writes a ttl attribute on create', async () => {
      db.query.mockResolvedValue({ Items: buildRoomItems().items });

      await service.createRoom('u', 'h');

      const { TransactItems } = txInput(db);
      const meta = (TransactItems![0] as { Put: { Item: Record<string, unknown> } }).Put.Item;
      expect(typeof meta['ttl']).toBe('number');
      const expectedMin = Math.floor(Date.now() / 1000) + 29 * 60;
      expect(meta['ttl'] as number).toBeGreaterThan(expectedMin);
    });
  });
});
