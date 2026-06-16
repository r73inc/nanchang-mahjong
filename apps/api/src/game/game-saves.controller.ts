/**
 * GameSavesController — REST endpoints for the save/load game feature.
 *
 * Routes:
 *   GET    /saves              — list the current user's save slots
 *   DELETE /saves/:slot        — delete a save slot ('auto' or 'manual')
 *   POST   /saves/auto/load    — restore the auto-save and start a live session
 *   POST   /saves/manual/load  — restore the manual save and start a live session (host)
 *   GET    /saves/restore/:code — resolve a restore code → gameId (for non-host players)
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { GameSavesService } from './game-saves.service';
import { GameService } from './game.service';
import type { SaveSlot } from '@nanchang/shared';

@Controller('saves')
@UseGuards(JwtGuard)
export class GameSavesController {
  constructor(
    private readonly savesService: GameSavesService,
    private readonly gameService: GameService,
  ) {}

  /** List all save slots for the current user. */
  @Get()
  async listSaves(@CurrentUser() user: AuthenticatedUser) {
    return this.savesService.listSaves(user.sub);
  }

  /** Delete a specific save slot. */
  @Delete(':slot')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSave(@CurrentUser() user: AuthenticatedUser, @Param('slot') slot: string) {
    if (slot !== 'auto' && slot !== 'manual') {
      throw new BadRequestException('slot must be "auto" or "manual"');
    }
    await this.savesService.deleteSave(user.sub, slot as SaveSlot);
  }

  /**
   * Restore the auto-save. Only the user who owns the save may load it.
   * Responds with the gameId so the client can navigate directly to /game/:id.
   */
  @Post('auto/load')
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  async loadAutoSave(@CurrentUser() user: AuthenticatedUser): Promise<{ gameId: string }> {
    const save = await this.savesService.getSave(user.sub, 'auto');
    if (!save) throw new NotFoundException('No auto-save found');

    // Ensure the requesting user is a human player in this save.
    if (!save.allowedPlayerSubs.includes(user.sub)) {
      throw new ForbiddenException('This save does not belong to you');
    }

    const { gameId } = await this.gameService.restoreSession(save, user.sub);

    // Delete the save once the session is live (it will be re-saved on next disconnect).
    await this.savesService.deleteSave(user.sub, 'auto').catch(() => undefined);

    return { gameId };
  }

  /**
   * Restore the manual save (host only). Creates a live session and returns a
   * restore code that other original players can use to join.
   */
  @Post('manual/load')
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  async loadManualSave(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ gameId: string; restoreCode?: string }> {
    const save = await this.savesService.getSave(user.sub, 'manual');
    if (!save) throw new NotFoundException('No manual save found');
    if (save.hostUserId !== user.sub) {
      throw new ForbiddenException('Only the host can load a manual save');
    }

    const { gameId, restoreCode } = await this.gameService.restoreSession(save, user.sub);

    // Delete the save now that the session is live.
    await this.savesService.deleteSave(user.sub, 'manual').catch(() => undefined);

    return { gameId, restoreCode };
  }

  /**
   * Resolve a restore code to a gameId. Used by non-host players who received
   * the code from the host after a manual save was restored.
   * Validates that the requesting user was an original player in the saved game.
   */
  @Get('restore/:code')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async resolveRestoreCode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
  ): Promise<{ gameId: string }> {
    const gameId = this.gameService.resolveRestoreCode(code, user.sub);
    if (!gameId) throw new NotFoundException('Restore code not found or expired');
    return { gameId };
  }
}
