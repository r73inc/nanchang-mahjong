/**
 * toClientSnapshot — pure per-viewer redaction function.
 *
 * Rules:
 *  - Viewer's own seat: full hand revealed.
 *  - All other seats: hand = null, handCount = true length.
 *  - Spectators (viewerSeat = null): all hands = null.
 *  - Wall / dead-wall contents never sent; only counts.
 *
 * This single function enforces PLAN §7.4 (server authoritative) and §7.8
 * (spectator cannot see concealed hands). It is unit-tested in snapshot.spec.ts.
 */

import type { GameState } from '@nanchang/engine';
import { tilesRemaining } from '@nanchang/engine';
import type {
  ClientGameState,
  ClientSeatState,
  ClientWallState,
  BotDifficulty,
} from '@nanchang/shared';
import type { ConnState } from './game-session';

export type ViewerSeat = 0 | 1 | 2 | 3 | null;

/** Per-seat bot metadata to embed in the snapshot — undefined means human seat. */
export type SeatBotMeta = { isBot: boolean; botDifficulty?: BotDifficulty } | undefined;

/**
 * Strip the wall down to its public positional state. Dice values, pointers,
 * and stack positions are public table state — only tile identities
 * (drawOrder) are secret and never leave the server.
 *
 * TODO (Spectator Mode): Expose a 'revealedWallTiles' array in ClientWallState
 * so late-joining spectators can accurately render the faces of swapped Jing
 * settlement tiles on the 2D table.
 */
function toClientWallState(wall: GameState['wall']): ClientWallState | null {
  if (!wall) return null;
  return {
    wallSelectionDice: wall.wallSelectionDice,
    dealStartDice: wall.dealStartDice,
    dealStartSeat: wall.dealStartSeat,
    dealStartStack: wall.dealStartStack,
    drawPtr: wall.drawPtr,
    kongDraws: wall.kongDraws,
    jingDice: wall.jingDice,
    jingStackGlobal: wall.jingStackGlobal,
  };
}

export function toClientSnapshot(
  state: GameState,
  gameId: string,
  viewerSeat: ViewerSeat,
  connState: readonly [ConnState, ConnState, ConnState, ConnState],
  viewMode: '2D' | '3D' = '3D',
  ruleTopBottomJing = false,
  preGamePhase: 'dealing' | 'hands' | 'settlement' | 'jing' | null = null,
  botMeta?: readonly [SeatBotMeta, SeatBotMeta, SeatBotMeta, SeatBotMeta],
  seatNames?: readonly [string, string, string, string],
  seatAvatarUrls?: readonly [string | null, string | null, string | null, string | null],
  pendingRoll: {
    purpose: 'deal_1' | 'deal_2' | 'jing_reveal';
    roller: 0 | 1 | 2 | 3;
  } | null = null,
): ClientGameState {
  const seats = state.seats.map((seat, i): ClientSeatState => {
    const isOwnSeat = viewerSeat === i;
    const bot = botMeta?.[i];
    return {
      wind: seat.wind,
      score: seat.score,
      connected: connState[i].connected,
      afk: connState[i].afk,
      openMelds: seat.openMelds,
      discards: seat.discards,
      hand: isOwnSeat ? [...seat.hand] : null,
      handCount: seat.hand.length,
      ...(bot?.isBot ? { isBot: true, botDifficulty: bot.botDifficulty } : {}),
      seatName: seatNames?.[i] ?? seat.wind,
      avatarUrl: seatAvatarUrls?.[i] ?? null,
    };
  }) as [ClientSeatState, ClientSeatState, ClientSeatState, ClientSeatState];

  return {
    gameId,
    phase: state.phase,
    jingIndicator: state.jingIndicator,
    jingPrimary: state.jingPrimary,
    jingSecondary: state.jingSecondary,
    currentSeat: state.currentSeat,
    dealerSeat: state.dealerSeat,
    roundWind: state.roundWind,
    wallCount: state.wall ? tilesRemaining(state.wall) : 0,
    wall: toClientWallState(state.wall),
    pendingDiscard: state.pendingDiscard,
    discardedBySeat: state.discardedBySeat,
    viewerSeat,
    seats,
    viewMode,
    ruleTopBottomJing,
    preGamePhase,
    pendingRoll,
  };
}
