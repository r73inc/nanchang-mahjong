/**
 * DiceRollOverlay.test — unit tests for the manual dice-roll pause UI.
 *
 * Feature: Gameplay·dice-roll-overlay
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DiceRollOverlay } from './DiceRollOverlay';
import type { ClientGameState } from '@nanchang/shared';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSeat(wind: 'east' | 'south' | 'west' | 'north', name: string) {
  return {
    wind,
    score: 0,
    connected: true,
    afk: false,
    openMelds: [],
    discards: [],
    hand: null,
    handCount: 13,
    seatName: name,
  } as const;
}

function makeSnapshot(overrides: Partial<ClientGameState> = {}): ClientGameState {
  return {
    gameId: 'g1',
    phase: 'dealing',
    jingIndicator: null,
    jingPrimary: null,
    jingSecondary: null,
    currentSeat: 0,
    dealerSeat: 0,
    roundWind: 'east',
    wallCount: 0,
    wall: null,
    pendingDiscard: null,
    discardedBySeat: null,
    viewerSeat: 0,
    viewMode: '2D',
    ruleTopBottomJing: false,
    preGamePhase: 'dealing',
    pendingRoll: { purpose: 'deal_1', roller: 0 },
    seats: [
      makeSeat('east', 'Alice'),
      makeSeat('south', 'Bob'),
      makeSeat('west', 'Carol'),
      makeSeat('north', 'Dave'),
    ],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DiceRollOverlay · Gameplay·dice-roll-overlay', () => {
  const onRoll = vi.fn();
  const onAnimationComplete = vi.fn();

  beforeEach(() => {
    onRoll.mockClear();
    onAnimationComplete.mockClear();
  });

  describe('interactive state — viewer is the roller', () => {
    it('shows Roll Dice button when pendingRoll.roller === viewerSeat', () => {
      const snapshot = makeSnapshot({
        viewerSeat: 0,
        pendingRoll: { purpose: 'deal_1', roller: 0 },
      });
      render(
        <DiceRollOverlay
          snapshot={snapshot}
          diceAnimation={null}
          onRoll={onRoll}
          onAnimationComplete={onAnimationComplete}
        />,
      );
      expect(screen.getByRole('button', { name: /roll dice/i })).toBeInTheDocument();
    });

    it('calls onRoll when Roll Dice button is clicked', () => {
      const snapshot = makeSnapshot({
        viewerSeat: 0,
        pendingRoll: { purpose: 'deal_1', roller: 0 },
      });
      render(
        <DiceRollOverlay
          snapshot={snapshot}
          diceAnimation={null}
          onRoll={onRoll}
          onAnimationComplete={onAnimationComplete}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /roll dice/i }));
      expect(onRoll).toHaveBeenCalledTimes(1);
    });
  });

  describe('waiting state — another player is the roller', () => {
    it('shows waiting message when viewer is not the roller', () => {
      const snapshot = makeSnapshot({
        viewerSeat: 1,
        pendingRoll: { purpose: 'deal_1', roller: 0 },
      });
      render(
        <DiceRollOverlay
          snapshot={snapshot}
          diceAnimation={null}
          onRoll={onRoll}
          onAnimationComplete={onAnimationComplete}
        />,
      );
      expect(screen.getByText(/waiting for alice/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /roll dice/i })).not.toBeInTheDocument();
    });
  });

  describe('dice roll purposes', () => {
    it.each([
      ['deal_1', /roll to select the starting wall/i],
      ['deal_2', /roll to select the starting stack/i],
      ['jing_reveal', /roll to reveal the spirit tile/i],
    ] as const)('shows correct label for purpose %s', (purpose, label) => {
      const snapshot = makeSnapshot({ pendingRoll: { purpose, roller: 0 } });
      render(
        <DiceRollOverlay
          snapshot={snapshot}
          diceAnimation={null}
          onRoll={onRoll}
          onAnimationComplete={onAnimationComplete}
        />,
      );
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  describe('animation state', () => {
    it('shows dice result during animation', () => {
      const snapshot = makeSnapshot({ pendingRoll: null });
      render(
        <DiceRollOverlay
          snapshot={snapshot}
          diceAnimation={{ dice: [3, 4], purpose: 'wall_selection', roller: 0 }}
          onRoll={onRoll}
          onAnimationComplete={onAnimationComplete}
        />,
      );
      // Result text should show the sum
      expect(screen.getByText(/3 \+ 4 = 7/)).toBeInTheDocument();
    });

    it('hides Roll Dice button when animation is playing', () => {
      const snapshot = makeSnapshot({ pendingRoll: null });
      render(
        <DiceRollOverlay
          snapshot={snapshot}
          diceAnimation={{ dice: [2, 5], purpose: 'deal_start', roller: 0 }}
          onRoll={onRoll}
          onAnimationComplete={onAnimationComplete}
        />,
      );
      expect(screen.queryByRole('button', { name: /roll dice/i })).not.toBeInTheDocument();
    });
  });
});
