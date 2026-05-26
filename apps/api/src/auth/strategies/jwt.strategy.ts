import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import type { AppConfig } from '../../config/configuration';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

interface JwtPayload {
  sub: string;
  email: string;
  handle: string;
  displayName: string;
  role: 'user' | 'admin';
  type?: 'access' | 'refresh';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('jwt.secret', { infer: true }),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (payload.type && payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    // Reject requests from accounts that have been disabled since token issuance.
    const profile = await this.users.findBySub(payload.sub);
    if (profile?.disabled === true) {
      throw new UnauthorizedException('Account is disabled');
    }

    return {
      sub: payload.sub,
      email: payload.email,
      handle: payload.handle,
      displayName: payload.displayName,
      role: payload.role,
    };
  }
}
