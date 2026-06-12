import {
  Controller,
  Get,
  Patch,
  Put,
  Body,
  Req,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StorageService } from '../storage/storage.service';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

@Controller('users')
@UseGuards(JwtGuard)
@Throttle({ default: { ttl: 60_000, limit: 60 } })
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly storage: StorageService,
  ) {}

  /** GET /users/me — full profile for the authenticated user. */
  @Get('me')
  async getMe(@CurrentUser() actor: AuthenticatedUser) {
    const profile = await this.users.getOrThrow(actor.sub);
    const avatarUrl = profile.avatarKey ? await this.storage.getAvatarUrl(profile.avatarKey) : null;
    return {
      ...profile,
      avatarUrl,
      gamesPlayed: profile.gamesPlayed ?? 0,
      gamesWon: profile.gamesWon ?? 0,
      rating: profile.rating ?? 1500,
      streak: profile.streak ?? 0,
    };
  }

  /** PATCH /users/me — update username (handle). */
  @Patch('me')
  async updateMe(@CurrentUser() actor: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(actor.sub, dto);
  }

  /** PUT /users/me/avatar — upload a profile picture (multipart/form-data, field "file"). */
  @Put('me/avatar')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async uploadAvatar(@CurrentUser() actor: AuthenticatedUser, @Req() req: FastifyRequest) {
    const data = await req.file();
    if (!data) throw new BadRequestException('No file uploaded');

    const contentType = data.mimetype;
    if (!/^image\/(jpeg|png)$/.test(contentType)) {
      throw new BadRequestException('Only JPEG and PNG images are supported');
    }

    const buffer = await data.toBuffer();
    if (buffer.length > 2_000_000) {
      throw new BadRequestException('Image exceeds 2 MB limit');
    }

    const key = await this.storage.putAvatar(actor.sub, buffer, contentType);
    await this.users.updateAvatar(actor.sub, key);
    const avatarUrl = await this.storage.getAvatarUrl(key);
    return { avatarUrl };
  }

  /** GET /users/me/games — paginated game history for the authenticated user. */
  @Get('me/games')
  async getMyGames(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('cursor') cursor?: string,
  ) {
    const clampedLimit = Math.min(50, Math.max(1, limit));
    return this.users.listGameHistory(actor.sub, clampedLimit, cursor);
  }

  /**
   * GET /users/search?q=<query> — search users by handle substring.
   * Returns only public fields (sub, handle) — no email.
   */
  @Get('search')
  async search(@Query('q') q: string) {
    const users = await this.users.searchPublic(q ?? '');
    return { users };
  }
}
