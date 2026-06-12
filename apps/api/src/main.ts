import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import fastifyMultipart from '@fastify/multipart';
import { AppModule } from './app.module';
import { WsAuthAdapter } from './common/adapters/ws-auth.adapter';
import type { AppConfig } from './config/configuration';

async function bootstrap() {
  const isTest = process.env.NODE_ENV === 'test';

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: !isTest }),
  );

  // Enable multipart/form-data parsing for file uploads (avatar endpoint).
  // Type cast needed: pnpm deduplication leaves two Fastify versions in the graph,
  // causing a structural mismatch on FastifyInstance — runtime behaviour is identical.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(fastifyMultipart as any, { limits: { fileSize: 2_097_152 } });

  // Strip unknown fields and coerce primitives before they reach controllers.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Attach the JWT-authenticated Socket.IO adapter (used by RoomsGateway and,
  // later, GameGateway in Phase 7).  Must be registered before app.listen().
  if (!isTest) {
    const jwtService = app.get(JwtService);
    const configService = app.get<ConfigService<AppConfig, true>>(ConfigService);
    app.useWebSocketAdapter(new WsAuthAdapter(app, jwtService, configService));
  }

  const port = process.env.PORT ?? 3001;
  await app.listen(port, '0.0.0.0');
  if (!isTest) console.log(`API running on http://0.0.0.0:${port}`);
}

bootstrap();
