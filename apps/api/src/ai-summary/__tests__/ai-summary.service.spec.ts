import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiSummaryService } from '../ai-summary.service';
import { GeminiRelayClient } from '../gemini-relay.client';
import { DynamoDBService } from '../../database/dynamodb.service';
import { StorageService } from '../../storage/storage.service';
import type { ReplayGamePayload } from '@nanchang/shared';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeReplay(overrides: Partial<ReplayGamePayload> = {}): ReplayGamePayload {
  return {
    gameId: 'game-001',
    seatMap: ['user-A', 'user-B', 'bot-easy-2', 'user-D'],
    seatNames: ['Alice', 'Bob', 'EasyBot', 'Diana'],
    settings: {
      rounds: 'east+south',
      terminationType: 'rounds',
      startingScore: 0,
      ruleTopBottomJing: true,
      timerSecs: 30,
      viewMode: '2D',
      claimWindowSecs: 0,
      maxHands: 1,
      isSolo: false,
    },
    startedAt: '2026-06-20T10:00:00Z',
    endedAt: '2026-06-20T10:45:00Z',
    finalScores: [12, -4, 6, -14],
    placement: [1, 3, 2, 4],
    result: 'win',
    hands: [
      {
        seed: 42,
        startingScores: [0, 0, 0, 0],
        dealerSeat: 0,
        roundWind: 'east',
        events: [
          { kind: 'deal', seed: 42, hands: [[], [], [], []] },
          {
            kind: 'jing_indicator',
            indicator: '1m',
            jingPrimary: '2m',
            jingSecondary: '3m',
          },
          { kind: 'discard', seat: 0, tile: '4m' },
          { kind: 'discard', seat: 1, tile: '5m' },
          {
            kind: 'win',
            seat: 2,
            winType: 'ron',
            handType: 'standard',
            paymentResult: {
              items: [],
              totalMultiplier: 1,
              flatBonusPerLoser: 0,
              scoreDelta: [-2, -2, 4, 0],
              winnerTotal: 4,
            },
          },
        ],
      },
      {
        seed: 99,
        startingScores: [-2, -2, 4, 0],
        dealerSeat: 1,
        roundWind: 'east',
        events: [
          { kind: 'deal', seed: 99, hands: [[], [], [], []] },
          {
            kind: 'jing_indicator',
            indicator: '4m',
            jingPrimary: '5m',
            jingSecondary: '6m',
          },
          { kind: 'draw_game' },
        ],
      },
      {
        seed: 77,
        startingScores: [-2, -2, 4, 0],
        dealerSeat: 2,
        roundWind: 'east',
        events: [
          { kind: 'deal', seed: 77, hands: [[], [], [], []] },
          {
            kind: 'jing_indicator',
            indicator: '9p',
            jingPrimary: '9p',
            jingSecondary: '1p',
          },
          { kind: 'concede', seat: 3 },
        ],
      },
    ],
    ...overrides,
  };
}

// ── Mock setup ────────────────────────────────────────────────────────────────

const mockDb = {
  get: jest.fn(),
  put: jest.fn(),
  update: jest.fn(),
  query: jest.fn(),
};

const mockStorage = {
  getReplay: jest.fn(),
};

const mockRelay = {
  isEnabled: true,
  generate: jest.fn(),
};

