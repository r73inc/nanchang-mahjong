import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FriendsModule } from '../friends/friends.module';
import { AiSummaryModule } from '../ai-summary/ai-summary.module';
import { ReplayService } from './replay.service';
import { ReplayController } from './replay.controller';

@Module({
  imports: [AuthModule, FriendsModule, AiSummaryModule],
  providers: [ReplayService],
  controllers: [ReplayController],
})
export class ReplayModule {}
