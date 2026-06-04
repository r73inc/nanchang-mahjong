/**
 * GameSession — per-game in-memory wrapper.
 *
 * Holds:
 *  - The authoritative GameEngine instance (swapped on each move)
 *  - seat ↔ userId mapping (4 players, fixed for the session)
 *  - socketId ↔ userId mapping (changes on reconnect)
 *  - Per-seat connection state { connected, lastSeenAt, afk }
 *  - Spectator tracking
 *  - Claim window state (eligibility + submitted claims)
 *  - Rob-kong window state
 *  - Active timers (claim window, AFK)
 *  - Cumulative scores across multiple hands
 *  - Full move log (in-memory; Phase 9 will serialize to S3)
 *
 * GameSession is a pure data class with no I/O. All game logic and emitting
 * is handled by GameService.
 */

import { GameEngine } from '@nanchang/engine';
import type { GameEvent, SeatWind } from '@nanchang/engine';
import type { RoomSettings } from '@nanchang/shared';
import type { ClaimAction } from '@nanchang/shared';
import type { IncomingClaim, Seat4 } from './claim-resolver';

export type { Seat4 };

/** Metadata for one hand within a session — needed to reconstruct replay. */
export interface HandMeta {
  seed: number;
  startingScores: [number, number, number, number];
  dealerSeat: 0 | 1 | 2 | 3;
  roundWind: SeatWind;
  /** Inclusive start index into session.moveLog for this hand's events. */
  eventStartIdx: number;
}

export interface ConnState {
  connected: boolean;
  lastSeenAt: number;
  afk: boolean;
  socketId?: string;
}

export interface ClaimWindowState {
  /** Seats that have ≥1 eligible claim action. */
  eligibleSeats: Set<Seat4>;
  /** Available actions per eligible seat. */
  actionsPerSeat: Map<Seat4, ClaimAction[]>;
  /** Claims submitted so far. */
  claims: Map<Seat4, IncomingClaim>;
  /** Seats that have explicitly passed. */
  passedSeats: Set<Seat4>;
  /** Timer deadline (epoch ms). */
  deadline: number;
  /** True if this is a rob-kong window (win-only claims). */
  isRobKong: boolean;
  /** The seat that added-to-kong (only relevant when isRobKong = true). */
  kongSeat?: Seat4;
}

export class GameSession {
  /** The current hand's authoritative engine instance (replaced after each move). */
  engine: GameEngine;

  readonly gameId: string;
  readonly roomId: string;
  readonly settings: RoomSettings;

  /** userId at each seat index. Immutable for the session lifetime. */
  readonly seatMap: [string, string, string, string];

  /** userId → seat index (derived from seatMap, for O(1) lookup). */
  readonly userToSeat: Map<string, Seat4>;

  /** socketId → userId (changes on reconnect). */
  readonly socketToUser = new Map<string, string>();

  /** userId → socketId (reverse of above). */
  readonly userToSocket = new Map<string, string>();

  /** Set of userIds who are spectating (not in seatMap). */
  readonly spectators = new Set<string>();

  /** Per-seat connection state. */
  connState: [ConnState, ConnState, ConnState, ConnState];

  /**
   * Running cumulative scores across all hands.
   * Initialized from settings.startingScore.
   * Updated after each hand's win payment + spirit settlement.
   */
  cumulativeScores: [number, number, number, number];

  /** Number of complete hands played so far. */
  handsPlayed = 0;

  /** Full ordered move log (all hands). Serialized to S3 on game end. */
  readonly moveLog: GameEvent[] = [];

  /** Per-hand metadata for replay assembly. One entry per hand played. */
  readonly handLog: HandMeta[] = [];

  /** Active claim/rob-kong window state (null when no window is open). */
  claimWindow: ClaimWindowState | null = null;

  /** Claim window expiry timer. */
  claimTimer?: ReturnType<typeof setTimeout>;

  /** Per-seat AFK timers. Cleared on any seat activity. */
  afkTimers: [
    ReturnType<typeof setTimeout> | undefined,
    ReturnType<typeof setTimeout> | undefined,
    ReturnType<typeof setTimeout> | undefined,
    ReturnType<typeof setTimeout> | undefined,
  ] = [undefined, undefined, undefined, undefined];

  /** Scheduled session teardown (runs briefly after game:ended so rematch hooks can fire). */
  teardownTimer?: ReturnType<typeof setTimeout>;

  readonly startedAt: string;

  constructor(params: {
    engine: GameEngine;
    gameId: string;
    roomId: string;
    settings: RoomSettings;
    seatMap: [string, string, string, string];
    startedAt: string;
  }) {
    this.engine = params.engine;
    this.gameId = params.gameId;
    this.roomId = params.roomId;
    this.settings = params.settings;
    this.seatMap = params.seatMap;
    this.startedAt = params.startedAt;

    this.userToSeat = new Map(params.seatMap.map((userId, i) => [userId, i as Seat4]));

    const startScore = params.settings.startingScore;
    this.cumulativeScores = [startScore, startScore, startScore, startScore];

    this.connState = [0, 1, 2, 3].map(
      (): ConnState => ({ connected: false, lastSeenAt: Date.now(), afk: false }),
    ) as [ConnState, ConnState, ConnState, ConnState];
  }

