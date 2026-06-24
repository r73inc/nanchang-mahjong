import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DynamoDBService, DK } from '../database/dynamodb.service';
import { StorageService } from '../storage/storage.service';
import { FriendsService } from '../friends/friends.service';
import type { ReplayGamePayload } from '@nanchang/shared';

@Injectable()
export class ReplayService {
  constructor(
    private readonly db: DynamoDBService,
    private readonly storage: StorageService,
    private readonly friends: FriendsService,
  ) {}

  /**
   * Verify the viewer is allowed to access the given game's replay.
   *
   * Access rules:
   *  - Viewer must be one of the 4 players, OR
   *  - Viewer must have an accepted friendship with at least one player.
   *
   * Throws NotFoundException if the game record doesn't exist.
   * Throws ForbiddenException if the viewer doesn't meet the access criteria.
   */
  async checkReplayAccess(gameId: string, viewerSub: string): Promise<void> {
    const gameMeta = await this.db.get({ Key: DK.game(gameId) });
    if (!gameMeta.Item) throw new NotFoundException('Game not found');

    const seatMap = gameMeta.Item.seatMap as [string, string, string, string];
    if (!seatMap.includes(viewerSub)) {
      const friendOfPlayer = await this.friends.areFriends(viewerSub, seatMap);
      if (!friendOfPlayer) throw new ForbiddenException('Access denied');
    }
  }

  /** Fetch the full replay payload for a viewer who has passed access control. */
  async getReplayForViewer(gameId: string, viewerSub: string): Promise<ReplayGamePayload> {
    await this.checkReplayAccess(gameId, viewerSub);
    return this.storage.getReplay(gameId);
  }
}
