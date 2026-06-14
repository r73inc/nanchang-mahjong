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
import {
  GameEngine,
  nextDealer,
  previewJingReveal,
  calculateSpiritSettlement,
  calculateOpeningJingSettlement,
  isWinningHand,
  decomposeHand,
  stepAbove,
  getBotDiscard,
  getBotClaim,
  mulberry32,
  rollDice,
  diceSum,
  DICE_SALT,
  GameRuleError,
} from '@nanchang/engine';
import type { BotClaimOption } from '@nanchang/engine';
import type {
  TileType,
  SeatWind,
  WinType,
  WinPaymentResult,
  HandType,
  SeatState,
  Meld,
  GameEvent,
} from '@nanchang/engine';
import type {
  RoomSettings,
  GameEndedPayload,
  HandRevealPayload,
  SpiritCount,
} from '@nanchang/shared';
import type { PublicGameEvent, ClaimAction } from '@nanchang/shared';
import { DynamoDBService, DK } from '../database/dynamodb.service';
import { GameSession } from './game-session';
import type { Seat4 } from './game-session';
import { computeEligibleClaims, computeRobKongEligible, resolveClaims } from './claim-resolver';
import type { IncomingClaim } from './claim-resolver';
import { toClientSnapshot } from './snapshot';
import type { SeatBotMeta } from './snapshot';
import { StatsService } from './stats.service';
import { StorageService } from '../storage/storage.service';
import { PushService } from '../push/push.service';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Fallback claim window length in seconds (used when settings.claimWindowSecs is not set). */
const CLAIM_WINDOW_SECS_DEFAULT = 8;

