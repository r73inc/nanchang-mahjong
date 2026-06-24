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
  handleLock: (handle: string) => ({ PK: `HANDLE#${handle.toLowerCase()}`, SK: 'LOCK' }),
  invite: (code: string) => ({ PK: `INVITE#${code.toUpperCase()}`, SK: 'META' }),
  invitesByStatus: (status: string) => ({ gsi1pk: `INVITE_STATUS#${status}` }),
  auditLog: (ts: string) => ({ PK: `AUDIT#${ts}`, SK: 'LOG' }),
  friendship: (sub: string, friendSub: string) => ({
    PK: `USER#${sub}`,
    SK: `FRIEND#${friendSub}`,
  }),
  room: (id: string) => ({ PK: `ROOM#${id}`, SK: 'META' }),
  roomSeat: (id: string, n: number) => ({ PK: `ROOM#${id}`, SK: `SEAT#${n}` }),
  roomByCode: (code: string) => ({
    gsi1pk: `ROOM_CODE#${code.replace(/-/g, '').toUpperCase()}`,
    gsi1sk: 'META',
  }),
  /** Web Push subscription for a user (stored when they opt in). */
  userPushSub: (sub: string) => ({ PK: `USER#${sub}`, SK: 'PUSH_SUB' }),
  // ── Game keys ──────────────────────────────────────────────────────────────
  /** Primary record for a game session (written on create + milestones + end). */
  game: (id: string) => ({ PK: `GAME#${id}`, SK: 'META' }),
  /** Per-move record (reserved for Phase 9 full replay; currently unused). */
  gameMove: (id: string, n: number) => ({
    PK: `GAME#${id}`,
    SK: `MOVE#${String(n).padStart(4, '0')}`,
  }),
  /** Per-user game history index (written on session end; feeds Phase 8 stats). */
  userGameIdx: (sub: string, ts: string, id: string) => ({
    PK: `USER#${sub}`,
    SK: `GAME#${ts}#${id}`,
  }),
  // ── Challenge keys ──────────────────────────────────────────────────────────
  /** Primary record for a Point Challenge. */
  challenge: (id: string) => ({ PK: `CHALLENGE#${id}`, SK: 'META' }),
  /** Per-user challenge index item (one per participant, including creator). */
  userChallengeIdx: (sub: string, ts: string, id: string) => ({
    PK: `USER#${sub}`,
    SK: `CHALLENGE#${ts}#${id}`,
  }),
  // ── Save keys ───────────────────────────────────────────────────────────────
  /** Auto-save slot for a user (overwritten on each new auto-save). */
  userSave: (sub: string, slot: 'auto' | 'manual') => ({
    PK: `USER#${sub}`,
    SK: `SAVE#${slot.toUpperCase()}`,
  }),
  // ── AI Commentary keys ───────────────────────────────────────────────────────
  /** AI summary item for a single game replay. */
  gameSummary: (id: string) => ({ PK: `GAME#${id}`, SK: 'AI_SUMMARY' }),
  /** AI summary item for a Point Challenge overview. */
  challengeSummary: (id: string) => ({ PK: `CHALLENGE#${id}`, SK: 'AI_SUMMARY' }),
  /** Primary record for a user-initiated AI summary request. */
  aiRequest: (reqId: string) => ({ PK: `AIREQ#${reqId}`, SK: 'META' }),
  /** GSI-1 lookup to list AI requests by status (mirrors invite status-GSI pattern). */
  aiRequestsByStatus: (status: string) => ({
    gsi1pk: `AIREQ_STATUS#${status}`,
  }),
} as const;
