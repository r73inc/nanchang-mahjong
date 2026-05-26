import { Test } from '@nestjs/testing';
import {
  ForbiddenException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { FriendsService } from './friends.service';
import { DynamoDBService } from '../database/dynamodb.service';
import { UsersService } from '../users/users.service';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockDb = {
  get: jest.fn(),
  put: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  query: jest.fn(),
  transactWrite: jest.fn(),
  tableName: 'test_table',
};

const mockUsers = {
  findBySub: jest.fn(),
  searchPublic: jest.fn(),
};

const ALICE = 'alice-sub';
const BOB = 'bob-sub';

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('FriendsService', () => {
  let service: FriendsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        FriendsService,
        { provide: DynamoDBService, useValue: mockDb },
        { provide: UsersService, useValue: mockUsers },
      ],
    }).compile();
    service = module.get(FriendsService);
  });

  // ── sendRequest ──────────────────────────────────────────────────────────────

  describe('sendRequest', () => {
    it('throws ForbiddenException when actor targets themselves', async () => {
      await expect(service.sendRequest(ALICE, ALICE)).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when target user does not exist', async () => {
      mockUsers.findBySub.mockResolvedValue(null);
      await expect(service.sendRequest(ALICE, BOB)).rejects.toThrow(NotFoundException);
    });

    it('creates two edge items via transactWrite', async () => {
      mockUsers.findBySub.mockResolvedValue({ sub: BOB, handle: 'bob', displayName: 'Bob' });
      mockDb.transactWrite.mockResolvedValue({});
      await service.sendRequest(ALICE, BOB);
      expect(mockDb.transactWrite).toHaveBeenCalledTimes(1);
      const { TransactItems } = mockDb.transactWrite.mock.calls[0][0] as {
        TransactItems: Array<{ Put: { Item: { friendSub: string; status: string } } }>;
      };
      expect(TransactItems).toHaveLength(2);
      expect(TransactItems[0].Put.Item.status).toBe('pending_sent');
      expect(TransactItems[1].Put.Item.status).toBe('pending_received');
    });

    it('throws ConflictException when transactWrite fails with TransactionCanceledException', async () => {
      mockUsers.findBySub.mockResolvedValue({ sub: BOB });
      mockDb.transactWrite.mockRejectedValue(
        new TransactionCanceledException({ message: 'condition failed', $metadata: {} }),
      );
      await expect(service.sendRequest(ALICE, BOB)).rejects.toThrow(ConflictException);
    });
  });

  // ── acceptRequest ────────────────────────────────────────────────────────────

  describe('acceptRequest', () => {
    it('throws BadRequestException when there is no pending_received edge', async () => {
      mockDb.get.mockResolvedValue({ Item: null });
      await expect(service.acceptRequest(ALICE, BOB)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the edge status is not pending_received', async () => {
      mockDb.get.mockResolvedValue({ Item: { status: 'accepted' } });
      await expect(service.acceptRequest(ALICE, BOB)).rejects.toThrow(BadRequestException);
    });

    it('updates both edges to accepted', async () => {
      mockDb.get.mockResolvedValue({ Item: { status: 'pending_received' } });
      mockDb.update.mockResolvedValue({});
      await service.acceptRequest(ALICE, BOB);
      expect(mockDb.update).toHaveBeenCalledTimes(2);
      const calls = mockDb.update.mock.calls as Array<
        [{ ExpressionAttributeValues: Record<string, unknown> }]
      >;
      expect(calls.every(([p]) => p.ExpressionAttributeValues[':s'] === 'accepted')).toBe(true);
    });
  });

  // ── declineRequest ───────────────────────────────────────────────────────────

  describe('declineRequest', () => {
    it('throws BadRequestException when edge is missing', async () => {
      mockDb.get.mockResolvedValue({ Item: null });
      await expect(service.declineRequest(ALICE, BOB)).rejects.toThrow(BadRequestException);
    });

    it('deletes both edges when a pending_received edge exists', async () => {
      mockDb.get.mockResolvedValue({ Item: { status: 'pending_received' } });
      mockDb.delete.mockResolvedValue({});
      await service.declineRequest(ALICE, BOB);
      expect(mockDb.delete).toHaveBeenCalledTimes(2);
    });
  });

  // ── removeFriend ─────────────────────────────────────────────────────────────

  describe('removeFriend', () => {
    it('throws BadRequestException when not friends', async () => {
      mockDb.get.mockResolvedValue({ Item: { status: 'pending_sent' } });
      await expect(service.removeFriend(ALICE, BOB)).rejects.toThrow(BadRequestException);
    });

    it('deletes both edges when friends', async () => {
      mockDb.get.mockResolvedValue({ Item: { status: 'accepted' } });
      mockDb.delete.mockResolvedValue({});
      await service.removeFriend(ALICE, BOB);
      expect(mockDb.delete).toHaveBeenCalledTimes(2);
    });
  });

  // ── listFriends ───────────────────────────────────────────────────────────────

  describe('listFriends', () => {
    it('returns empty array when no edges', async () => {
      mockDb.query.mockResolvedValue({ Items: [] });
      expect(await service.listFriends(ALICE)).toEqual([]);
    });

    it('enriches edges with profile data', async () => {
      mockDb.query.mockResolvedValue({
        Items: [{ friendSub: BOB, status: 'accepted', createdAt: 'x', updatedAt: 'x' }],
      });
      mockUsers.findBySub.mockResolvedValue({ sub: BOB, handle: 'bob', displayName: 'Bob' });
      const result = await service.listFriends(ALICE);
      expect(result[0].handle).toBe('bob');
      expect(result[0].displayName).toBe('Bob');
    });
  });

  // ── searchUsers ───────────────────────────────────────────────────────────────

  describe('searchUsers', () => {
    it('excludes self from results', async () => {
      mockUsers.searchPublic.mockResolvedValue([
        { sub: ALICE, handle: 'alice', displayName: 'Alice' },
        { sub: BOB, handle: 'bob', displayName: 'Bob' },
      ]);
      mockDb.get.mockResolvedValue({ Item: null }); // no friendship
      const results = await service.searchUsers(ALICE, 'a');
      expect(results.every((r) => r.sub !== ALICE)).toBe(true);
    });

    it('includes friendStatus in each result', async () => {
      mockUsers.searchPublic.mockResolvedValue([{ sub: BOB, handle: 'bob', displayName: 'Bob' }]);
      mockDb.get.mockResolvedValue({ Item: { status: 'accepted' } });
      const results = await service.searchUsers(ALICE, 'bob');
      expect(results[0].friendStatus).toBe('accepted');
    });
  });
});
