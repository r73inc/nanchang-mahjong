/**
 * setup-local.ts
 *
 * Bootstraps the local dev environment:
 *   1. Creates the DynamoDB table (nanchang_main) on DDB Local
 *   2. Creates a Cognito User Pool + App Client on cognito-local
 *   3. Prints the pool-id / client-id so you can paste them into .env
 *
 * Run once after `docker compose up -d`:
 *   pnpm --filter @nanchang/api setup:local
 *
 * The script is idempotent: it checks for existing resources before creating.
 */

import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import {
  CognitoIdentityProviderClient,
  CreateUserPoolCommand,
  CreateUserPoolClientCommand,
  ListUserPoolsCommand,
} from '@aws-sdk/client-cognito-identity-provider';

// ── Config (read from env or fall back to local defaults) ────────────────────
const REGION = process.env.AWS_REGION ?? 'ap-east-1';
const DDB_ENDPOINT = process.env.AWS_ENDPOINT_URL_DYNAMODB ?? 'http://localhost:8000';
const COGNITO_ENDPOINT = process.env.AWS_ENDPOINT_URL_COGNITO_IDP ?? 'http://localhost:9229';
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME ?? 'nanchang_main';

const CREDENTIALS = { accessKeyId: 'local', secretAccessKey: 'local' };

// ── DynamoDB ─────────────────────────────────────────────────────────────────

async function setupDynamoDB(): Promise<void> {
  const client = new DynamoDBClient({
    region: REGION,
    endpoint: DDB_ENDPOINT,
    credentials: CREDENTIALS,
  });

  // Check if table already exists
  try {
    await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    console.log(`✓ DynamoDB table "${TABLE_NAME}" already exists — skipping creation.`);
    return;
  } catch {
    // Table doesn't exist — fall through to create it
  }

  await client.send(
    new CreateTableCommand({
      TableName: TABLE_NAME,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
        { AttributeName: 'gsi1pk', AttributeType: 'S' },
        { AttributeName: 'gsi1sk', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'gsi1',
          KeySchema: [
            { AttributeName: 'gsi1pk', KeyType: 'HASH' },
            { AttributeName: 'gsi1sk', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
    }),
  );

  console.log(`✓ DynamoDB table "${TABLE_NAME}" created.`);
}

// ── Cognito ───────────────────────────────────────────────────────────────────

async function setupCognito(): Promise<{ userPoolId: string; clientId: string }> {
  const client = new CognitoIdentityProviderClient({
    region: REGION,
    endpoint: COGNITO_ENDPOINT,
    credentials: CREDENTIALS,
  });

  // cognito-local supports ListUserPools — use it to check for existing pool
  const poolName = 'nanchang-local';
  const existing = await client.send(new ListUserPoolsCommand({ MaxResults: 60 }));
  const found = existing.UserPools?.find((p) => p.Name === poolName);

  let userPoolId: string;
  if (found?.Id) {
    userPoolId = found.Id;
    console.log(`✓ Cognito User Pool "${poolName}" already exists (id: ${userPoolId}) — skipping.`);
  } else {
    const pool = await client.send(
      new CreateUserPoolCommand({
        PoolName: poolName,
        Policies: {
          PasswordPolicy: {
            MinimumLength: 8,
            RequireUppercase: true,
            RequireLowercase: true,
            RequireNumbers: true,
            RequireSymbols: false,
          },
        },
        // Enable email as the primary login attribute
        UsernameAttributes: ['email'],
        AutoVerifiedAttributes: ['email'],
      }),
    );
    userPoolId = pool.UserPool?.Id ?? '';
    if (!userPoolId) throw new Error('Cognito did not return a User Pool ID');
    console.log(`✓ Cognito User Pool "${poolName}" created (id: ${userPoolId}).`);
  }

  // Create the app client (allows USER_PASSWORD_AUTH — needed for InitiateAuth)
  const clientRes = await client.send(
    new CreateUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientName: 'nanchang-api-local',
      ExplicitAuthFlows: ['ALLOW_USER_PASSWORD_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
      GenerateSecret: false,
    }),
  );

  const clientId = clientRes.UserPoolClient?.ClientId ?? '';
  if (!clientId) throw new Error('Cognito did not return a Client ID');
  console.log(`✓ Cognito App Client created (id: ${clientId}).`);

  return { userPoolId, clientId };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🔧  Setting up local dev environment…\n');

  await setupDynamoDB();
  const { userPoolId, clientId } = await setupCognito();

  console.log(`
───────────────────────────────────────────────
  Update your .env with:

  COGNITO_USER_POOL_ID=${userPoolId}
  COGNITO_CLIENT_ID=${clientId}
───────────────────────────────────────────────

  Then run:  pnpm --filter @nanchang/api seed:admin
`);
}

main().catch((err) => {
  console.error('❌ setup-local failed:', err);
  process.exit(1);
});