const mockConfig = {
  get: jest.fn((key: string) => {
    if (key === 'geminiRelay.model') return 'gemini-1.5-flash';
    if (key === 'geminiRelay') return { model: 'gemini-1.5-flash', challengeWordCap: 400 };
    return undefined;
  }),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AiSummaryService', () => {
  let service: AiSummaryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDb.get.mockResolvedValue({ Item: undefined });
    mockDb.put.mockResolvedValue({});
    mockDb.update.mockResolvedValue({});

    const module = await Test.createTestingModule({
      providers: [
        AiSummaryService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: DynamoDBService, useValue: mockDb },
        { provide: StorageService, useValue: mockStorage },
        { provide: GeminiRelayClient, useValue: mockRelay },
      ],
    }).compile();

    service = module.get(AiSummaryService);
  });

  // ── extractGameDigest ──────────────────────────────────────────────────────

  describe('extractGameDigest', () => {
    it('maps seatMap/seatNames to DigestPlayer correctly', () => {
      const digest = service.extractGameDigest(makeReplay());
      expect(digest.players).toHaveLength(4);
      expect(digest.players[0]).toEqual({ seat: 0, sub: 'user-A', handle: 'Alice', isBot: false });
      expect(digest.players[2]).toEqual({
        seat: 2,
        sub: 'bot-easy-2',
        handle: 'EasyBot',
        isBot: true,
      });
    });

    it('marks bot seats with isBot=true based on sub prefix', () => {
      const digest = service.extractGameDigest(makeReplay());
      expect(digest.players[2].isBot).toBe(true);
      expect(digest.players[0].isBot).toBe(false);
    });

    it('uses paymentResult.scoreDelta for win hands and startingScores diff for draw/concede', () => {
      const digest = service.extractGameDigest(makeReplay());
      // Hand 0 (win): paymentResult.scoreDelta = [-2,-2,4,0]
      expect(digest.hands[0].scoreDeltas).toEqual([-2, -2, 4, 0]);
      // Hand 1 (draw): no scoring events → startingScores diff = [0,0,0,0]
      expect(digest.hands[1].scoreDeltas).toEqual([0, 0, 0, 0]);
    });

    it('uses finalScores for the last hand end scores', () => {
      const digest = service.extractGameDigest(makeReplay());
      // Hand 2: startingScores [-2,-2,4,0], finalScores [12,-4,6,-14] → deltas [14,-2,2,-14]
      expect(digest.hands[2].scoreDeltas).toEqual([14, -2, 2, -14]);
    });

    it('detects a ron win with correct winner, how=ron, dealInSeat', () => {
      const digest = service.extractGameDigest(makeReplay());
      const hand0 = digest.hands[0];
      expect(hand0.outcome).toBe('win');
      expect(hand0.winner?.seat).toBe(2);
      expect(hand0.winner?.how).toBe('ron');
      // Last discard before win was seat 1 discarding '5m'
      expect(hand0.dealInSeat).toBe(1);
    });

    it('detects a draw correctly', () => {
      const digest = service.extractGameDigest(makeReplay());
      expect(digest.hands[1].outcome).toBe('draw');
      expect(digest.hands[1].winner).toBeUndefined();
    });

    it('detects a concede correctly', () => {
      const digest = service.extractGameDigest(makeReplay());
      expect(digest.hands[2].outcome).toBe('concede');
      expect(digest.hands[2].hasConcede).toBe(true);
    });

    it('extracts seven_pairs special hand', () => {
      const replay = makeReplay();
      if (replay.hands[0].events) {
        const winEv = replay.hands[0].events.find((e) => e.kind === 'win')!;
        if (winEv.kind === 'win') {
          (winEv as unknown as { handType: string }).handType = 'seven_pairs';
        }
      }
      const digest = service.extractGameDigest(replay);
      expect(digest.hands[0].specialHands).toContain('Seven Pairs');
    });

    it('detects rob-kong when kong_added precedes win from different seat', () => {
      const replay = makeReplay();
      // Replace hand 0 events with a rob-kong sequence
      replay.hands[0].events = [
        { kind: 'deal', seed: 42, hands: [[], [], [], []] },
        { kind: 'jing_indicator', indicator: '1m', jingPrimary: '2m', jingSecondary: '3m' },
        { kind: 'kong_added', seat: 0, tile: '5m' }, // seat 0 promotes pung to kong
        { kind: 'draw', seat: 0, tile: '6m', fromBack: true }, // dead-wall draw
        {
          kind: 'win',
          seat: 1,
          winType: 'ron',
          handType: 'standard',
          paymentResult: {
            items: [],
            totalMultiplier: 1,
            flatBonusPerLoser: 0,
            scoreDelta: [-4, 4, 0, 0],
            winnerTotal: 4,
          },
        },
      ];
      const digest = service.extractGameDigest(replay);
      expect(digest.hands[0].hasRobKong).toBe(true);
      expect(digest.hands[0].winner?.how).toBe('kong');
    });

    it('detects tsumo win', () => {
      const replay = makeReplay();
      const winEv = replay.hands[0].events.find((e) => e.kind === 'win')!;
      if (winEv.kind === 'win') {
        (winEv as unknown as { winType: string }).winType = 'tsumo';
      }
      const digest = service.extractGameDigest(replay);
      expect(digest.hands[0].winner?.how).toBe('tsumo');
    });

    it('counts jing tiles in winner hand after jing reveal', () => {
      const replay = makeReplay();
      // Hand 0: winner is seat 2. Add a jing draw (2m = jingPrimary) for seat 2 after reveal
      const events = replay.hands[0].events;
      const revealIdx = events.findIndex((e) => e.kind === 'jing_indicator');
      events.splice(
        revealIdx + 1,
        0,
        { kind: 'draw', seat: 2, tile: '2m', fromBack: false }, // jing tile drawn by winner
      );
      const digest = service.extractGameDigest(replay);
      expect(digest.hands[0].jingCount).toBeGreaterThan(0);
    });
  });

  // ── generateGameSummary ────────────────────────────────────────────────────

  describe('generateGameSummary', () => {
    beforeEach(() => {
      mockStorage.getReplay.mockResolvedValue(makeReplay());
      mockRelay.generate.mockResolvedValue({
        ok: true,
        data: {
          text: { en: 'Great game!', zh: '好游戏！' },
          model: 'gemini-1.5-flash',
          promptVersion: 'v1-game',
        },
      });
      // Return the summary item after writes
      mockDb.get.mockImplementation((params: { Key: { PK: string; SK: string } }) => {
        if (params.Key.SK === 'AI_SUMMARY') {
          return Promise.resolve({
            Item: {
              PK: params.Key.PK,
              SK: 'AI_SUMMARY',
              status: 'done',
              text: { en: 'Great game!', zh: '好游戏！' },
              attempts: 1,
            },
          });
        }
        return Promise.resolve({ Item: undefined });
      });
    });

    it('writes processing then done on relay success', async () => {
      await service.generateGameSummary('game-001', 'user-X');
      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          Item: expect.objectContaining({ status: 'processing', PK: 'GAME#game-001' }),
        }),
      );
      expect(mockDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: { PK: 'GAME#game-001', SK: 'AI_SUMMARY' },
          UpdateExpression: expect.stringContaining('done'),
        }),
      );
    });

    it('writes processing then failed on relay error', async () => {
      mockRelay.generate.mockResolvedValue({
        ok: false,
        errorCode: 'timeout',
        message: 'timed out',
      });
      await service.generateGameSummary('game-001', 'user-X');
      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({ Item: expect.objectContaining({ status: 'processing' }) }),
      );
      expect(mockDb.update).toHaveBeenCalledWith(
        expect.objectContaining({ UpdateExpression: expect.stringContaining('failed') }),
      );
    });

    it('writes failed with 5xx when relay is disabled', async () => {
      mockRelay.isEnabled = false;
      await service.generateGameSummary('game-001', 'user-X');
      expect(mockDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          ExpressionAttributeValues: expect.objectContaining({
            ':failed': 'failed',
            ':code': '5xx',
          }),
        }),
      );
      mockRelay.isEnabled = true; // restore
    });

    it('writes failed when replay load throws', async () => {
      mockStorage.getReplay.mockRejectedValue(new Error('S3 not found'));
      await service.generateGameSummary('game-001', 'user-X');
      expect(mockDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          ExpressionAttributeValues: expect.objectContaining({ ':failed': 'failed' }),
        }),
      );
    });

    it('short-circuits and returns existing item when processing write is rejected as duplicate', async () => {
      const condError = Object.assign(new Error('The conditional request failed'), {
        name: 'ConditionalCheckFailedException',
      });
      const inFlightItem = {
        PK: 'GAME#game-001',
        SK: 'AI_SUMMARY',
        status: 'processing',
        requestedBy: 'user-concurrent',
        requestedAt: new Date().toISOString(),
        attempts: 1,
      };
      // First getSummary (for attempts count) → no existing item
      // db.put → ConditionalCheckFailedException (concurrent run already in flight)
      // Second getSummary (return value) → in-flight item
      mockDb.get
        .mockResolvedValueOnce({ Item: undefined })
        .mockResolvedValueOnce({ Item: inFlightItem });
      mockDb.put.mockRejectedValueOnce(condError);

      const result = await service.generateGameSummary('game-001', 'user-X');

      expect(mockDb.put).toHaveBeenCalledTimes(1);
      expect(mockDb.update).not.toHaveBeenCalled();
      expect(result.status).toBe('processing');
    });
  });

  // ── requestGameSummary ─────────────────────────────────────────────────────

  describe('requestGameSummary', () => {
    const doneItem = {
      PK: 'GAME#game-001',
      SK: 'AI_SUMMARY',
      status: 'done',
      text: { en: 'Great game!', zh: '好游戏！' },
      attempts: 1,
    };

    beforeEach(() => {
      mockStorage.getReplay.mockResolvedValue(makeReplay());
      mockRelay.generate.mockResolvedValue({
        ok: true,
        data: {
          text: { en: 'Great game!', zh: '好游戏！' },
          model: 'gemini-1.5-flash',
          promptVersion: 'v1-game',
        },
      });
    });

    it('auto-approve: triggers generateGameSummary and returns summary', async () => {
      // conflict check → no item; attempts fetch → no item; final getSummary → done item
      mockDb.get
        .mockResolvedValueOnce({ Item: undefined })
        .mockResolvedValueOnce({ Item: undefined })
        .mockResolvedValueOnce({ Item: doneItem });

      const result = await service.requestGameSummary('game-001', 'user-X', true);

      expect(result.queued).toBe(false);
      expect(result.summary?.status).toBe('done');
      // writeSummaryProcessing (db.put) must have been called
      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({ Item: expect.objectContaining({ status: 'processing' }) }),
      );
    });

    it('queue path: writes requested status and creates AiRequestItem', async () => {
      mockDb.get.mockResolvedValueOnce({ Item: undefined }); // conflict check

      const result = await service.requestGameSummary('game-001', 'user-X', false);

      expect(result.queued).toBe(true);
      expect(typeof result.reqId).toBe('string');
      // writeSummaryRequested
      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          Item: expect.objectContaining({ status: 'requested', SK: 'AI_SUMMARY' }),
        }),
      );
      // createAiRequestItem
      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          Item: expect.objectContaining({ status: 'pending', SK: 'META', targetType: 'game' }),
        }),
      );
    });

    it('throws ConflictException when summary is already processing', async () => {
      mockDb.get.mockResolvedValueOnce({ Item: { status: 'processing', attempts: 1 } });
      await expect(service.requestGameSummary('game-001', 'user-X', false)).rejects.toMatchObject({
        status: 409,
      });
    });

    it('throws ConflictException when summary is already done', async () => {
      mockDb.get.mockResolvedValueOnce({ Item: { status: 'done', attempts: 1 } });
      await expect(service.requestGameSummary('game-001', 'user-X', false)).rejects.toMatchObject({
        status: 409,
      });
    });

    it('allows re-request when previous summary failed', async () => {
      // conflict check → failed item (not blocked); then auto-approve path
      mockDb.get
        .mockResolvedValueOnce({ Item: { status: 'failed', attempts: 1 } })
        .mockResolvedValueOnce({ Item: { status: 'failed', attempts: 1 } }) // attempts in generateGameSummary
        .mockResolvedValueOnce({ Item: doneItem });

      const result = await service.requestGameSummary('game-001', 'user-X', true);
      expect(result.queued).toBe(false);
    });
  });

  // ── approveAiRequest ───────────────────────────────────────────────────────

  describe('approveAiRequest', () => {
    const pendingReq = {
      PK: 'AIREQ#req-001',
      SK: 'META',
      status: 'pending',
      targetType: 'game',
      targetId: 'game-001',
      requestedBy: 'user-X',
      requestedAt: new Date().toISOString(),
    };
    const doneItem = { PK: 'GAME#game-001', SK: 'AI_SUMMARY', status: 'done', attempts: 1 };

    beforeEach(() => {
      mockStorage.getReplay.mockResolvedValue(makeReplay());
      mockRelay.generate.mockResolvedValue({
        ok: true,
        data: {
          text: { en: 'Great!', zh: '好！' },
          model: 'gemini-1.5-flash',
          promptVersion: 'v1-game',
        },
      });
    });

    it('updates request to approved and triggers game generation', async () => {
      // getAiRequest → pending; generateGameSummary: attempts fetch → no item; final getSummary → done
      mockDb.get
        .mockResolvedValueOnce({ Item: pendingReq })
        .mockResolvedValueOnce({ Item: undefined })
        .mockResolvedValueOnce({ Item: doneItem });

      const result = await service.approveAiRequest('req-001', 'admin-sub');

      expect(mockDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: { PK: 'AIREQ#req-001', SK: 'META' },
          ExpressionAttributeValues: expect.objectContaining({ ':approved': 'approved' }),
        }),
      );
      expect(result.status).toBe('done');
    });

    it('throws ConflictException when request is already approved', async () => {
      mockDb.get.mockResolvedValueOnce({ Item: { ...pendingReq, status: 'approved' } });
      await expect(service.approveAiRequest('req-001', 'admin-sub')).rejects.toMatchObject({
        status: 409,
      });
    });

    it('throws NotFoundException when request does not exist', async () => {
      mockDb.get.mockResolvedValueOnce({ Item: undefined });
      await expect(service.approveAiRequest('req-001', 'admin-sub')).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  // ── rejectAiRequest ────────────────────────────────────────────────────────

  describe('rejectAiRequest', () => {
    it('updates request status to rejected', async () => {
      mockDb.get.mockResolvedValueOnce({
        Item: {
          PK: 'AIREQ#req-001',
          SK: 'META',
          status: 'pending',
          targetType: 'game',
          targetId: 'game-001',
          requestedBy: 'user-X',
          requestedAt: '',
        },
      });

      await service.rejectAiRequest('req-001', 'admin-sub');

      expect(mockDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: { PK: 'AIREQ#req-001', SK: 'META' },
          ExpressionAttributeValues: expect.objectContaining({ ':rejected': 'rejected' }),
        }),
      );
    });
  });

  // ── listPendingRequests / listFailedJobs ───────────────────────────────────

  describe('listPendingRequests', () => {
    it('queries GSI-1 for pending requests', async () => {
      const items = [{ PK: 'AIREQ#req-001', SK: 'META', status: 'pending' }];
      mockDb.query = jest.fn().mockResolvedValueOnce({ Items: items });

      const result = await service.listPendingRequests();

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.objectContaining({ ExpressionAttributeValues: { ':pk': 'AIREQ_STATUS#pending' } }),
      );
      expect(result).toEqual(items);
    });
  });

  describe('listFailedJobs', () => {
    it('queries GSI-1 for failed summary items', async () => {
      const items = [{ PK: 'GAME#game-001', SK: 'AI_SUMMARY', status: 'failed' }];
      mockDb.query = jest.fn().mockResolvedValueOnce({ Items: items });

      const result = await service.listFailedJobs();

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.objectContaining({
          ExpressionAttributeValues: { ':pk': 'AISUMMARY_STATUS#failed' },
        }),
      );
      expect(result).toEqual(items);
    });
  });
});
