import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ReplayService } from './replay.service';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

@Controller('replays')
@UseGuards(JwtGuard)
@Throttle({ default: { ttl: 60_000, limit: 30 } })
export class ReplayController {
  constructor(private readonly replay: ReplayService) {}

  /** GET /replays/:id — return the full replay payload for a finished game. */
  @Get(':id')
  getReplay(@Param('id') gameId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.replay.getReplayForViewer(gameId, actor.sub);
  }
}
