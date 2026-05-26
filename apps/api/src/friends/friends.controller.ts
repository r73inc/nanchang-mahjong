import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FriendsService } from './friends.service';
import { FriendTargetDto, FriendRequesterDto } from './dto/friend-action.dto';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

@Controller('friends')
@UseGuards(JwtGuard)
@Throttle({ default: { ttl: 60_000, limit: 60 } })
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  /** GET /friends — list all friendships (pending + accepted) for the caller. */
  @Get()
  async listFriends(@CurrentUser() actor: AuthenticatedUser) {
    const friends = await this.friends.listFriends(actor.sub);
    return { friends };
  }

  /**
   * GET /friends/search?q=<query> — search users by handle.
   * Results include the caller's friendship status towards each result.
   */
  @Get('search')
  async search(@CurrentUser() actor: AuthenticatedUser, @Query('q') q: string) {
    const users = await this.friends.searchUsers(actor.sub, q ?? '');
    return { users };
  }

  /** POST /friends/request — send a friend request to targetSub. */
  @Post('request')
  @HttpCode(HttpStatus.CREATED)
  async sendRequest(@CurrentUser() actor: AuthenticatedUser, @Body() dto: FriendTargetDto) {
    await this.friends.sendRequest(actor.sub, dto.targetSub);
    return { ok: true };
  }

  /** POST /friends/accept — accept a pending request from requesterSub. */
  @Post('accept')
  @HttpCode(HttpStatus.OK)
  async acceptRequest(@CurrentUser() actor: AuthenticatedUser, @Body() dto: FriendRequesterDto) {
    await this.friends.acceptRequest(actor.sub, dto.requesterSub);
    return { ok: true };
  }

  /** POST /friends/decline — decline a pending request from requesterSub. */
  @Post('decline')
  @HttpCode(HttpStatus.OK)
  async declineRequest(@CurrentUser() actor: AuthenticatedUser, @Body() dto: FriendRequesterDto) {
    await this.friends.declineRequest(actor.sub, dto.requesterSub);
    return { ok: true };
  }

  /** DELETE /friends/:sub — remove an existing friend. */
  @Delete(':sub')
  @HttpCode(HttpStatus.OK)
  async removeFriend(@CurrentUser() actor: AuthenticatedUser, @Param('sub') friendSub: string) {
    await this.friends.removeFriend(actor.sub, friendSub);
    return { ok: true };
  }
}
