/**
 * GameService — authoritative game session registry and turn-loop orchestrator.
 *
 * Responsibilities:
 *  - Create / look up / tear down GameSession instances (in-memory registry).
 *  - Drive the turn loop: discard → claim window → resolve → next seat.
 *  - Manage the rob-kong window.
 *  - AFK detection: emit game:afk-warning after 20s idle (no forced action, D4).
 *  - Claim window: 8s expiry timer; resolve on expiry or when all eligible seats respond.
 *  - Emit all S→C events (requires a Server reference set by GameGateway.afterInit).
 *  - Milestone DDB persistence: create, hand-end, session-end.
 *  - Spirit settlement after each hand.
 *  - Multi-hand session management (nextDealer, cumulative scores, bust/rounds check).
 */

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Server, Socket } from 'socket.io';
import { GameEngine, nextDealer, calculateSpiritSettlement } from '@nanchang/engine';
import type { TileType, SeatWind, WinType, WinPaymentResult } from '@nanchang/engine';
import type { RoomSettings, GameEndedPayload } from '@nanchang/shared';
import type { PublicGameEvent, ClaimAction } from '@nanchang/shared';
import { DynamoDBService, DK } from '../database/dynamodb.service';
import { GameSession } from './game-session';
import type { Seat4 } from './game-session';
import { computeEligibleClaims, computeRobKongEligible, resolveClaims } from './claim-resolver';
import type { IncomingClaim } from './claim-resolver';
import { toClientSnapshot } from './snapshot';
import { StatsService } from './stats.service';
import { StorageService } from '../storage/storage.service';
import { PushService } from '../push/push.service';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Claim window length in seconds. */
const CLAIM_WINDOW_SECS = 8;

/** Rob-kong window length in seconds (shorter than regular claim window). */
const ROB_KONG_WINDOW_SECS = 5;

/** Seconds of inactivity before first AFK warning overlay. Repeats every interval. */
const AFK_WARNING_INTERVAL_SECS = 20;

