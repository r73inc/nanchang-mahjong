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
import type { GameEvent, SeatWind, WinPaymentResult, WinType, HandType } from '@nanchang/engine';
import type {
  RoomSettings,
  HandRevealPayload,
  SettlementPreviewPayload,
  BotDifficulty,
} from '@nanchang/shared';
import type { ClaimAction } from '@nanchang/shared';
import type { IncomingClaim, Seat4 } from './claim-resolver';

export type { Seat4 };

/**
 * Data captured when a hand ends, held until the host clicks "Continue" on the
 * hand-reveal screen. Cleared by handleAdvanceHand().
 */
export interface PendingHandEnd {
  winnerSeat: Seat4 | null;
  result: 'win' | 'draw' | 'concede';
  payment?: WinPaymentResult;
  winType?: WinType;
  handType?: HandType;
  spiritDeltas: [number, number, number, number];
  nextDealerInfo: {
    dealerSeat: 0 | 1 | 2 | 3;
    roundWind: SeatWind;
    dealerChanged: boolean;
    roundComplete: boolean;
  };
  isLastHand: boolean;
}

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

  /** Display name at each seat index — player handle or bot-generated name. Immutable. */
  readonly seatNames: readonly [string, string, string, string];

  /** Pre-signed avatar URL at each seat index — null for bots and players without a photo. Immutable. */
  readonly seatAvatarUrls: readonly [string | null, string | null, string | null, string | null];

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

  /**
   * If this game was created as part of a Point Challenge, stores the challenge ID
   * so GameService can record the result when the session ends.
   */
  readonly challengeId?: string;

  /**
   * Pre-determined hand seeds for Point Challenge games.
   * When set, startNextHand() uses handSeeds[handsPlayed] instead of Math.random().
   * Indexed by hand index (0-based); generated deterministically from the challenge seed.
   */
  readonly handSeeds?: readonly number[];

  /**
   * Callback registered by ChallengesService when a challenge game is created.
   * Called by GameService.endSession() once the human player's final score is known.
   */
  onGameEnded?: (playerSub: string, finalScore: number) => Promise<void>;

  /**
   * Set of seat indices occupied by bots (derived from seatMap at construction time).
   * Used throughout GameService to decide whether to schedule async bot actions.
   */
  readonly botSeats: ReadonlySet<Seat4>;

  /**
   * Pre-game reveal sub-phase for the current hand.
   *   'dealing'    — awaiting manual dice rolls before deal() is called
   *   'hands'      — hands dealt, awaiting host to start reveals
   *   'settlement' — settlement tile preview shown (ruleTopBottomJing only)
   *   'jing'       — revealJing() called; wildcards visible; awaiting host to start game
   *   null         — game is in play (startTurn() has been called)
   */
  preGamePhase: 'dealing' | 'hands' | 'settlement' | 'jing' | null = 'dealing';

  /**
   * Set while a specific player must emit game:roll-dice to advance.
   * seed is stored server-side only (not sent to clients) for PRNG pre-computation.
   */
  pendingRoll: {
    purpose: 'deal_1' | 'deal_2' | 'jing_reveal';
    roller: Seat4;
    seed: number;
  } | null = null;

  /**
   * Pending hand-end state: set when a hand finishes, cleared when the host
   * clicks "Continue" on the hand-reveal screen.
   */
  pendingHandEnd: PendingHandEnd | null = null;

  /**
   * The most recent hand-reveal payload — re-sent to reconnecting players while
   * the session is paused at the hand-reveal screen.
   */
  lastHandReveal: HandRevealPayload | null = null;

  /**
   * The most recent settlement-preview payload — re-sent to reconnecting players
   * while the session is in the 'settlement' pre-game phase.
   */
  lastSettlementPreview: SettlementPreviewPayload | null = null;

  constructor(params: {
    engine: GameEngine;
    gameId: string;
    roomId: string;
    settings: RoomSettings;
    seatMap: [string, string, string, string];
    seatNames: [string, string, string, string];
    seatAvatarUrls: [string | null, string | null, string | null, string | null];
    startedAt: string;
    challengeId?: string;
    handSeeds?: readonly number[];
    onGameEnded?: (playerSub: string, finalScore: number) => Promise<void>;
  }) {
    this.engine = params.engine;
    this.gameId = params.gameId;
    this.roomId = params.roomId;
    this.settings = params.settings;
    this.seatMap = params.seatMap;
    this.seatNames = params.seatNames;
    this.seatAvatarUrls = params.seatAvatarUrls;
    this.startedAt = params.startedAt;
    this.challengeId = params.challengeId;
    this.handSeeds = params.handSeeds;
    this.onGameEnded = params.onGameEnded;

    this.userToSeat = new Map(params.seatMap.map((userId, i) => [userId, i as Seat4]));

    const startScore = params.settings.startingScore;
    this.cumulativeScores = [startScore, startScore, startScore, startScore];

    // Derive bot seats from the userId naming convention ('bot-<difficulty>-<seatIdx>').
    const bots = new Set<Seat4>();
    params.seatMap.forEach((userId, i) => {
      if (userId.startsWith('bot-')) bots.add(i as Seat4);
    });
    this.botSeats = bots;

    // Bots have no real socket but should appear "connected" so clients don't show
    // a reconnecting overlay for their seat.
    this.connState = [0, 1, 2, 3].map((i): ConnState => {
      const isBot = bots.has(i as Seat4);
      return { connected: isBot, lastSeenAt: Date.now(), afk: false };
    }) as [ConnState, ConnState, ConnState, ConnState];
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

  // ── Bot helpers ──────────────────────────────────────────────────────────────

  isBotSeat(seat: Seat4): boolean {
    return this.botSeats.has(seat);
  }

  /** Parse difficulty from userId string: 'bot-easy-N' → 'easy', 'bot-normal-N' → 'normal'. */
  getBotDifficulty(seat: Seat4): BotDifficulty {
    const userId = this.seatMap[seat];
    return userId.startsWith('bot-normal') ? 'normal' : 'easy';
  }

  get hasBots(): boolean {
    return this.botSeats.size > 0;
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
