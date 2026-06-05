import { Test, TestingModule } from '@nestjs/testing';
import { RoomsGateway } from './rooms.gateway';
import { RoomsService } from './rooms.service';
import type { RoomState } from '@nanchang/shared';

// ── Helpers ───────────────────────────────────────────────────────────────────

interface FakeSocket {
  id: string;
  data: Record<string, unknown>;
  join: jest.Mock;
  leave: jest.Mock;
  disconnect: jest.Mock;
}

function makeSocket(dataOverrides: Record<string, unknown> = {}): FakeSocket {
  return {
    id: 'socket-1',
    data: {
      user: { sub: 'u1', handle: 'player1', displayName: 'Player 1', role: 'user' },
      ...dataOverrides,
    },
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
  };
}

const SAMPLE_ROOM: RoomState = {
  roomId: 'room-1',
  code: 'AB-1234',
  hostUserId: 'u1',
  status: 'waiting',
  seats: [
    { seatIdx: 0, userId: 'u1', handle: 'player1', displayName: 'P1', ready: false, isHost: true },
    { seatIdx: 1, userId: null, handle: null, displayName: null, ready: false, isHost: false },
    { seatIdx: 2, userId: null, handle: null, displayName: null, ready: false, isHost: false },
    { seatIdx: 3, userId: null, handle: null, displayName: null, ready: false, isHost: false },
  ],
  settings: {
    rounds: 'east+south',
    terminationType: 'rounds',
    startingScore: 0,
    timerSecs: 30,
    minFan: 1,
    viewMode: '3D' as const,
  },
  createdAt: '2024-01-01T00:00:00.000Z',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RoomsGateway', () => {
  let gateway: RoomsGateway;
  let toEmit: jest.Mock;
  let mockRoomsService: Partial<RoomsService>;

  beforeEach(async () => {
    toEmit = jest.fn();
    mockRoomsService = {
      leaveRoom: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [RoomsGateway, { provide: RoomsService, useValue: mockRoomsService }],
    }).compile();

    gateway = module.get<RoomsGateway>(RoomsGateway);

    // Simulate what @WebSocketServer() injects
    (gateway as unknown as { server: unknown }).server = {
      to: jest.fn().mockReturnValue({ emit: toEmit }),
    };
  });

  // ── Connection ─────────────────────────────────────────────────────────────

  describe('handleConnection', () => {
    it('Gameplay·ws-auth: disconnects unauthenticated sockets', () => {
      const socket = makeSocket({ user: undefined });
      gateway.handleConnection(socket as never);
      expect(socket.disconnect).toHaveBeenCalled();
    });

    it('allows authenticated sockets through', () => {
      const socket = makeSocket();
      gateway.handleConnection(socket as never);
      expect(socket.disconnect).not.toHaveBeenCalled();
    });
  });

  // ── Subscribe / Unsubscribe ─────────────────────────────────────────────────

  describe('handleSubscribe', () => {
    it('joins the socket to the correct room', () => {
      const socket = makeSocket();
      gateway.handleSubscribe(socket as never, { roomId: 'room-1' });
      expect(socket.join).toHaveBeenCalledWith('room:room-1');
      expect(socket.data['roomId']).toBe('room-1');
    });

    it('leaves the previous room before joining the new one', () => {
      const socket = makeSocket({ roomId: 'old-room' });
      gateway.handleSubscribe(socket as never, { roomId: 'new-room' });
      expect(socket.leave).toHaveBeenCalledWith('room:old-room');
      expect(socket.join).toHaveBeenCalledWith('room:new-room');
    });

    it('ignores empty roomId', () => {
      const socket = makeSocket();
      gateway.handleSubscribe(socket as never, { roomId: '' });
      expect(socket.join).not.toHaveBeenCalled();
    });
  });

  describe('handleUnsubscribe', () => {
    it('leaves the socket room', () => {
      const socket = makeSocket({ roomId: 'room-1' });
      gateway.handleUnsubscribe(socket as never, { roomId: 'room-1' });
      expect(socket.leave).toHaveBeenCalledWith('room:room-1');
    });
  });

  // ── Broadcasts ─────────────────────────────────────────────────────────────

  describe('broadcastRoomUpdate', () => {
    it('emits room:update to the correct socket.io room', () => {
      gateway.broadcastRoomUpdate('room-1', SAMPLE_ROOM);
      const serverObj = (gateway as unknown as { server: { to: jest.Mock } }).server;
      expect(serverObj.to).toHaveBeenCalledWith('room:room-1');
      expect(toEmit).toHaveBeenCalledWith('room:update', { room: SAMPLE_ROOM });
    });
  });

  describe('broadcastRoomStarted', () => {
    it('emits room:started with roomId and gameId', () => {
      gateway.broadcastRoomStarted('room-1', 'game-abc');
      expect(toEmit).toHaveBeenCalledWith('room:started', { roomId: 'room-1', gameId: 'game-abc' });
    });
  });

  // ── Disconnect cleanup ─────────────────────────────────────────────────────

  describe('handleDisconnect', () => {
    it('calls leaveRoom and broadcasts when roomId is set', async () => {
      const socket = makeSocket({ roomId: 'room-1' });
      (mockRoomsService.leaveRoom as jest.Mock).mockResolvedValue(SAMPLE_ROOM);

      await gateway.handleDisconnect(socket as never);

      expect(mockRoomsService.leaveRoom).toHaveBeenCalledWith('room-1', 'u1');
      expect(toEmit).toHaveBeenCalledWith('room:update', { room: SAMPLE_ROOM });
    });

    it('does nothing when socket has no roomId', async () => {
      const socket = makeSocket();
      await gateway.handleDisconnect(socket as never);
      expect(mockRoomsService.leaveRoom).not.toHaveBeenCalled();
    });
  });
});
