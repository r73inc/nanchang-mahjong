/**
 * replayHand — pure utility for re-deriving game states from a move log.
 *
 * Given the seed + per-hand config used to create a GameEngine, plus the
 * sequence of GameEvents that were emitted during play, returns an ordered
 * array of GameState snapshots: one entry per engine transition.
 *
 * The first entry is the post-deal state (jing_reveal phase).
 * Each subsequent entry is the state immediately after the corresponding
 * engine method returned.
 *
 * Usage: step through the returned array to replay the game move-by-move.
 */

import { GameEngine } from './engine';
import type { GameConfig, GameEvent, GameState, SeatWind } from './types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReplayHandConfig {
  seed: number;
  startingScores: [number, number, number, number];
  dealerSeat: 0 | 1 | 2 | 3;
  roundWind: SeatWind;
  /**
   * Rule-variant flags the hand was played with. Required for correct replay:
   * ruleTopBottomJing changes what revealJing() does (settlement + swap).
   */
  config?: Partial<GameConfig>;
}

// ── replayHand ────────────────────────────────────────────────────────────────

export function replayHand(config: ReplayHandConfig, events: GameEvent[]): GameState[] {
  let engine = GameEngine.create(config.seed, {
    startingScores: config.startingScores,
    dealerSeat: config.dealerSeat,
    roundWind: config.roundWind,
    config: config.config,
  }).deal();

  const states: GameState[] = [engine.state]; // post-deal state (jing_reveal phase)

  let i = 0;
  while (i < events.length) {
    const event = events[i];
    let advance = 1;

    switch (event.kind) {
      case 'deal':
      case 'dice_roll':
        // Dice rolls and the deal are seed-derived and already applied by
        // GameEngine.create().deal() / revealJing() — skip.
        i += 1;
        continue;

      case 'jing_indicator':
        // revealJing transitions jing_reveal → playing; dealer acts first
        engine = engine.revealJing();
        states.push(engine.state);
        break;

      case 'discard':
        engine = engine.discard(event.tile);
        states.push(engine.state);
        break;

      case 'draw':
        // A stand-alone 'draw' always means passClaims() was called.
        // Dead-wall draws after kong claims are consumed internally by the
        // kong methods below (advance = 2 skips the following draw event).
        // Guard matches draw_game: skip silently if phase is wrong rather than
        // throwing, so an unexpected draw in the log doesn't crash the replay.
        if (engine.state.phase === 'awaiting_claims') {
          engine = engine.passClaims();
          states.push(engine.state);
        }
        break;

      case 'pung':
        engine = engine.pung(event.seat);
        states.push(engine.state);
        break;

      case 'chow':
        engine = engine.chow(event.seat, event.sequence);
        states.push(engine.state);
        break;

      case 'kong_open':
        // kongFromDiscard emits kong_open + dead-wall draw internally (2 events).
        engine = engine.kongFromDiscard(event.seat);
        states.push(engine.state);
        advance = 2;
        break;

      case 'kong_concealed':
        // kongConcealed emits kong_concealed + dead-wall draw internally (2 events).
        engine = engine.kongConcealed(event.seat, event.tile);
        states.push(engine.state);
        advance = 2;
        break;

      case 'kong_added':
        // addToKong emits kong_added + dead-wall draw internally (2 events).
        engine = engine.addToKong(event.seat, event.tile);
        states.push(engine.state);
        advance = 2;
        break;

      case 'win': {
        // Rob-kong: engine is in 'playing' phase and the winner is not the current seat.
        const isRobKong =
          engine.state.phase === 'playing' && event.seat !== engine.state.currentSeat;
        engine = engine.declareWin(event.seat, {
          ...(isRobKong ? { robKongSeat: engine.state.currentSeat } : {}),
        });
        states.push(engine.state);
        break;
      }

      case 'draw_game':
        // Wall exhausted via passClaims() — call it to transition to finished.
        // (draw_game events that follow a kong dead-wall draw are already consumed
        // by the advance = 2 in the kong_open/kong_concealed/kong_added cases above,
        // so any draw_game we reach here always means the engine is awaiting_claims.)
        if (engine.state.phase === 'awaiting_claims') {
          engine = engine.passClaims();
          states.push(engine.state);
        }
        break;

      case 'concede':
        engine = engine.concede(event.seat);
        states.push(engine.state);
        break;
    }

    i += advance;
  }

  return states;
}
