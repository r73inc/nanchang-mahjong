import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { GameService } from './game.service';
import { GameGateway } from './game.gateway';
import { EloService } from './elo.service';
import { StatsService } from './stats.service';
import { GameSavesService } from './game-saves.service';
import { GameSavesController } from './game-saves.controller';

@Module({
  imports: [DatabaseModule, AuthModule],
  providers: [GameService, GameGateway, EloService, StatsService, GameSavesService],
  controllers: [GameSavesController],
  exports: [GameService],
})
export class GameModule {}
