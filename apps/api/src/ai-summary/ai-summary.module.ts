import { Global, Module } from '@nestjs/common';
import { GeminiRelayClient } from './gemini-relay.client';
import { AiSummaryService } from './ai-summary.service';
import { AiSummaryController } from './ai-summary.controller';

/**
 * @Global so AiSummaryService can be injected into ChallengesService (Phase 5)
 * without re-importing AiSummaryModule in ChallengesModule.
 */
@Global()
@Module({
  controllers: [AiSummaryController],
  providers: [GeminiRelayClient, AiSummaryService],
  exports: [AiSummaryService],
})
export class AiSummaryModule {}
