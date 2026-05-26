import { Injectable, NotFoundException } from '@nestjs/common';
import { DynamoDBService, DK } from '../database/dynamodb.service';
import type { UserRole } from '../common/interfaces/authenticated-user.interface';

export interface UserProfile {
  sub: string;
  email: string;
  handle: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
  disabled: boolean;
}

export interface CreateProfileInput {
  sub: string;
  email: string;
  handle: string;
  displayName: string;
  role: UserRole;
}

@Injectable()
export class UsersService {
  constructor(private readonly db: DynamoDBService) {}

  async createProfile(input: CreateProfileInput): Promise<UserProfile> {
    const now = new Date().toISOString();
    // Profile item: primary key = USER#<sub>/PROFILE, GSI-1 = EMAIL#<email>/USER
    const item: UserProfile & Record<string, unknown> = {
      ...DK.userProfile(input.sub),
      ...DK.userByEmail(input.email),
      sub: input.sub,
      email: input.email.toLowerCase(),
      handle: input.handle.toLowerCase(),
      displayName: input.displayName,
      role: input.role,
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

  async findByEmail(email: string): Promise<UserProfile | null> {
    const res = await this.db.query({
      IndexName: 'gsi1',
      KeyConditionExpression: 'gsi1pk = :pk AND gsi1sk = :sk',
      ExpressionAttributeValues: {
        ':pk': DK.userByEmail(email).gsi1pk,
        ':sk': 'USER',
      },
    });
    return (res.Items?.[0] as UserProfile) ?? null;
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

  /** Soft-delete: anonymise PII, keep the record for history integrity. */
  async softDelete(sub: string): Promise<void> {
    const profile = await this.findBySub(sub);
    if (!profile) throw new NotFoundException('User not found');

    const now = new Date().toISOString();
    await this.db.update({
      Key: DK.userProfile(sub),
      UpdateExpression:
        'SET email = :anon, displayName = :anon, disabled = :true, deletedAt = :now, updatedAt = :now REMOVE gsi1pk, gsi1sk',
      ExpressionAttributeValues: {
        ':anon': `deleted-${sub}`,
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
   * List all user profiles. Optionally filter by handle or email substring.
   * Uses a table Scan — acceptable at ≤50 users. Add a GSI partition key
   * (e.g. gsi2pk='USERS') for cursor-based pagination if the user count grows.
   */
  async listAll(search?: string): Promise<UserProfile[]> {
    const filter = search?.trim().toLowerCase();
    const res = await this.db.scan({
      FilterExpression: filter
        ? 'begins_with(PK, :pkPrefix) AND SK = :sk AND (contains(handle, :s) OR contains(#em, :s))'
        : 'begins_with(PK, :pkPrefix) AND SK = :sk',
      ExpressionAttributeValues: filter
        ? { ':pkPrefix': 'USER#', ':sk': 'PROFILE', ':s': filter }
        : { ':pkPrefix': 'USER#', ':sk': 'PROFILE' },
      ...(filter && { ExpressionAttributeNames: { '#em': 'email' } }),
    });
    return (res.Items ?? []) as UserProfile[];
  }
}
