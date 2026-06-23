import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CreateDevTestGameDto } from '../admin/dto/create-dev-test-game.dto';
import { JwtGuard } from '../common/guards/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { AdminService } from '../admin/admin.service';
import { GameService } from '../game/game.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

@Controller('dev-test')
@UseGuards(JwtGuard, PermissionsGuard)
@Permissions('devTestRoom')
@Throttle({ default: { ttl: 60_000, limit: 30 } })
export class DevTestController {
  constructor(
    private readonly game: GameService,
    private readonly admin: AdminService,
  ) {}

  /**
   * POST /dev-test/game — create a dev test room with 3 easy bots.
   * Requires the 'devTestRoom' permission. ELO and stats are not affected.
   */
  @Post('game')
  async createDevTestGame(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateDevTestGameDto,
  ) {
    const result = await this.game.createTestGame(actor.sub, actor.handle, {
      hand: dto.hand,
      openMelds: dto.openMelds ?? [],
      condition: dto.condition,
      winTile: dto.winTile,
    });

    await this.admin.writeAudit({
      action: 'CREATE_DEV_TEST_GAME',
      actorSub: actor.sub,
      payload: { condition: dto.condition, gameId: result.gameId },
    });

    return result;
  }
}
