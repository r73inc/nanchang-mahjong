/**
 * AiQueueController — admin queue management for AI summary requests.
 *
 * All endpoints require the 'admin-ai-features' permission (also auto-passes for admin role).
 *
 * GET  /admin/ai-requests               — list pending requests
 * POST /admin/ai-requests/:reqId/approve — approve + trigger generation
 * POST /admin/ai-requests/:reqId/reject  — reject without generating
 * GET  /admin/ai-jobs/failed             — list failed summary jobs
 * POST /admin/ai-jobs/:type/:id/retry    — retry a failed game summary
 */

import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AiSummaryService } from './ai-summary.service';
import { JwtGuard } from '../common/guards/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

@Controller('admin/ai')
@UseGuards(JwtGuard, PermissionsGuard)
@Permissions('admin-ai-features')
@Throttle({ default: { ttl: 60_000, limit: 30 } })
export class AiQueueController {
  constructor(private readonly aiSummary: AiSummaryService) {}

  /** List all pending AI summary requests. */
  @Get('requests')
  async listPendingRequests() {
    return { requests: await this.aiSummary.listPendingRequests() };
  }

  /** Approve a pending request and immediately trigger generation. */
  @Post('requests/:reqId/approve')
  @HttpCode(HttpStatus.OK)
  async approveRequest(@Param('reqId') reqId: string, @CurrentUser() actor: AuthenticatedUser) {
    const summary = await this.aiSummary.approveAiRequest(reqId, actor.sub);
    return { summary };
  }

  /** Reject a pending request without generating. */
  @Post('requests/:reqId/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  async rejectRequest(@Param('reqId') reqId: string, @CurrentUser() actor: AuthenticatedUser) {
    await this.aiSummary.rejectAiRequest(reqId, actor.sub);
  }

  /** List all failed AI summary jobs. */
  @Get('jobs/failed')
  async listFailedJobs() {
    return { jobs: await this.aiSummary.listFailedJobs() };
  }

  /**
   * Retry a failed summary.
   * targetType: 'game' | 'challenge'   (challenge retry is Phase 5)
   */
  @Post('jobs/:targetType/:targetId/retry')
  @HttpCode(HttpStatus.OK)
  async retryFailedJob(
    @Param('targetType') targetType: string,
    @Param('targetId') targetId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (targetType !== 'game' && targetType !== 'challenge') {
      throw new BadRequestException('targetType must be "game" or "challenge"');
    }
    const summary = await this.aiSummary.retryFailedSummary(
      targetType as 'game' | 'challenge',
      targetId,
      actor.sub,
    );
    return { summary };
  }
}
