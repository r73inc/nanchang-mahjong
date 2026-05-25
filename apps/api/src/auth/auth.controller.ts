import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Delete } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { SigninDto } from './dto/signin.dto';
import { ForgotPasswordDto, ConfirmForgotPasswordDto } from './dto/forgot-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** POST /auth/signup — invite-gated account creation. Rate: 5/min/IP */
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  /** POST /auth/signin — returns { accessToken, refreshToken }. Rate: 5/min/IP */
  @Post('signin')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  signin(@Body() dto: SigninDto) {
    return this.auth.signin(dto);
  }

  /** POST /auth/refresh — exchange a valid refresh token for a new access token. */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  refresh(@Body('refreshToken') refreshToken: string) {
    return this.auth.refreshAccessToken(refreshToken);
  }

  /** POST /auth/forgot-password — triggers Cognito password-reset email. Rate: 5/min/IP */
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto.email);
  }

  /** POST /auth/confirm-forgot-password — submits code + new password. Rate: 5/min/IP */
  @Post('confirm-forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async confirmForgotPassword(@Body() dto: ConfirmForgotPasswordDto) {
    await this.auth.confirmForgotPassword(dto.email, dto.code, dto.newPassword);
  }

  /** POST /auth/change-password — requires auth. Rate: standard 60/min/user */
  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtGuard)
  async changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(user.email, dto.currentPassword, dto.newPassword);
  }

  /** DELETE /auth/account — hard-deletes from Cognito, soft-deletes DDB profile. Requires auth. */
  @Delete('account')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtGuard)
  async deleteAccount(@CurrentUser() user: AuthenticatedUser) {
    await this.auth.deleteAccount(user.sub, user.email);
  }
}
