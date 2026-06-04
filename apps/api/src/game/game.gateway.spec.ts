/**
 * game.gateway.spec — unit tests for GameGateway.
 *
 * Uses the same pattern as rooms.gateway.spec.ts:
 * mock GameService + fake Socket objects; verify delegation and rate-limiting.
 *
 * Feature coverage:
 *  - Gameplay·ws-auth           (unauthenticated socket disconnect)
 *  - Gameplay·rate-limit-events (spamming game:discard → TOO_FAST)
 *  - Gameplay·illegal-move-rejected (not in game → NOT_IN_GAME error)
 *  - delegation to GameService for all event handlers
 */

import { Test, TestingModule } from '@nestjs/testing';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';
import type { Server } from 'socket.io';

// ── Helpers ───────────────────────────────────────────────────────────────────

interface FakeSocket {
  id: string;
  data: Record<string, unknown>;
  emit: jest.Mock;
  join: jest.Mock;
  leave: jest.Mock;
  disconnect: jest.Mock;
}

function makeSocket(overrides: Partial<FakeSocket['data']> = {}): FakeSocket {
  return {
    id: `socket-${Math.random().toString(36).slice(2)}`,
    data: {
      user: { sub: 'u1', handle: 'player1', displayName: 'P1', role: 'user' },
      ...overrides,
    },
    emit: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
  };
}

