/**
 * ChallengesService — Point Challenge lifecycle management.
 *
 * Responsibilities:
 *  - Create a challenge record (with pre-derived hand seeds) and the creator's game.
 *  - Build challenge rooms (1 human + 3 bots) via RoomsService.
 *  - Record per-participant game results.
 *  - Enforce score visibility: participants cannot see other scores until they complete.
 *  - Determine the winner once all participants have finished or declined.
 *  - Send push invite notifications when the creator's game ends.
 *  - Expose challenge list and detail endpoints.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { deriveHandSeeds } from '@nanchang/engine';
import { BOT_PROFILES } from '@nanchang/shared';
import type { BotDifficulty, RoomSettings } from '@nanchang/shared';
import type {
  Challenge,
  ChallengeParticipant,
  ChallengeStatus,
  ChallengeSummary,
} from '@nanchang/shared';
import { DynamoDBService, DK } from '../database/dynamodb.service';
import { PushService } from '../push/push.service';
import type { CreateChallengeDto } from './dto/create-challenge.dto';

// Maximum number of hand seeds to pre-generate (4 rounds × 4 hands per round + generous buffer).
const MAX_HAND_SEEDS = 80;

/** Rounds config: numRounds → RoomSettings.rounds value */
const ROUNDS_MAP = {
  1: 'east',
  2: 'east+south',
  3: 'east+south+west',
  4: 'all',
} as const;

// ── DDB item shapes ───────────────────────────────────────────────────────────

interface ParticipantItem {
  sub: string;
  handle: string;
  role: 'creator' | 'challenged';
  status: 'pending' | 'accepted' | 'declined' | 'completed';
  gameId?: string;
  finalScore?: number;
  completedAt?: string;
}

