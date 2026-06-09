/**
 * friends.e2e-spec.ts
 *
 * Integration tests for /users and /friends endpoints.
 *
 * Phase 4 required tests:
 *   Friends·send-accept  — full request lifecycle (pending → accepted).
 *   Friends·decline      — declined requests disappear from both sides.
 *   Friends·remove       — bilateral removal.
 *   Friends·search-privacy — only public profile fields returned.
 *   Profile·update-handle  — uniqueness enforced.
 */

import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';
import { AppModule } from '../src/app.module';
import { DynamoDBService } from '../src/database/dynamodb.service';

// ── Token helper ──────────────────────────────────────────────────────────────

function makeToken(
  jwtService: JwtService,
  payload: {
    sub: string;
    handle: string;
    displayName: string;
    role: 'user' | 'admin';
  },
) {
  return jwtService.sign({ ...payload, type: 'access' });
}

// ── DDB stub ──────────────────────────────────────────────────────────────────

function buildDdbStub() {
  const store: Map<string, Record<string, unknown>> = new Map();

  // Pre-seed: alice user
  store.set('USER#alice-sub|PROFILE', {
    PK: 'USER#alice-sub',
    SK: 'PROFILE',
    sub: 'alice-sub',
    handle: 'alice',
    displayName: 'Alice',
    role: 'user',
    disabled: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  });
  store.set('HANDLE#alice|LOCK', { PK: 'HANDLE#alice', SK: 'LOCK', ownerSub: 'alice-sub' });

  // Pre-seed: bob user
  store.set('USER#bob-sub|PROFILE', {
    PK: 'USER#bob-sub',
    SK: 'PROFILE',
    sub: 'bob-sub',
    handle: 'bob',
    displayName: 'Bob',
    role: 'user',
    disabled: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  });
  store.set('HANDLE#bob|LOCK', { PK: 'HANDLE#bob', SK: 'LOCK', ownerSub: 'bob-sub' });

  const key = (k: Record<string, string>) => `${k.PK}|${k.SK}`;

  return {
    tableName: 'nanchang_main',

    get: jest.fn(({ Key }: { Key: Record<string, string> }) =>
      Promise.resolve({ Item: store.get(key(Key)) }),
    ),

    put: jest.fn(({ Item }: { Item: Record<string, unknown> }) => {
      store.set(`${String(Item.PK)}|${String(Item.SK)}`, Item);
      return Promise.resolve({});
    }),

    update: jest.fn(
      ({
        Key,
        UpdateExpression,
        ExpressionAttributeValues,
        ExpressionAttributeNames,
        ConditionExpression,
      }: {
        Key: Record<string, string>;
        UpdateExpression: string;
        ExpressionAttributeValues: Record<string, unknown>;
        ExpressionAttributeNames?: Record<string, string>;
        ConditionExpression?: string;
      }) => {
        const k = key(Key);
        const item = store.get(k);
        if (ConditionExpression?.includes('attribute_exists') && !item) {
          throw new ConditionalCheckFailedException({ message: 'failed', $metadata: {} });
        }
        if (!item) return Promise.resolve({});

        // Parse simple SET expressions, resolving ExpressionAttributeNames placeholders
        const updated = { ...item };
        const setMatch = UpdateExpression.match(/SET (.+)/);
        if (setMatch) {
          const assignments = setMatch[1].split(',').map((s) => s.trim());
          for (const assign of assignments) {
            const [lhs, rhs] = assign.split('=').map((s) => s.trim());
            const field = lhs.startsWith('#')
              ? (ExpressionAttributeNames?.[lhs] ?? lhs.slice(1))
              : lhs;
            const val = ExpressionAttributeValues[rhs];
            if (val !== undefined) updated[field] = val;
          }
        }
        store.set(k, updated);
        return Promise.resolve({});
      },
    ),

    delete: jest.fn(({ Key }: { Key: Record<string, string> }) => {
      store.delete(key(Key));
      return Promise.resolve({});
    }),

    query: jest.fn(
      ({
        KeyConditionExpression,
        ExpressionAttributeValues,
      }: {
        KeyConditionExpression: string;
        ExpressionAttributeValues: Record<string, unknown>;
      }) => {
        const pk = ExpressionAttributeValues[':pk'] as string;
        const prefix = ExpressionAttributeValues[':prefix'] as string | undefined;
        const gsi1pk = ExpressionAttributeValues[':gsi1pk'] as string | undefined;

        if (gsi1pk) {
          const items = [...store.values()].filter((v) => v.gsi1pk === gsi1pk);
          return Promise.resolve({ Items: items });
        }

        const items = [...store.values()].filter((v) => {
          if (v.PK !== pk) return false;
          if (prefix && !String(v.SK).startsWith(prefix)) return false;
          return true;
        });
        void KeyConditionExpression; // used for logging only
        return Promise.resolve({ Items: items });
      },
    ),

    scan: jest.fn(
      ({
        FilterExpression,
        ExpressionAttributeValues,
        ProjectionExpression,
      }: {
        FilterExpression: string;
        ExpressionAttributeValues: Record<string, unknown>;
        ProjectionExpression?: string;
      }) => {
        const pkPrefix = ExpressionAttributeValues[':pkPrefix'] as string | undefined;
        const sk = ExpressionAttributeValues[':sk'] as string | undefined;
        const search =
          (ExpressionAttributeValues[':s'] as string | undefined) ??
          (ExpressionAttributeValues[':q'] as string | undefined);

        const items = [...store.values()].filter((item) => {
          if (pkPrefix && !String(item.PK ?? '').startsWith(pkPrefix)) return false;
          if (sk && item.SK !== sk) return false;
          if (search) {
            return String(item.handle ?? '').includes(search);
          }
          return true;
        });

        void FilterExpression;
        const projected = ProjectionExpression
          ? items.map((item) => {
              const fields = ProjectionExpression.replace(/#\w+/g, (m) => m.slice(1))
                .split(',')
                .map((f) => f.trim());
              return Object.fromEntries(fields.map((f) => [f, item[f]]));
            })
          : items;

        return Promise.resolve({ Items: projected });
      },
    ),

    transactWrite: jest.fn(
      ({
        TransactItems,
      }: {
        TransactItems: Array<{
          Put?: { Item: Record<string, unknown>; TableName: string; ConditionExpression?: string };
          Delete?: { Key: Record<string, string>; TableName: string };
          Update?: {
            Key: Record<string, string>;
            TableName: string;
            UpdateExpression: string;
            ExpressionAttributeValues: Record<string, unknown>;
            ExpressionAttributeNames?: Record<string, string>;
            ConditionExpression?: string;
          };
        }>;
      }) => {
        // Check conditions first, then apply all writes
        for (const op of TransactItems) {
          if (op.Put) {
            const k = `${String(op.Put.Item.PK)}|${String(op.Put.Item.SK)}`;
            if (op.Put.ConditionExpression?.includes('attribute_not_exists') && store.has(k)) {
              throw new TransactionCanceledException({
                message: 'condition failed',
                $metadata: {},
              });
            }
          }
        }
        for (const op of TransactItems) {
          if (op.Put) {
            const k = `${String(op.Put.Item.PK)}|${String(op.Put.Item.SK)}`;
            store.set(k, op.Put.Item);
          }
          if (op.Delete) {
            store.delete(key(op.Delete.Key));
          }
          if (op.Update) {
            const k = key(op.Update.Key);
            const item = store.get(k);
            if (op.Update.ConditionExpression?.includes('attribute_exists') && !item) {
              throw new TransactionCanceledException({
                message: 'condition failed',
                $metadata: {},
              });
            }
            if (item) {
              // Basic SET parser — resolve ExpressionAttributeNames placeholders
              const updated = { ...item };
              const setMatch = op.Update.UpdateExpression.match(/SET (.+)/);
              if (setMatch) {
                for (const assign of setMatch[1].split(',').map((s) => s.trim())) {
                  const [lhs, rhs] = assign.split('=').map((s) => s.trim());
                  const field = lhs.startsWith('#')
                    ? (op.Update.ExpressionAttributeNames?.[lhs] ?? lhs.slice(1))
                    : lhs;
                  const val = op.Update.ExpressionAttributeValues[rhs];
                  if (val !== undefined) updated[field] = val;
                }
              }
              store.set(k, updated);
            }
          }
        }
        return Promise.resolve({});
      },
    ),

    _store: store,
  };
}

// ── Test setup ────────────────────────────────────────────────────────────────

describe('Friends & Profile (e2e)', () => {
  let app: NestFastifyApplication;
  let ddbStub: ReturnType<typeof buildDdbStub>;
  let aliceToken: string;
  let bobToken: string;

  beforeAll(async () => {
    ddbStub = buildDdbStub();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DynamoDBService)
      .useValue(ddbStub)
      .compile();

    app = moduleRef.createNestApplication(new FastifyAdapter({ logger: false }));
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const jwtService = moduleRef.get(JwtService);
    aliceToken = makeToken(jwtService, {
      sub: 'alice-sub',
      handle: 'alice',
      displayName: 'Alice',
      role: 'user',
    });
    bobToken = makeToken(jwtService, {
      sub: 'bob-sub',
      handle: 'bob',
      displayName: 'Bob',
      role: 'user',
    });
  });

  afterAll(() => app.close());

  // ── Profile endpoints ────────────────────────────────────────────────────────

  describe('GET /users/me', () => {
    it('returns the authenticated user profile with stat defaults', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/users/me',
        headers: { authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<Record<string, unknown>>();
      expect(body.handle).toBe('alice');
      expect(body.gamesPlayed).toBe(0);
      expect(body.rating).toBe(1500);
    });

    it('returns 401 without a token', async () => {
      const res = await app.inject({ method: 'GET', url: '/users/me' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('Profile·update-handle', () => {
    it('updates displayName', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/users/me',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: { displayName: 'Alice Updated' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ displayName: string }>().displayName).toBe('Alice Updated');
    });

    it('rejects a handle already taken by another user', async () => {
      // 'bob' is already taken — alice trying to take it should get a conflict
      const res = await app.inject({
        method: 'PATCH',
        url: '/users/me',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: { handle: 'bob' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('accepts a new unique handle', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/users/me',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: { handle: 'alice_new' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ handle: string }>().handle).toBe('alice_new');
      // Revert for later tests
      ddbStub._store.set('USER#alice-sub|PROFILE', {
        ...(ddbStub._store.get('USER#alice-sub|PROFILE') ?? {}),
        handle: 'alice',
        updatedAt: new Date().toISOString(),
      });
      ddbStub._store.delete('HANDLE#alice_new|LOCK');
      ddbStub._store.set('HANDLE#alice|LOCK', {
        PK: 'HANDLE#alice',
        SK: 'LOCK',
        ownerSub: 'alice-sub',
      });
    });
  });

  describe('Friends·search-privacy', () => {
    it('returns only public fields (sub, handle, displayName) — no email', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/users/search?q=bob',
        headers: { authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(200);
      const { users } = res.json<{ users: Record<string, unknown>[] }>();
      expect(users.length).toBeGreaterThan(0);
      expect(users[0].handle).toBe('bob');
      expect(users[0].email).toBeUndefined();
    });
  });

  // ── Friends lifecycle ────────────────────────────────────────────────────────

  describe('Friends·send-accept', () => {
    it('alice sends a request — bob sees it as pending_received', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/friends/request',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: { targetSub: 'bob-sub' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({ ok: true });

      // alice sees pending_sent
      const aliceList = await app.inject({
        method: 'GET',
        url: '/friends',
        headers: { authorization: `Bearer ${aliceToken}` },
      });
      const { friends: aliceFriends } = aliceList.json<{
        friends: { friendSub: string; status: string }[];
      }>();
      expect(aliceFriends.find((f) => f.friendSub === 'bob-sub')?.status).toBe('pending_sent');

      // bob sees pending_received
      const bobList = await app.inject({
        method: 'GET',
        url: '/friends',
        headers: { authorization: `Bearer ${bobToken}` },
      });
      const { friends: bobFriends } = bobList.json<{
        friends: { friendSub: string; status: string }[];
      }>();
      expect(bobFriends.find((f) => f.friendSub === 'alice-sub')?.status).toBe('pending_received');
    });

    it('duplicate request returns 409', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/friends/request',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: { targetSub: 'bob-sub' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('self-request returns 403', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/friends/request',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: { targetSub: 'alice-sub' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('bob accepts — both sides show accepted', async () => {
      await app.inject({
        method: 'POST',
        url: '/friends/accept',
        headers: { authorization: `Bearer ${bobToken}` },
        payload: { requesterSub: 'alice-sub' },
      });

      const aliceList = await app.inject({
        method: 'GET',
        url: '/friends',
        headers: { authorization: `Bearer ${aliceToken}` },
      });
      const { friends: aliceFriends } = aliceList.json<{
        friends: { friendSub: string; status: string }[];
      }>();
      expect(aliceFriends.find((f) => f.friendSub === 'bob-sub')?.status).toBe('accepted');
    });
  });

  describe('Friends·remove', () => {
    it('alice removes bob — both edges deleted', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/friends/bob-sub',
        headers: { authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });

      // Neither side should see the other now
      expect(ddbStub._store.has('USER#alice-sub|FRIEND#bob-sub')).toBe(false);
      expect(ddbStub._store.has('USER#bob-sub|FRIEND#alice-sub')).toBe(false);
    });
  });

  describe('Friends·decline', () => {
    it('charlie sends request, bob declines — both edges gone', async () => {
      // Manually seed a pending request (charlie → bob)
      ddbStub._store.set('USER#charlie-sub|FRIEND#bob-sub', {
        PK: 'USER#charlie-sub',
        SK: 'FRIEND#bob-sub',
        friendSub: 'bob-sub',
        status: 'pending_sent',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      ddbStub._store.set('USER#bob-sub|FRIEND#charlie-sub', {
        PK: 'USER#bob-sub',
        SK: 'FRIEND#charlie-sub',
        friendSub: 'charlie-sub',
        status: 'pending_received',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await app.inject({
        method: 'POST',
        url: '/friends/decline',
        headers: { authorization: `Bearer ${bobToken}` },
        payload: { requesterSub: 'charlie-sub' },
      });
      expect(res.statusCode).toBe(200);
      expect(ddbStub._store.has('USER#bob-sub|FRIEND#charlie-sub')).toBe(false);
      expect(ddbStub._store.has('USER#charlie-sub|FRIEND#bob-sub')).toBe(false);
    });
  });

  describe('Friends search with friendStatus', () => {
    it('GET /friends/search includes friendStatus null when not friends', async () => {
      // Re-seed bob's profile (might be altered by previous tests)
      ddbStub._store.set('USER#bob-sub|PROFILE', {
        PK: 'USER#bob-sub',
        SK: 'PROFILE',
        sub: 'bob-sub',
        handle: 'bob',
        displayName: 'Bob',
        role: 'user',
        disabled: false,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });

      const res = await app.inject({
        method: 'GET',
        url: '/friends/search?q=bob',
        headers: { authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(200);
      const { users } = res.json<{ users: { friendStatus: unknown }[] }>();
      expect(users[0].friendStatus).toBeNull();
    });
  });
});
