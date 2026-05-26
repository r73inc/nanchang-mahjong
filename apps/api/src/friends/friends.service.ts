import {
  Injectable,
  ForbiddenException,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBService, DK } from '../database/dynamodb.service';
import { UsersService, type PublicProfile } from '../users/users.service';

export type FriendStatus = 'pending_sent' | 'pending_received' | 'accepted';

export interface FriendEdge {
  friendSub: string;
  status: FriendStatus;
  createdAt: string;
  updatedAt: string;
}

export interface FriendWithProfile extends FriendEdge {
  handle: string;
  displayName: string;
}

@Injectable()
export class FriendsService {
  constructor(
    private readonly db: DynamoDBService,
    private readonly users: UsersService,
  ) {}

  // ── Internal helpers ────────────────────────────────────────────────────────

  private async getEdge(sub: string, friendSub: string): Promise<FriendEdge | null> {
    const res = await this.db.get({ Key: DK.friendship(sub, friendSub) });
    return (res.Item as FriendEdge) ?? null;
  }

  private async queryEdges(sub: string): Promise<FriendEdge[]> {
    const res = await this.db.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': `USER#${sub}`, ':prefix': 'FRIEND#' },
    });
    return (res.Items ?? []) as FriendEdge[];
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * List all friendship edges for a user, enriched with the friend's public profile.
   */
  async listFriends(sub: string): Promise<FriendWithProfile[]> {
    const edges = await this.queryEdges(sub);
    if (!edges.length) return [];

    const profiles = await Promise.all(edges.map((e) => this.users.findBySub(e.friendSub)));

    return edges.map((edge, i) => ({
      ...edge,
      handle: profiles[i]?.handle ?? '',
      displayName: profiles[i]?.displayName ?? '',
    }));
  }

  /**
   * Send a friend request from actor → target.
   * Writes two edge items atomically (pending_sent / pending_received).
   */
  async sendRequest(actorSub: string, targetSub: string): Promise<void> {
    if (actorSub === targetSub) {
      throw new ForbiddenException('Cannot add yourself as a friend');
    }

    // Target user must exist
    const target = await this.users.findBySub(targetSub);
    if (!target) throw new NotFoundException('User not found');

    const now = new Date().toISOString();

    try {
      await this.db.transactWrite({
        TransactItems: [
          {
            Put: {
              TableName: this.db.tableName,
              Item: {
                ...DK.friendship(actorSub, targetSub),
                friendSub: targetSub,
                status: 'pending_sent',
                createdAt: now,
                updatedAt: now,
              },
              ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
            },
          },
          {
            Put: {
              TableName: this.db.tableName,
              Item: {
                ...DK.friendship(targetSub, actorSub),
                friendSub: actorSub,
                status: 'pending_received',
                createdAt: now,
                updatedAt: now,
              },
              ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
            },
          },
        ],
      });
    } catch (err) {
      if (err instanceof TransactionCanceledException) {
        throw new ConflictException('Friend request already exists');
      }
      throw err;
    }
  }

  /**
   * Accept a pending friend request (actor accepts the requester's request).
   * Updates both edges to 'accepted'.
   */
  async acceptRequest(actorSub: string, requesterSub: string): Promise<void> {
    const edge = await this.getEdge(actorSub, requesterSub);
    if (!edge || edge.status !== 'pending_received') {
      throw new BadRequestException('Friend request not found');
    }

    const now = new Date().toISOString();
    await Promise.all([
      this.db.update({
        Key: DK.friendship(actorSub, requesterSub),
        UpdateExpression: 'SET #s = :s, updatedAt = :now',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':s': 'accepted', ':now': now },
      }),
      this.db.update({
        Key: DK.friendship(requesterSub, actorSub),
        UpdateExpression: 'SET #s = :s, updatedAt = :now',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':s': 'accepted', ':now': now },
      }),
    ]);
  }

  /**
   * Decline a pending friend request (actor declines the requester's request).
   * Deletes both edges.
   */
  async declineRequest(actorSub: string, requesterSub: string): Promise<void> {
    const edge = await this.getEdge(actorSub, requesterSub);
    if (!edge || edge.status !== 'pending_received') {
      throw new BadRequestException('Friend request not found');
    }
    await this.deleteEdgePair(actorSub, requesterSub);
  }

  /**
   * Remove an existing friend. Deletes both edges.
   */
  async removeFriend(actorSub: string, friendSub: string): Promise<void> {
    const edge = await this.getEdge(actorSub, friendSub);
    if (!edge || edge.status !== 'accepted') {
      throw new BadRequestException('Not friends');
    }
    await this.deleteEdgePair(actorSub, friendSub);
  }

  private async deleteEdgePair(sub: string, friendSub: string): Promise<void> {
    await Promise.all([
      this.db.delete({ Key: DK.friendship(sub, friendSub) }),
      this.db.delete({ Key: DK.friendship(friendSub, sub) }),
    ]);
  }

  /**
   * Search for users by handle (delegates to UsersService.searchPublic).
   * Enriches results with the caller's friendship status towards each result.
   */
  async searchUsers(
    actorSub: string,
    query: string,
  ): Promise<(PublicProfile & { friendStatus: FriendStatus | null })[]> {
    const results = await this.users.searchPublic(query);
    return Promise.all(
      results
        .filter((u) => u.sub !== actorSub) // exclude self from results
        .map(async (u) => {
          const edge = await this.getEdge(actorSub, u.sub);
          return { ...u, friendStatus: edge?.status ?? null };
        }),
    );
  }
}