interface ChallengeItem {
  PK: string;
  SK: 'META';
  challengeId: string;
  creatorSub: string;
  creatorHandle: string;
  seed: number;
  handSeeds: number[];
  config: {
    numRounds: 1 | 2 | 3 | 4;
    botDifficulty: BotDifficulty;
    startingScore: number;
    timerSecs: number;
    viewMode: '2D' | '3D';
    ruleTopBottomJing: boolean;
    claimWindowSecs: number;
  };
  challengedSubs: string[];
  participants: Record<string, ParticipantItem>;
  status: ChallengeStatus;
  winners?: string[];
  createdAt: string;
  completedAt?: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ChallengesService {
  private readonly logger = new Logger(ChallengesService.name);

  constructor(
    private readonly db: DynamoDBService,
    private readonly push: PushService,
  ) {}

  // ── Challenge creation ────────────────────────────────────────────────────

  /**
   * Create a challenge record and prepare the creator's game parameters.
   * Does NOT create the actual game session — that is done by ChallengesController
   * which calls GameService.createGame() with the returned challengeId + handSeeds.
   */
  async createChallenge(
    creatorSub: string,
    creatorHandle: string,
    dto: CreateChallengeDto,
  ): Promise<{ challengeId: string; handSeeds: readonly number[]; roomSettings: RoomSettings }> {
    if (dto.challengedSubs.includes(creatorSub)) {
      throw new BadRequestException('Cannot challenge yourself');
    }

    const challengeId = randomUUID();
    const now = new Date().toISOString();

    // Generate the challenge seed and pre-derive all hand seeds.
    const seed = (Math.random() * 0x7fff_ffff) >>> 0;
    const handSeeds = deriveHandSeeds(seed, MAX_HAND_SEEDS);

    // Build participant map (creator is 'accepted'; challenged players start 'pending').
    const participants: Record<string, ParticipantItem> = {
      [creatorSub]: {
        sub: creatorSub,
        handle: creatorHandle,
        role: 'creator',
        status: 'accepted',
      },
    };
    // We'll resolve handles for challenged friends in the controller from the friends service,
    // so store subs with placeholder handles for now; the controller patches handles in.
    for (const sub of dto.challengedSubs) {
      participants[sub] = {
        sub,
        handle: sub, // patched to real handle by controller
        role: 'challenged',
        status: 'pending',
      };
    }

    // Explicitly construct a plain object for the config (never store DTO class instances
    // in DynamoDB — the marshaler can't handle class-validator decorated class instances).
    const configPlain = {
      numRounds: dto.config.numRounds,
      botDifficulty: dto.config.botDifficulty,
      startingScore: dto.config.startingScore,
      timerSecs: dto.config.timerSecs,
      viewMode: dto.config.viewMode,
      ruleTopBottomJing: dto.config.ruleTopBottomJing,
      claimWindowSecs: dto.config.claimWindowSecs,
    };

    const challengeItem: ChallengeItem = {
      PK: `CHALLENGE#${challengeId}`,
      SK: 'META',
      challengeId,
      creatorSub,
      creatorHandle,
      seed,
      handSeeds: [...handSeeds], // plain array, not readonly
      config: configPlain,
      challengedSubs: [...dto.challengedSubs], // plain array
      participants,
      status: 'awaiting_creator',
      createdAt: now,
    };

    // Write challenge META + creator index item in one transaction.
    await this.db.transactWrite({
      TransactItems: [
        {
          Put: {
            TableName: this.db.tableName,
            Item: challengeItem,
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
        {
          Put: {
            TableName: this.db.tableName,
            Item: {
              ...DK.userChallengeIdx(creatorSub, now, challengeId),
              challengeId,
              role: 'creator',
              participantStatus: 'accepted',
              challengeStatus: 'awaiting_creator',
            },
          },
        },
      ],
    });

    const roomSettings: RoomSettings = {
      rounds: ROUNDS_MAP[dto.config.numRounds],
      terminationType: 'rounds',
      maxHands: 1,
      startingScore: dto.config.startingScore,
      timerSecs: dto.config.timerSecs,
      viewMode: dto.config.viewMode,
      ruleTopBottomJing: dto.config.ruleTopBottomJing,
      claimWindowSecs: dto.config.claimWindowSecs,
      isSolo: false,
    };

    this.logger.log(`Challenge created: ${challengeId} by ${creatorSub}`);
    return { challengeId, handSeeds, roomSettings };
  }

  /**
   * Patch the challenged subs' handles after the creator's friends list is resolved.
   * Called by the controller once friend handles are available.
   */
  async patchParticipantHandles(
    challengeId: string,
    handleMap: Record<string, string>,
  ): Promise<void> {
    const item = await this.getChallengeItem(challengeId);
    if (!item) return;

    const updates = Object.entries(handleMap)
      .filter(([sub]) => item.participants[sub])
      .map(([sub, handle]) => {
        item.participants[sub].handle = handle;
        return sub;
      });

    if (updates.length === 0) return;

    await this.db.update({
      Key: DK.challenge(challengeId),
      UpdateExpression: 'SET participants = :p',
      ExpressionAttributeValues: { ':p': item.participants },
    });
  }

  // ── Creator game completion ────────────────────────────────────────────────

  /**
   * Called by GameService.endSession() (via the onGameEnded callback) when the
   * creator completes their challenge game.
   *
   * Transitions challenge status from 'awaiting_creator' → 'open', writes the
   * creator's score, creates per-user index items for all challenged friends, and
   * sends push invites.
   */
  async recordCreatorResult(
    challengeId: string,
    creatorSub: string,
    finalScore: number,
    gameId: string,
  ): Promise<void> {
    const item = await this.getChallengeItem(challengeId);
    if (!item) {
      this.logger.error(`recordCreatorResult: challenge ${challengeId} not found`);
      return;
    }

    if (item.status !== 'awaiting_creator') {
      this.logger.warn(
        `recordCreatorResult: challenge ${challengeId} status=${item.status}, skipping`,
      );
      return;
    }

    const now = new Date().toISOString();
    const participant = item.participants[creatorSub];
    if (participant) {
      participant.status = 'completed';
      participant.finalScore = finalScore;
      participant.gameId = gameId;
      participant.completedAt = now;
    }

    // Transition to 'open' — challenged players can now start their games.
    // If there are no challenged players (shouldn't happen, but guard), close immediately.
    const hasChallengeable = item.challengedSubs.length > 0;
    const newStatus: ChallengeStatus = hasChallengeable ? 'open' : 'completed';

    await this.db.update({
      Key: DK.challenge(challengeId),
      UpdateExpression: 'SET #status = :s, participants = :p',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':s': newStatus,
        ':p': item.participants,
      },
    });

    // Create index items for all challenged friends so they can discover the challenge.
    if (hasChallengeable) {
      await Promise.all(
        item.challengedSubs.map((sub) =>
          this.db
            .put({
              Item: {
                ...DK.userChallengeIdx(sub, item.createdAt, challengeId),
                challengeId,
                role: 'challenged',
                participantStatus: 'pending',
                challengeStatus: 'open',
              },
            })
            .catch((err) =>
              this.logger.error(`Failed to write challenge index for ${sub}: ${err}`),
            ),
        ),
      );

      // Send push invites to challenged friends.
      await Promise.all(
        item.challengedSubs.map((sub) =>
          this.push
            .sendChallengeInviteNotification(sub, challengeId, item.creatorHandle)
            .catch((err) => this.logger.warn(`Push invite failed for ${sub}: ${err}`)),
        ),
      );
    }

    this.logger.log(`Challenge ${challengeId}: creator result recorded, status → ${newStatus}`);
  }

  /**
   * Called by GameService.endSession() for challenged participants.
   * Records their score; if all participants are done, finalises the challenge.
   */
  async recordParticipantResult(
    challengeId: string,
    playerSub: string,
    finalScore: number,
    gameId: string,
  ): Promise<void> {
    const item = await this.getChallengeItem(challengeId);
    if (!item) {
      this.logger.error(`recordParticipantResult: challenge ${challengeId} not found`);
      return;
    }

    const participant = item.participants[playerSub];
    if (!participant) {
      this.logger.warn(`recordParticipantResult: ${playerSub} not in challenge ${challengeId}`);
      return;
    }

    const now = new Date().toISOString();
    participant.status = 'completed';
    participant.finalScore = finalScore;
    participant.gameId = gameId;
    participant.completedAt = now;

    // Check if all participants have finished or declined.
    const allDone = Object.values(item.participants).every(
      (p) => p.status === 'completed' || p.status === 'declined',
    );

    let newStatus: ChallengeStatus = item.status;
    let winners: string[] | undefined;
    let completedAt: string | undefined;

    if (allDone) {
      newStatus = 'completed';
      completedAt = now;
      winners = this.determineWinners(item.participants);
    }

    const updateExpr = allDone
      ? 'SET participants = :p, #status = :s, winners = :w, completedAt = :ca'
      : 'SET participants = :p';
    const exprValues: Record<string, unknown> = { ':p': item.participants };
    if (allDone) {
      exprValues[':s'] = newStatus;
      exprValues[':w'] = winners;
      exprValues[':ca'] = completedAt;
    }

    await this.db.update({
      Key: DK.challenge(challengeId),
      UpdateExpression: updateExpr,
      ...(allDone ? { ExpressionAttributeNames: { '#status': 'status' } } : {}),
      ExpressionAttributeValues: exprValues,
    });

    // Update participant's own index item.
    await this.db
      .update({
        Key: DK.userChallengeIdx(playerSub, item.createdAt, challengeId),
        UpdateExpression: 'SET participantStatus = :ps, challengeStatus = :cs',
        ExpressionAttributeValues: {
          ':ps': 'completed',
          ':cs': newStatus,
        },
      })
      .catch((err) => this.logger.warn(`Index update failed for ${playerSub}: ${err}`));

    this.logger.log(`Challenge ${challengeId}: participant ${playerSub} result recorded`);
  }

  /**
   * Generic result recorder for restored sessions that don't have an onGameEnded callback.
   * Inspects the challenge record to determine whether to call creator or participant logic.
   */
  async recordGameResult(
    challengeId: string,
    playerSub: string,
    finalScore: number,
    gameId: string,
  ): Promise<void> {
    const item = await this.getChallengeItem(challengeId);
    if (!item) {
      this.logger.error(`recordGameResult: challenge ${challengeId} not found`);
      return;
    }
    const participant = item.participants[playerSub];
    if (!participant) {
      this.logger.warn(`recordGameResult: ${playerSub} not in challenge ${challengeId}`);
      return;
    }
    if (participant.role === 'creator') {
      await this.recordCreatorResult(challengeId, playerSub, finalScore, gameId);
    } else {
      await this.recordParticipantResult(challengeId, playerSub, finalScore, gameId);
    }
  }

  // ── Prepare challenge game for a participant ──────────────────────────────

  /**
   * Validate that a participant can start their challenge game and return the
   * hand seeds and room settings they need.
   */
  async prepareParticipantGame(
    challengeId: string,
    playerSub: string,
  ): Promise<{
    handSeeds: readonly number[];
    roomSettings: RoomSettings;
    botDifficulty: BotDifficulty;
    challengeId: string;
    numRounds: number;
    onGameEnded: (playerSub: string, finalScore: number, gameId: string) => Promise<void>;
  }> {
    const item = await this.getChallengeItem(challengeId);
    if (!item) throw new NotFoundException('Challenge not found');

    const participant = item.participants[playerSub];
    if (!participant) throw new ForbiddenException('You are not a participant in this challenge');

    if (participant.status === 'declined')
      throw new BadRequestException('You have declined this challenge');

    if (participant.status === 'completed')
      throw new BadRequestException('You have already completed this challenge');

    // Already started but not finished — client should resume the existing game.
    if (participant.status === 'accepted' && participant.gameId) {
      throw new BadRequestException(
        JSON.stringify({ code: 'GAME_IN_PROGRESS', gameId: participant.gameId }),
      );
    }

    if (item.status === 'awaiting_creator')
      throw new BadRequestException('The challenge creator has not completed their game yet');

    if (item.status === 'completed' || item.status === 'cancelled')
      throw new BadRequestException('This challenge is no longer active');

    const roomSettings: RoomSettings = {
      rounds: ROUNDS_MAP[item.config.numRounds],
      terminationType: 'rounds',
      maxHands: 1,
      startingScore: item.config.startingScore,
      timerSecs: item.config.timerSecs,
      viewMode: item.config.viewMode,
      ruleTopBottomJing: item.config.ruleTopBottomJing,
      claimWindowSecs: item.config.claimWindowSecs,
      isSolo: false,
    };

    const onGameEnded = async (sub: string, finalScore: number, gameId: string) => {
      await this.recordParticipantResult(challengeId, sub, finalScore, gameId);
    };

    return {
      handSeeds: item.handSeeds,
      roomSettings,
      botDifficulty: item.config.botDifficulty,
      challengeId,
      numRounds: item.config.numRounds,
      onGameEnded,
    };
  }

  /**
   * Record that a challenged participant has started their game.
   * Transitions status pending → accepted and stores the gameId so they can resume.
   */
  async markParticipantGameStarted(
    challengeId: string,
    playerSub: string,
    gameId: string,
  ): Promise<void> {
    const item = await this.getChallengeItem(challengeId);
    if (!item) return;

    const participant = item.participants[playerSub];
    if (!participant || participant.status !== 'pending') return;

    participant.status = 'accepted';
    participant.gameId = gameId;

    await this.db.update({
      Key: DK.challenge(challengeId),
      UpdateExpression: 'SET participants = :p',
      ExpressionAttributeValues: { ':p': item.participants },
    });

    await this.db
      .update({
        Key: DK.userChallengeIdx(playerSub, item.createdAt, challengeId),
        UpdateExpression: 'SET participantStatus = :ps',
        ExpressionAttributeValues: { ':ps': 'accepted' },
      })
      .catch((err) => this.logger.warn(`Index update for started ${playerSub}: ${err}`));
  }

  // ── Decline ───────────────────────────────────────────────────────────────

  async declineChallenge(challengeId: string, playerSub: string): Promise<void> {
    const item = await this.getChallengeItem(challengeId);
    if (!item) throw new NotFoundException('Challenge not found');

    const participant = item.participants[playerSub];
    if (!participant) throw new ForbiddenException('You are not a participant in this challenge');
    if (participant.role === 'creator')
      throw new BadRequestException('The creator cannot decline their own challenge');
    if (participant.status !== 'pending')
      throw new BadRequestException('Challenge already responded to');

    participant.status = 'declined';

    const allDone = Object.values(item.participants).every(
      (p) => p.status === 'completed' || p.status === 'declined',
    );

    // If all challenged players declined (creator already completed), cancel/complete.
    const nonCreators = Object.values(item.participants).filter((p) => p.role !== 'creator');
    const allNonCreatorsDeclined = nonCreators.every((p) => p.status === 'declined');

    let newStatus: ChallengeStatus = item.status;
    let winners: string[] | undefined;
    let completedAt: string | undefined;
    const now = new Date().toISOString();

    if (allNonCreatorsDeclined) {
      // All challenged players declined — cancel.
      newStatus = 'cancelled';
      completedAt = now;
    } else if (allDone) {
      newStatus = 'completed';
      completedAt = now;
      winners = this.determineWinners(item.participants);
    }

    await this.db.update({
      Key: DK.challenge(challengeId),
      UpdateExpression:
        allDone || allNonCreatorsDeclined
          ? 'SET participants = :p, #status = :s, completedAt = :ca'
          : 'SET participants = :p',
      ...(allDone || allNonCreatorsDeclined
        ? { ExpressionAttributeNames: { '#status': 'status' } }
        : {}),
      ExpressionAttributeValues: {
        ':p': item.participants,
        ...(allDone || allNonCreatorsDeclined ? { ':s': newStatus, ':ca': completedAt } : {}),
        ...(winners ? { ':w': winners } : {}),
      },
    });

    // Update player's index item.
    await this.db
      .update({
        Key: DK.userChallengeIdx(playerSub, item.createdAt, challengeId),
        UpdateExpression: 'SET participantStatus = :ps, challengeStatus = :cs',
        ExpressionAttributeValues: {
          ':ps': 'declined',
          ':cs': newStatus,
        },
      })
      .catch((err) => this.logger.warn(`Index update for declined ${playerSub}: ${err}`));
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  /**
   * List all challenges for a user (created + received).
   * Returns summaries sorted newest-first.
   */
  async listChallenges(playerSub: string): Promise<ChallengeSummary[]> {
    const res = await this.db.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': `USER#${playerSub}`,
        ':prefix': 'CHALLENGE#',
      },
      ScanIndexForward: false, // newest first
    });

    const indexItems = (res.Items ?? []) as Array<{
      challengeId: string;
      role: 'creator' | 'challenged';
      participantStatus: string;
      challengeStatus: string;
    }>;

    if (indexItems.length === 0) return [];

    // Fetch full challenge records in parallel.
    const challenges = await Promise.all(
      indexItems.map(async (idx) => {
        const item = await this.getChallengeItem(idx.challengeId);
        if (!item) return null;
        const completedCount = Object.values(item.participants).filter(
          (p) => p.status === 'completed',
        ).length;
        const myStatus = item.participants[playerSub]?.status ?? 'pending';
        return {
          challengeId: item.challengeId,
          creatorHandle: item.creatorHandle,
          config: item.config,
          status: item.status,
          participantCount: Object.keys(item.participants).length,
          completedCount,
          myStatus,
          createdAt: item.createdAt,
        } satisfies ChallengeSummary;
      }),
    );

    return challenges.filter((c): c is ChallengeSummary => c !== null);
  }

