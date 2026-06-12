/**
 * admin.e2e-spec.ts
 *
 * Integration tests for the /admin routes.
 *
 * All external services (DynamoDB, Cognito) are mocked so this suite runs in CI
 * without any Docker containers.
 *
 * Phase 3 required tests:
 *   Admin·route-guard    — non-admin gets 403; unauthenticated gets 401.
 *   Admin·generate-invite — code appears in list after creation.
 *   Admin·revoke-invite   — revoked code fails invite redemption.
 *   Admin·user-disable    — disabled user's JWT is rejected on next request.
 *   Admin·audit-log       — every mutation writes an AUDIT# item to DDB.
 */

import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { AppModule } from '../src/app.module';
import { DynamoDBService } from '../src/database/dynamodb.service';

// ── Token helper ──────────────────────────────────────────────────────────────

/** Sign a test JWT using the default dev secret (see configuration.ts). */
function makeToken(
  jwtService: JwtService,
  payload: {
    sub: string;
    handle: string;
    role: 'user' | 'admin';
  },
): string {
  return jwtService.sign({ ...payload, type: 'access' });
}

// ── DDB stub ──────────────────────────────────────────────────────────────────

function buildDdbStub() {
  const store: Map<string, Record<string, unknown>> = new Map();

  // Pre-seed: one active invite
  store.set('INVITE#ACTIVE01|META', {
    PK: 'INVITE#ACTIVE01',
    SK: 'META',
    gsi1pk: 'INVITE_STATUS#active',
    gsi1sk: 'ACTIVE01',
    code: 'ACTIVE01',
    status: 'active',
    createdBy: 'admin-sub',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  });

  // Pre-seed: admin user profile
  store.set('USER#admin-sub|PROFILE', {
    PK: 'USER#admin-sub',
    SK: 'PROFILE',
    sub: 'admin-sub',
    handle: 'admin',
    role: 'admin',
    disabled: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  });

  // Pre-seed: regular user profile
  store.set('USER#user-sub|PROFILE', {
    PK: 'USER#user-sub',
    SK: 'PROFILE',
    sub: 'user-sub',
    handle: 'alice',
    role: 'user',
    disabled: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  });

  return {
    tableName: 'nanchang_main',

    get: jest.fn(({ Key }: { Key: Record<string, string> }) => {
      const k = `${Key.PK}|${Key.SK}`;
      return Promise.resolve({ Item: store.get(k) });
    }),

    put: jest.fn(({ Item }: { Item: Record<string, unknown> }) => {
      const k = `${String(Item.PK)}|${String(Item.SK)}`;
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
        const item = store.get(k);
        if (ExpressionAttributeValues?.[':revoked'] === 'revoked') {
          if (!item || item.status !== 'active') {
            throw new ConditionalCheckFailedException({
              message: 'Condition failed',
              $metadata: {},
            });
          }
          store.set(k, { ...item, status: 'revoked' });
        } else if (ExpressionAttributeValues?.[':disabled'] !== undefined) {
          if (!item) {
            throw new ConditionalCheckFailedException({
              message: 'Condition failed',
              $metadata: {},
            });
          }
          store.set(k, { ...item, disabled: ExpressionAttributeValues[':disabled'] });
        } else if (ExpressionAttributeValues?.[':role'] !== undefined) {
          if (!item) {
            throw new ConditionalCheckFailedException({
              message: 'Condition failed',
              $metadata: {},
            });
          }
          store.set(k, { ...item, role: ExpressionAttributeValues[':role'] });
        }
        return Promise.resolve({});
      },
    ),

    delete: jest.fn(() => Promise.resolve({})),

    query: jest.fn(
      ({ ExpressionAttributeValues }: { ExpressionAttributeValues?: Record<string, unknown> }) => {
        const gsi1pk = ExpressionAttributeValues?.[':pk'] as string | undefined;
        if (!gsi1pk) return Promise.resolve({ Items: [] });
        const items = [...store.values()].filter((v) => v.gsi1pk === gsi1pk);
        return Promise.resolve({ Items: items });
      },
    ),

    scan: jest.fn(
      ({ ExpressionAttributeValues }: { ExpressionAttributeValues?: Record<string, unknown> }) => {
        const pkPrefix = ExpressionAttributeValues?.[':pkPrefix'] as string | undefined;
        const sk = ExpressionAttributeValues?.[':sk'] as string | undefined;
        const search = ExpressionAttributeValues?.[':s'] as string | undefined;

        const items = [...store.values()].filter((item) => {
          const pkMatch = pkPrefix ? String(item.PK ?? '').startsWith(pkPrefix) : true;
          const skMatch = sk ? item.SK === sk : true;
          if (!pkMatch || !skMatch) return false;
          if (search) {
            return String(item.handle ?? '').includes(search);
          }
          return true;
        });

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
            const k = `${String(Item.PK)}|${String(Item.SK)}`;
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

    /** Expose the store for assertions in tests. */
    _store: store,
  };
}

// ── Test setup ────────────────────────────────────────────────────────────────

describe('Admin (e2e)', () => {
  let app: NestFastifyApplication;
  let ddbStub: ReturnType<typeof buildDdbStub>;
  let adminToken: string;
  let userToken: string;

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

    // Sign tokens with the dev secret (see configuration.ts default)
    const jwtService = moduleRef.get(JwtService);
    adminToken = makeToken(jwtService, {
      sub: 'admin-sub',
      handle: 'admin',
      role: 'admin',
    });
    userToken = makeToken(jwtService, {
      sub: 'user-sub',
      handle: 'alice',
      role: 'user',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Admin·route-guard ────────────────────────────────────────────────────────

  describe('Admin·route-guard', () => {
    it('returns 401 with no token', async () => {
      const res = await app.inject({ method: 'GET', url: '/admin/invites' });
      expect(res.statusCode).toBe(401);
    });

    it('returns 403 for a non-admin JWT', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/invites',
        headers: { authorization: `Bearer ${userToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('allows admin JWT through', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/invites',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  // ── Admin·generate-invite ────────────────────────────────────────────────────

  describe('Admin·generate-invite', () => {
    it('creates a code that then appears in the invite list', async () => {
      // Generate one invite
      const createRes = await app.inject({
        method: 'POST',
        url: '/admin/invites',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { count: 1, note: 'for phase-3 test' },
      });
      expect(createRes.statusCode).toBe(201);
      const { invites } = createRes.json<{ invites: { code: string }[] }>();
      expect(invites).toHaveLength(1);
      const newCode = invites[0].code;

      // Verify it appears in the list
      const listRes = await app.inject({
        method: 'GET',
        url: '/admin/invites',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(listRes.statusCode).toBe(200);
      const { invites: all } = listRes.json<{ invites: { code: string }[] }>();
      expect(all.some((i) => i.code === newCode)).toBe(true);
    });

    it('generates multiple codes when count > 1', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/admin/invites',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { count: 3 },
      });
      expect(res.statusCode).toBe(201);
      const { invites } = res.json<{ invites: unknown[] }>();
      expect(invites).toHaveLength(3);
    });

    it('returns 400 when count exceeds 20', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/admin/invites',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { count: 25 },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when expiresAt is in the past', async () => {
      const pastDate = new Date(Date.now() - 60_000).toISOString();
      const res = await app.inject({
        method: 'POST',
        url: '/admin/invites',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { count: 1, expiresAt: pastDate },
      });
      expect(res.statusCode).toBe(400);
    });

    it('writes an AUDIT# item to DDB for the creation', async () => {
      ddbStub.put.mockClear();
      await app.inject({
        method: 'POST',
        url: '/admin/invites',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { count: 1 },
      });
      // The second put call (after the invite creation itself) should be the audit log
      type PutArg = {
        Item: { PK?: string; action?: string; actorSub?: string; targetSub?: string };
      };
      const auditCall = ddbStub.put.mock.calls.find(([args]: [PutArg]) =>
        String(args?.Item?.PK ?? '').startsWith('AUDIT#'),
      );
      expect(auditCall).toBeDefined();
      expect(auditCall?.[0]?.Item?.action).toBe('CREATE_INVITE');
    });
  });

  // ── Admin·revoke-invite ──────────────────────────────────────────────────────

  describe('Admin·revoke-invite', () => {
    it('revokes ACTIVE01 and the code then fails redemption', async () => {
      // Revoke the pre-seeded invite
      const revokeRes = await app.inject({
        method: 'DELETE',
        url: '/admin/invites/ACTIVE01',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(revokeRes.statusCode).toBe(200);
      expect(revokeRes.json()).toEqual({ ok: true });

      // Confirm it is now 'revoked' in the store
      const stored = ddbStub._store.get('INVITE#ACTIVE01|META');
      expect(stored?.status).toBe('revoked');

      // Attempting to sign up with the revoked code should fail
      const signupRes = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: {
          password: 'Password1',
          handle: 'newuser',
          inviteCode: 'ACTIVE01',
        },
      });
      expect(signupRes.statusCode).toBe(410); // GoneException → 410
    });

    it('writes an AUDIT# item for the revocation', async () => {
      // Re-seed an active invite for this sub-test
      ddbStub._store.set('INVITE#REVTEST1|META', {
        PK: 'INVITE#REVTEST1',
        SK: 'META',
        gsi1pk: 'INVITE_STATUS#active',
        gsi1sk: 'REVTEST1',
        code: 'REVTEST1',
        status: 'active',
        createdBy: 'admin-sub',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      ddbStub.put.mockClear();
      await app.inject({
        method: 'DELETE',
        url: '/admin/invites/REVTEST1',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      type PutArg = { Item: { PK?: string; action?: string } };
      const auditCall = ddbStub.put.mock.calls.find(([args]: [PutArg]) =>
        String(args?.Item?.PK ?? '').startsWith('AUDIT#'),
      );
      expect(auditCall).toBeDefined();
      expect(auditCall?.[0]?.Item?.action).toBe('REVOKE_INVITE');
    });
  });

  // ── Admin·user-disable ───────────────────────────────────────────────────────

  describe('Admin·user-disable', () => {
    it('disables a user and their subsequent requests return 401', async () => {
      // Disable alice
      const disableRes = await app.inject({
        method: 'PATCH',
        url: '/admin/users/user-sub/disable',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { disabled: true },
      });
      expect(disableRes.statusCode).toBe(200);
      expect(disableRes.json()).toEqual({ ok: true });

      // alice's profile should now have disabled: true in the DDB stub
      const stored = ddbStub._store.get('USER#user-sub|PROFILE');
      expect(stored?.disabled).toBe(true);

      // alice's existing JWT should now be rejected (JwtStrategy checks DDB)
      const guardedRes = await app.inject({
        method: 'GET',
        url: '/admin/users', // any authenticated endpoint
        headers: { authorization: `Bearer ${userToken}` },
      });
      expect(guardedRes.statusCode).toBe(401);
    });

    it('re-enabling restores access', async () => {
      const enableRes = await app.inject({
        method: 'PATCH',
        url: '/admin/users/user-sub/disable',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { disabled: false },
      });
      expect(enableRes.statusCode).toBe(200);

      // user-sub is non-admin so still 403 on /admin, but not 401
      const afterEnableRes = await app.inject({
        method: 'GET',
        url: '/admin/users',
        headers: { authorization: `Bearer ${userToken}` },
      });
      expect(afterEnableRes.statusCode).toBe(403); // 403 = authenticated but wrong role
    });

    it('returns 403 when admin tries to disable themselves', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/admin/users/admin-sub/disable',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { disabled: true },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ── Admin·audit-log ──────────────────────────────────────────────────────────

  describe('Admin·audit-log', () => {
    it('writes an AUDIT# item for setRole', async () => {
      ddbStub.put.mockClear();
      await app.inject({
        method: 'PATCH',
        url: '/admin/users/user-sub/role',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { role: 'admin' },
      });
      type PutArg = {
        Item: { PK?: string; action?: string; actorSub?: string; targetSub?: string };
      };
      const auditCall = ddbStub.put.mock.calls.find(([args]: [PutArg]) =>
        String(args?.Item?.PK ?? '').startsWith('AUDIT#'),
      );
      expect(auditCall).toBeDefined();
      expect(auditCall?.[0]?.Item?.action).toBe('SET_ROLE');
      expect(auditCall?.[0]?.Item?.actorSub).toBe('admin-sub');
      expect(auditCall?.[0]?.Item?.targetSub).toBe('user-sub');
    });

    it('writes an AUDIT# item for setDisabled', async () => {
      ddbStub.put.mockClear();
      await app.inject({
        method: 'PATCH',
        url: '/admin/users/user-sub/disable',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { disabled: true },
      });
      type PutArg = { Item: { PK?: string; action?: string } };
      const auditCall = ddbStub.put.mock.calls.find(([args]: [PutArg]) =>
        String(args?.Item?.PK ?? '').startsWith('AUDIT#'),
      );
      expect(auditCall).toBeDefined();
      expect(auditCall?.[0]?.Item?.action).toBe('DISABLE_USER');

      // Reset for subsequent tests
      ddbStub._store.set('USER#user-sub|PROFILE', {
        ...(ddbStub._store.get('USER#user-sub|PROFILE') ?? {}),
        disabled: false,
      });
    });
  });

  // ── GET /admin/users ─────────────────────────────────────────────────────────

  describe('GET /admin/users', () => {
    it('returns all user profiles', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/users',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const { users } = res.json<{ users: { sub: string }[] }>();
      expect(Array.isArray(users)).toBe(true);
      expect(users.some((u) => u.sub === 'admin-sub')).toBe(true);
      expect(users.some((u) => u.sub === 'user-sub')).toBe(true);
    });

    it('filters by search term', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/users?search=alice',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const { users } = res.json<{ users: { handle: string }[] }>();
      expect(users.every((u) => u.handle === 'alice')).toBe(true);
    });
  });
});
