/**
 * claim-resolver.spec — unit tests for simultaneous-claim resolution.
 *
 * Feature: Gameplay·call-priority
 * Priority invariant: Win > Kong/Pung > Chow
 * Multi-ron (D3): all win claims score.
 */

import { GameEngine } from '@nanchang/engine';
import { computeEligibleClaims, resolveClaims } from './claim-resolver';
import type { IncomingClaim } from './claim-resolver';

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
  });
});
