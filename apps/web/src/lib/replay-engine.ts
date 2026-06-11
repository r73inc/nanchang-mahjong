/**
 * replay-engine.ts — builds a flat, step-by-step timeline from a ReplayGamePayload.
 *
 * Each step pairs a GameState snapshot with the event that caused the
 * transition, allowing the replay player to scrub through the game.
 */

import { replayHand } from '@nanchang/shared';
import type { GameEvent, GameState, ReplayGamePayload } from '@nanchang/shared';

export interface ReplayStep {
  /** Engine state at this point in the game. */
  state: GameState;
  /** Which hand (0-indexed) this step belongs to. */
  handIdx: number;
  /** The event that produced this state, or null for the initial deal state. */
  event: GameEvent | null;
}

/**
 * Pre-compute the full step-by-step replay timeline from a payload.
 * Returns one ReplayStep per engine transition across all hands.
 */
export function buildTimeline(payload: ReplayGamePayload): ReplayStep[] {
  const steps: ReplayStep[] = [];

  for (let handIdx = 0; handIdx < payload.hands.length; handIdx++) {
    const hand = payload.hands[handIdx];

    const states = replayHand(
      {
        seed: hand.seed,
        startingScores: hand.startingScores,
        dealerSeat: hand.dealerSeat,
        roundWind: hand.roundWind,
        // Rule variants change what revealJing() does — required for a faithful replay
        config: { ruleTopBottomJing: payload.settings.ruleTopBottomJing },
      },
      hand.events,
    );

    // Build an ordered list of (event → state) pairs.
    // states[0] = post-deal state (no triggering event).
    // Each subsequent state was produced by one processed event.
    // kong_* events advance by 2 (consuming the following dead-wall draw).
    const causes: (GameEvent | null)[] = [null]; // null = initial deal state

    let i = 0;
    while (i < hand.events.length) {
      const event = hand.events[i];
      // Skip events that replayHand() consumes without pushing a state:
      // dice rolls + deal are applied inside deal()/revealJing(), and the
      // opening settlement state lands together with the jing_indicator step.
      if (
        event.kind === 'deal' ||
        event.kind === 'dice_roll' ||
        event.kind === 'opening_jing_settlement'
      ) {
        i += 1;
        continue;
      }
      causes.push(event);
      // Kong events consume the following 'draw' event internally
      const advance =
        event.kind === 'kong_open' || event.kind === 'kong_concealed' || event.kind === 'kong_added'
          ? 2
          : 1;
      i += advance;
    }

    for (let j = 0; j < Math.min(states.length, causes.length); j++) {
      steps.push({ state: states[j], handIdx, event: causes[j] });
    }
  }

  return steps;
}