  /**
   * Get full challenge detail for a participant.
   * Score visibility: finalScore values are hidden for other participants unless
   * the requesting player has already completed their own game (or challenge is complete).
   */
  async getChallenge(challengeId: string, playerSub: string): Promise<Challenge> {
    const item = await this.getChallengeItem(challengeId);
    if (!item) throw new NotFoundException('Challenge not found');

    const myParticipant = item.participants[playerSub];
    if (!myParticipant) throw new ForbiddenException('You are not a participant in this challenge');

    const myCompleted = myParticipant.status === 'completed' || item.status === 'completed';

    // Build the participants list in a randomised order (to avoid leaking rank info
    // while other players haven't yet finished). Randomise within pending/completed groups.
    const participantList = Object.values(item.participants);
    const withScores = myCompleted;

    const mapped: ChallengeParticipant[] = participantList.map((p) => ({
      sub: p.sub,
      handle: p.handle,
      role: p.role,
      status: p.status,
      gameId: p.gameId,
      finalScore: withScores ? p.finalScore : undefined,
      completedAt: withScores ? p.completedAt : undefined,
    }));

    // Shuffle so pending-viewer can't infer from order.
    if (!withScores) {
      for (let i = mapped.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [mapped[i], mapped[j]] = [mapped[j], mapped[i]];
      }
    } else {
      // When scores are visible, sort by finalScore desc (nulls last).
      mapped.sort((a, b) => {
        if (a.finalScore === undefined && b.finalScore === undefined) return 0;
        if (a.finalScore === undefined) return 1;
        if (b.finalScore === undefined) return -1;
        return b.finalScore - a.finalScore;
      });
    }

    return {
      challengeId: item.challengeId,
      creatorHandle: item.creatorHandle,
      config: item.config,
      participants: mapped,
      status: item.status,
      winners: item.winners,
      createdAt: item.createdAt,
      completedAt: item.completedAt,
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async getChallengeItem(challengeId: string): Promise<ChallengeItem | null> {
    const res = await this.db.get({ Key: DK.challenge(challengeId) });
    return (res.Item as ChallengeItem | undefined) ?? null;
  }

  private determineWinners(participants: Record<string, ParticipantItem>): string[] {
    const completed = Object.values(participants).filter(
      (p) => p.status === 'completed' && p.finalScore !== undefined,
    );
    if (completed.length === 0) return [];
    const maxScore = Math.max(...completed.map((p) => p.finalScore!));
    return completed.filter((p) => p.finalScore === maxScore).map((p) => p.sub);
  }

  /** Build a RoomSettings object from challenge config for bot room creation. */
  buildRoomSettings(config: ChallengeItem['config']): RoomSettings {
    return {
      rounds: ROUNDS_MAP[config.numRounds],
      terminationType: 'rounds',
      maxHands: 1,
      startingScore: config.startingScore,
      timerSecs: config.timerSecs,
      viewMode: config.viewMode,
      ruleTopBottomJing: config.ruleTopBottomJing,
      claimWindowSecs: config.claimWindowSecs,
      isSolo: false,
    };
  }

  /** Get the raw challenge item for internal use by the controller. */
  async getChallengeForController(challengeId: string): Promise<ChallengeItem | null> {
    return this.getChallengeItem(challengeId);
  }

  /** Get BOT_PROFILES for random bot seat assignment (shuffled). */
  getShuffledBotProfiles() {
    return [...BOT_PROFILES].sort(() => Math.random() - 0.5);
  }
}
