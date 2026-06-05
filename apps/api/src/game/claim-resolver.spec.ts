/**
 * claim-resolver.spec — unit tests for simultaneous-claim resolution.
 *
 * Feature: Gameplay·call-priority
 * Priority invariant: Win > Kong/Pung > Chow
 * Multi-ron (D3): all win claims score.
 */

import { GameEngine } from '@nanchang/engine';
import type { GameState } from '@nanchang/engine';
import { computeEligibleClaims, resolveClaims } from './claim-resolver';
import type { IncomingClaim } from './claim-resolver';

// ── Fixture helpers ───────────────────────────────────────────────────────────

/**
 * Build a minimal awaiting_claims GameState for unit-testing computeEligibleClaims.
 * Only the fields read by computeEligibleClaims need to be meaningful; the rest
 * carry zero/empty sentinel values.
 */
function makeClaimsState(
  discardedBySeat: 0 | 1 | 2 | 3,
  pendingDiscard: GameState['pendingDiscard'],
  hands: [string[], string[], string[], string[]],
): GameState {
  const emptyHand: string[] = [];
  return {
    phase: 'awaiting_claims',
    seed: 0,
    jingIndicator: null,
    jingPrimary: null,
    jingSecondary: null,
    wall: [],
    deadWall: [],
    seats: ([0, 1, 2, 3] as const).map((i) => ({
      wind: (['east', 'south', 'west', 'north'] as const)[i],
      hand: (hands[i] ?? emptyHand) as GameState['seats'][0]['hand'],
      openMelds: [],
      discards: [],
      score: 0,
    })) as unknown as GameState['seats'],
    currentSeat: discardedBySeat,
    pendingDiscard,
    discardedBySeat,
    kongsTotal: 0,
    isKongDraw: false,
    dealerSeat: 0,
    roundWind: 'east',
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Create an IncomingClaim fixture. */
function claim(seat: 0 | 1 | 2 | 3, kind: IncomingClaim['kind']): IncomingClaim {
  return { seat, kind };
}

// ── resolveClaims ─────────────────────────────────────────────────────────────

describe('claim-resolver · Gameplay·call-priority', () => {
  describe('resolveClaims — priority', () => {
    it('returns empty resolution when no claims', () => {
      const r = resolveClaims([]);
      expect(r.winners).toHaveLength(0);
      expect(r.applied).toBeNull();
      expect(r.contested).toHaveLength(0);
    });

    it('win beats pung', () => {
      const r = resolveClaims([claim(1, 'win'), claim(2, 'pung')]);
      expect(r.winners).toHaveLength(1);
      expect(r.winners[0].seat).toBe(1);
      expect(r.applied).toBeNull();
      expect(r.contested).toHaveLength(1);
      expect(r.contested[0].seat).toBe(2);
    });

    it('win beats kong', () => {
      const r = resolveClaims([claim(1, 'win'), claim(2, 'kong')]);
      expect(r.winners[0].seat).toBe(1);
      expect(r.contested[0].seat).toBe(2);
    });

    it('win beats chow', () => {
      const r = resolveClaims([claim(1, 'win'), claim(2, 'chow')]);
      expect(r.winners[0].seat).toBe(1);
      expect(r.contested[0].seat).toBe(2);
    });

    it('pung beats chow', () => {
      const r = resolveClaims([claim(2, 'chow'), claim(1, 'pung')]);
      expect(r.applied?.kind).toBe('pung');
      expect(r.contested).toHaveLength(1);
      expect(r.contested[0].kind).toBe('chow');
    });

    it('kong beats chow', () => {
      const r = resolveClaims([claim(2, 'chow'), claim(1, 'kong')]);
      expect(r.applied?.kind).toBe('kong');
      expect(r.contested[0].kind).toBe('chow');
    });

    it('sole chow is applied with no contested', () => {
      const r = resolveClaims([claim(1, 'chow')]);
      expect(r.applied?.kind).toBe('chow');
      expect(r.contested).toHaveLength(0);
      expect(r.winners).toHaveLength(0);
    });

    it('sole pung is applied with no contested', () => {
      const r = resolveClaims([claim(1, 'pung')]);
      expect(r.applied?.kind).toBe('pung');
      expect(r.contested).toHaveLength(0);
    });

    it('multiple pungs: lowest seat wins, others contested', () => {
      const r = resolveClaims([claim(3, 'pung'), claim(1, 'pung'), claim(2, 'pung')]);
      expect(r.applied?.seat).toBe(1); // lowest seat index
      expect(r.contested.map((c) => c.seat).sort()).toEqual([2, 3]);
    });

    it('win + win = multi-ron (D3): all winners, others contested', () => {
      const r = resolveClaims([claim(1, 'win'), claim(3, 'win'), claim(2, 'pung')]);
      expect(r.winners).toHaveLength(2);
      expect(r.winners.map((w) => w.seat).sort()).toEqual([1, 3]);
      expect(r.contested).toHaveLength(1);
      expect(r.contested[0].seat).toBe(2);
    });

    it('win + win + win = multi-ron: all three win', () => {
      const r = resolveClaims([claim(1, 'win'), claim(2, 'win'), claim(3, 'win')]);
      expect(r.winners).toHaveLength(3);
      expect(r.applied).toBeNull();
      expect(r.contested).toHaveLength(0);
    });
  });

  // ── computeEligibleClaims (integration with engine state) ─────────────────

  describe('computeEligibleClaims', () => {
    it('returns empty map in non awaiting_claims phase', () => {
      const engine = GameEngine.create(42).deal();
      // phase = jing_reveal, no discard
      const result = computeEligibleClaims(engine.state);
      expect(result.size).toBe(0);
    });

    it('discarder cannot claim their own discard', () => {
      // Get to awaiting_claims: reveal jing, then dealer discards
      const engine = GameEngine.create(42).deal().revealJing();
      const dealerSeat = engine.state.currentSeat;
      const tile = engine.state.seats[dealerSeat].hand[0];
      const afterDiscard = engine.discard(tile);

      expect(afterDiscard.state.phase).toBe('awaiting_claims');
      expect(afterDiscard.state.discardedBySeat).toBe(dealerSeat);

      const eligible = computeEligibleClaims(afterDiscard.state);
      // Discarder should not appear in the eligible map
      expect(eligible.has(dealerSeat)).toBe(false);
    });

    it('eligible map contains only seats that have at least one valid action', () => {
      const engine = GameEngine.create(42).deal().revealJing();
      const dealerSeat = engine.state.currentSeat;
      const tile = engine.state.seats[dealerSeat].hand[0];
      const afterDiscard = engine.discard(tile);

      const eligible = computeEligibleClaims(afterDiscard.state);
      // All eligible seats should be non-discarder seats
      for (const seat of eligible.keys()) {
        expect(seat).not.toBe(dealerSeat);
        const actions = eligible.get(seat)!;
        expect(actions.length).toBeGreaterThan(0);
      }
    });

    // ── Chow seat restriction (rules §4.2) ──────────────────────────────────
    // Only the seat immediately after the discarder (CCW: nextSeat = (discardedBySeat+1)%4)
    // may be offered a chow prompt, even if other seats hold tiles that would form
    // a valid sequence with the discard.

    it('chow prompt is only sent to the seat immediately after the discarder', () => {
      // Seat 0 discards 5m.
      // Seat 1 (nextSeat) has [4m, 6m] → can form [4m, 5m, 6m].
      // Seat 2 (NOT nextSeat) also has [3m, 4m] → could form [3m, 4m, 5m] if allowed.
      // Only seat 1 should receive the chow prompt.
      const state = makeClaimsState(
        0, // discardedBySeat
        '5m' as GameState['pendingDiscard'],
        [
          ['1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p', '1s', '2s', '3s', '4s'], // seat 0 (discarder)
          ['4m', '6m', '1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p', '1s', '2s'], // seat 1 ← nextSeat: chow eligible
          ['3m', '4m', '1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p', '1s', '2s'], // seat 2: has chow tiles but wrong seat
          ['1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p', '1s', '2s', '3s', '4s'], // seat 3
        ],
      );

      const eligible = computeEligibleClaims(state);

      // Seat 1 should have a chow action
      const seat1Actions = eligible.get(1) ?? [];
      expect(seat1Actions.some((a) => a.kind === 'chow')).toBe(true);

      // Seat 2 must NOT have a chow action, even though it holds valid chow tiles
      const seat2Actions = eligible.get(2) ?? [];
      expect(seat2Actions.some((a) => a.kind === 'chow')).toBe(false);

      // Seat 3 must NOT have a chow action
      const seat3Actions = eligible.get(3) ?? [];
      expect(seat3Actions.some((a) => a.kind === 'chow')).toBe(false);
    });

    it('chow seat rotates with the discarder — seat 2 discards, only seat 3 can chow', () => {
      // Seat 2 discards 7p.
      // Seat 3 (nextSeat = (2+1)%4 = 3) has [5p, 6p] → can form [5p, 6p, 7p].
      // Seat 0 also has [6p, 8p] → could form [6p, 7p, 8p] but must NOT be offered.
      const state = makeClaimsState(
        2, // discardedBySeat
        '7p' as GameState['pendingDiscard'],
        [
          ['6p', '8p', '1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m', '1s', '2s'], // seat 0: has chow tiles, wrong seat
          ['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m', '1s', '2s', '3s', '4s'], // seat 1
          ['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m', '1s', '2s', '3s', '4s'], // seat 2 (discarder)
          ['5p', '6p', '1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m', '1s', '2s'], // seat 3 ← nextSeat: chow eligible
        ],
      );

      const eligible = computeEligibleClaims(state);

      // Seat 3 should have chow
      const seat3Actions = eligible.get(3) ?? [];
      expect(seat3Actions.some((a) => a.kind === 'chow')).toBe(true);

      // Seat 0 must NOT have chow
      const seat0Actions = eligible.get(0) ?? [];
      expect(seat0Actions.some((a) => a.kind === 'chow')).toBe(false);
    });

    it('wrap-around: seat 3 discards, only seat 0 can chow', () => {
      // nextSeat = (3+1)%4 = 0
      const state = makeClaimsState(
        3, // discardedBySeat
        '3s' as GameState['pendingDiscard'],
        [
          ['1s', '2s', '1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m', '1p', '2p'], // seat 0 ← nextSeat: chow eligible
          ['2s', '4s', '1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m', '1p', '2p'], // seat 1: has chow tiles, wrong seat
          ['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m', '1p', '2p', '3p', '4p'], // seat 2
          ['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m', '1p', '2p', '3p', '4p'], // seat 3 (discarder)
        ],
      );

      const eligible = computeEligibleClaims(state);

      // Seat 0 (wrap-around nextSeat) should have chow
      const seat0Actions = eligible.get(0) ?? [];
      expect(seat0Actions.some((a) => a.kind === 'chow')).toBe(true);

      // Seat 1 must NOT have chow
      const seat1Actions = eligible.get(1) ?? [];
      expect(seat1Actions.some((a) => a.kind === 'chow')).toBe(false);
    });
  });
});
