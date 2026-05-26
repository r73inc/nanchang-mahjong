import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  type GetCommandInput,
  type PutCommandInput,
  type UpdateCommandInput,
  type DeleteCommandInput,
  type QueryCommandInput,
  type ScanCommandInput,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import type { AppConfig } from '../config/configuration';

@Injectable()
export class DynamoDBService implements OnModuleInit {
  private readonly logger = new Logger(DynamoDBService.name);
  private docClient!: DynamoDBDocumentClient;
  readonly tableName: string;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    this.tableName = this.config.get('dynamodb.tableName', { infer: true });
  }

  onModuleInit() {
    const awsCfg = this.config.get('aws', { infer: true });
    const client = new DynamoDBClient({
      region: awsCfg.region,
      ...(awsCfg.endpoints.dynamodb && { endpoint: awsCfg.endpoints.dynamodb }),
      ...(awsCfg.accessKeyId && {
        credentials: {
          accessKeyId: awsCfg.accessKeyId,
          secretAccessKey: awsCfg.secretAccessKey ?? 'local',
        },
      }),
    });
    this.docClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
    this.logger.log(`DynamoDB ready → table: ${this.tableName}`);
  }

  get(params: Omit<GetCommandInput, 'TableName'>) {
    return this.docClient.send(new GetCommand({ TableName: this.tableName, ...params }));
  }

  put(params: Omit<PutCommandInput, 'TableName'>) {
    return this.docClient.send(new PutCommand({ TableName: this.tableName, ...params }));
  }

  update(params: Omit<UpdateCommandInput, 'TableName'>) {
    return this.docClient.send(new UpdateCommand({ TableName: this.tableName, ...params }));
  }

  delete(params: Omit<DeleteCommandInput, 'TableName'>) {
    return this.docClient.send(new DeleteCommand({ TableName: this.tableName, ...params }));
  }

  query(params: Omit<QueryCommandInput, 'TableName'>) {
    return this.docClient.send(new QueryCommand({ TableName: this.tableName, ...params }));
  }

  scan(params: Omit<ScanCommandInput, 'TableName'>) {
    return this.docClient.send(new ScanCommand({ TableName: this.tableName, ...params }));
  }

  transactWrite(params: TransactWriteCommandInput) {
    return this.docClient.send(new TransactWriteCommand(params));
  }
}

// ── DynamoDB key helpers ──────────────────────────────────────────────────────
// Single-table design: PK / SK primary key, gsi1pk / gsi1sk for GSI-1.
export const DK = {
  userProfile: (sub: string) => ({ PK: `USER#${sub}`, SK: 'PROFILE' }),
  userByEmail: (email: string) => ({ gsi1pk: `EMAIL#${email.toLowerCase()}`, gsi1sk: 'USER' }),
  handleLock: (handle: string) => ({ PK: `HANDLE#${handle.toLowerCase()}`, SK: 'LOCK' }),
  invite: (code: string) => ({ PK: `INVITE#${code.toUpperCase()}`, SK: 'META' }),
  invitesByStatus: (status: string) => ({ gsi1pk: `INVITE_STATUS#${status}` }),
  auditLog: (ts: string) => ({ PK: `AUDIT#${ts}`, SK: 'LOG' }),
  friendship: (sub: string, friendSub: string) => ({
    PK: `USER#${sub}`,
    SK: `FRIEND#${friendSub}`,
  }),
} as const;
