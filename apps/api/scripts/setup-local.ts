/**
 * setup-local.ts
 *
 * Bootstraps the local dev environment:
 *   1. Creates the DynamoDB table (nanchang_main) on DDB Local
 *
 * Run once after `docker compose up -d`:
 *   pnpm --filter @nanchang/api run setup:local
 *
 * The script is idempotent: it checks for the table before creating it.
 */

import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';

const REGION = process.env.AWS_REGION ?? 'ap-east-1';
const DDB_ENDPOINT = process.env.AWS_ENDPOINT_URL_DYNAMODB ?? 'http://localhost:8000';
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME ?? 'nanchang_main';
const CREDENTIALS = { accessKeyId: 'local', secretAccessKey: 'local' };

async function setupDynamoDB(): Promise<void> {
  const client = new DynamoDBClient({
    region: REGION,
    endpoint: DDB_ENDPOINT,
    credentials: CREDENTIALS,
  });

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

async function main(): Promise<void> {
  console.log('🔧  Setting up local dev environment…\n');
  await setupDynamoDB();
  console.log(`
───────────────────────────────────────────────
  DynamoDB is ready.

  Next step:
    pnpm --filter @nanchang/api run seed
───────────────────────────────────────────────
`);
}

main().catch((err) => {
  console.error('❌ setup-local failed:', err);
  process.exit(1);
});
