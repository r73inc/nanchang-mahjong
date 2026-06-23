import { Module } from '@nestjs/common';
import { DevTestController } from './dev-test.controller';
import { GameModule } from '../game/game.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [GameModule, AdminModule],
  controllers: [DevTestController],
})
export class DevTestModule {}
