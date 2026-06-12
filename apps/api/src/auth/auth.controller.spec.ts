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
  changePassword: jest.fn(),
  deleteAccount: jest.fn(),
};

const mockUser: AuthenticatedUser = {
  sub: 'sub-123',
  handle: 'alice',
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
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AuthController);
  });

  describe('signup', () => {
    it('delegates to authService.signup', async () => {
      const dto: SignupDto = {
        password: 'Password1',
        handle: 'alice',
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
      const dto: SigninDto = { handle: 'alice', password: 'Password1' };
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

  describe('changePassword', () => {
    it('delegates to authService.changePassword with the current user sub', async () => {
      mockAuth.changePassword.mockResolvedValue(undefined);

      await controller.changePassword(mockUser, {
        currentPassword: 'OldPass1',
        newPassword: 'NewPass1',
      });

      expect(mockAuth.changePassword).toHaveBeenCalledWith('sub-123', 'OldPass1', 'NewPass1');
    });
  });

  describe('deleteAccount', () => {
    it('delegates to authService.deleteAccount with sub only', async () => {
      mockAuth.deleteAccount.mockResolvedValue(undefined);

      await controller.deleteAccount(mockUser);

      expect(mockAuth.deleteAccount).toHaveBeenCalledWith('sub-123');
    });
  });
});
