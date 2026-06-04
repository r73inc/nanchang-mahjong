import { Injectable, Logger } from '@nestjs/common';
import { DynamoDBService, DK } from '../database/dynamodb.service';
import { EloService } from './elo.service';

@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);

  constructor(
    private readonly db: DynamoDBService,
    private readonly elo: EloService,
  ) {}

  /**
   * After a game session ends:
   *  1. Fetch each player's current rating and streak from DDB.
   *  2. Compute pairwise ELO deltas.
   *  3. Update gamesPlayed, gamesWon, streak, rating for every player.
   *
   * Returns the computed rating deltas [Δseat0, Δseat1, Δseat2, Δseat3].
   * All DDB writes are fire-and-forget with error logging — stats failures
   * never block the game:ended broadcast.
   */
  async updateAfterGame(
    seatMap: [string, string, string, string],
    placement: [1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4],
  ): Promise<[number, number, number, number]> {
    const profileResults = await Promise.all(
      seatMap.map((sub) => this.db.get({ Key: DK.userProfile(sub) })),
    );

    const currentRatings = profileResults.map(
      (r) => (r.Item?.rating as number | undefined) ?? 1500,
    ) as [number, number, number, number];

    const deltas = this.elo.computeDeltas(placement, currentRatings);
    const now = new Date().toISOString();

    await Promise.all(
      seatMap.map((sub, i) => {
        const won = placement[i] === 1;
        const currentStreak = (profileResults[i].Item?.streak as number | undefined) ?? 0;
        const newStreak = won ? currentStreak + 1 : 0;

        return this.db
          .update({
            Key: DK.userProfile(sub),
            UpdateExpression:
              'SET gamesPlayed = if_not_exists(gamesPlayed, :zero) + :one, ' +
              'gamesWon = if_not_exists(gamesWon, :zero) + :wonDelta, ' +
              'rating = if_not_exists(rating, :defaultRating) + :delta, ' +
              'streak = :newStreak, ' +
              'updatedAt = :now',
            ExpressionAttributeValues: {
              ':zero': 0,
              ':one': 1,
              ':wonDelta': won ? 1 : 0,
              ':delta': deltas[i],
              ':defaultRating': 1500,
              ':newStreak': newStreak,
              ':now': now,
            },
            ConditionExpression: 'attribute_exists(PK)',
          })
          .catch((err) => this.logger.error(`Failed to update stats for ${sub}: ${err}`));
      }),
    );

    return deltas;
  }
}
