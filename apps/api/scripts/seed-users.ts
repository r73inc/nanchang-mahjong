/**
 * seed-users.ts
 *
 * Creates four regular test users (player1–4) in both Cognito and DynamoDB.
 * Intended for local development only — run after seed-admin.ts.
 *
 * Pre-requisites:
 *   - Docker services running  (`docker compose up -d`)
 *   - setup-local.ts has already been run
 *   - .env contains COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID
 *
 * Usage:
 *   pnpm --filter @nanchang/api seed:users
 *
 * The script is idempotent: users that already exist in Cognito or DDB
 * are skipped cleanly.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminGetUserCommand,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

// ── Config ────────────────────────────────────────────────────────────────────
const REGION = process.env.AWS_REGION ?? 'ap-east-1';
const DDB_ENDPOINT = process.env.AWS_ENDPOINT_URL_DYNAMODB ?? 'http://localhost:8000';
const COGNITO_ENDPOINT = process.env.AWS_ENDPOINT_URL_COGNITO_IDP ?? 'http://localhost:9229';
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME ?? 'nanchang_main';
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID ?? '';
const CREDENTIALS = { accessKeyId: 'local', secretAccessKey: 'local' };

if (!USER_POOL_ID) {
  console.error('❌ COGNITO_USER_POOL_ID is not set. Run setup-local.ts first.');
  process.exit(1);
}

// ── Test user definitions ─────────────────────────────────────────────────────
interface TestUser {
  email: string;
  password: string;
  handle: string;
  displayName: string;
}

const TEST_USERS: TestUser[] = [
  {
    email: 'player1@nanchang.local',
    password: 'Player1234!',
    handle: 'player1',
    displayName: 'Player One',
  },
  {
    email: 'player2@nanchang.local',
    password: 'Player1234!',
    handle: 'player2',
    displayName: 'Player Two',
  },
  {
    email: 'player3@nanchang.local',
    password: 'Player1234!',
    handle: 'player3',
    displayName: 'Player Three',
  },
  {
    email: 'player4@nanchang.local',
    password: 'Player1234!',
    handle: 'player4',
    displayName: 'Player Four',
  },
];

// ── DK key helpers ────────────────────────────────────────────────────────────
const DK = {
  userProfile: (sub: string) => ({ PK: `USER#${sub}`, SK: 'PROFILE' }),
  userByEmail: (email: string) => ({ gsi1pk: `EMAIL#${email.toLowerCase()}`, gsi1sk: 'USER' }),
  handleLock: (handle: string) => ({ PK: `HANDLE#${handle.toLowerCase()}`, SK: 'LOCK' }),
};

// ── Seed a single user ────────────────────────────────────────────────────────
async function seedUser(
  user: TestUser,
  cognito: CognitoIdentityProviderClient,
  db: DynamoDBDocumentClient,
): Promise<void> {
  const { email, password, handle, displayName } = user;
  console.log(`\n  Seeding ${email}…`);

  // 1. Create Cognito user (or retrieve existing sub) ─────────────────────────
  let sub: string;
  try {
    const res = await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        MessageAction: 'SUPPRESS',
        TemporaryPassword: password,
      }),
    );
    sub = res.User?.Attributes?.find((a) => a.Name === 'sub')?.Value ?? '';
    if (!sub) throw new Error('No sub returned from Cognito');

    await cognito.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        Password: password,
        Permanent: true,
      }),
    );
    console.log(`  ✓ Cognito user created (sub: ${sub})`);
  } catch (err) {
    if (err instanceof UsernameExistsException) {
      const res = await cognito.send(
        new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: email }),
      );
      const subAttr = res.UserAttributes?.find((a) => a.Name === 'sub');
      if (!subAttr?.Value) {
        console.warn(`  ⚠ Could not retrieve sub for ${email} — skipping.`);
        return;
      }
      sub = subAttr.Value;
      console.log(`  ✓ Cognito user already exists (sub: ${sub})`);
    } else {
      throw err;
    }
  }

  // 2. Create DDB profile (skip if already exists) ────────────────────────────
  const now = new Date().toISOString();
  const profileKey = DK.userProfile(sub);
  const existing = await db.send(new GetCommand({ TableName: TABLE_NAME, Key: profileKey }));

  if (existing.Item) {
    console.log(`  ✓ DDB profile already exists — skipping.`);
    return;
  }

  await db.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        ...profileKey,
        ...DK.userByEmail(email),
        sub,
        email: email.toLowerCase(),
        handle,
        displayName,
        role: 'user',
        createdAt: now,
        updatedAt: now,
        disabled: false,
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    }),
  );

  // Handle lock (unconditional — idempotent on re-runs)
  await db.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { ...DK.handleLock(handle), ownerSub: sub, createdAt: now },
    }),
  );

  console.log(`  ✓ DDB profile created (handle: @${handle})`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('🎮  Seeding test users…');

  const ddbRaw = new DynamoDBClient({
    region: REGION,
    endpoint: DDB_ENDPOINT,
    credentials: CREDENTIALS,
  });
  const db = DynamoDBDocumentClient.from(ddbRaw, {
    marshallOptions: { removeUndefinedValues: true },
  });

  const cognito = new CognitoIdentityProviderClient({
    region: REGION,
    endpoint: COGNITO_ENDPOINT,
    credentials: CREDENTIALS,
  });

  for (const user of TEST_USERS) {
    await seedUser(user, cognito, db);
  }

  console.log(`
───────────────────────────────────────────────
  Test users ready!  All share password: Player1234!

  player1@nanchang.local  (@player1)
  player2@nanchang.local  (@player2)
  player3@nanchang.local  (@player3)
  player4@nanchang.local  (@player4)
───────────────────────────────────────────────
`);
}

main().catch((err) => {
  console.error('❌ seed-users failed:', err);
  process.exit(1);
});
