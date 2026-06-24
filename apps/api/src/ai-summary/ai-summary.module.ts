import { Module } from '@nestjs/common';
import { GeminiRelayClient } from './gemini-relay.client';
import { AiSummaryService } from './ai-summary.service';
import { AiSummaryController } from './ai-summary.controller';

@Module({
  controllers: [AiSummaryController],
  providers: [GeminiRelayClient, AiSummaryService],
  exports: [AiSummaryService],
})
export class AiSummaryModule {}
