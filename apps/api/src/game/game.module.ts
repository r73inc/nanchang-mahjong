import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { GameService } from './game.service';
import { GameGateway } from './game.gateway';
import { EloService } from './elo.service';
import { StatsService } from './stats.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  providers: [GameService, GameGateway, EloService, StatsService],
  exports: [GameService],
})
export class GameModule {}
