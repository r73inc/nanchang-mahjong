import { Injectable, ConflictException, NotFoundException, GoneException } from '@nestjs/common';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { randomBytes } from 'crypto';
import { DynamoDBService, DK } from '../database/dynamodb.service';

export interface InviteRecord {
  code: string;
  status: 'active' | 'redeemed' | 'revoked';
  createdBy: string; // admin sub
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  note?: string;
  redeemedBy?: string;
  redeemedAt?: string;
}

export interface CreateInviteInput {
  adminSub: string;
  expiresAt?: string;
  note?: string;
}

@Injectable()
export class InvitesService {
  constructor(private readonly db: DynamoDBService) {}

  /**
   * Generate a cryptographically random 8-char invite code.
   * Uses an unambiguous alphabet (no I, O, 1, 0 to avoid confusion).
   */
  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = randomBytes(8);
    return Array.from(bytes)
      .map((b) => chars[b % chars.length])
      .join('');
  }

  async create(input: CreateInviteInput): Promise<InviteRecord> {
    const code = this.generateCode();
    const now = new Date().toISOString();

    const item: InviteRecord & Record<string, unknown> = {
      ...DK.invite(code),
      ...DK.invitesByStatus('active'),
      gsi1sk: code,
      code,
      status: 'active',
      createdBy: input.adminSub,
      createdAt: now,
      updatedAt: now,
      ...(input.expiresAt && { expiresAt: input.expiresAt }),
      ...(input.note && { note: input.note }),
    };

    await this.db.put({
      Item: item,
      ConditionExpression: 'attribute_not_exists(PK)', // extremely unlikely collision guard
    });

    return item as unknown as InviteRecord;
  }

  async findByCode(code: string): Promise<InviteRecord | null> {
    const res = await this.db.get({ Key: DK.invite(code.toUpperCase()) });
    return (res.Item as InviteRecord) ?? null;
  }

  /**
   * Fast-fail read validation before Cognito user creation.
   * Does NOT mutate the invite — atomic redemption happens in redeemOrThrow.
   */
  async validateOrThrow(code: string): Promise<void> {
    const invite = await this.findByCode(code);
    if (!invite) throw new NotFoundException('Invite code not found');
    if (invite.status === 'redeemed') throw new ConflictException('Invite code already used');
    if (invite.status === 'revoked') throw new GoneException('Invite code has been revoked');
    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
      throw new GoneException('Invite code has expired');
    }
  }

  /**
   * Atomically flips status active → redeemed.
   * The ConditionExpression prevents double-redemption even under concurrent requests.
   */
  async redeemOrThrow(code: string, redeemerSub: string): Promise<void> {
    const now = new Date().toISOString();
    try {
      await this.db.update({
        Key: DK.invite(code.toUpperCase()),
        UpdateExpression:
          'SET #status = :redeemed, redeemedBy = :sub, redeemedAt = :now, updatedAt = :now, gsi1pk = :newPk',
        ConditionExpression: '#status = :active',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':redeemed': 'redeemed',
          ':sub': redeemerSub,
          ':now': now,
          ':active': 'active',
          ':newPk': DK.invitesByStatus('redeemed').gsi1pk,
        },
      });
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        throw new ConflictException('Invite code is no longer valid');
      }
      throw err;
    }
  }

  /** Admin revocation — only active invites can be revoked. */
  async revoke(code: string): Promise<void> {
    const now = new Date().toISOString();
    try {
      await this.db.update({
        Key: DK.invite(code.toUpperCase()),
        UpdateExpression: 'SET #status = :revoked, updatedAt = :now, gsi1pk = :newPk',
        ConditionExpression: 'attribute_exists(PK) AND #status = :active',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':revoked': 'revoked',
          ':now': now,
          ':active': 'active',
          ':newPk': DK.invitesByStatus('revoked').gsi1pk,
        },
      });
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        throw new ConflictException('Cannot revoke: invite not found or already redeemed/revoked');
      }
      throw err;
    }
  }

  async listByStatus(status: 'active' | 'redeemed' | 'revoked'): Promise<InviteRecord[]> {
    const res = await this.db.query({
      IndexName: 'gsi1',
      KeyConditionExpression: 'gsi1pk = :pk',
      ExpressionAttributeValues: { ':pk': DK.invitesByStatus(status).gsi1pk },
    });
    return (res.Items ?? []) as InviteRecord[];
  }

  /** Returns all invites across every status (parallel GSI queries). */
  async listAll(): Promise<InviteRecord[]> {
    const [active, redeemed, revoked] = await Promise.all([
      this.listByStatus('active'),
      this.listByStatus('redeemed'),
      this.listByStatus('revoked'),
    ]);
    // Sorted newest-first by createdAt for consistent admin-panel display
    return [...active, ...redeemed, ...revoked].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }
}
