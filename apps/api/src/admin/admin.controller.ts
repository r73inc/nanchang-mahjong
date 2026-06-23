import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdminService } from './admin.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { SetRoleDto } from './dto/set-role.dto';
import { SetDisabledDto } from './dto/set-disabled.dto';
import { SetPermissionDto } from './dto/set-permission.dto';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

@Controller('admin')
@UseGuards(JwtGuard, RolesGuard)
@Roles('admin')
// Admin actions are low-volume; tighten to 30 req/min to be safe.
@Throttle({ default: { ttl: 60_000, limit: 30 } })
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  // ── Invites ──────────────────────────────────────────────────────────────────

  /** GET /admin/invites — list all invite codes (all statuses, newest first). */
  @Get('invites')
  async listInvites() {
    const invites = await this.admin.listInvites();
    return { invites };
  }

  /** POST /admin/invites — generate one or more new invite codes. */
  @Post('invites')
  async createInvites(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateInviteDto) {
    const invites = await this.admin.createInvites(
      actor.sub,
      dto.count ?? 1,
      dto.expiresAt,
      dto.note,
    );
    return { invites };
  }

  /** DELETE /admin/invites/:code — revoke an active invite code. */
  @Delete('invites/:code')
  @HttpCode(HttpStatus.OK)
  async revokeInvite(@CurrentUser() actor: AuthenticatedUser, @Param('code') code: string) {
    await this.admin.revokeInvite(actor.sub, code);
    return { ok: true };
  }

  // ── Users ────────────────────────────────────────────────────────────────────

  /**
   * GET /admin/users — list all users.
   * Optional ?search=<term> filters by handle substring (case-insensitive).
   */
  @Get('users')
  async listUsers(@Query('search') search?: string) {
    const users = await this.admin.listUsers(search);
    return { users };
  }

  /** PATCH /admin/users/:sub/role — change a user's role (cannot target yourself). */
  @Patch('users/:sub/role')
  async setRole(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('sub') targetSub: string,
    @Body() dto: SetRoleDto,
  ) {
    await this.admin.setRole(actor.sub, targetSub, dto.role);
    return { ok: true };
  }

  /** PATCH /admin/users/:sub/disable — enable or disable a user (cannot target yourself). */
  @Patch('users/:sub/disable')
  async setDisabled(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('sub') targetSub: string,
    @Body() dto: SetDisabledDto,
  ) {
    await this.admin.setDisabled(actor.sub, targetSub, dto.disabled);
    return { ok: true };
  }

  /** PATCH /admin/users/:sub/permission — grant or revoke a named permission. Admins may target themselves. */
  @Patch('users/:sub/permission')
  async setPermission(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('sub') targetSub: string,
    @Body() dto: SetPermissionDto,
  ) {
    await this.admin.setPermission(actor.sub, targetSub, dto.permission, dto.grant);
    return { ok: true };
  }
}
