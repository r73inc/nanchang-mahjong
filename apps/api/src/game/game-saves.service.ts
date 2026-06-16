/**
 * GameSavesService — serialize and persist game sessions to DynamoDB save slots.
 *
 * Each user has two save slots:
 *  - AUTO  — written automatically when the last human disconnects from a bot game.
 *  - MANUAL — written by the host via "Save & Quit" from the game menu.
 *
 * Both slots hold at most one save; writing overwrites the previous entry.
 * The full GameState (engine snapshot) plus session metadata is serialized as a
 * DynamoDB attribute, making the record self-contained for restoration.
 */

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DynamoDBService, DK } from '../database/dynamodb.service';
import type { GameSaveData, SaveSlot, SaveSlotInfo } from '@nanchang/shared';
import type { GameSession, Seat4 } from './game-session';

// TTL: saves expire after 30 days.
const SAVE_TTL_DAYS = 30;

@Injectable()
export class GameSavesService {
  private readonly logger = new Logger(GameSavesService.name);

  constructor(private readonly db: DynamoDBService) {}

  // ── Serialization ────────────────────────────────────────────────────────────

  /** Serialize a live GameSession into a GameSaveData record. */
  private serialize(session: GameSession, slot: SaveSlot, hostUserId: string): GameSaveData {
    const allowedPlayerSubs = ([0, 1, 2, 3] as Seat4[])
      .filter((i) => !session.isBotSeat(i))
      .map((i) => session.seatMap[i]);

    // Use JSON round-trip to strip class-instance prototypes before DynamoDB
    // marshaling — the AWS SDK throws on non-POJO values (see BUG-051).
    const engineState = JSON.parse(
      JSON.stringify(session.engine.state),
    ) as typeof session.engine.state;
    const settings = JSON.parse(JSON.stringify(session.settings)) as typeof session.settings;

    return {
      saveId: randomUUID(),
      slot,
      savedAt: Date.now(),
      gameId: session.gameId,
      roomId: session.roomId,
      settings,
      hostUserId,
      seatMap: [...session.seatMap] as [string, string, string, string],
      seatNames: [...session.seatNames] as [string, string, string, string],
      seatAvatarUrls: [...session.seatAvatarUrls] as [
        string | null,
        string | null,
        string | null,
        string | null,
      ],
      engineState,
      cumulativeScores: [...session.cumulativeScores] as [number, number, number, number],
      sessionSpiritPoints: [...session.sessionSpiritPoints] as [number, number, number, number],
      sessionBonusTilePoints: [...session.sessionBonusTilePoints] as [
        number,
        number,
        number,
        number,
      ],
      handsWon: [...session.handsWon] as [number, number, number, number],
      bestHandPoints: [...session.bestHandPoints] as [number, number, number, number],
      handsPlayed: session.handsPlayed,
      moveLog: [...session.moveLog],
      handLog: session.handLog.map((h) => ({ ...h })),
      challengeId: session.challengeId,
      handSeeds: session.handSeeds ? [...session.handSeeds] : undefined,
      targetHands: session.targetHands,
      preGamePhase: session.preGamePhase,
      pendingRoll: session.pendingRoll ? { ...session.pendingRoll } : null,
      allowedPlayerSubs,
    };
  }

  // ── Write ────────────────────────────────────────────────────────────────────

  /**
   * Auto-save a bot game for the sole human player.
   * Called just before destroySession() when all humans disconnect.
   */
  async saveAuto(session: GameSession, humanSub: string): Promise<void> {
    const save = this.serialize(session, 'auto', humanSub);
    await this.writeSave(humanSub, 'auto', save);
    this.logger.log(`Auto-saved game ${session.gameId} for user ${humanSub}`);
  }

  /**
   * Manual save — triggered by the host via game:save-and-quit.
   * Stored under the host's partition. All human subs are recorded in
   * allowedPlayerSubs so they can join the restore room later.
   */
  async saveManual(session: GameSession, hostSub: string): Promise<GameSaveData> {
    const save = this.serialize(session, 'manual', hostSub);
    await this.writeSave(hostSub, 'manual', save);
    this.logger.log(`Manual save ${save.saveId} for game ${session.gameId} by host ${hostSub}`);
    return save;
  }

  private async writeSave(userSub: string, slot: SaveSlot, save: GameSaveData): Promise<void> {
    const ttl = Math.floor(Date.now() / 1000) + SAVE_TTL_DAYS * 86_400;
    await this.db.put({
      Item: {
        ...DK.userSave(userSub, slot),
        ...save,
        ttl,
      },
    });
  }

  // ── Read ─────────────────────────────────────────────────────────────────────

  async getSave(userSub: string, slot: SaveSlot): Promise<GameSaveData | null> {
    const res = await this.db.get({ Key: DK.userSave(userSub, slot) });
    return (res?.Item as GameSaveData | undefined) ?? null;
  }

  /** Return summary info for both save slots (omitting bulky engineState/moveLog). */
  async listSaves(userSub: string): Promise<SaveSlotInfo[]> {
    const [auto, manual] = await Promise.all([
      this.getSave(userSub, 'auto'),
      this.getSave(userSub, 'manual'),
    ]);

    const toInfo = (save: GameSaveData): SaveSlotInfo => ({
      slot: save.slot,
      saveId: save.saveId,
      savedAt: save.savedAt,
      seatNames: save.seatNames,
      handsPlayed: save.handsPlayed,
      cumulativeScores: save.cumulativeScores,
      settings: {
        rounds: save.settings.rounds,
        terminationType: save.settings.terminationType,
        startingScore: save.settings.startingScore,
      },
      challengeId: save.challengeId,
      restoreRoomCode: save.restoreRoomCode,
    });

    const result: SaveSlotInfo[] = [];
    if (auto) result.push(toInfo(auto));
    if (manual) result.push(toInfo(manual));
    return result;
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  async deleteSave(userSub: string, slot: SaveSlot): Promise<void> {
    await this.db.delete({ Key: DK.userSave(userSub, slot) });
  }

  // ── Restore room code ────────────────────────────────────────────────────────

  /** Persist the restore room code into the manual save record. */
  async setRestoreRoomCode(hostSub: string, code: string): Promise<void> {
    await this.db.update({
      Key: DK.userSave(hostSub, 'manual'),
      UpdateExpression: 'SET restoreRoomCode = :code',
      ExpressionAttributeValues: { ':code': code },
    });
  }
}
