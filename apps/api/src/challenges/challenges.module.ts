import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PushModule } from '../push/push.module';
import { FriendsModule } from '../friends/friends.module';
import { RoomsModule } from '../rooms/rooms.module';
import { GameModule } from '../game/game.module';
import { ChallengesService } from './challenges.service';
import { ChallengesController } from './challenges.controller';

@Module({
  imports: [
    DatabaseModule,
    PushModule,
    FriendsModule,
    RoomsModule,
    // GameModule is imported directly so ChallengesController can inject GameService.
    // (RoomsModule also imports GameModule but does not re-export it.)
    GameModule,
  ],
  providers: [ChallengesService],
  controllers: [ChallengesController],
  exports: [ChallengesService],
})
export class ChallengesModule {}
