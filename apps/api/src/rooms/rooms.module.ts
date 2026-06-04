import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { GameModule } from '../game/game.module';
import { RoomsService } from './rooms.service';
import { RoomsGateway } from './rooms.gateway';
import { RoomsController } from './rooms.controller';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    // GameModule is imported so RoomsController can call GameService.createGame()
    // when the host starts a game. No circular dep: GameModule does not import RoomsModule.
    GameModule,
  ],
  providers: [RoomsService, RoomsGateway],
  controllers: [RoomsController],
  exports: [RoomsService, RoomsGateway],
})
export class RoomsModule {}
