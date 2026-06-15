import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { configuration } from './config/configuration';
import type { AppConfig } from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { StorageModule } from './storage/storage.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { InvitesModule } from './invites/invites.module';
import { AdminModule } from './admin/admin.module';
import { FriendsModule } from './friends/friends.module';
import { RoomsModule } from './rooms/rooms.module';
import { ReplayModule } from './replay/replay.module';
import { PushModule } from './push/push.module';
import { ChallengesModule } from './challenges/challenges.module';
import { HealthController } from './health/health.controller';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { I18nModule } from './i18n/i18n.module';

@Module({
  imports: [
    // Config — global, loaded from env; no .env file in prod (injected by App Runner / ECS).
    // In dev, pnpm sets CWD to apps/api/ so we look for .env there first, then fall
    // back to the monorepo root (where .env.example and the actual .env live).
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env', '../../.env'],
      ignoreEnvFile: process.env.NODE_ENV === 'production',
    }),

    // Rate limiting — skipped entirely in non-production so local testing is
    // never blocked. In production: 60 req / min per IP globally; individual
    // routes can tighten with @Throttle({ default: { ttl, limit } }).
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        skipIf: () => config.get('nodeEnv', { infer: true }) !== 'production',
        throttlers: [{ name: 'default', ttl: 60_000, limit: 60 }],
      }),
    }),

    // i18n — global service for translating error messages per Accept-Language.
    I18nModule,

    DatabaseModule,
    StorageModule,
    AuthModule,
    UsersModule,
    InvitesModule,
    AdminModule,
    FriendsModule,
    RoomsModule, // transitively imports GameModule
    ReplayModule,
    PushModule,
    ChallengesModule,
  ],
  controllers: [HealthController],
  providers: [
    // Apply throttler globally; routes that need stricter limits use @Throttle().
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Normalise all thrown errors to { statusCode, error, message } JSON.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
