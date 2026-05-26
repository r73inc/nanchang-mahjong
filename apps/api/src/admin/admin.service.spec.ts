import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { DynamoDBService } from '../database/dynamodb.service';
import { InvitesService } from '../invites/invites.service';
import { UsersService } from '../users/users.service';
import { CognitoService } from '../auth/cognito.service';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockDb = { put: jest.fn() };
const mockInvites = { create: jest.fn(), revoke: jest.fn(), listAll: jest.fn() };
const mockUsers = { listAll: jest.fn(), setRole: jest.fn(), setDisabled: jest.fn() };
const mockCognito = {
  adminSetRole: jest.fn(),
  adminDisableUser: jest.fn(),
  adminEnableUser: jest.fn(),
};

// ── Suite ──────────────────────────────────────────────────────────────────────

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDb.put.mockResolvedValue({});
    mockInvites.create.mockResolvedValue({ code: 'TESTCODE', status: 'active' });
    mockUsers.setRole.mockResolvedValue(undefined);
    mockUsers.setDisabled.mockResolvedValue(undefined);
    mockCognito.adminSetRole.mockResolvedValue(undefined);
    mockCognito.adminDisableUser.mockResolvedValue(undefined);
    mockCognito.adminEnableUser.mockResolvedValue(undefined);

    const module = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: DynamoDBService, useValue: mockDb },
        { provide: InvitesService, useValue: mockInvites },
        { provide: UsersService, useValue: mockUsers },
        { provide: CognitoService, useValue: mockCognito },
      ],
    }).compile();

    service = module.get(AdminService);
  });

  // ── createInvites ────────────────────────────────────────────────────────────

  describe('createInvites', () => {
    it('creates the requested number of invites', async () => {
      const results = await service.createInvites('admin-sub', 3);
      expect(mockInvites.create).toHaveBeenCalledTimes(3);
      expect(results).toHaveLength(3);
    });

    it('throws BadRequestException when expiresAt is in the past', async () => {
      const pastDate = new Date(Date.now() - 60_000).toISOString(); // 1 minute ago
      await expect(service.createInvites('admin-sub', 1, pastDate)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockInvites.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when expiresAt is exactly now (<=)', async () => {
      // Use a date that is definitely in the past by the time the check runs
      const justNow = new Date(Date.now() - 1).toISOString();
      await expect(service.createInvites('admin-sub', 1, justNow)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('accepts a future expiresAt without throwing', async () => {
      const futureDate = new Date(Date.now() + 86_400_000).toISOString(); // +1 day
      await expect(service.createInvites('admin-sub', 1, futureDate)).resolves.not.toThrow();
      expect(mockInvites.create).toHaveBeenCalledTimes(1);
    });

    it('writes an audit item after creation', async () => {
      await service.createInvites('admin-sub', 1);
      const auditPut = mockDb.put.mock.calls.find(([{ Item }]: [{ Item: { PK?: string } }]) =>
        String(Item?.PK ?? '').startsWith('AUDIT#'),
      );
      expect(auditPut).toBeDefined();
    });
  });

  // ── setRole ───────────────────────────────────────────────────────────────────

  describe('setRole', () => {
    it('throws ForbiddenException when actor targets themselves', async () => {
      await expect(service.setRole('admin-sub', 'admin-sub', 'user')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockUsers.setRole).not.toHaveBeenCalled();
    });

    it('delegates to UsersService and CognitoService for a different target', async () => {
      await service.setRole('admin-sub', 'user-sub', 'admin');
      expect(mockUsers.setRole).toHaveBeenCalledWith('user-sub', 'admin');
      expect(mockCognito.adminSetRole).toHaveBeenCalledWith('user-sub', 'admin');
    });
  });

  // ── setDisabled ───────────────────────────────────────────────────────────────

  describe('setDisabled', () => {
    it('throws ForbiddenException when actor targets themselves', async () => {
      await expect(service.setDisabled('admin-sub', 'admin-sub', true)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockUsers.setDisabled).not.toHaveBeenCalled();
    });

    it('calls adminDisableUser on Cognito when disabled=true', async () => {
      await service.setDisabled('admin-sub', 'user-sub', true);
      expect(mockCognito.adminDisableUser).toHaveBeenCalledWith('user-sub');
      expect(mockCognito.adminEnableUser).not.toHaveBeenCalled();
    });

    it('calls adminEnableUser on Cognito when disabled=false', async () => {
      await service.setDisabled('admin-sub', 'user-sub', false);
      expect(mockCognito.adminEnableUser).toHaveBeenCalledWith('user-sub');
      expect(mockCognito.adminDisableUser).not.toHaveBeenCalled();
    });
  });
});
