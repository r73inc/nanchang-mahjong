/**
 * Save/load game types shared between the API and web app.
 *
 * Two save slots per user:
 *  - 'auto'   — written automatically when the last human disconnects from a
 *               bot game (1 human + 3 bots, including challenge games).
 *  - 'manual' — written when the host triggers "Save & Quit" from the menu.
 *               Any game configuration is eligible.
 *
 * Each slot holds at most one save; writing to an occupied slot overwrites it.
 */

import type { GameState, GameEvent, SeatWind } from './game.events';
import type { RoomSettings } from './room.schemas';

export type SaveSlot = 'auto' | 'manual';

/** Per-hand metadata needed to reconstruct the replay, mirrored from GameSession. */
export interface SavedHandMeta {
  seed: number;
  startingScores: [number, number, number, number];
  dealerSeat: 0 | 1 | 2 | 3;
  roundWind: SeatWind;
  eventStartIdx: number;
}

/**
 * Full serialized save record — written to DynamoDB and read back on restore.
 * Stored at USER#<userId>/SAVE#AUTO or USER#<userId>/SAVE#MANUAL.
 */
export interface GameSaveData {
  saveId: string;
  slot: SaveSlot;
  savedAt: number;

  /** Original game/room identifiers (informational only after save). */
  gameId: string;
  roomId: string;

  /** Room configuration used to recreate the session. */
  settings: RoomSettings;

  /** userId of the player who is considered "host" of the saved game. */
  hostUserId: string;

  /** userId at each seat index; bots use the 'bot-<difficulty>-<seat>' convention. */
  seatMap: [string, string, string, string];
  seatNames: [string, string, string, string];
  seatAvatarUrls: [string | null, string | null, string | null, string | null];

  /** Full serialized engine state at the moment the game was saved. */
  engineState: GameState;

  /** Running totals at time of save. */
  cumulativeScores: [number, number, number, number];
  sessionSpiritPoints: [number, number, number, number];
  sessionBonusTilePoints: [number, number, number, number];
  handsWon: [number, number, number, number];
  bestHandPoints: [number, number, number, number];
  handsPlayed: number;

  /** Full move log preserved for replay after game completion. */
  moveLog: GameEvent[];
  handLog: SavedHandMeta[];

  /** Challenge metadata — present only for Point Challenge games. */
  challengeId?: string;
  handSeeds?: number[];
  targetHands?: number;

  /**
   * Session-level state needed to resume exactly where the game was paused.
   * preGamePhase is the hand-reveal sub-phase; null means the game was mid-play.
   */
  preGamePhase: 'dealing' | 'hands' | 'settlement' | 'jing' | null;
  pendingRoll: {
    purpose: 'deal_1' | 'deal_2' | 'jing_reveal';
    roller: 0 | 1 | 2 | 3;
    seed: number;
  } | null;

  /**
   * For manual saves: the set of userIds (human players) allowed to rejoin.
   * Only these players can enter the restore room. Bots are auto-filled.
   */
  allowedPlayerSubs: string[];

  /**
   * For manual saves: the room code of the pending restore room.
   * Set when the host loads the save (POST /saves/manual/load).
   * Null/absent until the host initiates the restore.
   */
  restoreRoomCode?: string;
}

/**
 * Summary of a save slot — returned by GET /saves for display on the home page.
 * Does not include the full engine state or move log.
 */
export interface SaveSlotInfo {
  slot: SaveSlot;
  saveId: string;
  savedAt: number;
  seatNames: [string, string, string, string];
  handsPlayed: number;
  cumulativeScores: [number, number, number, number];
  settings: Pick<RoomSettings, 'rounds' | 'terminationType' | 'startingScore'>;
  challengeId?: string;
  /** Populated once the host has loaded the manual save and a restore room exists. */
  restoreRoomCode?: string;
}
