/**
 * replay.test.ts — Replay·deterministic
 *
 * Verifies that replayHand() re-derives the same final state as the live
 * engine when given the same seed and event log.
 */

import { describe, it, expect } from 'vitest';
import { GameEngine } from '../engine';
import { replayHand } from '../replay';
import { tilesRemaining } from '../wall';
import type { GameEvent, GameState } from '../types';

// ── Helper: play a scripted game to completion and collect events ──────────────

/**
 * Drive the engine through a sequence of forced moves and return
 * { finalState, events } so the replay can be verified against them.
 *
 * Strategy: dealer discards one tile each turn, all others pass, until
 * the wall runs dry (draw_game) or a seat wins via tsumo.
 */
function playToEnd(seed: number): { finalState: GameState; events: GameEvent[] } {
  let engine = GameEngine.create(seed, {
    startingScores: [0, 0, 0, 0],
    dealerSeat: 0,
    roundWind: 'east',
  })
    .deal()
    .revealJing();

  // Play: current seat always discards their first tile; all others pass.
  let safety = 1000;
  while (engine.state.phase === 'playing' || engine.state.phase === 'awaiting_claims') {
    if (--safety <= 0) break;

    if (engine.state.phase === 'playing') {
      const seat = engine.state.seats[engine.state.currentSeat];
      const tile = seat.hand[0]; // discard first tile
      try {
        engine = engine.discard(tile);
      } catch {
        break;
      }
    } else if (engine.state.phase === 'awaiting_claims') {
      engine = engine.passClaims();
    }
  }

  return { finalState: engine.state, events: engine.events };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('replayHand', () => {
  it('Replay·deterministic — reproduces final phase from event log', () => {
    const seed = 12345;
    const { finalState, events } = playToEnd(seed);

    const replayedStates = replayHand(
      { seed, startingScores: [0, 0, 0, 0], dealerSeat: 0, roundWind: 'east' },
      events,
    );

    const replayedFinal = replayedStates[replayedStates.length - 1];
    expect(replayedFinal.phase).toBe(finalState.phase);
  });

  it('Replay·deterministic — wall count decreases monotonically as tiles are drawn', () => {
    const seed = 99999;
    const { events } = playToEnd(seed);

    const replayedStates = replayHand(
      { seed, startingScores: [0, 0, 0, 0], dealerSeat: 0, roundWind: 'east' },
      events,
    );

    // Wall must be present throughout replay, and count must never increase
    // (each draw removes a tile; no operation can restore tiles to the wall)
    let prevCount = tilesRemaining(replayedStates[0].wall!);
    for (const state of replayedStates) {
      expect(state.wall).not.toBeNull();
      const count = tilesRemaining(state.wall!);
      expect(count).toBeLessThanOrEqual(prevCount);
      prevCount = count;
    }
  });

  it('Replay·deterministic — first replayed state is jing_reveal (post-deal)', () => {
    const seed = 1;
    const { events } = playToEnd(seed);

    const states = replayHand(
      { seed, startingScores: [0, 0, 0, 0], dealerSeat: 0, roundWind: 'east' },
      events,
    );

    expect(states[0].phase).toBe('jing_reveal');
  });

  it('Replay·deterministic — different seeds produce different initial hands', () => {
    const eventsA = playToEnd(42).events;
    const eventsB = playToEnd(43).events;

    const statesA = replayHand(
      { seed: 42, startingScores: [0, 0, 0, 0], dealerSeat: 0, roundWind: 'east' },
      eventsA,
    );
    const statesB = replayHand(
      { seed: 43, startingScores: [0, 0, 0, 0], dealerSeat: 0, roundWind: 'east' },
      eventsB,
    );

    // Post-deal hands should differ (deterministic but seed-dependent)
    const handsA = statesA[0].seats.map((s) => s.hand.join(','));
    const handsB = statesB[0].seats.map((s) => s.hand.join(','));
    expect(handsA).not.toEqual(handsB);
  });
});
