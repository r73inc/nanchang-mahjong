import type { GameEvent, SeatWind } from './game.events';
import type { RoomSettings } from './room.schemas';

/**
 * Per-hand data stored in the replay JSON — everything needed to re-derive
 * every game state for that hand using replayHand() from @nanchang/engine.
 */
export interface ReplayHandData {
  seed: number;
  startingScores: [number, number, number, number];
  dealerSeat: 0 | 1 | 2 | 3;
  roundWind: SeatWind;
  /** Full ordered event log for this hand (all events from deal through end). */
  events: GameEvent[];
}

/**
 * Full replay payload returned by GET /replays/:id.
 * Stored as a single JSON blob in S3 on game end.
 */
export interface ReplayGamePayload {
  gameId: string;
  seatMap: [string, string, string, string];
  settings: RoomSettings;
  hands: ReplayHandData[];
  startedAt: string;
  endedAt: string;
  finalScores: [number, number, number, number];
  placement: [1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4];
  result: 'win' | 'draw' | 'concede' | 'bust';
}
