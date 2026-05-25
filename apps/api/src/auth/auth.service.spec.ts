import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { CognitoService } from './cognito.service';
import { UsersService } from '../users/users.service';
import { InvitesService } from '../invites/invites.service';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockCognito = {
  adminCreateUser: jest.fn(),
  initiateAuth: jest.fn(),
  forgotPassword: jest.fn(),
  confirmForgotPassword: jest.fn(),
  changePassword: jest.fn(),
  adminDeleteUser: jest.fn(),
};

const mockUsers = {
  isHandleTaken: jest.fn(),
  createProfile: jest.fn(),
  findBySub: jest.fn(),
  softDelete: jest.fn(),
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

const signupDto = {
  email: 'alice@example.com',
  password: 'Password1',
  handle: 'alice',
  displayName: 'Alice',
  inviteCode: 'INVITE01',
};

const userProfile = {
  sub: 'sub-123',
  email: 'alice@example.com',
  handle: 'alice',
  displayName: 'Alice',
  role: 'user' as const,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  disabled: false,
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: CognitoService, useValue: mockCognito },
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
      mockCognito.adminCreateUser.mockResolvedValue('sub-123');
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

    it('atomically redeems the invite after Cognito user creation', async () => {
      await service.signup(signupDto);
      const cognitoCallOrder = mockCognito.adminCreateUser.mock.invocationCallOrder[0];
      const redeemCallOrder = mockInvites.redeemOrThrow.mock.invocationCallOrder[0];
      expect(cognitoCallOrder).toBeLessThan(redeemCallOrder);
    });

    it('throws ConflictException when handle is already taken', async () => {
      mockUsers.isHandleTaken.mockResolvedValue(true);
      await expect(service.signup(signupDto)).rejects.toThrow(ConflictException);
      expect(mockCognito.adminCreateUser).not.toHaveBeenCalled();
    });

    it('throws ConflictException when email is already registered in Cognito', async () => {
      mockCognito.adminCreateUser.mockRejectedValue(
        Object.assign(new Error(), { code: 'EMAIL_ALREADY_REGISTERED' }),
      );
      await expect(service.signup(signupDto)).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException for invalid password policy', async () => {
      mockCognito.adminCreateUser.mockRejectedValue(
        Object.assign(new Error(), { code: 'INVALID_PASSWORD' }),
      );
      await expect(service.signup(signupDto)).rejects.toThrow(BadRequestException);
    });

    it('creates the user profile with role=user', async () => {
      await service.signup(signupDto);
      expect(mockUsers.createProfile).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'user' }),
      );
    });
  });

  // ── signin ─────────────────────────────────────────────────────────────────

  describe('signin', () => {
    beforeEach(() => {
      mockCognito.initiateAuth.mockResolvedValue('sub-123');
      mockUsers.findBySub.mockResolvedValue(userProfile);
    });

    it('returns tokens for valid credentials', async () => {
      const result = await service.signin({ email: 'alice@example.com', password: 'Password1' });
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('throws UnauthorizedException for invalid Cognito credentials', async () => {
      mockCognito.initiateAuth.mockRejectedValue(
        Object.assign(new Error(), { code: 'INVALID_CREDENTIALS' }),
      );
      await expect(
        service.signin({ email: 'alice@example.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when DDB profile is not found', async () => {
      mockUsers.findBySub.mockResolvedValue(null);
      await expect(
        service.signin({ email: 'alice@example.com', password: 'Password1' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when account is disabled', async () => {
      mockUsers.findBySub.mockResolvedValue({ ...userProfile, disabled: true });
      await expect(
        service.signin({ email: 'alice@example.com', password: 'Password1' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── forgotPassword ─────────────────────────────────────────────────────────

  describe('forgotPassword', () => {
    it('delegates to cognito.forgotPassword', async () => {
      mockCognito.forgotPassword.mockResolvedValue(undefined);
      await service.forgotPassword('alice@example.com');
      expect(mockCognito.forgotPassword).toHaveBeenCalledWith('alice@example.com');
    });
  });

  // ── refreshAccessToken ─────────────────────────────────────────────────────

  describe('refreshAccessToken', () => {
    it('returns a new accessToken for a valid refresh token', () => {
      mockJwt.verify.mockReturnValue({
        sub: 'sub-123',
        email: 'alice@example.com',
        handle: 'alice',
        displayName: 'Alice',
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
    it('soft-deletes the DDB profile then hard-deletes from Cognito', async () => {
      mockUsers.softDelete.mockResolvedValue(undefined);
      mockCognito.adminDeleteUser.mockResolvedValue(undefined);

      await service.deleteAccount('sub-123', 'alice@example.com');

      expect(mockUsers.softDelete).toHaveBeenCalledWith('sub-123');
      expect(mockCognito.adminDeleteUser).toHaveBeenCalledWith('alice@example.com');
      // Ensure soft-delete happened before hard-delete
      const softOrder = mockUsers.softDelete.mock.invocationCallOrder[0];
      const hardOrder = mockCognito.adminDeleteUser.mock.invocationCallOrder[0];
      expect(softOrder).toBeLessThan(hardOrder);
    });
  });
});