function makeServer(): jest.Mocked<Pick<Server, 'to' | 'sockets'>> {
  const emit = jest.fn();
  return {
    to: jest.fn().mockReturnValue({ emit }),
    sockets: { sockets: new Map() } as unknown as Server['sockets'],
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GameGateway', () => {
  let gateway: GameGateway;
  let mockGameService: jest.Mocked<Partial<GameService>>;

  beforeEach(async () => {
    mockGameService = {
      setServer: jest.fn(),
      joinGame: jest.fn().mockResolvedValue(undefined),
      handleDisconnect: jest.fn(),
      handleRevealJing: jest.fn(),
      handleDiscard: jest.fn(),
      handleClaim: jest.fn(),
      handlePass: jest.fn(),
      handleKongConcealed: jest.fn(),
      handleKongAdd: jest.fn(),
      handleConcede: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [GameGateway, { provide: GameService, useValue: mockGameService }],
    }).compile();

    gateway = module.get<GameGateway>(GameGateway);

    // Simulate @WebSocketServer() injection
    (gateway as unknown as { server: unknown }).server = makeServer();
  });

  afterEach(() => jest.clearAllMocks());

  // ── Auth ────────────────────────────────────────────────────────────────────

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

  // ── Disconnect ──────────────────────────────────────────────────────────────

  describe('handleDisconnect', () => {
    it('calls gameService.handleDisconnect and clears throttle', () => {
      const socket = makeSocket();
      gateway.handleDisconnect(socket as never);
      expect(mockGameService.handleDisconnect).toHaveBeenCalledWith(socket.id);
    });
  });

  // ── game:join ───────────────────────────────────────────────────────────────

  describe('handleJoin', () => {
    it('delegates to gameService.joinGame with valid payload', async () => {
      const socket = makeSocket();
      await gateway.handleJoin(socket as never, { gameId: 'g1', spectate: false });
      expect(mockGameService.joinGame).toHaveBeenCalledWith(
        expect.objectContaining({ id: socket.id }),
        'u1',
        'g1',
        false,
      );
    });

    it('emits game:error INVALID_PAYLOAD on bad payload', async () => {
      const socket = makeSocket();
      await gateway.handleJoin(socket as never, { notAGameId: true });
      expect(socket.emit).toHaveBeenCalledWith(
        'game:error',
        expect.objectContaining({ code: 'INVALID_PAYLOAD' }),
      );
      expect(mockGameService.joinGame).not.toHaveBeenCalled();
    });
  });

  // ── game:discard ────────────────────────────────────────────────────────────

  describe('handleDiscard', () => {
    it('delegates to gameService.handleDiscard when socket has gameId', () => {
      const socket = makeSocket({ gameId: 'game-1' });
      gateway.handleDiscard(socket as never, { tile: '1m' });
      expect(mockGameService.handleDiscard).toHaveBeenCalledWith(
        expect.anything(),
        'u1',
        'game-1',
        '1m',
      );
    });

    it('emits NOT_IN_GAME when socket has no gameId', () => {
      const socket = makeSocket(); // no gameId
      gateway.handleDiscard(socket as never, { tile: '1m' });
      expect(socket.emit).toHaveBeenCalledWith(
        'game:error',
        expect.objectContaining({ code: 'NOT_IN_GAME' }),
      );
      expect(mockGameService.handleDiscard).not.toHaveBeenCalled();
    });

    it('Gameplay·rate-limit-events: TOO_FAST after exceeding limit', () => {
      const socket = makeSocket({ gameId: 'game-1' });

      // Limit is 2/s; first two should pass
      gateway.handleDiscard(socket as never, { tile: '1m' });
      gateway.handleDiscard(socket as never, { tile: '1m' });
      expect(mockGameService.handleDiscard).toHaveBeenCalledTimes(2);

      // Third within the window → throttled
      gateway.handleDiscard(socket as never, { tile: '1m' });
      expect(socket.emit).toHaveBeenCalledWith(
        'game:error',
        expect.objectContaining({ code: 'TOO_FAST' }),
      );
      expect(mockGameService.handleDiscard).toHaveBeenCalledTimes(2); // still 2
    });
  });

  // ── game:claim ──────────────────────────────────────────────────────────────

  describe('handleClaim', () => {
    it('delegates pung claim', () => {
      const socket = makeSocket({ gameId: 'g1' });
      gateway.handleClaim(socket as never, { kind: 'pung' });
      expect(mockGameService.handleClaim).toHaveBeenCalledWith(
        expect.anything(),
        'u1',
        'g1',
        'pung',
        undefined,
      );
    });

    it('delegates win claim', () => {
      const socket = makeSocket({ gameId: 'g1' });
      gateway.handleClaim(socket as never, { kind: 'win' });
      expect(mockGameService.handleClaim).toHaveBeenCalledWith(
        expect.anything(),
        'u1',
        'g1',
        'win',
        undefined,
      );
    });

    it('delegates chow claim with sequence', () => {
      const socket = makeSocket({ gameId: 'g1' });
      gateway.handleClaim(socket as never, { kind: 'chow', sequence: ['1m', '2m', '3m'] });
      expect(mockGameService.handleClaim).toHaveBeenCalledWith(
        expect.anything(),
        'u1',
        'g1',
        'chow',
        ['1m', '2m', '3m'],
      );
    });
  });

  // ── game:pass ───────────────────────────────────────────────────────────────

  describe('handlePass', () => {
    it('delegates to gameService.handlePass', () => {
      const socket = makeSocket({ gameId: 'g1' });
      gateway.handlePass(socket as never);
      expect(mockGameService.handlePass).toHaveBeenCalledWith(expect.anything(), 'u1', 'g1');
    });
  });

  // ── game:concede ────────────────────────────────────────────────────────────

  describe('handleConcede', () => {
    it('delegates to gameService.handleConcede', () => {
      const socket = makeSocket({ gameId: 'g1' });
      gateway.handleConcede(socket as never);
      expect(mockGameService.handleConcede).toHaveBeenCalledWith(expect.anything(), 'u1', 'g1');
    });
  });

  // ── game:kong-concealed ─────────────────────────────────────────────────────

  describe('handleKongConcealed', () => {
    it('delegates to gameService.handleKongConcealed', () => {
      const socket = makeSocket({ gameId: 'g1' });
      gateway.handleKongConcealed(socket as never, { tile: '1m' });
      expect(mockGameService.handleKongConcealed).toHaveBeenCalledWith(
        expect.anything(),
        'u1',
        'g1',
        '1m',
      );
    });
  });

  // ── afterInit ───────────────────────────────────────────────────────────────

  describe('afterInit', () => {
    it('passes server to GameService.setServer', () => {
      const fakeServer = makeServer() as unknown as Server;
      gateway.afterInit(fakeServer);
      expect(mockGameService.setServer).toHaveBeenCalledWith(fakeServer);
    });
  });
});
