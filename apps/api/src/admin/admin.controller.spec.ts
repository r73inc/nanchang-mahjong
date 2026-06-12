import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const adminUser: AuthenticatedUser = {
  sub: 'admin-sub',
  handle: 'admin',
  role: 'admin',
};

const sampleInvite = {
  code: 'ABCD1234',
  status: 'active' as const,
  createdBy: adminUser.sub,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const sampleUser = {
  sub: 'user-sub',
  handle: 'alice',
  role: 'user' as const,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  disabled: false,
};

// ── Mock AdminService ─────────────────────────────────────────────────────────

const mockAdmin = {
  listInvites: jest.fn(),
  createInvites: jest.fn(),
  revokeInvite: jest.fn(),
  listUsers: jest.fn(),
  setRole: jest.fn(),
  setDisabled: jest.fn(),
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('AdminController', () => {
  let controller: AdminController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [{ provide: AdminService, useValue: mockAdmin }],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AdminController);
  });

  // ── Invites ─────────────────────────────────────────────────────────────────

  describe('listInvites', () => {
    it('returns all invites wrapped in { invites }', async () => {
      mockAdmin.listInvites.mockResolvedValue([sampleInvite]);
      const res = await controller.listInvites();
      expect(res).toEqual({ invites: [sampleInvite] });
      expect(mockAdmin.listInvites).toHaveBeenCalledTimes(1);
    });
  });

  describe('createInvites', () => {
    it('delegates count/expiry/note to AdminService and returns generated invites', async () => {
      mockAdmin.createInvites.mockResolvedValue([sampleInvite]);
      const dto = { count: 1, expiresAt: undefined, note: 'for alice' };
      const res = await controller.createInvites(adminUser, dto as never);
      expect(res).toEqual({ invites: [sampleInvite] });
      expect(mockAdmin.createInvites).toHaveBeenCalledWith(
        adminUser.sub,
        1,
        undefined,
        'for alice',
      );
    });

    it('defaults count to 1 when omitted', async () => {
      mockAdmin.createInvites.mockResolvedValue([sampleInvite]);
      await controller.createInvites(adminUser, { count: undefined } as never);
      expect(mockAdmin.createInvites).toHaveBeenCalledWith(adminUser.sub, 1, undefined, undefined);
    });
  });

  describe('revokeInvite', () => {
    it('delegates to AdminService and returns { ok: true }', async () => {
      mockAdmin.revokeInvite.mockResolvedValue(undefined);
      const res = await controller.revokeInvite(adminUser, 'ABCD1234');
      expect(res).toEqual({ ok: true });
      expect(mockAdmin.revokeInvite).toHaveBeenCalledWith(adminUser.sub, 'ABCD1234');
    });
  });

  // ── Users ────────────────────────────────────────────────────────────────────

  describe('listUsers', () => {
    it('returns all users when no search term', async () => {
      mockAdmin.listUsers.mockResolvedValue([sampleUser]);
      const res = await controller.listUsers(undefined);
      expect(res).toEqual({ users: [sampleUser] });
      expect(mockAdmin.listUsers).toHaveBeenCalledWith(undefined);
    });

    it('passes the search term to AdminService', async () => {
      mockAdmin.listUsers.mockResolvedValue([sampleUser]);
      await controller.listUsers('alice');
      expect(mockAdmin.listUsers).toHaveBeenCalledWith('alice');
    });
  });

  describe('setRole', () => {
    it('returns { ok: true } on success', async () => {
      mockAdmin.setRole.mockResolvedValue(undefined);
      const res = await controller.setRole(adminUser, 'user-sub', { role: 'user' });
      expect(res).toEqual({ ok: true });
      expect(mockAdmin.setRole).toHaveBeenCalledWith(adminUser.sub, 'user-sub', 'user');
    });

    it('propagates ForbiddenException when targeting self', async () => {
      mockAdmin.setRole.mockRejectedValue(new ForbiddenException('Cannot change your own role'));
      await expect(controller.setRole(adminUser, adminUser.sub, { role: 'user' })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('setDisabled', () => {
    it('returns { ok: true } on success', async () => {
      mockAdmin.setDisabled.mockResolvedValue(undefined);
      const res = await controller.setDisabled(adminUser, 'user-sub', { disabled: true });
      expect(res).toEqual({ ok: true });
      expect(mockAdmin.setDisabled).toHaveBeenCalledWith(adminUser.sub, 'user-sub', true);
    });

    it('propagates ForbiddenException when targeting self', async () => {
      mockAdmin.setDisabled.mockRejectedValue(
        new ForbiddenException('Cannot disable your own account'),
      );
      await expect(
        controller.setDisabled(adminUser, adminUser.sub, { disabled: true }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
