import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CognitoService } from './cognito.service';
import { UsersService } from '../users/users.service';
import { InvitesService } from '../invites/invites.service';
import type { AppConfig } from '../config/configuration';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import type { SignupDto } from './dto/signup.dto';
import type { SigninDto } from './dto/signin.dto';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly cognito: CognitoService,
    private readonly users: UsersService,
    private readonly invites: InvitesService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async signup(dto: SignupDto): Promise<AuthTokens> {
    // 1. Validate invite (fast-fail read — atomic gate is in step 4)
    await this.invites.validateOrThrow(dto.inviteCode);

    // 2. Check handle availability
    const handleTaken = await this.users.isHandleTaken(dto.handle);
    if (handleTaken) {
      throw new ConflictException('Handle is already taken');
    }

    // 3. Create Cognito user (validates email uniqueness in Cognito)
    let cognitoSub: string;
    try {
      cognitoSub = await this.cognito.adminCreateUser(dto.email, dto.password);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === 'EMAIL_ALREADY_REGISTERED') {
        throw new ConflictException('Email is already registered');
      }
      if (e.code === 'INVALID_PASSWORD') {
        throw new BadRequestException(
          'Password does not meet requirements (min 8 chars, upper, lower, number)',
        );
      }
      throw err;
    }

    // 4. Atomically redeem the invite (prevents races)
    await this.invites.redeemOrThrow(dto.inviteCode, cognitoSub);

    // 5. Create user profile in DDB
    await this.users.createProfile({
      sub: cognitoSub,
      email: dto.email,
      handle: dto.handle,
      displayName: dto.displayName,
      role: 'user',
    });

    const user: AuthenticatedUser = {
      sub: cognitoSub,
      email: dto.email,
      handle: dto.handle,
      displayName: dto.displayName,
      role: 'user',
    };

    return this.issueTokens(user);
  }

  async signin(dto: SigninDto): Promise<AuthTokens> {
    let cognitoSub: string;
    try {
      cognitoSub = await this.cognito.initiateAuth(dto.email, dto.password);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === 'INVALID_CREDENTIALS' || e.code === 'TOO_MANY_ATTEMPTS') {
        throw new UnauthorizedException('Invalid email or password');
      }
      throw err;
    }

    const profile = await this.users.findBySub(cognitoSub);
    if (!profile) {
      throw new UnauthorizedException('Account not found');
    }
    if (profile.disabled) {
      throw new UnauthorizedException('Account is disabled');
    }

    return this.issueTokens({
      sub: profile.sub,
      email: profile.email,
      handle: profile.handle,
      displayName: profile.displayName,
      role: profile.role,
    });
  }

  async forgotPassword(email: string): Promise<void> {
    // CognitoService already suppresses UserNotFoundException to prevent enumeration
    await this.cognito.forgotPassword(email);
  }

  async confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void> {
    await this.cognito.confirmForgotPassword(email, code, newPassword);
  }

  /** change-password requires the user to re-authenticate via Cognito using their current creds. */
  async changePassword(
    userEmail: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    // Re-auth to get a fresh Cognito access token for ChangePassword
    let cognitoAccessToken: string;
    try {
      cognitoAccessToken = await this.getCognitoAccessToken(userEmail, currentPassword);
    } catch {
      throw new UnauthorizedException('Current password is incorrect');
    }
    await this.cognito.changePassword(cognitoAccessToken, currentPassword, newPassword);
  }

  async deleteAccount(sub: string, email: string): Promise<void> {
    // Soft-delete profile in DDB (anonymise PII), then remove from Cognito
    await this.users.softDelete(sub);
    await this.cognito.adminDeleteUser(email);
    this.logger.log(`Account deleted: sub=${sub}`);
  }

  refreshAccessToken(refreshToken: string): { accessToken: string } {
    let payload: AuthenticatedUser & { type: string };
    try {
      payload = this.jwt.verify<AuthenticatedUser & { type: string }>(refreshToken, {
        secret: this.config.get('jwt.refreshSecret', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (payload.type !== 'refresh') throw new UnauthorizedException('Invalid token type');

    const accessToken = this.jwt.sign(
      {
        sub: payload.sub,
        email: payload.email,
        handle: payload.handle,
        displayName: payload.displayName,
        role: payload.role,
        type: 'access',
      },
      {
        secret: this.config.get('jwt.secret', { infer: true }),
        expiresIn: this.config.get('jwt.expiresIn', { infer: true }),
      },
    );
    return { accessToken };
  }

  private issueTokens(user: AuthenticatedUser): AuthTokens {
    const base = {
      sub: user.sub,
      email: user.email,
      handle: user.handle,
      displayName: user.displayName,
      role: user.role,
    };
    const jwtCfg = this.config.get('jwt', { infer: true });

    const accessToken = this.jwt.sign(
      { ...base, type: 'access' },
      { secret: jwtCfg.secret, expiresIn: jwtCfg.expiresIn },
    );
    const refreshToken = this.jwt.sign(
      { ...base, type: 'refresh' },
      { secret: jwtCfg.refreshSecret, expiresIn: jwtCfg.refreshExpiresIn },
    );
    return { accessToken, refreshToken };
  }

  /** Re-authenticates to get a raw Cognito access token string (needed for ChangePassword API). */
  private async getCognitoAccessToken(email: string, password: string): Promise<string> {
    const { CognitoIdentityProviderClient, InitiateAuthCommand } =
      await import('@aws-sdk/client-cognito-identity-provider');
    const awsCfg = this.config.get('aws', { infer: true });
    const cognitoCfg = this.config.get('cognito', { infer: true });

    const client = new CognitoIdentityProviderClient({
      region: awsCfg.region,
      ...(awsCfg.endpoints.cognitoIdp && { endpoint: awsCfg.endpoints.cognitoIdp }),
    });
    const res = await client.send(
      new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: cognitoCfg.clientId,
        AuthParameters: { USERNAME: email, PASSWORD: password },
      }),
    );
    const token = res.AuthenticationResult?.AccessToken;
    if (!token) throw new Error('No Cognito access token returned');
    return token;
  }
}
