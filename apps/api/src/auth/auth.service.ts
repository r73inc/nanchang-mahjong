import { Injectable, ConflictException, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
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

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly invites: InvitesService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async signup(dto: SignupDto): Promise<AuthTokens> {
    // 1. Validate invite (fast-fail read — atomic gate is in step 3)
    await this.invites.validateOrThrow(dto.inviteCode);

    // 2. Check handle availability
    const handleTaken = await this.users.isHandleTaken(dto.handle);
    if (handleTaken) {
      throw new ConflictException('Handle is already taken');
    }

    // 3. Hash password and generate sub
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const sub = randomUUID();

    // 4. Atomically redeem the invite (prevents races)
    await this.invites.redeemOrThrow(dto.inviteCode, sub);

    // 5. Create user profile in DDB
    await this.users.createProfile({
      sub,
      handle: dto.handle,
      role: 'user',
      passwordHash,
    });

    const user: AuthenticatedUser = {
      sub,
      handle: dto.handle.toLowerCase(),
      role: 'user',
    };

    this.logger.log(`Signup: handle=${user.handle} sub=${sub}`);
    return this.issueTokens(user);
  }

  async signin(dto: SigninDto): Promise<AuthTokens> {
    const profile = await this.users.findByHandle(dto.handle);

    if (!profile || !profile.passwordHash) {
      throw new UnauthorizedException('Invalid handle or password');
    }
    if (profile.disabled) {
      throw new UnauthorizedException('Account is disabled');
    }

    const valid = await bcrypt.compare(dto.password, profile.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid handle or password');
    }

    return this.issueTokens({
      sub: profile.sub,
      handle: profile.handle,
      role: profile.role,
    });
  }

  async changePassword(sub: string, currentPassword: string, newPassword: string): Promise<void> {
    const profile = await this.users.findBySub(sub);
    if (!profile || !profile.passwordHash) {
      throw new UnauthorizedException('Account not found');
    }

    const valid = await bcrypt.compare(currentPassword, profile.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.users.updatePasswordHash(sub, newHash);
  }

  async deleteAccount(sub: string): Promise<void> {
    await this.users.softDelete(sub);
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
        handle: payload.handle,
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
      handle: user.handle,
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
}
