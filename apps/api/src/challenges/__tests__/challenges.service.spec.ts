import { Test } from '@nestjs/testing';
import { ChallengesService } from '../challenges.service';
import { DynamoDBService } from '../../database/dynamodb.service';
import { PushService } from '../../push/push.service';
import { AiSummaryService } from '../../ai-summary/ai-summary.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeChallenge(
  participantOverrides: Record<
    string,
    {
      sub: string;
      handle: string;
      role: 'creator' | 'challenged';
      status: 'pending' | 'accepted' | 'declined' | 'completed';
      gameId?: string;
      finalScore?: number;
    }
  >,
  extraOverrides: Record<string, unknown> = {},
) {
  return {
    PK: 'CHALLENGE#chal-001',
    SK: 'META',
    challengeId: 'chal-001',
    creatorSub: 'user-A',
    creatorHandle: 'Alice',
    seed: 42,
    handSeeds: [1, 2, 3],
    config: {
      numRounds: 1,
      botDifficulty: 'easy',
      startingScore: 0,
      timerSecs: 30,
      viewMode: '2D',
      ruleTopBottomJing: true,
      claimWindowSecs: 0,
    },
    challengedSubs: ['user-B', 'user-C'],
    participants: participantOverrides,
    status: 'open',
    createdAt: '2026-06-20T10:00:00Z',
    ...extraOverrides,
  };
}

// ── Mock setup ─────────────────────────────────────────────────────────────────

const mockDb = {
  get: jest.fn(),
  put: jest.fn(),
  update: jest.fn(),
  query: jest.fn(),
};

const mockPush = {
  sendChallengeInviteNotification: jest.fn().mockResolvedValue(undefined),
};