/** Bot simulated think-time range (ms). */
const BOT_THINK_MIN_MS = 1_000;
const BOT_THINK_MAX_MS = 3_000;

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
    seatNames: [string, string, string, string],
    /** Pre-resolved avatar URLs from the room snapshot (includes bot profile paths). */
    preResolvedAvatarUrls: [string | null, string | null, string | null, string | null],
  ): Promise<void> {
    const seed = (Math.random() * 0x7fff_ffff) >>> 0; // non-negative 31-bit int
    const now = new Date().toISOString();

    // Bust mode always starts at 20 regardless of the room's startingScore setting.
    const initialScore = settings.terminationType === 'bust' ? 20 : settings.startingScore;
    const startingScores: [number, number, number, number] = [
      initialScore,
      initialScore,
      initialScore,
      initialScore,
    ];

    const engine = GameEngine.create(seed, {
      startingScores,
      dealerSeat: 0,
      roundWind: 'east',
      config: { ruleTopBottomJing: settings.ruleTopBottomJing },
    });

    // Avatar URLs are fully resolved by RoomsService before the game starts.
    const seatAvatarUrls = preResolvedAvatarUrls;

    const session = new GameSession({
      engine,
      gameId,
      roomId,
      settings,
      seatMap,
      seatNames,
      seatAvatarUrls,
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

    // Start with deal_1: dealer (seat 0) rolls to select the starting wall
    session.preGamePhase = 'dealing';
    session.pendingRoll = { purpose: 'deal_1', roller: 0 as Seat4, seed };

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

    // Auto-roll immediately if the dealer is a bot
    this.doBotRollIfNeeded(session);

    this.logger.log(`Game created: ${gameId} (room: ${roomId})`);
  }

  getSession(gameId: string): GameSession | undefined {
    return this.sessions.get(gameId);
  }

  /** Resolves after a random human-like delay (BOT_THINK_MIN_MS – BOT_THINK_MAX_MS). */
  private botDelay(): Promise<void> {
    const ms =
      Math.floor(Math.random() * (BOT_THINK_MAX_MS - BOT_THINK_MIN_MS + 1)) + BOT_THINK_MIN_MS;
    return new Promise((resolve) => setTimeout(resolve, ms));
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

    // Re-send pending events to reconnecting players so they don't miss a screen.
    if (
      (session.preGamePhase === 'jing' || session.preGamePhase === 'settlement') &&
      session.lastSettlementPreview
    ) {
      this.server?.to(socket.id).emit('game:settlement-preview', session.lastSettlementPreview);
    }
    if (session.lastHandReveal) {
      this.server?.to(socket.id).emit('game:hand-reveal', session.lastHandReveal);
    }
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

        // If this is a bot game and no human remains connected, tear down immediately
        // to avoid orphaned sessions running forever.
        if (session.hasBots) {
          const anyHumanConnected = [0, 1, 2, 3].some(
            (i) => !session.isBotSeat(i as Seat4) && session.connState[i as Seat4].connected,
          );
          if (!anyHumanConnected) {
            this.logger.log(
              `All humans disconnected from bot game ${session.gameId} — destroying session`,
            );
            this.destroySession(session.gameId);
          }
        }
      } else if (session.spectators.has(userId)) {
        session.spectators.delete(userId);
      }
      return; // A socket is in at most one game
    }
  }

  // ── Pre-game reveal flow ──────────────────────────────────────────────────────

  /**
   * Handle game:advance-pre-game — host taps through the pre-game reveal steps.
   *
   * Flow without ruleTopBottomJing (2 clicks to start):
   *   'hands' → (click) → 'jing'  → (click) → null (game starts)
   *
   * Flow with ruleTopBottomJing (3 clicks to start):
   *   'hands' → (click) → 'settlement' → (click) → 'jing' → (click) → null
   *
   * Backward-compat: game:reveal-jing delegates here so old clients still work.
   */
  handleAdvancePreGame(socket: Socket, userId: string, gameId: string): void {
    const session = this.sessions.get(gameId);
    if (!session) return this.emitError(socket, 'GAME_NOT_FOUND');

    const seat = session.getSeat(userId);
    if (seat === undefined) return this.emitError(socket, 'NOT_IN_GAME');

    // Only the dealer (host of this hand) may advance.
    // If the dealer seat is a bot, any connected human player may advance.
    const dealerSeat = session.engine.state.dealerSeat;
    const dealerUserId = session.seatMap[dealerSeat];
    const dealerIsBot = session.isBotSeat(dealerSeat);
    if (!dealerIsBot && userId !== dealerUserId) {
      this.logger.warn(
        `advance-pre-game rejected: userId=${userId} is not dealer (${dealerUserId})`,
      );
      return this.emitError(socket, 'NOT_HOST');
    }

    if (session.preGamePhase === 'dealing') {
      // Dice rolls are in progress — advance-pre-game cannot skip this phase.
      this.logger.warn(`advance-pre-game ignored: preGamePhase=dealing for game ${gameId}`);
      return;
    }

    if (session.preGamePhase === 'hands') {
      // Trigger the jing_reveal dice roll; settlement is computed and shown after the roll.
      this.setJingRevealPendingRoll(session);
    } else if (session.preGamePhase === 'settlement') {
      // Settlement acknowledged — advance to spirit tile reveal.
      session.preGamePhase = 'jing';
      this.broadcastSnapshots(session);
    } else if (session.preGamePhase === 'jing') {
      // Final step: start the game turn.
      session.preGamePhase = null;
      session.lastSettlementPreview = null;
      this.broadcastSnapshots(session);
      this.broadcastEvent(session, { kind: 'draw', seat: session.engine.state.currentSeat });
      this.startTurn(session);
    } else {
      // preGamePhase === null means game is already live — ignore stray clicks.
      this.logger.warn(`advance-pre-game ignored: preGamePhase=null for game ${gameId}`);
    }
  }

  /**
   * Set pendingRoll for jing_reveal and broadcast snapshot + optional bot auto-roll.
   * Called from handleAdvancePreGame when transitioning 'hands'/'settlement' → jing roll.
   */
  private setJingRevealPendingRoll(session: GameSession): void {
    const dealerSeat = session.engine.state.dealerSeat;
    const seed = session.engine.state.seed;
    session.pendingRoll = { purpose: 'jing_reveal', roller: dealerSeat, seed };
    this.broadcastSnapshots(session);
    this.doBotRollIfNeeded(session);
  }

  /**
   * Handle game:roll-dice — the active roller triggers their dice roll.
   * Server computes the dice from the PRNG seed; client just provides the trigger.
   */
  handleRollDice(socket: Socket, userId: string, gameId: string): void {
    const session = this.sessions.get(gameId);
    if (!session) return this.emitError(socket, 'GAME_NOT_FOUND');

    const seat = session.getSeat(userId);
    if (seat === undefined) return this.emitError(socket, 'NOT_IN_GAME');

    const pr = session.pendingRoll;
    if (!pr) return this.emitError(socket, 'INVALID_PHASE');
    if (pr.roller !== seat) return this.emitError(socket, 'NOT_YOUR_TURN');

    this.handleRollDiceInternal(session);
  }

  /**
   * Execute the current pendingRoll step and advance the state machine.
   * Called both from handleRollDice (human players) and doBotRollIfNeeded (bots).
   */
  private handleRollDiceInternal(session: GameSession): void {
    const pr = session.pendingRoll;
    if (!pr) return;

    const { purpose, roller, seed } = pr;

    if (purpose === 'deal_1') {
      // Pre-compute wall selection dice using the same PRNG call engine.deal() uses internally.
      const dice = rollDice(mulberry32((seed ^ DICE_SALT.wall_selection) >>> 0)) as [
        number,
        number,
      ];
      const dealerSeat = session.engine.state.dealerSeat;
      // Mirror engine's formula: selectedSeat = (dealerSeat + sum - 1) % 4
      const selectedSeat = ((((dealerSeat + diceSum(dice) - 1) % 4) + 4) % 4) as Seat4;

      // Broadcast dice_roll event so all clients can animate
      this.broadcastEvent(session, {
        kind: 'dice_roll',
        purpose: 'wall_selection',
        roller,
        dice,
      });

      // Advance to deal_2: the selected seat must now roll
      session.pendingRoll = { purpose: 'deal_2', roller: selectedSeat, seed };
      this.broadcastSnapshots(session);
      this.doBotRollIfNeeded(session);
    } else if (purpose === 'deal_2') {
      // Pre-compute deal start dice
      const dice = rollDice(mulberry32((seed ^ DICE_SALT.deal_start) >>> 0)) as [number, number];

      // Broadcast dice_roll event
      this.broadcastEvent(session, {
        kind: 'dice_roll',
        purpose: 'deal_start',
        roller,
        dice,
      });

      // Now call engine.deal() — it internally computes the same dice and builds the wall
      session.engine = session.engine.deal();
      session.moveLog.push(...getNewEvents(session));

      session.pendingRoll = null;
      session.preGamePhase = 'hands';
      this.broadcastSnapshots(session);
    } else {
      // jing_reveal: call engine.revealJing() and broadcast the resulting dice event
      if (session.engine.state.phase !== 'jing_reveal') {
        this.logger.error(
          `handleRollDiceInternal: jing_reveal but engine phase=${session.engine.state.phase} (game ${session.gameId})`,
        );
        return;
      }

      // Capture state before revealJing — previewJingReveal needs the pre-reveal hand counts.
      const stateBeforeReveal = session.engine.state;

      session.engine = session.engine.revealJing();
      session.moveLog.push(...getNewEvents(session));
      session.pendingRoll = null;
      // With ruleTopBottomJing: show detailed settlement screen before spirit tiles.
      session.preGamePhase = session.settings.ruleTopBottomJing ? 'settlement' : 'jing';

      // Compute and store settlement preview (hand counts read from pre-reveal state).
      if (session.settings.ruleTopBottomJing) {
        const jingPreview = previewJingReveal(stateBeforeReveal);
        const settlementTile = jingPreview.topTile;
        const nextTile = stepAbove(settlementTile);
        const seatCounts = stateBeforeReveal.seats.map(
          (s) => s.hand.filter((t) => t === settlementTile).length,
        ) as [number, number, number, number];
        const delta = calculateOpeningJingSettlement(settlementTile, stateBeforeReveal.seats, 2);
        const nextTileSeatCounts = stateBeforeReveal.seats.map(
          (s) => s.hand.filter((t) => t === nextTile).length,
        ) as [number, number, number, number];
        const nextTileDelta = calculateOpeningJingSettlement(nextTile, stateBeforeReveal.seats, 1);
        session.lastSettlementPreview = {
          dice: jingPreview.dice,
          stackGlobal: jingPreview.stackGlobal,
          settlementTile,
          nextTile,
          seatCounts,
          delta,
          nextTileSeatCounts,
          nextTileDelta,
        };
      }

      // Broadcast the jing dice_roll event so clients animate
      const jingDiceEvent = session.engine.events.find(
        (e) => e.kind === 'dice_roll' && e.purpose === 'jing_reveal',
      );
      if (jingDiceEvent && jingDiceEvent.kind === 'dice_roll') {
        this.broadcastEvent(session, {
          kind: 'dice_roll',
          purpose: jingDiceEvent.purpose,
          roller: jingDiceEvent.roller,
          dice: jingDiceEvent.dice,
        });
      }

      // Snapshot after event so scores reflect settlement payout before toast
      this.broadcastSnapshots(session);

      // Broadcast settlement-preview so the 'settlement' phase screen can display the breakdown.
      if (session.settings.ruleTopBottomJing && session.lastSettlementPreview) {
        if (this.server) {
          this.server
            .to(`game:${session.gameId}`)
            .emit('game:settlement-preview', session.lastSettlementPreview);
        }
      }

      // Broadcast opening settlement event for the score-toast
      if (session.settings.ruleTopBottomJing) {
        const settlementEvent = session.engine.events.find(
          (e) => e.kind === 'opening_jing_settlement',
        ) as
          | {
              kind: 'opening_jing_settlement';
              settlementTile: TileType;
              scoreDelta: [number, number, number, number];
            }
          | undefined;
        if (settlementEvent) {
          this.broadcastEvent(session, {
            kind: 'opening_jing_settlement',
            settlementTile: settlementEvent.settlementTile,
            scoreDelta: settlementEvent.scoreDelta,
          });
        }
      }
      // Note: startTurn() is NOT called here — the host must click one more time.
    }
  }

  /**
   * If pendingRoll is set and the roller is a bot seat, schedule the roll after a short
   * delay so human players can see the dice animation for the preceding roll complete
   * before the bot fires its own roll.
   */
  private doBotRollIfNeeded(session: GameSession): void {
    const pr = session.pendingRoll;
    if (!pr) return;
    if (!session.isBotSeat(pr.roller)) return;
    const { purpose, roller } = pr;
    setTimeout(() => {
      // Guard: skip if the session ended or the pending roll changed during the delay.
      const currentPr = session.pendingRoll;
      if (!currentPr || currentPr.purpose !== purpose || currentPr.roller !== roller) return;
      if (!this.sessions.has(session.gameId)) return;
      this.handleRollDiceInternal(session);
    }, 3500);
  }

  /**
   * Backward-compat alias: game:reveal-jing → handleAdvancePreGame.
   * Old clients that still emit game:reveal-jing continue to work.
   */
  handleRevealJing(socket: Socket, userId: string, gameId: string): void {
    this.handleAdvancePreGame(socket, userId, gameId);
  }

  // ── Hand-reveal advance ───────────────────────────────────────────────────────

  /**
   * Handle game:advance-hand — host clicks "Continue" on the hand-reveal screen
   * to start the next hand or end the session.
   */
  handleAdvanceHand(socket: Socket, userId: string, gameId: string): void {
    const session = this.sessions.get(gameId);
    if (!session) return this.emitError(socket, 'GAME_NOT_FOUND');

    const seat = session.getSeat(userId);
    if (seat === undefined) return this.emitError(socket, 'NOT_IN_GAME');

    // Only the dealer (host of the just-finished hand) may advance.
    // If the dealer seat is a bot, any connected human player may advance.
    const dealerSeat = session.engine.state.dealerSeat;
    const dealerUserId = session.seatMap[dealerSeat];
    const dealerIsBot = session.isBotSeat(dealerSeat);
    if (!dealerIsBot && userId !== dealerUserId) return this.emitError(socket, 'NOT_HOST');

    const pending = session.pendingHandEnd;
    // pendingHandEnd is null when advance was already processed (e.g. auto-advance fired
    // and the client resent due to a network delay, or two humans both clicked when
    // the dealer was a bot seat).  The correct response is a silent no-op — the caller
    // will shortly receive game:ended or the next hand's game:snapshot.
    if (!pending) return;

    session.pendingHandEnd = null;
    session.lastHandReveal = null;

    if (pending.isLastHand) {
      void this.endSession(
        session,
        pending.winnerSeat,
        pending.result,
        pending.payment,
        pending.spiritDeltas,
      );
    } else {
      this.startNextHand(session, pending.nextDealerInfo);
    }
  }

  // ── Turn loop ────────────────────────────────────────────────────────────────

  private startTurn(session: GameSession): void {
    const activeSeat = session.engine.state.currentSeat;
    const st = session.engine.state;

    // Bot seat: schedule the async turn handler and return immediately.
    // The bot will think (and auto-tsumo if its hand is complete), then discard.
    if (session.isBotSeat(activeSeat)) {
      void this.handleBotTurn(session, activeSeat);
      return;
    }

    session.touch(activeSeat);
    session.clearAfkTimers();

    // Emit game:your-turn to the active seat's socket
    const socketId = session.socketIdForSeat(activeSeat);
    if (socketId && this.server) {
      this.server.to(socketId).emit('game:your-turn', { seat: activeSeat });
    }

    // ── Tsumo opportunity detection ───────────────────────────────────────────
    // If the player's full 14-tile hand is already complete, notify them privately
    // so the UI can show a "Declare Win" button. Winning is a conscious player
    // action — the server does NOT auto-win; the player must emit game:tsumo.
    // They may instead choose to discard normally and continue playing.
    if (st.jingPrimary && st.jingSecondary && st.phase === 'playing') {
      const jingTypes: TileType[] = [st.jingPrimary, st.jingSecondary];
      const seatState = st.seats[activeSeat];
      // Normalize kongs (4 tiles) → pungs (3 tiles): isWinningHand requires exactly 14 tiles,
      // but a hand with k kongs has 14+k total. See BUG-038.
      const openMeldTiles = seatState.openMelds.flatMap((m) =>
        m.kind === 'kong'
          ? ([m.tiles[0], m.tiles[0], m.tiles[0]] as TileType[])
          : ([...m.tiles] as TileType[]),
      );
      const fullHand = [...openMeldTiles, ...seatState.hand];

      if (fullHand.length === 14 && isWinningHand(fullHand, jingTypes, true)) {
        this.logger.log(
          `Can-tsumo: seat ${activeSeat} has a complete hand after kong (game ${session.gameId})`,
        );
        if (socketId && this.server) {
          this.server.to(socketId).emit('game:can-tsumo', { seat: activeSeat });
        }
      }
    }

    // Player offline — fire a push notification (no-op if not subscribed or push disabled)
    if (!socketId) {
      void this.push.sendTurnNotification(session.seatMap[activeSeat], session.gameId);
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
   * Drive a bot's discard turn: wait for a human-like delay, then discard the
   * tile chosen by the bot engine and open the claim window as usual.
   */
  private async handleBotTurn(session: GameSession, seat: Seat4): Promise<void> {
    await this.botDelay();

    // Guard: game may have ended or been conceded during the delay.
    if (session.engine.state.phase !== 'playing' || session.engine.state.currentSeat !== seat) {
      return;
    }

    const state = session.engine.state;
    const jingTypes: TileType[] = [];
    if (state.jingPrimary) jingTypes.push(state.jingPrimary);
    if (state.jingSecondary) jingTypes.push(state.jingSecondary);

    // Bots auto-declare tsumo when their hand is complete — no button needed.
    if (jingTypes.length === 2) {
      const seatState = state.seats[seat];
      const openMeldTiles = seatState.openMelds.flatMap((m) =>
        m.kind === 'kong'
          ? ([m.tiles[0], m.tiles[0], m.tiles[0]] as TileType[])
          : ([...m.tiles] as TileType[]),
      );
      const fullHand = [...openMeldTiles, ...seatState.hand];
      if (fullHand.length === 14 && isWinningHand(fullHand, jingTypes, true)) {
        this.logger.log(`Bot auto-tsumo: seat ${seat} (game ${session.gameId})`);
        this.applyWinClaim(session, seat, 'tsumo', { isRobKong: false });
        return;
      }
    }

    const tile = getBotDiscard(state.seats[seat].hand, jingTypes, session.getBotDifficulty(seat));

    try {
      session.engine = session.engine.discard(tile);
      session.touch(seat);
      session.clearAfkTimers();
      session.moveLog.push(...getNewEvents(session));
    } catch (err) {
      this.logger.error(`Bot discard failed — seat ${seat}, game ${session.gameId}: ${err}`);
      return;
    }

    this.broadcastEvent(session, { kind: 'discard', seat, tile });
    this.broadcastSnapshots(session);
    this.openClaimWindowAfterDiscard(session);
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

  /**
   * Handle game:tsumo from the active player.
   * The player has a complete 14-tile winning hand and chooses to declare self-draw.
   */
  handleTsumo(socket: Socket, userId: string, gameId: string): void {
    const session = this.sessions.get(gameId);
    if (!session) return this.emitError(socket, 'GAME_NOT_FOUND');

    const seat = session.getSeat(userId);
    if (seat === undefined) return this.emitError(socket, 'NOT_IN_GAME');
    if (seat !== session.engine.state.currentSeat) return this.emitError(socket, 'NOT_YOUR_TURN');
    if (session.engine.state.phase !== 'playing') return this.emitError(socket, 'INVALID_PHASE');

    this.applyWinClaim(session, seat, 'tsumo', { isRobKong: false });
  }

  private openClaimWindowAfterDiscard(session: GameSession): void {
    const eligibilityMap = computeEligibleClaims(session.engine.state);

    if (eligibilityMap.size === 0) {
      // No eligible claims — immediately advance turn
      this.advanceAfterNoClaim(session);
      return;
    }

    const eligibleSeats = new Set(eligibilityMap.keys()) as Set<Seat4>;
    const windowSecs = session.settings.claimWindowSecs ?? CLAIM_WINDOW_SECS_DEFAULT;
    const isInfinite = windowSecs === 0;
    const deadline = isInfinite ? Infinity : Date.now() + windowSecs * 1000;

    session.openClaimWindow(eligibleSeats, eligibilityMap, isInfinite ? 9999 : windowSecs, {
      isRobKong: false,
    });

    // Send claim-window event only to eligible human seats
    for (const [claimSeat, actions] of eligibilityMap) {
      const socketId = session.socketIdForSeat(claimSeat);
      if (socketId && this.server) {
        this.server.to(socketId).emit('game:claim-window', { actions, deadline });
      }
    }

    // Arm expiry timer — skipped when window is infinite (resolves only when all seats respond)
    if (!isInfinite) {
      session.claimTimer = setTimeout(() => this.resolveClaimWindow(session), windowSecs * 1000);
    }

    // Schedule async reactions for eligible bot seats — runs in parallel with human timer.
    for (const [claimSeat, actions] of eligibilityMap) {
      if (session.isBotSeat(claimSeat)) {
        void this.handleBotReaction(session, claimSeat, actions);
      }
    }
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

    // Schedule async win reactions for eligible bot seats.
    for (const s of eligibleSet) {
      if (session.isBotSeat(s)) {
        void this.handleBotReaction(session, s, [{ kind: 'win' }]);
      }
    }
  }

  private async handleBotReaction(
    session: GameSession,
    seat: Seat4,
    actions: ClaimAction[],
  ): Promise<void> {
    await this.botDelay();

    const w = session.claimWindow;
    if (!w || !w.eligibleSeats.has(seat) || w.claims.has(seat) || w.passedSeats.has(seat)) return;

    const available: BotClaimOption[] = actions.map((a) => {
      if (a.kind === 'chow')
        return { kind: 'chow', sequences: a.sequences ?? [] } as BotClaimOption;
      return { kind: a.kind } as BotClaimOption;
    });

    const state = session.engine.state;
    const discardedTile = state.pendingDiscard ?? '1m';
    const openMeldCount = state.seats[seat].openMelds.length;
    const decision = getBotClaim(
      available,
      discardedTile,
      openMeldCount,
      session.getBotDifficulty(seat),
    );

    if (!decision) {
      w.passedSeats.add(seat);
    } else {
      const claim: IncomingClaim = {
        seat,
        kind: decision.kind,
        ...(decision.kind === 'chow' ? { sequence: decision.sequence } : {}),
      };
      w.claims.set(seat, claim);
    }

    if (session.claimWindowComplete) {
      clearTimeout(session.claimTimer);
      session.claimTimer = undefined;
      this.resolveClaimWindow(session);
    }
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
    const state = session.engine.state;
    const jingPrimary = state.jingPrimary!;
    const jingSecondary = state.jingSecondary!;
    const jingTypes: TileType[] = [jingPrimary, jingSecondary];

    const winnerState = state.seats[winnerSeat];
    const isTsumo = winType === 'tsumo' && !opts.isRobKong;

    // Determine any "extra" winning tile not yet in the winner's hand.
    // Tsumo: _drawFor() adds the drawn tile to hand before this method is called,
    //   so winnerState.hand already contains the tsumo tile — no extra tile needed.
    // Ron: the pending discard is not yet in hand — append it.
    // Rob-kong: the robbed tile from the kong_added event is not in hand — append it.
    let winningTileExtra: TileType[] = [];
    if (!isTsumo && !opts.isRobKong && state.pendingDiscard) {
      winningTileExtra = [state.pendingDiscard];
    } else if (opts.isRobKong) {
      const lastKongAdded = [...session.engine.events]
        .reverse()
        .find((e): e is Extract<GameEvent, { kind: 'kong_added' }> => e.kind === 'kong_added');
      if (lastKongAdded) winningTileExtra = [lastKongAdded.tile];
    }

    const winnerAllTiles: TileType[] = [
      ...winnerState.hand,
      ...winnerState.openMelds.flatMap((m: Meld) => m.tiles as TileType[]),
      ...winningTileExtra,
    ];

    // True German: winner used no Jing AND no other player holds any Jing tiles.
    const winnerHasNoJing = !winnerAllTiles.some((t) => jingTypes.includes(t));
    const noOtherPlayerHasJing = ([0, 1, 2, 3] as const).every((i) => {
      if (i === winnerSeat) return true;
      const s = state.seats[i];
      return ![...s.hand, ...s.openMelds.flatMap((m: Meld) => m.tiles as TileType[])].some((t) =>
        jingTypes.includes(t),
      );
    });
    const isTrueGerman = winnerHasNoJing && noOtherPlayerHasJing;

    // Spirit Fishing (精钓 / Dan Diao Jiang 单吊将): tsumo win where the winning tile
    // completed the pair in the hand's decomposition, AND the winner holds at least one
    // Jing tile.  Works for any hand shape — open melds or fully concealed.
    let isSpiritFishing = false;
    if (isTsumo && winnerAllTiles.some((t) => jingTypes.includes(t))) {
      const lastDrawEv = [...session.engine.events]
        .reverse()
        .find(
          (e): e is Extract<GameEvent, { kind: 'draw' }> =>
            e.kind === 'draw' && e.seat === winnerSeat,
        );
      if (lastDrawEv) {
        const tsumoTile = lastDrawEv.tile;
        // Build the 14-tile winning hand (normalized open melds + concealed hand).
        // The concealed hand already includes the tsumo tile (added by _drawFor).
        const openNorm = winnerState.openMelds.flatMap((m: Meld) =>
          m.kind === 'kong'
            ? ([m.tiles[0], m.tiles[0], m.tiles[0]] as TileType[])
            : (m.tiles as TileType[]),
        );
        const winHand14: TileType[] = [...openNorm, ...winnerState.hand];
        // Dan Diao Jiang: the tsumo tile appears as the pair tile in at least one
        // valid decomposition of the winning hand.
        const decomps = decomposeHand(winHand14, jingTypes);
        isSpiritFishing = decomps.some((d) => d.pair === tsumoTile);
      }
    }

    // Capture the liable seat before declareWin clears pendingDiscard / discardedBySeat.
    const liableSeatForDisplay: Seat4 | undefined = opts.isRobKong
      ? opts.robKongSeat
      : winType === 'ron'
        ? (state.discardedBySeat ?? undefined)
        : undefined;

    try {
      session.engine = session.engine.declareWin(winnerSeat, {
        isTrueGerman,
        isSpiritFishing,
        robKongSeat: opts.robKongSeat,
      });
      session.moveLog.push(...getNewEvents(session));
    } catch (err) {
      if (err instanceof GameRuleError) {
        // Structured rule violation — reply to the claiming seat so the client
        // can surface the rejection rather than silently ignoring the claim.
        const socketId = session.socketIdForSeat(winnerSeat);
        if (socketId && this.server) {
          this.server.to(socketId).emit('game:error', {
            code: 'RULE_VIOLATION',
            message: (err as GameRuleError).message,
          });
        }
        this.logger.warn(
          `Rule violation in declareWin seat ${winnerSeat} game ${session.gameId}: ${err.message}`,
        );
      } else {
        this.logger.error(
          `Unexpected error in declareWin seat ${winnerSeat} game ${session.gameId}: ${err}`,
        );
      }
      return;
    }

    const lastEvent = session.engine.events.at(-1);
    const payment = lastEvent?.kind === 'win' ? lastEvent.paymentResult : undefined;

    const handType: HandType = lastEvent?.kind === 'win' ? lastEvent.handType : 'standard';

    this.broadcastEvent(session, {
      kind: 'win',
      seat: winnerSeat,
      winType,
      handType,
      payment: payment!,
    });
    this.broadcastSnapshots(session);

    this.handleHandEnd(
      session,
      winnerSeat,
      'win',
      payment,
      winType,
      handType,
      undefined,
      liableSeatForDisplay,
      opts.isRobKong,
    );
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
    this.handleHandEnd(session, null, 'concede', undefined, undefined, undefined, seat);
  }

  // ── Hand end & session management ────────────────────────────────────────────

  private handleHandEnd(
    session: GameSession,
    winnerSeat: Seat4 | null,
    result: 'win' | 'draw' | 'concede',
    payment?: WinPaymentResult,
    winType?: WinType,
    handType?: HandType,
    concedeSeat?: Seat4,
    liableSeat?: Seat4,
    isRobKong?: boolean,
  ): void {
    session.clearAfkTimers();
    session.closeClaimWindow();
    session.handsPlayed++;

    const state = session.engine.state;

    // ── Spirit settlement ──────────────────────────────────────────────────────
    let spiritDeltas: [number, number, number, number] = [0, 0, 0, 0];
    if (state.jingPrimary !== null && state.jingSecondary !== null) {
      spiritDeltas = calculateSpiritSettlement(state.seats, state.jingPrimary, state.jingSecondary);
    }

    // ── Update cumulative scores ───────────────────────────────────────────────
    for (let i = 0; i < 4; i++) {
      session.cumulativeScores[i as Seat4] = state.seats[i].score + spiritDeltas[i];
    }

    // ── Compute next dealer ────────────────────────────────────────────────────
    const nextDealerInfo = nextDealer(
      { dealerSeat: state.dealerSeat, roundWind: state.roundWind },
      winnerSeat,
    );

    const isLastHand = result === 'concede' || this.isSessionOver(session, nextDealerInfo);

    // ── Per-player spirit counts for the reveal screen ─────────────────────────
    const spiritCounts = this.computeSpiritCounts(
      state.seats,
      state.jingPrimary,
      state.jingSecondary,
    );

    // ── Net hand delta per seat (win + kong payouts + spirit vs. starting score) ─
    const handMeta = session.handLog[session.handLog.length - 1];
    const handStarting =
      handMeta?.startingScores ?? ([0, 0, 0, 0] as [number, number, number, number]);
    const handNetDeltas = session.cumulativeScores.map((s, i) => s - handStarting[i]) as [
      number,
      number,
      number,
      number,
    ];

    // ── Build hand-reveal payload ──────────────────────────────────────────────
    const handReveal: HandRevealPayload = {
      hands: state.seats.map((s) => [...s.hand]) as [
        TileType[],
        TileType[],
        TileType[],
        TileType[],
      ],
      openMelds: state.seats.map((s) => [...s.openMelds]) as [Meld[], Meld[], Meld[], Meld[]],
      jingPrimary: state.jingPrimary,
      jingSecondary: state.jingSecondary,
      spiritCounts,
      spiritDeltas,
      result,
      winnerSeat: winnerSeat ?? undefined,
      winType,
      handType,
      winPayment: payment,
      concedeSeat,
      isLastHand,
      nextDealerSeat: isLastHand ? undefined : nextDealerInfo.dealerSeat,
      handNetDeltas,
      liableSeat,
      isRobKong,
    };

    // ── Store pending state, emit hand-reveal, and pause ──────────────────────
    session.pendingHandEnd = {
      winnerSeat,
      result,
      payment,
      winType,
      handType,
      spiritDeltas,
      nextDealerInfo,
      isLastHand,
    };
    session.lastHandReveal = handReveal;

    if (this.server) {
      this.server.to(`game:${session.gameId}`).emit('game:hand-reveal', handReveal);
    }

    // The host must emit game:advance-hand to proceed.
  }

  /**
   * Compute per-seat spirit tile counts for the hand-reveal breakdown.
   */
  private computeSpiritCounts(
    seats: readonly SeatState[],
    jingPrimary: TileType | null,
    jingSecondary: TileType | null,
  ): [SpiritCount, SpiritCount, SpiritCount, SpiritCount] {
    return seats.map((seat): SpiritCount => {
      if (!jingPrimary || !jingSecondary) return { primary: 0, secondary: 0, spiritKongs: 0 };
      const allTiles: TileType[] = [
        ...seat.hand,
        ...(seat.openMelds.flatMap((m) => [...m.tiles]) as TileType[]),
      ];
      const primary = allTiles.filter((t) => t === jingPrimary).length;
      const secondary = allTiles.filter((t) => t === jingSecondary).length;
      const spiritKongs = seat.openMelds.filter(
        (m) => m.kind === 'kong' && (m.tiles[0] === jingPrimary || m.tiles[0] === jingSecondary),
      ).length;
      return { primary, secondary, spiritKongs };
    }) as [SpiritCount, SpiritCount, SpiritCount, SpiritCount];
  }

  private isSessionOver(
    session: GameSession,
    nextDealerInfo: { dealerSeat: 0 | 1 | 2 | 3; roundWind: SeatWind; roundComplete: boolean },
  ): boolean {
    const { settings, cumulativeScores, engine } = session;

    if (settings.terminationType === 'bust') {
      // Bust: only eliminate after a full round completes (roundComplete = true).
      // A player may go negative mid-round from spirit settlement and recover;
      // the check must not fire until all hands in that rotation are done.
      if (nextDealerInfo.roundComplete && cumulativeScores.some((s) => s < 0)) return true;
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
      config: { ruleTopBottomJing: session.settings.ruleTopBottomJing },
    });

    // Record hand metadata for replay
    session.handLog.push({
      seed,
      startingScores,
      dealerSeat,
      roundWind,
      eventStartIdx: session.moveLog.length,
    });

    session.engine = newEngine;
    // Start dealing phase: dealer rolls first
    session.preGamePhase = 'dealing';
    session.pendingRoll = { purpose: 'deal_1', roller: dealerSeat, seed };
    this.broadcastSnapshots(session);
    this.doBotRollIfNeeded(session);
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
    // Skip stats entirely for bot games — bot virtual accounts have no DDB profile.
    const ratingDeltas = session.hasBots
      ? ([0, 0, 0, 0] as [number, number, number, number])
      : await this.stats.updateAfterGame(session.seatMap, placement).catch((err) => {
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

    // ── Write per-user history index (skip bot virtual accounts) ─────────────
    const writes = session.seatMap
      .map((userId, i) => ({ userId, i }))
      .filter(({ i }) => !session.isBotSeat(i as Seat4))
      .map(({ userId, i }) =>
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
          .catch((err) =>
            this.logger.error(`Failed to write user game index for ${userId}: ${err}`),
          ),
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
    const botMeta = [0, 1, 2, 3].map((i): SeatBotMeta => {
      const seat = i as Seat4;
      if (!session.isBotSeat(seat)) return undefined;
      return { isBot: true, botDifficulty: session.getBotDifficulty(seat) };
    }) as [SeatBotMeta, SeatBotMeta, SeatBotMeta, SeatBotMeta];
    // Strip the server-side seed before sending pendingRoll to the client
    const clientPendingRoll = session.pendingRoll
      ? { purpose: session.pendingRoll.purpose, roller: session.pendingRoll.roller }
      : null;
    const snapshot = toClientSnapshot(
      session.engine.state,
      session.gameId,
      viewerSeat,
      session.connState,
      session.settings.viewMode,
      session.settings.ruleTopBottomJing,
      session.preGamePhase,
      botMeta,
      session.seatNames,
      session.seatAvatarUrls,
      clientPendingRoll,
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

    // Fetch profiles for seat display info
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
 *
 * engine.events resets for every hand (new GameEngine per hand) while
 * moveLog spans the whole session, so the comparison must be offset by the
 * current hand's eventStartIdx. (Without the offset, every in-play event
 * from hand 2 onward was silently dropped from the replay log.)
 */
function getNewEvents(session: GameSession) {
  const handStart = session.handLog[session.handLog.length - 1]?.eventStartIdx ?? 0;
  const loggedThisHand = session.moveLog.length - handStart;
  return session.engine.events.slice(loggedThisHand);
}
