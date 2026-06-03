import { z } from 'zod';

// ── Room types ────────────────────────────────────────────────────────────────

export type RoomStatus = 'waiting' | 'playing' | 'finished';

export const RoomSettingsSchema = z.object({
  rounds: z.enum(['east', 'east+south']).default('east+south'),
  timerSecs: z.number().int().min(5).max(30).default(8),
  minFan: z.number().int().min(1).max(8).default(3),
});
export type RoomSettings = z.infer<typeof RoomSettingsSchema>;

export interface RoomSeat {
  seatIdx: number;
  userId: string | null;
  handle: string | null;
  displayName: string | null;
  ready: boolean;
  isHost: boolean;
}

export interface RoomState {
  roomId: string;
  code: string;
  hostUserId: string;
  status: RoomStatus;
  seats: RoomSeat[];
  settings: RoomSettings;
  createdAt: string;
  gameId?: string;
}

// ── REST DTOs ─────────────────────────────────────────────────────────────────

export const CreateRoomSchema = z.object({
  settings: RoomSettingsSchema.optional(),
});
export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;

export const JoinRoomSchema = z.object({
  code: z.string().min(1, 'Room code is required'),
});
export type JoinRoomInput = z.infer<typeof JoinRoomSchema>;

// ── Socket events ─────────────────────────────────────────────────────────────

/** Client → Server */
export interface WsSubscribePayload {
  roomId: string;
}

/** Server → Client: broadcast on any room state change */
export interface WsRoomUpdatePayload {
  room: RoomState;
}

/** Server → Client: broadcast when the host starts the game */
export interface WsRoomStartedPayload {
  roomId: string;
  gameId: string;
}

/** Server → Client: connection or room-state error */
export interface WsRoomErrorPayload {
  code: string;
  message: string;
}
