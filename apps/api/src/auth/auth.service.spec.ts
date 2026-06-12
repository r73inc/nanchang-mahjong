import { Test } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { InvitesService } from '../invites/invites.service';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockUsers = {
  isHandleTaken: jest.fn(),
  createProfile: jest.fn(),
  findBySub: jest.fn(),
  findByHandle: jest.fn(),
  softDelete: jest.fn(),
  updatePasswordHash: jest.fn(),
  getOrThrow: jest.fn(),
};

const mockInvites = {
  validateOrThrow: jest.fn(),
  redeemOrThrow: jest.fn(),
};

const mockJwt = {
  sign: jest.fn().mockReturnValue('mock-jwt-token'),
  verify: jest.fn(),
};

const mockConfig = {
  get: jest.fn((key: string) => {
    const cfg: Record<string, unknown> = {
      'jwt.secret': 'test-secret',
      'jwt.expiresIn': '1h',
      'jwt.refreshSecret': 'test-refresh-secret',
      'jwt.refreshExpiresIn': '30d',
      jwt: {
        secret: 'test-secret',
        expiresIn: '1h',
        refreshSecret: 'test-refresh-secret',
        refreshExpiresIn: '30d',
      },
    };
    return cfg[key];
  }),
};

// ── Fixtures ──────────────────────────────────────────────────────────────────

const HASH = '$2b$12$testhashfortesting1234567890123456789012345678901234'; // fake hash

const signupDto = {
  password: 'Password1',
  handle: 'alice',
  inviteCode: 'INVITE01',
};

const userProfile = {
  sub: 'sub-123',
  handle: 'alice',
  role: 'user' as const,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  disabled: false,
  passwordHash: HASH,
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsers },
        { provide: InvitesService, useValue: mockInvites },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  // ── signup ─────────────────────────────────────────────────────────────────

  describe('signup', () => {
    beforeEach(() => {
      mockInvites.validateOrThrow.mockResolvedValue(undefined);
      mockUsers.isHandleTaken.mockResolvedValue(false);
      mockInvites.redeemOrThrow.mockResolvedValue(undefined);
      mockUsers.createProfile.mockResolvedValue(userProfile);
    });

    it('returns access and refresh tokens on success', async () => {
      const result = await service.signup(signupDto);
      expect(result).toEqual({ accessToken: 'mock-jwt-token', refreshToken: 'mock-jwt-token' });
    });

    it('calls invite validation before anything else', async () => {
      await service.signup(signupDto);
      expect(mockInvites.validateOrThrow).toHaveBeenCalledWith('INVITE01');
    });

    it('throws ConflictException when handle is already taken', async () => {
      mockUsers.isHandleTaken.mockResolvedValue(true);
      await expect(service.signup(signupDto)).rejects.toThrow(ConflictException);
      expect(mockUsers.createProfile).not.toHaveBeenCalled();
    });

    it('creates the user profile with role=user', async () => {
      await service.signup(signupDto);
      expect(mockUsers.createProfile).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'user', handle: 'alice' }),
      );
    });

    it('stores a bcrypt hash (not the raw password)', async () => {
      await service.signup(signupDto);
      const createCall = mockUsers.createProfile.mock.calls[0][0] as { passwordHash: string };
      expect(createCall.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(createCall.passwordHash).not.toContain('Password1');
    });
  });

  // ── signin ─────────────────────────────────────────────────────────────────

  describe('signin', () => {
    const realHash = bcrypt.hashSync('Password1', 4); // fast rounds for tests

    beforeEach(() => {
      mockUsers.findByHandle.mockResolvedValue({ ...userProfile, passwordHash: realHash });
    });

    it('returns tokens for valid credentials', async () => {
      const result = await service.signin({ handle: 'alice', password: 'Password1' });
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('throws UnauthorizedException for an unknown handle', async () => {
      mockUsers.findByHandle.mockResolvedValue(null);
      await expect(service.signin({ handle: 'nobody', password: 'Password1' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException for a wrong password', async () => {
      await expect(service.signin({ handle: 'alice', password: 'WrongPass1' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when account is disabled', async () => {
      mockUsers.findByHandle.mockResolvedValue({
        ...userProfile,
        disabled: true,
        passwordHash: realHash,
      });
      await expect(service.signin({ handle: 'alice', password: 'Password1' })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── changePassword ─────────────────────────────────────────────────────────

  describe('changePassword', () => {
    const realHash = bcrypt.hashSync('OldPass1', 4);

    beforeEach(() => {
      mockUsers.findBySub.mockResolvedValue({ ...userProfile, passwordHash: realHash });
      mockUsers.updatePasswordHash.mockResolvedValue(undefined);
    });

    it('updates the password hash when current password is correct', async () => {
      await service.changePassword('sub-123', 'OldPass1', 'NewPass1');
      expect(mockUsers.updatePasswordHash).toHaveBeenCalledWith(
        'sub-123',
        expect.stringMatching(/^\$2[aby]\$/),
      );
    });

    it('throws UnauthorizedException when current password is wrong', async () => {
      await expect(service.changePassword('sub-123', 'WrongPass', 'NewPass1')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockUsers.updatePasswordHash).not.toHaveBeenCalled();
    });
  });

  // ── refreshAccessToken ─────────────────────────────────────────────────────

  describe('refreshAccessToken', () => {
    it('returns a new accessToken for a valid refresh token', () => {
      mockJwt.verify.mockReturnValue({
        sub: 'sub-123',
        handle: 'alice',
        role: 'user',
        type: 'refresh',
      });
      mockJwt.sign.mockReturnValue('new-access-token');

      const result = service.refreshAccessToken('valid-refresh-token');
      expect(result).toEqual({ accessToken: 'new-access-token' });
    });

    it('throws UnauthorizedException for an invalid refresh token', () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('invalid');
      });
      expect(() => service.refreshAccessToken('bad-token')).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when token type is not refresh', () => {
      mockJwt.verify.mockReturnValue({
        sub: 'sub-123',
        type: 'access',
      });
      expect(() => service.refreshAccessToken('access-token')).toThrow(UnauthorizedException);
    });
  });

  // ── deleteAccount ──────────────────────────────────────────────────────────

  describe('deleteAccount', () => {
    it('soft-deletes the DDB profile', async () => {
      mockUsers.softDelete.mockResolvedValue(undefined);
      await service.deleteAccount('sub-123');
      expect(mockUsers.softDelete).toHaveBeenCalledWith('sub-123');
    });
  });
});