  // ── Player identity helpers ──────────────────────────────────────────────────

  getSeat(userId: string): Seat4 | undefined {
    return this.userToSeat.get(userId);
  }

  isPlayer(userId: string): boolean {
    return this.userToSeat.has(userId);
  }

  isSpectator(userId: string): boolean {
    return this.spectators.has(userId);
  }

  // ── Connection management ────────────────────────────────────────────────────

  connectPlayer(socketId: string, userId: string): void {
    // Clear stale reverse mapping if the same user reconnects with a new socket
    const oldSocket = this.userToSocket.get(userId);
    if (oldSocket && oldSocket !== socketId) {
      this.socketToUser.delete(oldSocket);
    }

    this.socketToUser.set(socketId, userId);
    this.userToSocket.set(userId, socketId);

    const seat = this.getSeat(userId);
    if (seat !== undefined) {
      this.connState[seat] = {
        connected: true,
        lastSeenAt: Date.now(),
        afk: false,
        socketId,
      };
    }
  }

  connectSpectator(socketId: string, userId: string): void {
    this.spectators.add(userId);
    this.socketToUser.set(socketId, userId);
    this.userToSocket.set(userId, socketId);
  }

  /**
   * Deregister a socket on disconnect.
   * Returns the userId that owned it (or undefined if unknown).
   */
  disconnect(socketId: string): string | undefined {
    const userId = this.socketToUser.get(socketId);
    if (!userId) return undefined;

    this.socketToUser.delete(socketId);

    // Only clear userToSocket if it still points to this socket (guard against race
    // where reconnect has already registered a new socket for the same user).
    if (this.userToSocket.get(userId) === socketId) {
      this.userToSocket.delete(userId);
    }

    const seat = this.getSeat(userId);
    if (seat !== undefined) {
      this.connState[seat] = {
        ...this.connState[seat],
        connected: false,
        lastSeenAt: Date.now(),
        socketId: undefined,
      };
    }

    return userId;
  }

  setAfk(seat: Seat4, afk: boolean): void {
    this.connState[seat] = { ...this.connState[seat], afk };
  }

  /** Update lastSeenAt and clear AFK flag on any seat activity. */
  touch(seat: Seat4): void {
    this.connState[seat] = {
      ...this.connState[seat],
      lastSeenAt: Date.now(),
      afk: false,
    };
  }

  // ── Computed helpers ─────────────────────────────────────────────────────────

  get allConnected(): boolean {
    return this.connState.every((c) => c.connected);
  }

  socketIdForSeat(seat: Seat4): string | undefined {
    return this.userToSocket.get(this.seatMap[seat]);
  }

  /** All socketIds currently tracked by this session (players + spectators). */
  allSocketIds(): string[] {
    return [...this.socketToUser.keys()];
  }

  // ── Claim window helpers ─────────────────────────────────────────────────────

  openClaimWindow(
    eligibleSeats: Set<Seat4>,
    actionsPerSeat: Map<Seat4, ClaimAction[]>,
    deadlineSecs: number,
    opts: { isRobKong: boolean; kongSeat?: Seat4 } = { isRobKong: false },
  ): void {
    this.claimWindow = {
      eligibleSeats,
      actionsPerSeat,
      claims: new Map(),
      passedSeats: new Set(),
      deadline: Date.now() + deadlineSecs * 1000,
      isRobKong: opts.isRobKong,
      kongSeat: opts.kongSeat,
    };
  }

  closeClaimWindow(): ClaimWindowState | null {
    const w = this.claimWindow;
    this.claimWindow = null;
    if (this.claimTimer) {
      clearTimeout(this.claimTimer);
      this.claimTimer = undefined;
    }
    return w;
  }

  /**
   * True when all eligible seats have either claimed or passed
   * (claim window can close early).
   */
  get claimWindowComplete(): boolean {
    const w = this.claimWindow;
    if (!w) return false;
    for (const seat of w.eligibleSeats) {
      if (!w.claims.has(seat) && !w.passedSeats.has(seat)) return false;
    }
    return true;
  }

  // ── AFK timer helpers ─────────────────────────────────────────────────────────

  clearAfkTimers(): void {
    for (let i = 0; i < 4; i++) {
      const t = this.afkTimers[i as Seat4];
      if (t !== undefined) clearTimeout(t);
      this.afkTimers[i as Seat4] = undefined;
    }
  }

  clearAfkTimer(seat: Seat4): void {
    const t = this.afkTimers[seat];
    if (t !== undefined) {
      clearTimeout(t);
      this.afkTimers[seat] = undefined;
    }
  }
}
