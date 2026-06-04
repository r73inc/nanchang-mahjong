import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { GameService } from './game.service';
import { GameGateway } from './game.gateway';

@Module({
  imports: [DatabaseModule, AuthModule],
  providers: [GameService, GameGateway],
  exports: [GameService],
})
export class GameModule {}