/** After game:ended, keep the session alive briefly for rematch hooks (Phase 8). */
const SESSION_TEARDOWN_DELAY_MS = 60_000;

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);
  private readonly sessions = new Map<string, GameSession>();
  private server?: Server;

  constructor(
    private readonly db: DynamoDBService,
    private readonly stats: StatsService,
    private readonly storage: StorageService,
    private readonly push: PushService,
  ) {}

  /** Called by GameGateway.afterInit to wire in the Socket.IO server reference. */
  setServer(server: Server): void {
    this.server = server;
  }

  // ── Session lifecycle ────────────────────────────────────────────────────────

  /**
   * Create a new game session from an already-started room.
   * The room's seats must be fully occupied (4 players).
   * Returns the gameId.
   */
  async createGame(
    roomId: string,
    seatMap: [string, string, string, string],
    settings: RoomSettings,
    /** Game ID assigned by RoomsService.startGame() — reuse it so room + game IDs agree. */
    gameId: string,
  ): Promise<void> {
    const seed = (Math.random() * 0x7fff_ffff) >>> 0; // non-negative 31-bit int
    const now = new Date().toISOString();

    const startingScores: [number, number, number, number] = [
      settings.startingScore,
      settings.startingScore,
      settings.startingScore,
      settings.startingScore,
    ];

    const engine = GameEngine.create(seed, {
      startingScores,
      dealerSeat: 0,
      roundWind: 'east',
    }).deal();

    const session = new GameSession({
      engine,
      gameId,
      roomId,
      settings,
      seatMap,
      startedAt: now,
    });

    // Record hand-0 metadata for replay
    session.handLog.push({
      seed,
      startingScores,
      dealerSeat: 0,
      roundWind: 'east',
      eventStartIdx: 0,
    });

    this.sessions.set(gameId, session);

    // Persist initial GAME#id/META
    await this.db
      .put({
        Item: {
          ...DK.game(gameId),
          gameId,
          roomId,
          seed,
          seatMap: Array.from(seatMap),
          settings,
          status: 'active',
          dealerSeat: 0,
          roundWind: 'east' as SeatWind,
          handsPlayed: 0,
          startedAt: now,
        },
      })
      .catch((err) => this.logger.error(`Failed to persist GAME#${gameId}/META: ${err}`));

    this.logger.log(`Game created: ${gameId} (room: ${roomId})`);
  }

  getSession(gameId: string): GameSession | undefined {
    return this.sessions.get(gameId);
  }

  private destroySession(gameId: string): void {
    const session = this.sessions.get(gameId);
    if (!session) return;

    // Clear all timers
    session.closeClaimWindow();
    session.clearAfkTimers();
    if (session.teardownTimer) clearTimeout(session.teardownTimer);

    this.sessions.delete(gameId);
    this.logger.log(`Session destroyed: ${gameId}`);
  }

  // ── Player join / reconnect ──────────────────────────────────────────────────

  /**
   * Handle game:join. Registers the socket, sends the current snapshot.
   * Spectators may join any game; players re-join to resync after disconnect.
   */
  async joinGame(socket: Socket, userId: string, gameId: string, spectate: boolean): Promise<void> {
    const session = this.sessions.get(gameId);
    if (!session) {
      socket.emit('game:error', { code: 'GAME_NOT_FOUND', message: 'Game not found' });
      return;
    }

    // Validate spectator eligibility (D7: any authenticated user can spectate)
    if (spectate) {
      if (!session.isPlayer(userId)) {
        session.connectSpectator(socket.id, userId);
      } else {
        // A player trying to spectate their own game — treat as regular join
        session.connectPlayer(socket.id, userId);
      }
    } else {
      if (!session.isPlayer(userId)) {
        socket.emit('game:error', {
          code: 'NOT_IN_GAME',
          message: 'You are not a player in this game',
        });
        return;
      }
      session.connectPlayer(socket.id, userId);
    }

    // Join the socket.io room and store gameId on the socket for subsequent events
    await socket.join(`game:${gameId}`);
    socket.data.gameId = gameId;

    const seat = session.getSeat(userId);

    // Broadcast connection status to others
    if (seat !== undefined) {
      this.broadcastPlayerConnection(session, seat, 'connected');
    }

    // Send current snapshot only to this socket
    this.emitSnapshotToSocket(socket.id, session, userId);

    // If all 4 players are now connected and game is in jing_reveal, we stay there
    // waiting for the host to emit game:reveal-jing (D6).
  }

  /**
   * Handle socket disconnect. Updates connection state, notifies room.
   */
  handleDisconnect(socketId: string): void {
    for (const session of this.sessions.values()) {
      const userId = session.disconnect(socketId);
      if (!userId) continue;

      const seat = session.getSeat(userId);
      if (seat !== undefined) {
        this.logger.debug(`Player seat ${seat} disconnected from game ${session.gameId}`);
        this.broadcastPlayerConnection(session, seat, 'reconnecting');
      } else if (session.spectators.has(userId)) {
        session.spectators.delete(userId);
      }
      return; // A socket is in at most one game
    }
  }

  // ── Jing reveal ──────────────────────────────────────────────────────────────

  /**
   * Handle game:reveal-jing (host explicit tap, D6).
   * Transitions engine from jing_reveal → playing and starts the first turn.
   */
  handleRevealJing(socket: Socket, userId: string, gameId: string): void {
    const session = this.sessions.get(gameId);
    if (!session) return this.emitError(socket, 'GAME_NOT_FOUND');

    const seat = session.getSeat(userId);
    if (seat === undefined) return this.emitError(socket, 'NOT_IN_GAME');

    // The current dealer (engine's dealerSeat) reveals jing.
    // Hand 1: dealer = seat 0 = room host. Later hands: dealer rotates.
    const dealerSeat = session.engine.state.dealerSeat;
    const dealerUserId = session.seatMap[dealerSeat];
    if (userId !== dealerUserId) {
      this.logger.warn(
        `reveal-jing rejected: userId=${userId} dealerUserId=${dealerUserId} ` +
          `seatMap=${JSON.stringify(session.seatMap)} dealerSeat=${dealerSeat}`,
      );
      return this.emitError(socket, 'NOT_HOST');
    }

    if (session.engine.state.phase !== 'jing_reveal') {
      return this.emitError(socket, 'INVALID_PHASE');
    }

    try {
      session.engine = session.engine.revealJing();
      session.moveLog.push(...session.engine.events);
    } catch (err) {
      return this.emitError(socket, 'ENGINE_ERROR', String(err));
    }

    this.broadcastEvent(session, { kind: 'draw', seat: session.engine.state.dealerSeat });
    this.broadcastSnapshots(session);
    this.startTurn(session);
  }

  // ── Turn loop ────────────────────────────────────────────────────────────────

  private startTurn(session: GameSession): void {
    const activeSeat = session.engine.state.currentSeat;
    session.touch(activeSeat);
    session.clearAfkTimers();

    // Emit game:your-turn to the active seat's socket
    const socketId = session.socketIdForSeat(activeSeat);
    if (socketId && this.server) {
      this.server.to(socketId).emit('game:your-turn', { seat: activeSeat });
    }

    // Player offline — fire a push notification (no-op if not subscribed or push disabled)
    if (!socketId) {
      const userId = session.seatMap[activeSeat];
      void this.push.sendTurnNotification(userId, session.gameId);
    }

    // AFK warning: emit overlay every 20s of inactivity (D4, no forced action)
    this.scheduleAfkWarning(session, activeSeat);
  }

  private scheduleAfkWarning(session: GameSession, seat: Seat4): void {
    session.clearAfkTimer(seat);

    const warn = () => {
      // Check the seat is still the active player (turn may have moved on)
      if (session.engine.state.phase !== 'playing') return;
      if (session.engine.state.currentSeat !== seat) return;

      session.setAfk(seat, true);
      const socketId = session.socketIdForSeat(seat);
      if (socketId && this.server) {
        this.server.to(socketId).emit('game:afk-warning', { seat });
      }

      // Re-arm for repeat (every 20s, no forced discard per D4)
      session.afkTimers[seat] = setTimeout(warn, AFK_WARNING_INTERVAL_SECS * 1000);
    };

    session.afkTimers[seat] = setTimeout(warn, AFK_WARNING_INTERVAL_SECS * 1000);
  }

  /**
   * Handle game:discard from the active player.
   */
  handleDiscard(socket: Socket, userId: string, gameId: string, tile: TileType): void {
    const session = this.sessions.get(gameId);
    if (!session) return this.emitError(socket, 'GAME_NOT_FOUND');

    const seat = session.getSeat(userId);
    if (seat === undefined) return this.emitError(socket, 'NOT_IN_GAME');
    if (seat !== session.engine.state.currentSeat) return this.emitError(socket, 'NOT_YOUR_TURN');
    if (session.engine.state.phase !== 'playing') return this.emitError(socket, 'INVALID_PHASE');

    try {
      session.engine = session.engine.discard(tile);
      session.touch(seat);
      session.clearAfkTimers();
      session.moveLog.push(...getNewEvents(session));
    } catch (err) {
      return this.emitError(socket, 'ILLEGAL_MOVE', String(err));
    }

    this.broadcastEvent(session, { kind: 'discard', seat, tile });
    this.broadcastSnapshots(session);

    // Open claim window or proceed
    this.openClaimWindowAfterDiscard(session);
  }

  private openClaimWindowAfterDiscard(session: GameSession): void {
    const eligibilityMap = computeEligibleClaims(session.engine.state);

    if (eligibilityMap.size === 0) {
      // No eligible claims — immediately advance turn
      this.advanceAfterNoClaim(session);
      return;
    }

    const eligibleSeats = new Set(eligibilityMap.keys()) as Set<Seat4>;
    const deadline = Date.now() + CLAIM_WINDOW_SECS * 1000;

    session.openClaimWindow(eligibleSeats, eligibilityMap, CLAIM_WINDOW_SECS, { isRobKong: false });

    // Send claim-window event only to eligible seats
    for (const [claimSeat, actions] of eligibilityMap) {
      const socketId = session.socketIdForSeat(claimSeat);
      if (socketId && this.server) {
        this.server.to(socketId).emit('game:claim-window', { actions, deadline });
      }
    }

    // Arm expiry timer
    session.claimTimer = setTimeout(
      () => this.resolveClaimWindow(session),
      CLAIM_WINDOW_SECS * 1000,
    );
  }

  private openRobKongWindow(session: GameSession, kongSeat: Seat4, kongTile: TileType): void {
    const eligibleSet = computeRobKongEligible(session.engine.state, kongTile);

    if (eligibleSet.size === 0) {
      // No one can rob — proceed normally
      this.broadcastSnapshots(session);
      this.startTurn(session);
      return;
    }

    const actionsPerSeat = new Map<Seat4, ClaimAction[]>();
    for (const s of eligibleSet) actionsPerSeat.set(s, [{ kind: 'win' }]);

    const deadline = Date.now() + ROB_KONG_WINDOW_SECS * 1000;
    session.openClaimWindow(eligibleSet, actionsPerSeat, ROB_KONG_WINDOW_SECS, {
      isRobKong: true,
      kongSeat,
    });

    for (const s of eligibleSet) {
      const socketId = session.socketIdForSeat(s);
      if (socketId && this.server) {
        this.server.to(socketId).emit('game:rob-kong-window', {
          kongSeat,
          deadline,
          actions: [{ kind: 'win' }],
        });
      }
    }

    session.claimTimer = setTimeout(
      () => this.resolveClaimWindow(session),
      ROB_KONG_WINDOW_SECS * 1000,
    );
  }

  /**
   * Handle game:claim during the claim window.
   */
  handleClaim(
    socket: Socket,
    userId: string,
    gameId: string,
    kind: 'win' | 'pung' | 'kong' | 'chow',
    sequence?: [TileType, TileType, TileType],
  ): void {
    const session = this.sessions.get(gameId);
    if (!session) return this.emitError(socket, 'GAME_NOT_FOUND');

    const seat = session.getSeat(userId);
    if (seat === undefined) return this.emitError(socket, 'NOT_IN_GAME');

    const w = session.claimWindow;
    if (!w) return this.emitError(socket, 'NO_CLAIM_WINDOW');
    if (!w.eligibleSeats.has(seat)) return this.emitError(socket, 'CLAIM_NOT_ELIGIBLE');
    if (w.claims.has(seat) || w.passedSeats.has(seat)) {
      return this.emitError(socket, 'ALREADY_RESPONDED');
    }

    // Validate claim kind is in eligible actions for this seat
    const allowed = w.actionsPerSeat.get(seat)?.map((a) => a.kind) ?? [];
    if (!allowed.includes(kind)) return this.emitError(socket, 'CLAIM_NOT_ELIGIBLE');

    w.claims.set(seat, { seat, kind, sequence });
    session.touch(seat);

    if (session.claimWindowComplete) {
      this.resolveClaimWindow(session);
    }
  }

  /**
   * Handle game:pass during the claim window.
   */
  handlePass(socket: Socket, userId: string, gameId: string): void {
    const session = this.sessions.get(gameId);
    if (!session) return this.emitError(socket, 'GAME_NOT_FOUND');

    const seat = session.getSeat(userId);
    if (seat === undefined) return this.emitError(socket, 'NOT_IN_GAME');

    const w = session.claimWindow;
    if (!w) return this.emitError(socket, 'NO_CLAIM_WINDOW');
    if (!w.eligibleSeats.has(seat)) return; // silently ignore pass from non-eligible seat
    if (w.claims.has(seat) || w.passedSeats.has(seat)) return; // already responded

    w.passedSeats.add(seat);
    session.touch(seat);

    if (session.claimWindowComplete) {
      this.resolveClaimWindow(session);
    }
  }

  private resolveClaimWindow(session: GameSession): void {
    const w = session.closeClaimWindow();
    if (!w) return;

    const claims = [...w.claims.values()];
    const resolution = resolveClaims(claims);

    // Notify contested losers
    for (const c of resolution.contested) {
      const socketId = session.socketIdForSeat(c.seat);
      if (socketId && this.server) {
        this.server.to(socketId).emit('game:contested', { kind: c.kind, seat: c.seat });
      }
    }

    if (w.isRobKong) {
      this.applyRobKongResolution(session, resolution, w.kongSeat!);
      return;
    }

    // Multi-ron: apply all wins (D3)
    if (resolution.winners.length > 0) {
      for (const claim of resolution.winners) {
        this.applyWinClaim(session, claim.seat, 'ron', { isRobKong: false });
      }
      return;
    }

    if (resolution.applied) {
      this.applyNonWinClaim(session, resolution.applied);
      return;
    }

    // No claims — advance the turn
    this.advanceAfterNoClaim(session);
  }

  private advanceAfterNoClaim(session: GameSession): void {
    try {
      session.engine = session.engine.passClaims();
      session.moveLog.push(...getNewEvents(session));
    } catch (err) {
      this.logger.error(`passClaims failed for game ${session.gameId}: ${err}`);
      return;
    }

    if (session.engine.state.phase === 'finished') {
      // draw_game (exhaustive draw)
      this.handleHandEnd(session, null, 'draw');
      return;
    }

    this.broadcastEvent(session, { kind: 'draw', seat: session.engine.state.currentSeat });
    this.broadcastSnapshots(session);
    this.startTurn(session);
  }

  private applyWinClaim(
    session: GameSession,
    winnerSeat: Seat4,
    winType: WinType,
    opts: { isRobKong: boolean; robKongSeat?: Seat4 },
  ): void {
    try {
      session.engine = session.engine.declareWin(winnerSeat, {
        isTrueGerman: false,
        isSpiritFishing: false,
        robKongSeat: opts.robKongSeat,
      });
      session.moveLog.push(...getNewEvents(session));
    } catch (err) {
      this.logger.error(
        `declareWin failed for seat ${winnerSeat} in game ${session.gameId}: ${err}`,
      );
      return;
    }

    const lastEvent = session.engine.events.at(-1);
    const payment = lastEvent?.kind === 'win' ? lastEvent.paymentResult : undefined;

    this.broadcastEvent(session, {
      kind: 'win',
      seat: winnerSeat,
      winType,
      handType: lastEvent?.kind === 'win' ? lastEvent.handType : 'standard',
      payment: payment!,
    });
    this.broadcastSnapshots(session);

    this.handleHandEnd(session, winnerSeat, 'win', payment);
  }

  private applyRobKongResolution(
    session: GameSession,
    resolution: ReturnType<typeof resolveClaims>,
    kongSeat: Seat4,
  ): void {
    if (resolution.winners.length > 0) {
      // Rob-kong: the robber wins; kongSeat pays all (handled by engine isRobKong scoring)
      const robber = resolution.winners[0];
      this.applyWinClaim(session, robber.seat, 'ron', {
        isRobKong: true,
        robKongSeat: kongSeat,
      });
    } else {
      // No rob — proceed after the kong draw (engine already drew the replacement)
      this.broadcastSnapshots(session);
      this.startTurn(session);
    }
  }

  private applyNonWinClaim(session: GameSession, claim: IncomingClaim): void {
    // Capture the pending discard tile BEFORE any engine call clears it
    const claimedTile = session.engine.state.pendingDiscard!;

    try {
      switch (claim.kind) {
        case 'pung':
          session.engine = session.engine.pung(claim.seat);
          this.broadcastEvent(session, { kind: 'pung', seat: claim.seat, tile: claimedTile });
          break;

        case 'kong':
          session.engine = session.engine.kongFromDiscard(claim.seat);
          this.broadcastEvent(session, { kind: 'kong_open', seat: claim.seat, tile: claimedTile });
          break;

        case 'chow':
          if (!claim.sequence) throw new Error('chow claim missing sequence');
          session.engine = session.engine.chow(claim.seat, claim.sequence);
          this.broadcastEvent(session, {
            kind: 'chow',
            seat: claim.seat,
            tile: claim.sequence[0],
            sequence: claim.sequence,
          });
          break;

        default:
          throw new Error(`Unexpected claim kind: ${String(claim.kind)}`);
      }

      session.moveLog.push(...getNewEvents(session));
    } catch (err) {
      this.logger.error(
        `Applying claim ${claim.kind} for seat ${claim.seat} in game ${session.gameId}: ${err}`,
      );
      return;
    }

    this.broadcastSnapshots(session);
    this.startTurn(session);
  }

  // ── On-turn melds ────────────────────────────────────────────────────────────

  handleKongConcealed(socket: Socket, userId: string, gameId: string, tile: TileType): void {
    const session = this.sessions.get(gameId);
    if (!session) return this.emitError(socket, 'GAME_NOT_FOUND');

    const seat = session.getSeat(userId);
    if (seat === undefined) return this.emitError(socket, 'NOT_IN_GAME');
    if (seat !== session.engine.state.currentSeat) return this.emitError(socket, 'NOT_YOUR_TURN');
    if (session.engine.state.phase !== 'playing') return this.emitError(socket, 'INVALID_PHASE');

    try {
      session.engine = session.engine.kongConcealed(seat, tile);
      session.touch(seat);
      session.moveLog.push(...getNewEvents(session));
    } catch (err) {
      return this.emitError(socket, 'ILLEGAL_MOVE', String(err));
    }

    this.broadcastEvent(session, { kind: 'kong_concealed', seat });
    this.broadcastSnapshots(session);
    this.startTurn(session); // Player still needs to discard after drawing replacement
  }

  handleKongAdd(socket: Socket, userId: string, gameId: string, tile: TileType): void {
    const session = this.sessions.get(gameId);
    if (!session) return this.emitError(socket, 'GAME_NOT_FOUND');

    const seat = session.getSeat(userId);
    if (seat === undefined) return this.emitError(socket, 'NOT_IN_GAME');
    if (seat !== session.engine.state.currentSeat) return this.emitError(socket, 'NOT_YOUR_TURN');
    if (session.engine.state.phase !== 'playing') return this.emitError(socket, 'INVALID_PHASE');

    try {
      session.engine = session.engine.addToKong(seat, tile);
      session.touch(seat);
      session.moveLog.push(...getNewEvents(session));
    } catch (err) {
      return this.emitError(socket, 'ILLEGAL_MOVE', String(err));
    }

    this.broadcastEvent(session, { kind: 'kong_added', seat, tile });

    // Open rob-kong window
    this.openRobKongWindow(session, seat, tile);
  }

  // ── Concede ──────────────────────────────────────────────────────────────────

  handleConcede(socket: Socket, userId: string, gameId: string): void {
    const session = this.sessions.get(gameId);
    if (!session) return this.emitError(socket, 'GAME_NOT_FOUND');

    const seat = session.getSeat(userId);
    if (seat === undefined) return this.emitError(socket, 'NOT_IN_GAME');

    try {
      session.engine = session.engine.concede(seat);
      session.closeClaimWindow();
      session.clearAfkTimers();
      session.moveLog.push(...getNewEvents(session));
    } catch (err) {
      return this.emitError(socket, 'ILLEGAL_MOVE', String(err));
    }

    this.broadcastEvent(session, { kind: 'concede', seat });
    this.broadcastSnapshots(session);
    this.handleHandEnd(session, null, 'concede');
  }

  // ── Hand end & session management ────────────────────────────────────────────

  private handleHandEnd(
    session: GameSession,
    winnerSeat: Seat4 | null,
    result: 'win' | 'draw' | 'concede',
    payment?: WinPaymentResult,
  ): void {
    session.clearAfkTimers();
    session.closeClaimWindow();
    session.handsPlayed++;

    // ── Spirit settlement ──────────────────────────────────────────────────────
    const state = session.engine.state;
    let spiritDeltas: [number, number, number, number] = [0, 0, 0, 0];

    if (state.jingPrimary !== null && state.jingSecondary !== null) {
      spiritDeltas = calculateSpiritSettlement(state.seats, state.jingPrimary, state.jingSecondary);
    }

    // ── Update cumulative scores ───────────────────────────────────────────────
    for (let i = 0; i < 4; i++) {
      session.cumulativeScores[i as Seat4] = state.seats[i].score + spiritDeltas[i];
    }

    // ── Compute next dealer (needed for both termination check and next hand) ────
    const nextDealerInfo = nextDealer(
      { dealerSeat: state.dealerSeat, roundWind: state.roundWind },
      winnerSeat,
    );

    // ── Check session termination ──────────────────────────────────────────────
    if (result === 'concede' || this.isSessionOver(session, nextDealerInfo)) {
      this.endSession(session, winnerSeat, result, payment, spiritDeltas);
      return;
    }

    // ── Start next hand ────────────────────────────────────────────────────────
    this.startNextHand(session, nextDealerInfo);
  }

  private isSessionOver(
    session: GameSession,
    nextDealerInfo: { dealerSeat: 0 | 1 | 2 | 3; roundWind: SeatWind; roundComplete: boolean },
  ): boolean {
    const { settings, cumulativeScores, engine } = session;

    if (settings.terminationType === 'bust') {
      // Bust: session ends if any player's score goes below 0 after this hand
      if (cumulativeScores.some((s) => s < 0)) return true;
    }

    if (settings.terminationType === 'rounds') {
      const currentRoundWind = engine.state.roundWind;
      const { roundComplete } = nextDealerInfo;

      // East-only: session ends once the East round completes
      if (settings.rounds === 'east' && currentRoundWind === 'east' && roundComplete) return true;

      // East+South: session ends once the South round completes
      if (settings.rounds === 'east+south' && currentRoundWind === 'south' && roundComplete)
        return true;
    }

    return false;
  }

  private startNextHand(
    session: GameSession,
    nextDealerInfo: { dealerSeat: 0 | 1 | 2 | 3; roundWind: SeatWind },
  ): void {
    const { dealerSeat, roundWind } = nextDealerInfo;
    const seed = (Math.random() * 0x7fff_ffff) >>> 0;

    const startingScores = [...session.cumulativeScores] as [number, number, number, number];
    const newEngine = GameEngine.create(seed, {
      startingScores,
      dealerSeat,
      roundWind,
    }).deal();

    // Record hand metadata for replay
    session.handLog.push({
      seed,
      startingScores,
      dealerSeat,
      roundWind,
      eventStartIdx: session.moveLog.length,
    });

    session.engine = newEngine;
    this.broadcastSnapshots(session);

    // Host still needs to tap to start Jing reveal for the next hand (D6)
    const hostSocketId = session.socketIdForSeat(0);
    if (hostSocketId && this.server) {
      this.server.to(hostSocketId).emit('game:jing-reveal-ready', {
        handNumber: session.handsPlayed,
        dealerSeat,
        roundWind,
      });
    }
  }

  private async endSession(
    session: GameSession,
    winnerSeat: Seat4 | null,
    result: 'win' | 'draw' | 'concede',
    lastHandPayment?: WinPaymentResult,
    lastHandSpirits?: [number, number, number, number],
  ): Promise<void> {
    const endedAt = new Date().toISOString();
    const finalScores = [...session.cumulativeScores] as [number, number, number, number];

    // Compute placement (1 = highest)
    const sorted = [...finalScores].sort((a, b) => b - a);
    const placement = finalScores.map((s) => {
      return (sorted.indexOf(s) + 1) as 1 | 2 | 3 | 4;
    }) as [1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4];

    // Determine bust result
    const actualResult: GameEndedPayload['result'] =
      result === 'concede'
        ? 'concede'
        : result === 'draw'
          ? 'draw'
          : session.settings.terminationType === 'bust' && finalScores.some((s) => s < 0)
            ? 'bust'
            : 'win';

    // ── Update player stats + compute ELO deltas (before broadcast so payload is rich) ──
    const ratingDeltas = await this.stats
      .updateAfterGame(session.seatMap, placement)
      .catch((err) => {
        this.logger.error(`Stats update failed for game ${session.gameId}: ${err}`);
        return [0, 0, 0, 0] as [number, number, number, number];
      });

    const payload: GameEndedPayload = {
      result: actualResult,
      winnerSeat: winnerSeat ?? undefined,
      finalScores,
      placement,
      handsPlayed: session.handsPlayed,
      lastHandPayment,
      lastHandSpirits,
      seatMap: session.seatMap,
      startedAt: session.startedAt,
      endedAt,
      ratingDeltas,
    };

    // Broadcast game:ended to all in room
    if (this.server) {
      this.server.to(`game:${session.gameId}`).emit('game:ended', payload);
    }

    // ── Persist final GAME#id/META ─────────────────────────────────────────────
    await this.db
      .update({
        Key: DK.game(session.gameId),
        UpdateExpression:
          'SET #status = :s, endedAt = :ea, finalScores = :fs, handsPlayed = :hp, #result = :r',
        ExpressionAttributeNames: { '#status': 'status', '#result': 'result' },
        ExpressionAttributeValues: {
          ':s': 'finished',
          ':ea': endedAt,
          ':fs': finalScores,
          ':hp': session.handsPlayed,
          ':r': actualResult,
        },
      })
      .catch((err) => this.logger.error(`Failed to update GAME#${session.gameId}/META: ${err}`));

    // ── Write per-user history index ───────────────────────────────────────────
    const writes = session.seatMap.map((userId, i) =>
      this.db
        .put({
          Item: {
            ...DK.userGameIdx(userId, session.startedAt, session.gameId),
            gameId: session.gameId,
            placement: placement[i],
            finalScore: finalScores[i],
            result: actualResult,
            endedAt,
          },
        })
        .catch((err) => this.logger.error(`Failed to write user game index for ${userId}: ${err}`)),
    );
    await Promise.all(writes);

    // ── Write replay to S3 ────────────────────────────────────────────────────
    const replayPayload = {
      gameId: session.gameId,
      seatMap: session.seatMap,
      settings: session.settings,
      hands: session.handLog.map((meta, i) => ({
        seed: meta.seed,
        startingScores: meta.startingScores,
        dealerSeat: meta.dealerSeat,
        roundWind: meta.roundWind,
        events: session.moveLog.slice(
          meta.eventStartIdx,
          session.handLog[i + 1]?.eventStartIdx ?? session.moveLog.length,
        ),
      })),
      startedAt: session.startedAt,
      endedAt,
      finalScores,
      placement,
      result: actualResult,
    };
    await this.storage
      .putReplay(session.gameId, replayPayload)
      .catch((err) => this.logger.error(`Failed to write replay for ${session.gameId}: ${err}`));

    // ── Schedule session teardown ──────────────────────────────────────────────
    session.teardownTimer = setTimeout(
      () => this.destroySession(session.gameId),
      SESSION_TEARDOWN_DELAY_MS,
    );

    this.logger.log(`Game ended: ${session.gameId} — result: ${actualResult}`);
  }

  // ── Broadcasting helpers ─────────────────────────────────────────────────────

  /**
   * Emit a per-viewer redacted snapshot to every connected socket in this game.
   * Each socket gets a different redaction based on their viewer seat.
   */
  broadcastSnapshots(session: GameSession): void {
    if (!this.server) return;

    for (const [socketId, userId] of session.socketToUser) {
      this.emitSnapshotToSocket(socketId, session, userId);
    }
  }

  private emitSnapshotToSocket(socketId: string, session: GameSession, userId: string): void {
    if (!this.server) return;
    const viewerSeat = session.getSeat(userId) ?? null;
    const snapshot = toClientSnapshot(
      session.engine.state,
      session.gameId,
      viewerSeat,
      session.connState,
    );
    this.server.to(socketId).emit('game:snapshot', { state: snapshot });
  }

  /** Broadcast a public (already-redacted) game event to the whole game room. */
  private broadcastEvent(session: GameSession, event: PublicGameEvent): void {
    if (!this.server) return;
    this.server.to(`game:${session.gameId}`).emit('game:event', { event });
  }

  private broadcastPlayerConnection(
    session: GameSession,
    seat: Seat4,
    status: 'connected' | 'reconnecting' | 'left',
  ): void {
    if (!this.server) return;
    this.server.to(`game:${session.gameId}`).emit('game:player-connection', { seat, status });
  }

  private emitError(socket: Socket, code: string, message?: string): void {
    socket.emit('game:error', { code, message: message ?? code });
  }

  // ── Rematch ──────────────────────────────────────────────────────────────────

  /**
   * Host-only rematch: create a new room pre-populated with the same 4 players
   * and the same settings, then emit game:rematch-ready to all sockets still in
   * the game room. Clients navigate to the new room code.
   *
   * Only valid during the SESSION_TEARDOWN_DELAY_MS window after game:ended.
   */
  async requestRematch(socket: Socket, initiatorSub: string, gameId: string): Promise<void> {
    const session = this.sessions.get(gameId);
    if (!session) {
      return this.emitError(socket, 'SESSION_EXPIRED');
    }

    if (session.getSeat(initiatorSub) !== 0) {
      return this.emitError(socket, 'NOT_HOST');
    }

    const roomId = randomUUID();
    const roomCode = this.generateRoomCode();
    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + 30 * 60;

    // Fetch profiles for seat display info (handle/displayName)
    const profileResults = await Promise.all(
      session.seatMap.map((sub) => this.db.get({ Key: DK.userProfile(sub) })),
    );

    const roomCodeStripped = roomCode.replace(/-/g, '');
    await this.db
      .transactWrite({
        TransactItems: [
          {
            Put: {
              TableName: this.db.tableName,
              Item: {
                PK: `ROOM#${roomId}`,
                SK: 'META',
                roomId,
                code: roomCode,
                hostUserId: session.seatMap[0],
                status: 'waiting',
                settings: session.settings,
                createdAt: now,
                idleAt: now,
                ttl,
                gsi1pk: `ROOM_CODE#${roomCodeStripped}`,
                gsi1sk: 'META',
              },
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          ...session.seatMap.map((userId, i) => {
            const p = profileResults[i].Item;
            return {
              Put: {
                TableName: this.db.tableName,
                Item: {
                  PK: `ROOM#${roomId}`,
                  SK: `SEAT#${i}`,
                  roomId,
                  seatIdx: i,
                  userId,
                  handle: (p?.handle as string | undefined) ?? userId,
                  displayName: (p?.displayName as string | undefined) ?? userId,
                  ready: false,
                  joinedAt: now,
                },
              },
            };
          }),
        ],
      })
      .catch((err) => {
        this.logger.error(`Failed to create rematch room: ${err}`);
        this.emitError(socket, 'REMATCH_FAILED');
        throw err;
      });

    if (this.server) {
      this.server.to(`game:${gameId}`).emit('game:rematch-ready', { roomId, roomCode });
    }
    this.logger.log(`Rematch: game ${gameId} → room ${roomId} (${roomCode})`);
  }

  private generateRoomCode(): string {
    const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    let s = '';
    for (let i = 0; i < 6; i++) {
      s += chars[Math.floor(Math.random() * chars.length)];
    }
    return `${s.slice(0, 2)}-${s.slice(2)}`;
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * After mutating session.engine, return the events appended since the last
 * call — i.e., the tail of engine.events not yet in session.moveLog.
 */
function getNewEvents(session: GameSession) {
  const logged = session.moveLog.length;
  return session.engine.events.slice(logged);
}
