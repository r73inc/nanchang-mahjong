import { Controller, Get, Post, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ReplayService } from './replay.service';
import { AiSummaryService } from '../ai-summary/ai-summary.service';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

@Controller('replays')
@UseGuards(JwtGuard)
@Throttle({ default: { ttl: 60_000, limit: 30 } })
export class ReplayController {
  constructor(
    private readonly replay: ReplayService,
    private readonly aiSummary: AiSummaryService,
  ) {}

  /** GET /replays/:id — return the full replay payload for a finished game. */
  @Get(':id')
  getReplay(@Param('id') gameId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.replay.getReplayForViewer(gameId, actor.sub);
  }

  /**
   * POST /replays/:id/request-summary
   *
   * Request an AI-generated commentary summary for this game.
   * Callers with admin-ai-features (or admin role) trigger generation immediately;
   * all others enqueue a pending request for admin approval.
   */
  @Post(':id/request-summary')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async requestSummary(@Param('id') gameId: string, @CurrentUser() actor: AuthenticatedUser) {
    await this.replay.checkReplayAccess(gameId, actor.sub);
    const hasAutoApprove =
      actor.role === 'admin' || actor.permissions.includes('admin-ai-features');
    return this.aiSummary.requestGameSummary(gameId, actor.sub, hasAutoApprove);
  }
}