const mockAiSummary = {
  generateChallengeSummary: jest.fn().mockResolvedValue({ status: 'done' }),
  generateGameSummary: jest.fn().mockResolvedValue({ status: 'done' }),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ChallengesService — completion fan-out', () => {
  let service: ChallengesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDb.get.mockResolvedValue({ Item: undefined });
    mockDb.put.mockResolvedValue({});
    mockDb.update.mockResolvedValue({});

    const module = await Test.createTestingModule({
      providers: [
        ChallengesService,
        { provide: DynamoDBService, useValue: mockDb },
        { provide: PushService, useValue: mockPush },
        { provide: AiSummaryService, useValue: mockAiSummary },
      ],
    }).compile();

    service = module.get(ChallengesService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── recordParticipantResult ──────────────────────────────────────────────────

  describe('recordParticipantResult', () => {
    it('dispatches challenge overview + game summary for each completed participant on completion', async () => {
      jest.useFakeTimers();

      // Alice (creator, completed), Bob (last participant, about to complete).
      const challenge = makeChallenge(
        {
          'user-A': {
            sub: 'user-A',
            handle: 'Alice',
            role: 'creator',
            status: 'completed',
            gameId: 'game-A',
            finalScore: 12,
          },
          'user-B': { sub: 'user-B', handle: 'Bob', role: 'challenged', status: 'pending' },
        },
        { challengedSubs: ['user-B'] },
      );
      mockDb.get.mockResolvedValueOnce({ Item: challenge });

      await service.recordParticipantResult('chal-001', 'user-B', -4, 'game-B');

      // Jobs must not fire synchronously — jitter delays each kick-off
      expect(mockAiSummary.generateChallengeSummary).not.toHaveBeenCalled();
      expect(mockAiSummary.generateGameSummary).not.toHaveBeenCalled();

      // Advance all fake timers past the maximum jitter window (1500 ms)
      jest.runAllTimers();
      // Flush .then(fn) microtasks
      await Promise.resolve();
      await Promise.resolve();

      expect(mockAiSummary.generateChallengeSummary).toHaveBeenCalledTimes(1);
      expect(mockAiSummary.generateChallengeSummary).toHaveBeenCalledWith('chal-001', 'auto');
      // Alice (game-A) + Bob (game-B) — two completed participants
      expect(mockAiSummary.generateGameSummary).toHaveBeenCalledTimes(2);
      expect(mockAiSummary.generateGameSummary).toHaveBeenCalledWith('game-A', 'auto');
      expect(mockAiSummary.generateGameSummary).toHaveBeenCalledWith('game-B', 'auto');
    });

    it('skips declined participants when building the game summary fan-out', async () => {
      jest.useFakeTimers();

      // Alice (creator, completed), Bob (declined — no gameId), Charlie (about to complete).
      const challenge = makeChallenge({
        'user-A': {
          sub: 'user-A',
          handle: 'Alice',
          role: 'creator',
          status: 'completed',
          gameId: 'game-A',
          finalScore: 12,
        },
        'user-B': { sub: 'user-B', handle: 'Bob', role: 'challenged', status: 'declined' },
        'user-C': { sub: 'user-C', handle: 'Charlie', role: 'challenged', status: 'pending' },
      });
      mockDb.get.mockResolvedValueOnce({ Item: challenge });

      await service.recordParticipantResult('chal-001', 'user-C', 8, 'game-C');

      jest.runAllTimers();
      await Promise.resolve();
      await Promise.resolve();

      // Only Alice (game-A) and Charlie (game-C) are completed; Bob declined → no game summary
      expect(mockAiSummary.generateGameSummary).toHaveBeenCalledTimes(2);
      expect(mockAiSummary.generateGameSummary).toHaveBeenCalledWith('game-A', 'auto');
      expect(mockAiSummary.generateGameSummary).toHaveBeenCalledWith('game-C', 'auto');
      expect(mockAiSummary.generateChallengeSummary).toHaveBeenCalledTimes(1);
    });

    it('does not dispatch when challenge is not yet fully complete', async () => {
      jest.useFakeTimers();

      // Bob and Charlie both still pending — allDone is false
      const challenge = makeChallenge({
        'user-A': {
          sub: 'user-A',
          handle: 'Alice',
          role: 'creator',
          status: 'completed',
          gameId: 'game-A',
          finalScore: 12,
        },
        'user-B': { sub: 'user-B', handle: 'Bob', role: 'challenged', status: 'pending' },
        'user-C': { sub: 'user-C', handle: 'Charlie', role: 'challenged', status: 'pending' },
      });
      mockDb.get.mockResolvedValueOnce({ Item: challenge });

      await service.recordParticipantResult('chal-001', 'user-B', -4, 'game-B');

      jest.runAllTimers();
      await Promise.resolve();

      expect(mockAiSummary.generateChallengeSummary).not.toHaveBeenCalled();
      expect(mockAiSummary.generateGameSummary).not.toHaveBeenCalled();
    });
  });

  // ── declineChallenge ─────────────────────────────────────────────────────────

  describe('declineChallenge', () => {
    it('dispatches fan-out (skipping declining participant) when last decliner completes the challenge', async () => {
      jest.useFakeTimers();

      // Alice (creator, completed), Bob (challenged, completed), Charlie (about to decline).
      // allNonCreatorsDeclined = false (Bob is completed, not declined) → newStatus = 'completed'
      const challenge = makeChallenge({
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
        'user-C': { sub: 'user-C', handle: 'Charlie', role: 'challenged', status: 'pending' },
      });
      mockDb.get.mockResolvedValueOnce({ Item: challenge });

      await service.declineChallenge('chal-001', 'user-C');

      jest.runAllTimers();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockAiSummary.generateChallengeSummary).toHaveBeenCalledTimes(1);
      expect(mockAiSummary.generateChallengeSummary).toHaveBeenCalledWith('chal-001', 'auto');
      // Alice (game-A) and Bob (game-B) are completed; Charlie declined — no game summary for Charlie
      expect(mockAiSummary.generateGameSummary).toHaveBeenCalledTimes(2);
      expect(mockAiSummary.generateGameSummary).toHaveBeenCalledWith('game-A', 'auto');
      expect(mockAiSummary.generateGameSummary).toHaveBeenCalledWith('game-B', 'auto');
    });

    it('dispatches nothing when all non-creator participants decline (challenge cancelled)', async () => {
      jest.useFakeTimers();

      // Bob already declined, Charlie about to decline → allNonCreatorsDeclined = true → cancelled
      const challenge = makeChallenge({
        'user-A': {
          sub: 'user-A',
          handle: 'Alice',
          role: 'creator',
          status: 'completed',
          gameId: 'game-A',
          finalScore: 12,
        },
        'user-B': { sub: 'user-B', handle: 'Bob', role: 'challenged', status: 'declined' },
        'user-C': { sub: 'user-C', handle: 'Charlie', role: 'challenged', status: 'pending' },
      });
      mockDb.get.mockResolvedValueOnce({ Item: challenge });

      await service.declineChallenge('chal-001', 'user-C');

      jest.runAllTimers();
      await Promise.resolve();

      expect(mockAiSummary.generateChallengeSummary).not.toHaveBeenCalled();
      expect(mockAiSummary.generateGameSummary).not.toHaveBeenCalled();
    });
  });
});
