import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBService, DK } from '../database/dynamodb.service';
import type { UserRole, UserPermission } from '../common/interfaces/authenticated-user.interface';

export interface UserProfile {
  sub: string;
  handle: string;
  role: UserRole;
  permissions?: UserPermission[];
  createdAt: string;
  updatedAt: string;
  disabled: boolean;
  passwordHash?: string;
  avatarKey?: string;
  gamesPlayed?: number;
  gamesWon?: number;
  rating?: number;
  streak?: number;
}

export interface GameHistoryItem {
  gameId: string;
  placement: 1 | 2 | 3 | 4;
  finalScore: number;
  result: 'win' | 'draw' | 'concede' | 'bust';
  endedAt: string;
}

export interface PublicProfile {
  sub: string;
  handle: string;
  avatarUrl?: string | null;
}

export interface CreateProfileInput {
  sub: string;
  handle: string;
  role: UserRole;
  passwordHash: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly db: DynamoDBService) {}

  async createProfile(input: CreateProfileInput): Promise<UserProfile> {
    const now = new Date().toISOString();
    const item: UserProfile & Record<string, unknown> = {
      ...DK.userProfile(input.sub),
      sub: input.sub,
      handle: input.handle.toLowerCase(),
      role: input.role,
      passwordHash: input.passwordHash,
      createdAt: now,
      updatedAt: now,
      disabled: false,
    };

    // Transact: write profile + handle-lock atomically
    await this.db.transactWrite({
      TransactItems: [
        {
          Put: {
            TableName: this.db.tableName,
            Item: item,
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
        {
          Put: {
            TableName: this.db.tableName,
            Item: {
              ...DK.handleLock(input.handle),
              ownerSub: input.sub,
              createdAt: now,
            },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
      ],
    });

    return item as unknown as UserProfile;
  }

  async findBySub(sub: string): Promise<UserProfile | null> {
    const res = await this.db.get({ Key: DK.userProfile(sub) });
    return (res.Item as UserProfile) ?? null;
  }

  /** Look up the owner sub from the handle lock, then load the full profile. */
  async findByHandle(handle: string): Promise<UserProfile | null> {
    const lockRes = await this.db.get({ Key: DK.handleLock(handle) });
    const lock = lockRes.Item as { ownerSub?: string } | undefined;
    if (!lock?.ownerSub) return null;
    return this.findBySub(lock.ownerSub);
  }

  async isHandleTaken(handle: string): Promise<boolean> {
    const res = await this.db.get({ Key: DK.handleLock(handle) });
    return !!res.Item;
  }

  async setRole(sub: string, role: UserRole): Promise<void> {
    const now = new Date().toISOString();
    await this.db.update({
      Key: DK.userProfile(sub),
      UpdateExpression: 'SET #role = :role, updatedAt = :now',
      ExpressionAttributeNames: { '#role': 'role' },
      ExpressionAttributeValues: { ':role': role, ':now': now },
      ConditionExpression: 'attribute_exists(PK)',
    });
  }

  async setDisabled(sub: string, disabled: boolean): Promise<void> {
    const now = new Date().toISOString();
    await this.db.update({
      Key: DK.userProfile(sub),
      UpdateExpression: 'SET disabled = :disabled, updatedAt = :now',
      ExpressionAttributeValues: { ':disabled': disabled, ':now': now },
      ConditionExpression: 'attribute_exists(PK)',
    });
  }

  async setPermission(sub: string, permission: UserPermission, grant: boolean): Promise<void> {
    const profile = await this.getOrThrow(sub);
    const current = new Set(profile.permissions ?? []);
    if (grant) {
      current.add(permission);
    } else {
      current.delete(permission);
    }
    const now = new Date().toISOString();
    await this.db.update({
      Key: DK.userProfile(sub),
      UpdateExpression: 'SET #perms = :perms, updatedAt = :now',
      ExpressionAttributeNames: { '#perms': 'permissions' },
      ExpressionAttributeValues: { ':perms': [...current], ':now': now },
      ConditionExpression: 'attribute_exists(PK)',
    });
  }

  async updatePasswordHash(sub: string, passwordHash: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.update({
      Key: DK.userProfile(sub),
      UpdateExpression: 'SET passwordHash = :hash, updatedAt = :now',
      ExpressionAttributeValues: { ':hash': passwordHash, ':now': now },
      ConditionExpression: 'attribute_exists(PK)',
    });
  }

  /** Soft-delete: anonymise PII, keep the record for history integrity. */
  async softDelete(sub: string): Promise<void> {
    const profile = await this.findBySub(sub);
    if (!profile) throw new NotFoundException('User not found');

    const now = new Date().toISOString();
    await this.db.update({
      Key: DK.userProfile(sub),
      UpdateExpression:
        'SET disabled = :true, deletedAt = :now, updatedAt = :now REMOVE passwordHash, avatarKey',
      ExpressionAttributeValues: {
        ':true': true,
        ':now': now,
      },
    });
  }

  async getOrThrow(sub: string): Promise<UserProfile> {
    const profile = await this.findBySub(sub);
    if (!profile) throw new NotFoundException('User not found');
    return profile;
  }

  /**
   * Update a user's handle (username). Swaps the handle-lock item atomically.
   */
  async updateProfile(sub: string, data: { handle?: string }): Promise<UserProfile> {
    const profile = await this.getOrThrow(sub);
    const now = new Date().toISOString();

    const handleChanged = data.handle && data.handle.toLowerCase() !== profile.handle.toLowerCase();
    const newHandle = data.handle?.toLowerCase() ?? profile.handle;

    if (handleChanged) {
      try {
        await this.db.transactWrite({
          TransactItems: [
            {
              Put: {
                TableName: this.db.tableName,
                Item: { ...DK.handleLock(newHandle), ownerSub: sub, createdAt: now },
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
            {
              Delete: {
                TableName: this.db.tableName,
                Key: DK.handleLock(profile.handle),
              },
            },
            {
              Update: {
                TableName: this.db.tableName,
                Key: DK.userProfile(sub),
                UpdateExpression: 'SET handle = :h, updatedAt = :now',
                ExpressionAttributeValues: { ':h': newHandle, ':now': now },
                ConditionExpression: 'attribute_exists(PK)',
              },
            },
          ],
        });
      } catch (err) {
        if (err instanceof TransactionCanceledException) {
          throw new ConflictException('Username is already taken');
        }
        throw err;
      }
    }

    return { ...profile, handle: newHandle, updatedAt: now };
  }

  /** Store the S3 key for a user's avatar. */
  async updateAvatar(sub: string, avatarKey: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.update({
      Key: DK.userProfile(sub),
      UpdateExpression: 'SET avatarKey = :key, updatedAt = :now',
      ExpressionAttributeValues: { ':key': avatarKey, ':now': now },
      ConditionExpression: 'attribute_exists(PK)',
    });
  }

  /**
   * Return a user's game history in reverse-chronological order.
   * Uses the USER#<sub> / GAME#<ts>#<id> index written by GameService.endSession.
   * Supports cursor-based pagination via DDB LastEvaluatedKey (base64-encoded).
   */
  async listGameHistory(
    sub: string,
    limit = 20,
    cursor?: string,
  ): Promise<{ games: GameHistoryItem[]; nextCursor?: string }> {
    const exclusiveStartKey = cursor
      ? (JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8')) as Record<string, unknown>)
      : undefined;

    const res = await this.db.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: { ':pk': `USER#${sub}`, ':skPrefix': 'GAME#' },
      ScanIndexForward: false,
      Limit: limit,
      ...(exclusiveStartKey && { ExclusiveStartKey: exclusiveStartKey }),
    });

    const games = (res.Items ?? []).map((item) => ({
      gameId: item.gameId as string,
      placement: item.placement as 1 | 2 | 3 | 4,
      finalScore: item.finalScore as number,
      result: item.result as 'win' | 'draw' | 'concede' | 'bust',
      endedAt: item.endedAt as string,
    }));

    const nextCursor = res.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(res.LastEvaluatedKey)).toString('base64')
      : undefined;

    return { games, nextCursor };
  }

  /**
   * Search users by handle prefix. Returns only public fields.
   * Used for friend search — safe to expose to any authenticated user.
   */
  async searchPublic(query: string): Promise<PublicProfile[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const res = await this.db.scan({
      FilterExpression: 'begins_with(PK, :pkPrefix) AND SK = :sk AND contains(handle, :q)',
      ExpressionAttributeValues: { ':pkPrefix': 'USER#', ':sk': 'PROFILE', ':q': q },
      ProjectionExpression: '#sub, handle',
      ExpressionAttributeNames: { '#sub': 'sub' },
    });
    return (res.Items ?? []).map((item) => ({
      sub: item.sub as string,
      handle: item.handle as string,
    }));
  }

  /**
   * List all user profiles. Optionally filter by handle substring.
   * Uses a table Scan — acceptable at ≤50 users.
   */
  async listAll(search?: string): Promise<UserProfile[]> {
    const filter = search?.trim().toLowerCase();
    const res = await this.db.scan({
      FilterExpression: filter
        ? 'begins_with(PK, :pkPrefix) AND SK = :sk AND contains(handle, :s)'
        : 'begins_with(PK, :pkPrefix) AND SK = :sk',
      ExpressionAttributeValues: filter
        ? { ':pkPrefix': 'USER#', ':sk': 'PROFILE', ':s': filter }
        : { ':pkPrefix': 'USER#', ':sk': 'PROFILE' },
    });
    // Strip passwordHash before returning to callers
    return ((res.Items ?? []) as UserProfile[]).map(({ passwordHash: _ph, ...rest }) => rest);
  }
}
