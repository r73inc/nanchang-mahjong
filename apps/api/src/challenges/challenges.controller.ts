/**
 * ChallengesController — REST endpoints for the Point Challenge feature.
 *
 * POST /challenges              — Create a challenge (seed + config) and start the creator's game.
 * GET  /challenges              — List my challenges (created + received).
 * GET  /challenges/:id          — Get challenge detail (score visibility enforced).
 * POST /challenges/:id/start-game — A challenged player starts their game.
 * POST /challenges/:id/decline  — A challenged player declines.
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { ChallengesService } from './challenges.service';
import { RoomsService } from '../rooms/rooms.service';
import { GameService } from '../game/game.service';
import { FriendsService } from '../friends/friends.service';
import { DynamoDBService } from '../database/dynamodb.service';
import { AiSummaryService } from '../ai-summary/ai-summary.service';
import { CreateChallengeDto } from './dto/create-challenge.dto';
import type { BotDifficulty } from '@nanchang/shared';

@Controller('challenges')
@UseGuards(JwtGuard)
export class ChallengesController {
  constructor(
    private readonly challenges: ChallengesService,
    private readonly rooms: RoomsService,
    private readonly gameService: GameService,
    private readonly friends: FriendsService,
    private readonly db: DynamoDBService,
    private readonly aiSummary: AiSummaryService,
  ) {}

  /**
   * Create a Point Challenge and immediately start the creator's game.
   *
   * Flow:
   * 1. Validate challenged friends exist and are accepted friends.
   * 2. Create challenge record (seed + handSeeds stored).
   * 3. Create a solo room (creator + 3 bots).
   * 4. Start the game with pre-determined hand seeds.
   * 5. Return { challengeId, gameId }.
   */
  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  async createChallenge(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateChallengeDto) {
    // Resolve challenged friends' handles for display.
    const friendsList = await this.friends.listFriends(user.sub);
    const acceptedFriendSubs = new Set(
      friendsList.filter((f) => f.status === 'accepted').map((f) => f.friendSub),
    );

    // Validate all challenged subs are accepted friends.
    for (const sub of dto.challengedSubs) {
      if (!acceptedFriendSubs.has(sub)) {
        throw new (await import('@nestjs/common')).BadRequestException(
          `User ${sub} is not an accepted friend`,
        );
      }
    }

    // Build handle map for challenged friends.
    const handleMap: Record<string, string> = {};
    for (const f of friendsList) {
      if (dto.challengedSubs.includes(f.friendSub)) {
        handleMap[f.friendSub] = f.handle;
      }
    }

    // Create the challenge record.
    const { challengeId, handSeeds, roomSettings } = await this.challenges.createChallenge(
      user.sub,
      user.handle,
      dto,
    );

    // Patch real handles onto participant records.
    await this.challenges.patchParticipantHandles(challengeId, handleMap);

    // Create the creator's solo room (1 human + 3 bots).
    const roomState = await this.createChallengeRoom(
      user.sub,
      user.handle,
      dto.config.botDifficulty,
      roomSettings,
    );

    // Start the game immediately (no waiting room needed for challenge games).
    const { room: startedRoom, gameId } = await this.rooms.startGame(roomState.roomId, user.sub);

    const seatMap = ([0, 1, 2, 3] as const).map(
      (i) => startedRoom.seats.find((s) => s.seatIdx === i)!.userId!,
    ) as [string, string, string, string];
    const seatNames = ([0, 1, 2, 3] as const).map(
      (i) => startedRoom.seats.find((s) => s.seatIdx === i)!.handle ?? seatMap[i],
    ) as [string, string, string, string];
    const seatAvatarUrls = ([0, 1, 2, 3] as const).map(
      (i) => startedRoom.seats.find((s) => s.seatIdx === i)!.avatarUrl ?? null,
    ) as [string | null, string | null, string | null, string | null];

    // onGameEnded fires when the creator's game ends — records result + sends invites.
    const service = this.challenges;
    const onGameEnded = async (playerSub: string, finalScore: number) => {
      await service.recordCreatorResult(challengeId, playerSub, finalScore, gameId);
    };

    await this.gameService.createGame(
      roomState.roomId,
      seatMap,
      roomSettings,
      gameId,
      seatNames,
      seatAvatarUrls,
      { challengeId, handSeeds, onGameEnded, numHands: dto.config.numRounds },
    );

    return { challengeId, gameId };
  }

  /** List all challenges the current user is involved in. */
  @Get()
  async listChallenges(@CurrentUser() user: AuthenticatedUser) {
    const summaries = await this.challenges.listChallenges(user.sub);
    return { challenges: summaries };
  }

  /** Get challenge details (score visibility enforced server-side). */
  @Get(':id')
  async getChallenge(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.challenges.getChallenge(id, user.sub);
  }

  /**
   * Start the game for a challenged participant.
   * Creates a solo room, starts the game with the same hand seeds, returns gameId.
   */
  @Post(':id/start-game')
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  async startChallengeGame(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') challengeId: string,
  ) {
    const { handSeeds, roomSettings, botDifficulty, onGameEnded, numRounds } =
      await this.challenges.prepareParticipantGame(challengeId, user.sub);

    // Create a fresh solo room for this participant.
    const roomState = await this.createChallengeRoom(
      user.sub,
      user.handle,
      botDifficulty,
      roomSettings,
    );

    const { room: startedRoom, gameId } = await this.rooms.startGame(roomState.roomId, user.sub);

    const seatMap = ([0, 1, 2, 3] as const).map(
      (i) => startedRoom.seats.find((s) => s.seatIdx === i)!.userId!,
    ) as [string, string, string, string];
    const seatNames = ([0, 1, 2, 3] as const).map(
      (i) => startedRoom.seats.find((s) => s.seatIdx === i)!.handle ?? seatMap[i],
    ) as [string, string, string, string];
    const seatAvatarUrls = ([0, 1, 2, 3] as const).map(
      (i) => startedRoom.seats.find((s) => s.seatIdx === i)!.avatarUrl ?? null,
    ) as [string | null, string | null, string | null, string | null];

    // Record that the participant has started (enables resume and prevents double-start).
    await this.challenges.markParticipantGameStarted(challengeId, user.sub, gameId);

    // Wrap onGameEnded to pass gameId through.
    const wrappedOnGameEnded = async (playerSub: string, finalScore: number) => {
      await onGameEnded(playerSub, finalScore, gameId);
    };

    await this.gameService.createGame(
      roomState.roomId,
      seatMap,
      roomSettings,
      gameId,
      seatNames,
      seatAvatarUrls,
      { challengeId, handSeeds, onGameEnded: wrappedOnGameEnded, numHands: numRounds },
    );

    return { gameId };
  }

  /** Decline a challenge (challenged players only). */
  @Post(':id/decline')
  @HttpCode(HttpStatus.NO_CONTENT)
  async declineChallenge(@CurrentUser() user: AuthenticatedUser, @Param('id') challengeId: string) {
    await this.challenges.declineChallenge(challengeId, user.sub);
  }

  /**
   * Mark that the current user has viewed the final results of a completed challenge.
   * Idempotent — safe to call on every visit to the results screen.
   */
  @Post(':id/mark-viewed')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markResultsViewed(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') challengeId: string,
  ) {
    await this.challenges.markResultsViewed(challengeId, user.sub);
  }

  /**
   * GET /challenges/:id/summary
   *
   * Return the current AI summary state for this challenge (public fields only).
   * Returns null when no summary has been requested yet.
   */
  @Get(':id/summary')
  async getChallengeSummary(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') challengeId: string,
  ) {
    await this.challenges.getChallenge(challengeId, actor.sub);
    const item = await this.aiSummary.getSummary(`CHALLENGE#${challengeId}`);
    if (!item) return null;
    return { status: item.status, text: item.text, errorCode: item.errorCode };
  }

  /**
   * Request an AI-generated overview summary for this challenge.
   *
   * Callers with admin-ai-features (or admin role) receive an immediately-approved
   * summary request; all others create a pending queue item for admin approval.
   * Challenge generation itself lands in Phase 5 — the queue item is created now.
   */
  @Post(':id/request-summary')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async requestSummary(@CurrentUser() actor: AuthenticatedUser, @Param('id') challengeId: string) {
    // Access check: getChallenge throws 403/404 if caller is not a participant.
    const challenge = await this.challenges.getChallenge(challengeId, actor.sub);
    return this.aiSummary.requestChallengeSummary(challengeId, actor.sub, challenge.status);
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  /**
   * Create a room with 1 human (host at seat 0) and 3 bots.
   * The room is ready to start immediately (all seats filled).
   */
  private async createChallengeRoom(
    hostUserId: string,
    hostHandle: string,
    botDifficulty: BotDifficulty,
    roomSettings: import('@nanchang/shared').RoomSettings,
  ) {
    return this.rooms.createRoom(hostUserId, hostHandle, {
      settings: roomSettings,
      bots: { count: 3, difficulty: botDifficulty },
    });
  }
}
