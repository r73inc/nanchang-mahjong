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

function makeChallengeRecord() {
  return {
    PK: 'CHALLENGE#chal-001',
    SK: 'META',
    challengeId: 'chal-001',
    config: { numRounds: 1, startingScore: 0, ruleTopBottomJing: true },
    participants: {
      'user-A': {
        sub: 'user-A',
        handle: 'Alice',
        role: 'creator',
        status: 'completed',
        gameId: 'game-A',
        finalScore: 12,
      },
      'user-B': {
        sub: 'user-B',
        handle: 'Bob',
        role: 'challenged',
        status: 'completed',
        gameId: 'game-B',
        finalScore: -4,
      },
      'user-C': {
        sub: 'user-C',
        handle: 'Charlie',
        role: 'challenged',
        status: 'declined',
      },
    },
    winners: ['user-A'],
    createdAt: '2026-06-20T10:00:00Z',
    completedAt: '2026-06-20T11:30:00Z',
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
    if (key === 'geminiRelay.model') return 'gemini-2.5-flash';
    if (key === 'geminiRelay') return { model: 'gemini-2.5-flash', challengeWordCap: 400 };
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
          model: 'gemini-2.5-flash',
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
          model: 'gemini-2.5-flash',
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

    it('queue path: writes requested status and creates AiRequestItem with deterministic key', async () => {
      mockDb.get.mockResolvedValueOnce({ Item: undefined }); // conflict check

      const result = await service.requestGameSummary('game-001', 'user-X', false);

      expect(result.queued).toBe(true);
      expect(result.reqId).toBe('game:game-001');
      // writeSummaryRequested
      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          Item: expect.objectContaining({ status: 'requested', SK: 'AI_SUMMARY' }),
        }),
      );
      // createAiRequestItem — deterministic key + ConditionExpression guard
      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          Item: expect.objectContaining({
            PK: 'AIREQ#game:game-001',
            status: 'pending',
            SK: 'META',
            targetType: 'game',
          }),
          ConditionExpression: expect.stringContaining('attribute_not_exists'),
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

    it('throws ConflictException (409) when concurrent writeSummaryRequested wins the race', async () => {
      const condError = Object.assign(new Error('The conditional request failed'), {
        name: 'ConditionalCheckFailedException',
      });
      mockDb.get.mockResolvedValueOnce({ Item: undefined }); // getSummary → no item
      mockDb.put.mockRejectedValueOnce(condError); // writeSummaryRequested

      await expect(service.requestGameSummary('game-001', 'user-X', false)).rejects.toMatchObject({
        status: 409,
      });
      // createAiRequestItem must NOT have been called
      expect(mockDb.put).toHaveBeenCalledTimes(1);
    });
  });

  // ── requestChallengeSummary ────────────────────────────────────────────────

  describe('requestChallengeSummary', () => {
    it('throws BadRequestException (400) when challenge status is not completed', async () => {
      await expect(
        service.requestChallengeSummary('chal-001', 'user-X', 'open'),
      ).rejects.toMatchObject({ status: 400 });
      // No DB calls should be made before the guard
      expect(mockDb.get).not.toHaveBeenCalled();
    });

    it('throws BadRequestException (400) for awaiting_creator status', async () => {
      await expect(
        service.requestChallengeSummary('chal-001', 'user-X', 'awaiting_creator'),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('throws BadRequestException (400) for cancelled status', async () => {
      await expect(
        service.requestChallengeSummary('chal-001', 'user-X', 'cancelled'),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('creates queue item with deterministic key when challenge is completed', async () => {
      mockDb.get.mockResolvedValueOnce({ Item: undefined }); // getSummary → no existing

      const result = await service.requestChallengeSummary('chal-001', 'user-X', 'completed');

      expect(result.queued).toBe(true);
      expect(result.reqId).toBe('challenge:chal-001');
      // writeSummaryRequested
      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          Item: expect.objectContaining({ status: 'requested', PK: 'CHALLENGE#chal-001' }),
        }),
      );
      // createAiRequestItem — deterministic key + ConditionExpression guard
      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          Item: expect.objectContaining({
            PK: 'AIREQ#challenge:chal-001',
            targetType: 'challenge',
            targetId: 'chal-001',
          }),
          ConditionExpression: expect.stringContaining('attribute_not_exists'),
        }),
      );
    });

    it('throws ConflictException (409) when concurrent writeSummaryRequested wins the race', async () => {
      const condError = Object.assign(new Error('The conditional request failed'), {
        name: 'ConditionalCheckFailedException',
      });
      mockDb.get.mockResolvedValueOnce({ Item: undefined });
      mockDb.put.mockRejectedValueOnce(condError); // writeSummaryRequested

      await expect(
        service.requestChallengeSummary('chal-001', 'user-X', 'completed'),
      ).rejects.toMatchObject({ status: 409 });
      expect(mockDb.put).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException (409) when summary is already in progress', async () => {
      mockDb.get.mockResolvedValueOnce({ Item: { status: 'processing', attempts: 1 } });

      await expect(
        service.requestChallengeSummary('chal-001', 'user-X', 'completed'),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  // ── generateChallengeSummary ───────────────────────────────────────────────

  describe('generateChallengeSummary', () => {
    const doneChallengeItem = {
      PK: 'CHALLENGE#chal-001',
      SK: 'AI_SUMMARY',
      status: 'done',
      attempts: 1,
    };

    beforeEach(() => {
      // Default relay response for challenge tests
      mockRelay.generate.mockResolvedValue({
        ok: true,
        data: {
          text: { en: 'Epic challenge!', zh: '精彩挑战！' },
          model: 'gemini-2.5-flash',
          promptVersion: 'v1-challenge',
        },
      });
    });

    it('writes processing with v1-challenge promptVersion then done on relay success', async () => {
      // getSummary (attempts) → no existing; fetchChallengeRecord → record; getReplay ×2; final getSummary → done
      mockDb.get
        .mockResolvedValueOnce({ Item: undefined })
        .mockResolvedValueOnce({ Item: makeChallengeRecord() })
        .mockResolvedValueOnce({ Item: doneChallengeItem });
      mockStorage.getReplay
        .mockResolvedValueOnce(makeReplay({ gameId: 'game-A' }))
        .mockResolvedValueOnce(makeReplay({ gameId: 'game-B' }));

      const result = await service.generateChallengeSummary('chal-001', 'auto');

      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          Item: expect.objectContaining({
            PK: 'CHALLENGE#chal-001',
            status: 'processing',
            promptVersion: 'v1-challenge',
          }),
        }),
      );
      expect(mockDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: { PK: 'CHALLENGE#chal-001', SK: 'AI_SUMMARY' },
          UpdateExpression: expect.stringContaining('done'),
        }),
      );
      expect(result.status).toBe('done');
    });

    it('skips declined participants: only completed entries appear in digest', async () => {
      mockDb.get
        .mockResolvedValueOnce({ Item: undefined })
        .mockResolvedValueOnce({ Item: makeChallengeRecord() })
        .mockResolvedValueOnce({ Item: doneChallengeItem });
      mockStorage.getReplay
        .mockResolvedValueOnce(makeReplay({ gameId: 'game-A' }))
        .mockResolvedValueOnce(makeReplay({ gameId: 'game-B' }));

      await service.generateChallengeSummary('chal-001', 'auto');

      // storage.getReplay must be called exactly twice (Alice + Bob), not three times (Charlie declined)
      expect(mockStorage.getReplay).toHaveBeenCalledTimes(2);
      expect(mockStorage.getReplay).toHaveBeenCalledWith('game-A');
      expect(mockStorage.getReplay).toHaveBeenCalledWith('game-B');
    });

    it('marks failed when relay is disabled', async () => {
      mockRelay.isEnabled = false;
      mockDb.get
        .mockResolvedValueOnce({ Item: undefined })
        .mockResolvedValueOnce({ Item: doneChallengeItem });

      await service.generateChallengeSummary('chal-001', 'auto');

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

    it('marks failed when challenge record is not found in DDB', async () => {
      mockDb.get
        .mockResolvedValueOnce({ Item: undefined }) // getSummary
        .mockResolvedValueOnce({ Item: undefined }) // fetchChallengeRecord → not found
        .mockResolvedValueOnce({ Item: doneChallengeItem });

      await service.generateChallengeSummary('chal-001', 'auto');

      expect(mockDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          ExpressionAttributeValues: expect.objectContaining({ ':failed': 'failed' }),
        }),
      );
    });

    it('writes failed when fewer than 2 participant replays load (divergence impossible)', async () => {
      mockDb.get
        .mockResolvedValueOnce({ Item: undefined }) // getSummary (attempts)
        .mockResolvedValueOnce({ Item: makeChallengeRecord() }) // fetchChallengeRecord
        .mockResolvedValueOnce({ Item: doneChallengeItem }); // final getSummary
      mockStorage.getReplay
        .mockResolvedValueOnce(makeReplay({ gameId: 'game-A' })) // Alice OK
        .mockRejectedValueOnce(new Error('S3 error')); // Bob fails → only 1 available

      await service.generateChallengeSummary('chal-001', 'auto');

      // Relay must NOT be called — extraction failure gates the job
      expect(mockRelay.generate).not.toHaveBeenCalled();
      expect(mockDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          ExpressionAttributeValues: expect.objectContaining({ ':failed': 'failed' }),
        }),
      );
    });

    it('short-circuits when already processing (ConditionalCheckFailedException)', async () => {
      const condError = Object.assign(new Error('The conditional request failed'), {
        name: 'ConditionalCheckFailedException',
      });
      const inFlightItem = {
        PK: 'CHALLENGE#chal-001',
        SK: 'AI_SUMMARY',
        status: 'processing',
        attempts: 1,
      };
      mockDb.get
        .mockResolvedValueOnce({ Item: undefined }) // getSummary (attempts)
        .mockResolvedValueOnce({ Item: inFlightItem }); // getSummary (return value)
      mockDb.put.mockRejectedValueOnce(condError);

      const result = await service.generateChallengeSummary('chal-001', 'auto');

      expect(mockDb.put).toHaveBeenCalledTimes(1);
      expect(mockRelay.generate).not.toHaveBeenCalled();
      expect(result.status).toBe('processing');
    });

    it('marks failed when relay returns error', async () => {
      mockRelay.generate.mockResolvedValue({
        ok: false,
        errorCode: 'timeout',
        message: 'timed out',
      });
      mockDb.get
        .mockResolvedValueOnce({ Item: undefined })
        .mockResolvedValueOnce({ Item: makeChallengeRecord() })
        .mockResolvedValueOnce({ Item: doneChallengeItem });
      mockStorage.getReplay
        .mockResolvedValueOnce(makeReplay({ gameId: 'game-A' }))
        .mockResolvedValueOnce(makeReplay({ gameId: 'game-B' }));

      await service.generateChallengeSummary('chal-001', 'auto');

      expect(mockDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          UpdateExpression: expect.stringContaining('failed'),
        }),
      );
    });
  });

  // ── approveAiRequest ───────────────────────────────────────────────────────

  describe('approveAiRequest', () => {
    // reqId is now deterministic: targetType:targetId
    const reqId = 'game:game-001';
    const pendingReq = {
      PK: `AIREQ#${reqId}`,
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
          model: 'gemini-2.5-flash',
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

      const result = await service.approveAiRequest(reqId, 'admin-sub');

      expect(mockDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: { PK: `AIREQ#${reqId}`, SK: 'META' },
          ExpressionAttributeValues: expect.objectContaining({ ':approved': 'approved' }),
        }),
      );
      expect(result.status).toBe('done');
    });

    it('generates summary with original requester sub, not approver sub', async () => {
      mockDb.get
        .mockResolvedValueOnce({ Item: pendingReq }) // getAiRequest
        .mockResolvedValueOnce({ Item: undefined }) // generateGameSummary: attempts
        .mockResolvedValueOnce({ Item: doneItem }); // generateGameSummary: return value

      await service.approveAiRequest(reqId, 'admin-sub');

      // writeSummaryProcessing must carry the original requester ('user-X'), not the approver
      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          Item: expect.objectContaining({ requestedBy: 'user-X', status: 'processing' }),
        }),
      );
    });

    it('throws ConflictException when request is already approved', async () => {
      mockDb.get.mockResolvedValueOnce({ Item: { ...pendingReq, status: 'approved' } });
      await expect(service.approveAiRequest(reqId, 'admin-sub')).rejects.toMatchObject({
        status: 409,
      });
    });

    it('throws NotFoundException when request does not exist', async () => {
      mockDb.get.mockResolvedValueOnce({ Item: undefined });
      await expect(service.approveAiRequest(reqId, 'admin-sub')).rejects.toMatchObject({
        status: 404,
      });
    });

    it('triggers generateChallengeSummary when targetType is challenge', async () => {
      const chalReqId = 'challenge:chal-001';
      const chalPendingReq = {
        PK: `AIREQ#${chalReqId}`,
        SK: 'META',
        status: 'pending',
        targetType: 'challenge',
        targetId: 'chal-001',
        requestedBy: 'user-X',
        requestedAt: new Date().toISOString(),
      };
      const chalDoneItem = {
        PK: 'CHALLENGE#chal-001',
        SK: 'AI_SUMMARY',
        status: 'done',
        attempts: 1,
      };

      mockRelay.generate.mockResolvedValue({
        ok: true,
        data: {
          text: { en: 'Epic!', zh: '精彩！' },
          model: 'gemini-2.5-flash',
          promptVersion: 'v1-challenge',
        },
      });
      mockDb.get
        .mockResolvedValueOnce({ Item: chalPendingReq }) // getAiRequest
        .mockResolvedValueOnce({ Item: undefined }) // generateChallengeSummary: getSummary (attempts)
        .mockResolvedValueOnce({ Item: makeChallengeRecord() }) // fetchChallengeRecord
        .mockResolvedValueOnce({ Item: chalDoneItem }); // final getSummary
      mockStorage.getReplay
        .mockResolvedValueOnce(makeReplay({ gameId: 'game-A' }))
        .mockResolvedValueOnce(makeReplay({ gameId: 'game-B' }));

      const result = await service.approveAiRequest(chalReqId, 'admin-sub');

      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          Item: expect.objectContaining({
            PK: 'CHALLENGE#chal-001',
            promptVersion: 'v1-challenge',
            requestedBy: 'user-X', // original requester, not 'admin-sub'
          }),
        }),
      );
      expect(result.status).toBe('done');
    });
  });

  // ── rejectAiRequest ────────────────────────────────────────────────────────

  describe('rejectAiRequest', () => {
    it('updates request status to rejected', async () => {
      const reqId = 'game:game-001';
      mockDb.get.mockResolvedValueOnce({
        Item: {
          PK: `AIREQ#${reqId}`,
          SK: 'META',
          status: 'pending',
          targetType: 'game',
          targetId: 'game-001',
          requestedBy: 'user-X',
          requestedAt: '',
        },
      });

      await service.rejectAiRequest(reqId, 'admin-sub');

      expect(mockDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: { PK: `AIREQ#${reqId}`, SK: 'META' },
          ExpressionAttributeValues: expect.objectContaining({ ':rejected': 'rejected' }),
        }),
      );
    });
  });

  // ── retryFailedSummary ────────────────────────────────────────────────────

  describe('retryFailedSummary', () => {
    it('delegates to generateGameSummary for game targetType', async () => {
      const failedItem = { PK: 'GAME#game-001', SK: 'AI_SUMMARY', status: 'failed', attempts: 1 };
      const doneItem = { ...failedItem, status: 'done', attempts: 2 };
      mockStorage.getReplay.mockResolvedValue(makeReplay());
      mockRelay.generate.mockResolvedValue({
        ok: true,
        data: {
          text: { en: 'Retry!', zh: '重试！' },
          model: 'gemini-2.5-flash',
          promptVersion: 'v1-game',
        },
      });
      mockDb.get
        .mockResolvedValueOnce({ Item: failedItem }) // getSummary (attempts)
        .mockResolvedValueOnce({ Item: doneItem }); // final return

      const result = await service.retryFailedSummary('game', 'game-001', 'admin-sub');
      expect(result.status).toBe('done');
    });

    it('short-circuits when game summary is already processing', async () => {
      const inFlightItem = {
        PK: 'GAME#game-001',
        SK: 'AI_SUMMARY',
        status: 'processing',
        attempts: 1,
      };
      const condError = Object.assign(new Error('conditional check failed'), {
        name: 'ConditionalCheckFailedException',
      });
      mockDb.get
        .mockResolvedValueOnce({ Item: inFlightItem }) // getSummary (attempts)
        .mockResolvedValueOnce({ Item: inFlightItem }); // return after short-circuit
      mockDb.put.mockRejectedValueOnce(condError);

      const result = await service.retryFailedSummary('game', 'game-001', 'admin-sub');
      expect(mockRelay.generate).not.toHaveBeenCalled();
      expect(result.status).toBe('processing');
    });

    it('delegates to generateChallengeSummary for challenge targetType', async () => {
      const failedItem = {
        PK: 'CHALLENGE#chal-001',
        SK: 'AI_SUMMARY',
        status: 'failed',
        attempts: 1,
      };
      const doneItem = { ...failedItem, status: 'done', attempts: 2 };
      mockRelay.generate.mockResolvedValue({
        ok: true,
        data: {
          text: { en: 'Retry!', zh: '重试！' },
          model: 'gemini-2.5-flash',
          promptVersion: 'v1-challenge',
        },
      });
      mockDb.get
        .mockResolvedValueOnce({ Item: failedItem }) // getSummary (attempts)
        .mockResolvedValueOnce({ Item: makeChallengeRecord() }) // fetchChallengeRecord
        .mockResolvedValueOnce({ Item: doneItem }); // final getSummary
      mockStorage.getReplay
        .mockResolvedValueOnce(makeReplay({ gameId: 'game-A' }))
        .mockResolvedValueOnce(makeReplay({ gameId: 'game-B' }));

      const result = await service.retryFailedSummary('challenge', 'chal-001', 'admin-sub');
      expect(result.status).toBe('done');
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
