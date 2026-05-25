import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { SignupDto } from './dto/signup.dto';
import type { SigninDto } from './dto/signin.dto';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockAuth = {
  signup: jest.fn(),
  signin: jest.fn(),
  refreshAccessToken: jest.fn(),
  forgotPassword: jest.fn(),
  confirmForgotPassword: jest.fn(),
  changePassword: jest.fn(),
  deleteAccount: jest.fn(),
};

const mockUser: AuthenticatedUser = {
  sub: 'sub-123',
  email: 'alice@example.com',
  handle: 'alice',
  displayName: 'Alice',
  role: 'user',
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuth }],
    })
      // Override ThrottlerGuard — no rate-limit state in unit tests
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AuthController);
  });

  describe('signup', () => {
    it('delegates to authService.signup', async () => {
      const dto: SignupDto = {
        email: 'alice@example.com',
        password: 'Password1',
        handle: 'alice',
        displayName: 'Alice',
        inviteCode: 'INVITE01',
      };
      mockAuth.signup.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });

      const result = await controller.signup(dto);

      expect(mockAuth.signup).toHaveBeenCalledWith(dto);
      expect(result).toEqual({ accessToken: 'at', refreshToken: 'rt' });
    });
  });

  describe('signin', () => {
    it('delegates to authService.signin', async () => {
      const dto: SigninDto = { email: 'alice@example.com', password: 'Password1' };
      mockAuth.signin.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });

      await controller.signin(dto);

      expect(mockAuth.signin).toHaveBeenCalledWith(dto);
    });
  });

  describe('refresh', () => {
    it('delegates to authService.refreshAccessToken', async () => {
      mockAuth.refreshAccessToken.mockReturnValue({ accessToken: 'new-at' });

      const result = await controller.refresh('valid-refresh-token');

      expect(mockAuth.refreshAccessToken).toHaveBeenCalledWith('valid-refresh-token');
      expect(result).toEqual({ accessToken: 'new-at' });
    });
  });

  describe('forgotPassword', () => {
    it('delegates to authService.forgotPassword', async () => {
      mockAuth.forgotPassword.mockResolvedValue(undefined);

      await controller.forgotPassword({ email: 'alice@example.com' });

      expect(mockAuth.forgotPassword).toHaveBeenCalledWith('alice@example.com');
    });
  });

  describe('confirmForgotPassword', () => {
    it('delegates to authService.confirmForgotPassword', async () => {
      mockAuth.confirmForgotPassword.mockResolvedValue(undefined);

      await controller.confirmForgotPassword({
        email: 'alice@example.com',
        code: '123456',
        newPassword: 'NewPass1',
      });

      expect(mockAuth.confirmForgotPassword).toHaveBeenCalledWith(
        'alice@example.com',
        '123456',
        'NewPass1',
      );
    });
  });

  describe('changePassword', () => {
    it('delegates to authService.changePassword with the current user email', async () => {
      mockAuth.changePassword.mockResolvedValue(undefined);

      await controller.changePassword(mockUser, {
        currentPassword: 'OldPass1',
        newPassword: 'NewPass1',
      });

      expect(mockAuth.changePassword).toHaveBeenCalledWith(
        'alice@example.com',
        'OldPass1',
        'NewPass1',
      );
    });
  });

  describe('deleteAccount', () => {
    it('delegates to authService.deleteAccount with sub and email', async () => {
      mockAuth.deleteAccount.mockResolvedValue(undefined);

      await controller.deleteAccount(mockUser);

      expect(mockAuth.deleteAccount).toHaveBeenCalledWith('sub-123', 'alice@example.com');
    });
  });
});
