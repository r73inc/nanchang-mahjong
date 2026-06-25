/**
 * AiSummaryController — admin-only debug endpoint for triggering AI summary generation.
 *
 * Phase 3: internal testing only. Phase 4 will add the public request/approval endpoints.
 */

import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { IsEnum, IsString } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { AiSummaryService } from './ai-summary.service';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

class TriggerSummaryDto {
  @IsEnum(['game'])
  targetType!: 'game';

  @IsString()
  targetId!: string;
}

@Controller('admin/ai-summary')
@UseGuards(JwtGuard, RolesGuard)
@Roles('admin')
@Throttle({ default: { ttl: 60_000, limit: 10 } })
export class AiSummaryController {
  constructor(private readonly aiSummary: AiSummaryService) {}

  /**
   * POST /admin/ai-summary/trigger
   *
   * Triggers an end-to-end AI summary generation for a specific game.
   * Admin-only debug endpoint for Phase 3 integration testing.
   * Returns the resulting summary item (status = done or failed).
   */
  @Post('trigger')
  @HttpCode(HttpStatus.OK)
  async trigger(@Body() dto: TriggerSummaryDto) {
    const summary = await this.aiSummary.generateGameSummary(dto.targetId, 'admin-debug');
    return { summary };
  }
}
