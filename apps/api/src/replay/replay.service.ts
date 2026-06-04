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
   * Fetch a replay for the given viewer.
   *
   * Access rules:
   *  - Viewer must be one of the 4 players in the game, OR
   *  - Viewer must have an accepted friendship with at least one player.
   *
   * Throws NotFoundException if the game record doesn't exist.
   * Throws ForbiddenException if the viewer doesn't meet the access criteria.
   */
  async getReplayForViewer(gameId: string, viewerSub: string): Promise<ReplayGamePayload> {
    // Fetch game META from DDB to get seatMap for access control
    const gameMeta = await this.db.get({ Key: DK.game(gameId) });
    if (!gameMeta.Item) throw new NotFoundException('Game not found');

    const seatMap = gameMeta.Item.seatMap as [string, string, string, string];

    // Access control: player in the game?
    const isPlayer = seatMap.includes(viewerSub);
    if (!isPlayer) {
      // Not a player — must be an accepted friend of at least one player
      const friendOfPlayer = await this.friends.areFriends(viewerSub, seatMap);
      if (!friendOfPlayer) throw new ForbiddenException('Access denied');
    }

    return this.storage.getReplay(gameId);
  }
}
