import { Test } from '@nestjs/testing';
import { ConflictException, GoneException, NotFoundException } from '@nestjs/common';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { InvitesService } from './invites.service';
import { DynamoDBService, DK } from '../database/dynamodb.service';

// ── Shared mock ──────────────────────────────────────────────────────────────

const mockDb = {
  get: jest.fn(),
  put: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  query: jest.fn(),
  transactWrite: jest.fn(),
  tableName: 'nanchang_main',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function activeInvite(code = 'TESTCODE') {
  return {
    code,
    status: 'active' as const,
    createdBy: 'admin-sub',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('InvitesService', () => {
  let service: InvitesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [InvitesService, { provide: DynamoDBService, useValue: mockDb }],
    }).compile();

    service = module.get(InvitesService);
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('writes the invite to DDB and returns the record', async () => {
      mockDb.put.mockResolvedValue({});

      const result = await service.create({ adminSub: 'sub-1' });

      expect(mockDb.put).toHaveBeenCalledTimes(1);
      expect(result.status).toBe('active');
      expect(result.createdBy).toBe('sub-1');
      expect(result.code).toMatch(/^[A-Z2-9]{8}$/); // generated code format
    });

    it('includes optional expiresAt and note when provided', async () => {
      mockDb.put.mockResolvedValue({});

      const result = await service.create({
        adminSub: 'sub-1',
        expiresAt: '2099-01-01T00:00:00.000Z',
        note: 'For Alice',
      });

      expect(result.expiresAt).toBe('2099-01-01T00:00:00.000Z');
      expect(result.note).toBe('For Alice');
    });
  });

  // ── findByCode ────────────────────────────────────────────────────────────

  describe('findByCode', () => {
    it('returns null when item not found', async () => {
      mockDb.get.mockResolvedValue({ Item: undefined });
      expect(await service.findByCode('XXXXXXXX')).toBeNull();
    });

    it('returns the invite record when found', async () => {
      const invite = activeInvite('ABCD1234');
      mockDb.get.mockResolvedValue({ Item: invite });
      expect(await service.findByCode('ABCD1234')).toEqual(invite);
    });
  });

  // ── validateOrThrow ───────────────────────────────────────────────────────

  describe('validateOrThrow', () => {
    it('resolves for a valid active invite', async () => {
      mockDb.get.mockResolvedValue({ Item: activeInvite() });
      await expect(service.validateOrThrow('TESTCODE')).resolves.toBeUndefined();
    });

    it('throws NotFoundException when code does not exist', async () => {
      mockDb.get.mockResolvedValue({ Item: undefined });
      await expect(service.validateOrThrow('NOTFOUND')).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when invite is already redeemed', async () => {
      mockDb.get.mockResolvedValue({ Item: { ...activeInvite(), status: 'redeemed' } });
      await expect(service.validateOrThrow('TESTCODE')).rejects.toThrow(ConflictException);
    });

    it('throws GoneException when invite is revoked', async () => {
      mockDb.get.mockResolvedValue({ Item: { ...activeInvite(), status: 'revoked' } });
      await expect(service.validateOrThrow('TESTCODE')).rejects.toThrow(GoneException);
    });

    it('throws GoneException when invite is expired', async () => {
      mockDb.get.mockResolvedValue({
        Item: { ...activeInvite(), expiresAt: '2000-01-01T00:00:00.000Z' },
      });
      await expect(service.validateOrThrow('TESTCODE')).rejects.toThrow(GoneException);
    });

    it('resolves when expiresAt is in the future', async () => {
      mockDb.get.mockResolvedValue({
        Item: { ...activeInvite(), expiresAt: '2099-01-01T00:00:00.000Z' },
      });
      await expect(service.validateOrThrow('TESTCODE')).resolves.toBeUndefined();
    });
  });

  // ── redeemOrThrow ──────────────────────────────────────────────────────────

  describe('redeemOrThrow', () => {
    it('calls db.update with correct ConditionExpression', async () => {
      mockDb.update.mockResolvedValue({});

      await service.redeemOrThrow('TESTCODE', 'user-sub');

      expect(mockDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: DK.invite('TESTCODE'),
          ConditionExpression: '#status = :active',
        }),
      );
    });

    it('throws ConflictException when the condition check fails', async () => {
      mockDb.update.mockRejectedValue(
        new ConditionalCheckFailedException({ message: '', $metadata: {} }),
      );
      await expect(service.redeemOrThrow('TESTCODE', 'user-sub')).rejects.toThrow(
        ConflictException,
      );
    });

    it('re-throws unexpected errors', async () => {
      const err = new Error('DDB network error');
      mockDb.update.mockRejectedValue(err);
      await expect(service.redeemOrThrow('TESTCODE', 'user-sub')).rejects.toThrow(
        'DDB network error',
      );
    });
  });

  // ── revoke ─────────────────────────────────────────────────────────────────

  describe('revoke', () => {
    it('calls db.update with the revoked status', async () => {
      mockDb.update.mockResolvedValue({});

      await service.revoke('TESTCODE');

      expect(mockDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: DK.invite('TESTCODE'),
          ConditionExpression: 'attribute_exists(PK) AND #status = :active',
        }),
      );
    });

    it('throws ConflictException when the invite cannot be revoked', async () => {
      mockDb.update.mockRejectedValue(
        new ConditionalCheckFailedException({ message: '', $metadata: {} }),
      );
      await expect(service.revoke('TESTCODE')).rejects.toThrow(ConflictException);
    });
  });

  // ── listByStatus ───────────────────────────────────────────────────────────

  describe('listByStatus', () => {
    it('queries gsi1 with the correct gsi1pk', async () => {
      mockDb.query.mockResolvedValue({ Items: [] });

      await service.listByStatus('active');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.objectContaining({
          IndexName: 'gsi1',
          ExpressionAttributeValues: expect.objectContaining({
            ':pk': DK.invitesByStatus('active').gsi1pk,
          }),
        }),
      );
    });

    it('returns empty array when no items exist', async () => {
      mockDb.query.mockResolvedValue({ Items: undefined });
      expect(await service.listByStatus('active')).toEqual([]);
    });
  });

  // ── listAll ────────────────────────────────────────────────────────────────

  describe('listAll', () => {
    it('combines results from all three statuses and sorts by createdAt desc', async () => {
      const older = {
        ...activeInvite('OLD1CODE'),
        status: 'redeemed' as const,
        createdAt: '2024-01-01T00:00:00.000Z',
      };
      const newer = { ...activeInvite('NEW1CODE'), createdAt: '2025-01-01T00:00:00.000Z' };

      mockDb.query
        .mockResolvedValueOnce({ Items: [newer] }) // active
        .mockResolvedValueOnce({ Items: [older] }) // redeemed
        .mockResolvedValueOnce({ Items: [] }); // revoked

      const results = await service.listAll();
      expect(results).toHaveLength(2);
      expect(results[0].code).toBe('NEW1CODE'); // newer first
      expect(results[1].code).toBe('OLD1CODE');
    });
  });
});
