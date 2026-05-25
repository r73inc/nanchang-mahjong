import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InvitesService } from './invites.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

const VALID_STATUSES = ['active', 'redeemed', 'revoked'] as const;
type InviteStatus = (typeof VALID_STATUSES)[number];

@Controller('invites')
@UseGuards(JwtGuard, RolesGuard)
@Roles('admin')
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  /**
   * POST /invites — create a new invite code.
   * Admin only. Rate: 3 per hour (prevent accidental mass-generation).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 3_600_000, limit: 3 } })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateInviteDto) {
    return this.invites.create({
      adminSub: user.sub,
      expiresAt: dto.expiresAt,
      note: dto.note,
    });
  }

  /**
   * GET /invites?status=active|redeemed|revoked — list invites.
   * Omit ?status to return all. Admin only.
   */
  @Get()
  list(@Query('status') status?: string) {
    if (status !== undefined) {
      if (!(VALID_STATUSES as readonly string[]).includes(status)) {
        throw new BadRequestException(`status must be one of: ${VALID_STATUSES.join(', ')}`);
      }
      return this.invites.listByStatus(status as InviteStatus);
    }
    return this.invites.listAll();
  }

  /**
   * DELETE /invites/:code — revoke an active invite.
   * Admin only. Code is case-insensitive (normalised to uppercase in service).
   */
  @Delete(':code')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(@Param('code') code: string) {
    return this.invites.revoke(code);
  }
}
