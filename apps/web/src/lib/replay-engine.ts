/**
 * replay-engine.ts — builds step-by-step timelines from replay payloads.
 *
 * Exports two timeline builders:
 *  - buildTimeline        (legacy, kept for tests/compatibility)
 *  - buildOmniscientTimeline  (new, adds claimed-discard tracking)
 *
 * Also exports challenge-mode utilities:
 *  - getChallengeSnapshot — safe indexed access with Extended Winning State logic
 */

import { replayHand } from '@nanchang/shared';
import type { GameEvent, GameState, ReplayGamePayload } from '@nanchang/shared';

// ── Core step type ─────────────────────────────────────────────────────────────

export interface ReplayStep {
  state: GameState;
  handIdx: number;
  event: GameEvent | null;
}

// ── Omniscient step type ───────────────────────────────────────────────────────

/**
 * Extends ReplayStep with per-seat claimed discard tracking.
 *
 * claimedDiscardIndices[seat] = set of indices within state.seats[seat].discards
 * that have been consumed by a Pung/Chow/open Kong up to and including this step.
 * Rendering code should skip those indices in the visual discard pool.
 */
export interface OmniscientReplayStep extends ReplayStep {
  claimedDiscardIndices: readonly [
    ReadonlySet<number>,
    ReadonlySet<number>,
    ReadonlySet<number>,
    ReadonlySet<number>,
  ];
}

// ── Challenge snapshot helpers ─────────────────────────────────────────────────

export interface ChallengeSnapshot {
  step: OmniscientReplayStep;
  /** True when globalTurnIndex exceeds the participant's timeline length. */
  isExtendedWinningState: boolean;
}

/**
 * Safe accessor for challenge mode that implements the Extended Winning State:
 * if globalTurnIndex is past the end of this participant's timeline, return the
 * final state and flag it so the UI can display a "Match Concluded" overlay.
 */
export function getChallengeSnapshot(
  timelines: Record<string, OmniscientReplayStep[]>,
  participantSub: string,
  globalTurnIndex: number,
): ChallengeSnapshot {
  const timeline = timelines[participantSub];
  if (!timeline || timeline.length === 0) {
    throw new Error(`No timeline for participant ${participantSub}`);
  }
  const lastIdx = timeline.length - 1;
  if (globalTurnIndex > lastIdx) {
    return { step: timeline[lastIdx], isExtendedWinningState: true };
  }
  return { step: timeline[globalTurnIndex], isExtendedWinningState: false };
}

// ── Internal shared timeline builder ──────────────────────────────────────────

/**
 * Given a ReplayHandData event list, return [causes, states] aligned arrays.
 * Applies the same filtering/kong-double-advance logic used everywhere.
 */
function buildHandCauses(
  hand: ReplayGamePayload['hands'][number],
  settings: ReplayGamePayload['settings'],
): { causes: (GameEvent | null)[]; states: GameState[] } {
  const states = replayHand(
    {
      seed: hand.seed,
      startingScores: hand.startingScores,
      dealerSeat: hand.dealerSeat,
      roundWind: hand.roundWind,
      config: { ruleTopBottomJing: settings.ruleTopBottomJing },
    },
    hand.events,
  );

  const causes: (GameEvent | null)[] = [null];
  let i = 0;
  while (i < hand.events.length) {
    const event = hand.events[i];
    if (
      event.kind === 'deal' ||
      event.kind === 'dice_roll' ||
      event.kind === 'opening_jing_settlement'
    ) {
      i += 1;
      continue;
    }
    causes.push(event);
    const advance =
      event.kind === 'kong_open' || event.kind === 'kong_concealed' || event.kind === 'kong_added'
        ? 2
        : 1;
    i += advance;
  }

  return { causes, states };
}

// ── Legacy builder (kept for backward compatibility) ──────────────────────────

export function buildTimeline(payload: ReplayGamePayload): ReplayStep[] {
  const steps: ReplayStep[] = [];
  for (let handIdx = 0; handIdx < payload.hands.length; handIdx++) {
    const { causes, states } = buildHandCauses(payload.hands[handIdx], payload.settings);
    for (let j = 0; j < Math.min(states.length, causes.length); j++) {
      steps.push({ state: states[j], handIdx, event: causes[j] });
    }
  }
  return steps;
}

// ── Omniscient builder ────────────────────────────────────────────────────────

/**
 * Builds a full timeline with claimed-discard tracking.
 *
 * For each step we accumulate which indices in each seat's `discards` array
 * have been consumed by Pung/Chow/open Kong actions. The engine retains all
 * discards in `SeatState.discards` even after a claim; this metadata lets the
 * UI filter them out for an accurate visual pool.
 *
 * Claim detection logic:
 *   - A `discard` event appends to the discarding seat's pool; we record the
 *     seat and index for the next step.
 *   - A `pung`, `chow`, or `kong_open` event consumes that recorded index.
 *   - `kong_concealed` / `kong_added` come from the player's own hand — they
 *     do not touch any discard pool.
 */
export function buildOmniscientTimeline(payload: ReplayGamePayload): OmniscientReplayStep[] {
  const steps: OmniscientReplayStep[] = [];

  for (let handIdx = 0; handIdx < payload.hands.length; handIdx++) {
    const { causes, states } = buildHandCauses(payload.hands[handIdx], payload.settings);

    // Mutable tracking across this hand
    const claimedSets: [Set<number>, Set<number>, Set<number>, Set<number>] = [
      new Set(),
      new Set(),
      new Set(),
      new Set(),
    ];
    let lastDiscardSeat: 0 | 1 | 2 | 3 | null = null;
    let lastDiscardIndex = -1;

    for (let j = 0; j < Math.min(states.length, causes.length); j++) {
      const event = causes[j];

      if (event?.kind === 'discard') {
        lastDiscardSeat = event.seat;
        // The state at this step already has the tile appended to discards
        lastDiscardIndex = states[j].seats[event.seat].discards.length - 1;
      } else if (
        (event?.kind === 'pung' || event?.kind === 'chow' || event?.kind === 'kong_open') &&
        lastDiscardSeat !== null &&
        lastDiscardIndex >= 0
      ) {
        claimedSets[lastDiscardSeat].add(lastDiscardIndex);
        lastDiscardSeat = null;
        lastDiscardIndex = -1;
      } else if (event?.kind === 'draw') {
        // A draw means the claim window passed without a claim — reset tracking
        lastDiscardSeat = null;
        lastDiscardIndex = -1;
      }

      // Snapshot the claimed sets immutably for this step
      steps.push({
        state: states[j],
        handIdx,
        event,
        claimedDiscardIndices: [
          new Set(claimedSets[0]),
          new Set(claimedSets[1]),
          new Set(claimedSets[2]),
          new Set(claimedSets[3]),
        ],
      });
    }
  }

  return steps;
}
