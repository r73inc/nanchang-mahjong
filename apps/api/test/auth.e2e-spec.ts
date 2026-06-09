/**
 * auth.e2e-spec.ts
 *
 * Integration tests for the /auth routes.
 *
 * DynamoDB is mocked so this suite runs in CI without any Docker containers.
 * We use Fastify's built-in `app.inject()` for HTTP calls — no supertest required.
 */

import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { DynamoDBService } from '../src/database/dynamodb.service';

// ── DDB stub ─────────────────────────────────────────────────────────────────

function buildDdbStub() {
  const store: Map<string, Record<string, unknown>> = new Map();

  // Pre-seed: active invite
  const inviteCode = 'TESTABC1';
  store.set('INVITE#TESTABC1|META', {
    PK: 'INVITE#TESTABC1',
    SK: 'META',
    gsi1pk: 'INVITE_STATUS#active',
    gsi1sk: inviteCode,
    code: inviteCode,
    status: 'active',
    createdBy: 'admin-sub',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return {
    tableName: 'nanchang_main',

    get: jest.fn(({ Key }: { Key: Record<string, string> }) => {
      const k = `${Key.PK}|${Key.SK}`;
      return Promise.resolve({ Item: store.get(k) });
    }),

    put: jest.fn(({ Item }: { Item: Record<string, unknown> }) => {
      const k = `${Item.PK as string}|${Item.SK as string}`;
      store.set(k, Item);
      return Promise.resolve({});
    }),

    update: jest.fn(
      ({
        Key,
        ExpressionAttributeValues,
      }: {
        Key: Record<string, string>;
        ConditionExpression?: string;
        ExpressionAttributeValues?: Record<string, unknown>;
        UpdateExpression?: string;
        ExpressionAttributeNames?: Record<string, string>;
      }) => {
        const k = `${Key.PK}|${Key.SK}`;
        const item = store.get(k) ?? {};
        if (ExpressionAttributeValues?.[':redeemed'] === 'redeemed') {
          if (item.status !== 'active') {
            throw new ConditionalCheckFailedException({
              message: 'Condition failed',
              $metadata: {},
            });
          }
          store.set(k, { ...item, status: 'redeemed' });
        }
        return Promise.resolve({});
      },
    ),

    delete: jest.fn(() => Promise.resolve({})),

    query: jest.fn(
      ({
        ExpressionAttributeValues,
      }: {
        IndexName?: string;
        KeyConditionExpression?: string;
        ExpressionAttributeValues?: Record<string, unknown>;
      }) => {
        const gsi1pk = ExpressionAttributeValues?.[':pk'] as string | undefined;
        if (!gsi1pk) return Promise.resolve({ Items: [] });
        const items = [...store.values()].filter((v) => v.gsi1pk === gsi1pk);
        return Promise.resolve({ Items: items });
      },
    ),

    transactWrite: jest.fn(
      ({
        TransactItems,
      }: {
        TransactItems: Array<{
          Put?: { Item: Record<string, unknown>; ConditionExpression?: string };
        }>;
      }) => {
        for (const item of TransactItems) {
          if (item.Put) {
            const { Item, ConditionExpression } = item.Put;
            const k = `${Item.PK as string}|${Item.SK as string}`;
            if (ConditionExpression?.includes('attribute_not_exists') && store.has(k)) {
              throw new ConditionalCheckFailedException({
                message: 'Condition failed',
                $metadata: {},
              });
            }
            store.set(k, Item);
          }
        }
        return Promise.resolve({});
      },
    ),
  };
}

// ── Test setup ────────────────────────────────────────────────────────────────

describe('Auth (e2e)', () => {
  let app: NestFastifyApplication;
  let ddbStub: ReturnType<typeof buildDdbStub>;

  beforeAll(async () => {
    ddbStub = buildDdbStub();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DynamoDBService)
      .useValue(ddbStub)
      .compile();

    app = moduleRef.createNestApplication(new FastifyAdapter({ logger: false }));
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── POST /auth/signup ──────────────────────────────────────────────────────

  describe('POST /auth/signup', () => {
    const validBody = {
      password: 'Password1',
      handle: 'bob',
      displayName: 'Bob',
      inviteCode: 'TESTABC1',
    };

    it('returns 201 with accessToken and refreshToken', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: validBody,
      });
      expect(res.statusCode).toBe(201);
      const body = res.json<{ accessToken: string; refreshToken: string }>();
      expect(body).toHaveProperty('accessToken');
      expect(body).toHaveProperty('refreshToken');
    });

    it('returns 409 when the same invite code is used twice', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: { ...validBody, handle: 'charlie' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: { password: 'Password1' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when handle contains invalid characters', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: { ...validBody, handle: 'bad handle!' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── POST /auth/signin ──────────────────────────────────────────────────────

  describe('POST /auth/signin', () => {
    beforeAll(async () => {
      // Manually seed a user profile + handle lock with a real bcrypt hash so
      // signin tests can verify without needing a second invite code.
      const hash = await bcrypt.hash('Password1', 4);
      ddbStub.get.mockImplementation(({ Key }: { Key: Record<string, string> }) => {
        if (Key.PK === 'HANDLE#bob' && Key.SK === 'LOCK') {
          return Promise.resolve({ Item: { PK: 'HANDLE#bob', SK: 'LOCK', ownerSub: 'sub-bob' } });
        }
        if (Key.PK === 'HANDLE#nobody' && Key.SK === 'LOCK') {
          return Promise.resolve({ Item: undefined });
        }
        if (Key.PK === 'USER#sub-bob' && Key.SK === 'PROFILE') {
          return Promise.resolve({
            Item: {
              PK: 'USER#sub-bob',
              SK: 'PROFILE',
              sub: 'sub-bob',
              handle: 'bob',
              displayName: 'Bob',
              role: 'user',
              disabled: false,
              passwordHash: hash,
            },
          });
        }
        return Promise.resolve({ Item: undefined });
      });
    });

    it('returns 200 with tokens for valid credentials', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/signin',
        payload: { handle: 'bob', password: 'Password1' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ accessToken: string; refreshToken: string }>();
      expect(body).toHaveProperty('accessToken');
    });

    it('returns 401 for an unknown handle', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/signin',
        payload: { handle: 'nobody', password: 'Password1' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 401 for a wrong password', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/signin',
        payload: { handle: 'bob', password: 'WrongPass1' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── POST /auth/refresh ─────────────────────────────────────────────────────

  describe('POST /auth/refresh', () => {
    it('returns 401 for an invalid refresh token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken: 'not-a-real-token' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── GET /health ────────────────────────────────────────────────────────────

  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: 'ok' });
    });
  });
});
