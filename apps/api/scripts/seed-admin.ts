/**
 * seed-admin.ts
 *
 * Creates the first admin user in both Cognito (local) and DynamoDB.
 * Also generates one initial invite code so the admin can invite family members.
 *
 * Pre-requisites:
 *   - Docker services running  (`docker compose up -d`)
 *   - setup-local.ts has already been run
 *   - .env contains COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID
 *
 * Usage:
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=Aa1!aaaa ADMIN_HANDLE=admin \
 *     pnpm --filter @nanchang/api seed:admin
 *
 * The script is idempotent: if the user already exists in DDB it prints a
 * notice and exits cleanly.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as crypto from 'crypto';

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

// Customise via env vars
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@nanchang.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'Admin1234!';
const ADMIN_HANDLE = (process.env.ADMIN_HANDLE ?? 'admin').toLowerCase();
const ADMIN_DISPLAY = process.env.ADMIN_DISPLAY ?? 'Admin';

if (!USER_POOL_ID) {
  console.error('❌ COGNITO_USER_POOL_ID is not set. Run setup-local.ts first.');
  process.exit(1);
}

// ── DK key helpers (inline — avoid importing from the compiled app) ───────────
const DK = {
  userProfile: (sub: string) => ({ PK: `USER#${sub}`, SK: 'PROFILE' }),
  userByEmail: (email: string) => ({ gsi1pk: `EMAIL#${email.toLowerCase()}`, gsi1sk: 'USER' }),
  handleLock: (handle: string) => ({ PK: `HANDLE#${handle.toLowerCase()}`, SK: 'LOCK' }),
  invite: (code: string) => ({ PK: `INVITE#${code.toUpperCase()}`, SK: 'META' }),
  invitesByStatus: (status: string) => ({
    gsi1pk: `INVITE_STATUS#${status}`,
    gsi1sk: 'PLACEHOLDER',
  }),
};

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join('');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🌱  Seeding admin user…\n');

  // ── DDB client ──
  const ddbRaw = new DynamoDBClient({
    region: REGION,
    endpoint: DDB_ENDPOINT,
    credentials: CREDENTIALS,
  });
  const db = DynamoDBDocumentClient.from(ddbRaw, {
    marshallOptions: { removeUndefinedValues: true },
  });

  // ── Cognito client ──
  const cognito = new CognitoIdentityProviderClient({
    region: REGION,
    endpoint: COGNITO_ENDPOINT,
    credentials: CREDENTIALS,
  });

  // 1. Create Cognito user ---------------------------------------------------
  let cognitoSub: string;
  try {
    const res = await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: ADMIN_EMAIL,
        MessageAction: 'SUPPRESS',
        TemporaryPassword: ADMIN_PASSWORD,
      }),
    );
    cognitoSub = res.User?.Attributes?.find((a) => a.Name === 'sub')?.Value ?? '';
    if (!cognitoSub) throw new Error('No sub returned from Cognito');

    await cognito.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: ADMIN_EMAIL,
        Password: ADMIN_PASSWORD,
        Permanent: true,
      }),
    );
    console.log(`✓ Cognito user created: ${ADMIN_EMAIL} (sub: ${cognitoSub})`);
  } catch (err) {
    if (err instanceof UsernameExistsException) {
      console.log(`✓ Cognito user already exists: ${ADMIN_EMAIL}`);
      // Retrieve the sub directly from Cognito — more reliable than a DDB lookup
      // (DDB may have been reset while Cognito persists via Docker volume).
      const getUserRes = await cognito.send(
        new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: ADMIN_EMAIL }),
      );
      const subAttr = getUserRes.UserAttributes?.find((a) => a.Name === 'sub');
      if (!subAttr?.Value) {
        console.error('❌ AdminGetUser did not return a sub attribute — cannot continue.');
        return;
      }
      cognitoSub = subAttr.Value;
      console.log(`  └─ Retrieved existing sub from Cognito: ${cognitoSub}`);
    } else {
      throw err;
    }
  }

  // 2. Create DDB profile (skip if already exists) ---------------------------
  const now = new Date().toISOString();
  const profileKey = DK.userProfile(cognitoSub);
  const existing = await db.send(new GetCommand({ TableName: TABLE_NAME, Key: profileKey }));
  if (existing.Item) {
    console.log('✓ Admin DDB profile already exists — skipping.');
  } else {
    const profileItem = {
      ...profileKey, // PK=USER#sub, SK=PROFILE
      ...DK.userByEmail(ADMIN_EMAIL), // gsi1pk / gsi1sk for email lookup
      // NOTE: do NOT spread DK.handleLock here — its PK/SK would overwrite the profile key.
      // The handle lock is written as a separate DynamoDB item below.
      sub: cognitoSub,
      email: ADMIN_EMAIL.toLowerCase(),
      handle: ADMIN_HANDLE,
      displayName: ADMIN_DISPLAY,
      role: 'admin',
      createdAt: now,
      updatedAt: now,
      disabled: false,
    };

    // Write profile
    await db.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: profileItem,
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );

    // Write handle lock — unconditional so re-runs are idempotent.
    await db.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...DK.handleLock(ADMIN_HANDLE),
          ownerSub: cognitoSub,
          createdAt: now,
        },
      }),
    );

    console.log(`✓ Admin DDB profile created: handle=${ADMIN_HANDLE}, role=admin`);
  }

  // 3. Generate an initial invite code ----------------------------------------
  const inviteCode = generateInviteCode();
  const inviteKey = DK.invite(inviteCode);

  await db.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        ...inviteKey,
        gsi1pk: `INVITE_STATUS#active`,
        gsi1sk: inviteCode,
        code: inviteCode,
        status: 'active',
        createdBy: cognitoSub,
        createdAt: now,
        updatedAt: now,
        note: 'Initial invite generated by seed-admin script',
      },
    }),
  );

  console.log(`
───────────────────────────────────────────────
  ✅  Admin seeded successfully!

  Email:    ${ADMIN_EMAIL}
  Password: ${ADMIN_PASSWORD}
  Handle:   @${ADMIN_HANDLE}

  Initial invite code: ${inviteCode}
  Share this code with the first family member.
───────────────────────────────────────────────
`);
}

main().catch((err) => {
  console.error('❌ seed-admin failed:', err);
  process.exit(1);
});
