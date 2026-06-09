/**
 * WsAuthAdapter — wraps the standard IoAdapter to enforce JWT auth on every
 * socket connection at the handshake level.
 *
 * Usage in main.ts:
 *   const jwtService = app.get(JwtService);
 *   const config = app.get<ConfigService<AppConfig, true>>(ConfigService);
 *   app.useWebSocketAdapter(new WsAuthAdapter(app, jwtService, config));
 *
 * The socket's JWT access-token must be supplied in:
 *   socket.handshake.auth.token   (preferred, avoids URL exposure)
 *
 * On success, socket.data.user is populated with the verified payload subset.
 * On failure, the connection is rejected before any message handler runs.
 */

import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { ServerOptions, Server } from 'socket.io';
import type { AppConfig } from '../../config/configuration';

interface JwtPayload {
  sub: string;
  handle: string;
  displayName: string;
  role: 'user' | 'admin';
  type?: string;
}

export interface WsUser {
  sub: string;
  handle: string;
  displayName: string;
  role: 'user' | 'admin';
}

export class WsAuthAdapter extends IoAdapter {
  constructor(
    app: INestApplication,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const isDev = this.configService.get('nodeEnv', { infer: true }) !== 'production';

    const server: Server = super.createIOServer(port, {
      ...options,
      cors: isDev ? { origin: '*', credentials: true } : false,
    });

    const secret = this.configService.get('jwt.secret', { infer: true });

    server.use((socket, next) => {
      const auth = socket.handshake.auth as Record<string, unknown>;
      const token = auth?.token as string | undefined;

      if (!token) {
        return next(new Error('UNAUTHORIZED'));
      }

      try {
        const payload = this.jwtService.verify<JwtPayload>(token, { secret });

        if (payload.type && payload.type !== 'access') {
          return next(new Error('UNAUTHORIZED'));
        }

        const user: WsUser = {
          sub: payload.sub,
          handle: payload.handle,
          displayName: payload.displayName,
          role: payload.role,
        };

        socket.data.user = user;
        next();
      } catch {
        next(new Error('UNAUTHORIZED'));
      }
    });

    return server;
  }
}
