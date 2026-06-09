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
import type { ClientGameState, ClientSeatState, BotDifficulty } from '@nanchang/shared';
import type { ConnState } from './game-session';

export type ViewerSeat = 0 | 1 | 2 | 3 | null;

/** Per-seat bot metadata to embed in the snapshot — undefined means human seat. */
export type SeatBotMeta = { isBot: boolean; botDifficulty?: BotDifficulty } | undefined;

export function toClientSnapshot(
  state: GameState,
  gameId: string,
  viewerSeat: ViewerSeat,
  connState: readonly [ConnState, ConnState, ConnState, ConnState],
  viewMode: '2D' | '3D' = '3D',
  ruleTopBottomJing = false,
  preGamePhase: 'hands' | 'settlement' | 'jing' | null = null,
  botMeta?: readonly [SeatBotMeta, SeatBotMeta, SeatBotMeta, SeatBotMeta],
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
    wallCount: state.wall.length,
    deadWallCount: state.deadWall.length,
    pendingDiscard: state.pendingDiscard,
    discardedBySeat: state.discardedBySeat,
    viewerSeat,
    seats,
    viewMode,
    ruleTopBottomJing,
    preGamePhase,
  };
}
