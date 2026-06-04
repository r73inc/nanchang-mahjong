/**
 * EloService unit tests.
 *
 * Feature coverage:
 *  - Stats·rating-delta: known inputs → known rating change (ELO formula).
 */

import { EloService } from './elo.service';

describe('EloService', () => {
  let svc: EloService;
  beforeEach(() => {
    svc = new EloService();
  });

  it('Stats·rating-delta — equal ratings, distinct placements: top gains, bottom loses', () => {
    const deltas = svc.computeDeltas([1, 2, 3, 4], [1500, 1500, 1500, 1500]);
    // With equal ratings, expected = 0.5 per pair.
    // Seat 0 (1st): beats 3 opponents → actual = 1,1,1 → delta = 3*K*(1-0.5) = 48
    expect(deltas[0]).toBe(48);
    // Seat 3 (4th): loses to 3 opponents → actual = 0,0,0 → delta = 3*K*(0-0.5) = -48
    expect(deltas[3]).toBe(-48);
    // Zero-sum: all deltas sum to 0
    expect(deltas[0] + deltas[1] + deltas[2] + deltas[3]).toBe(0);
  });

  it('Stats·rating-delta — zero-sum invariant holds for unequal ratings', () => {
    const deltas = svc.computeDeltas([2, 1, 4, 3], [1600, 1400, 1550, 1450]);
    const sum = deltas.reduce((a, b) => a + b, 0);
    // Rounding may cause ±1 deviation from zero
    expect(Math.abs(sum)).toBeLessThanOrEqual(2);
  });

  it('Stats·rating-delta — upset: low-rated player wins, gains more than equal-rated winner', () => {
    // Seat 0 rating=1200 (underdog) beats seat 1 rating=1800 (favourite)
    const deltasUpset = svc.computeDeltas([1, 2, 3, 4], [1200, 1800, 1500, 1500]);
    const deltasNormal = svc.computeDeltas([1, 2, 3, 4], [1500, 1500, 1500, 1500]);
    // Underdog winner gains more than equal-rated winner
    expect(deltasUpset[0]).toBeGreaterThan(deltasNormal[0]);
    // Favourite loser loses more than equal-rated loser
    expect(deltasUpset[1]).toBeLessThan(deltasNormal[1]);
  });

  it('Stats·rating-delta — ties: tied seats get equal deltas vs each other', () => {
    // Seats 0 and 1 tie for 1st (placement both = 1)
    const deltas = svc.computeDeltas([1, 1, 3, 4], [1500, 1500, 1500, 1500]);
    // Tied seats should have the same delta
    expect(deltas[0]).toBe(deltas[1]);
    // Both tied winners should still gain more than the 4th-place player
    expect(deltas[0]).toBeGreaterThan(deltas[3]);
  });

  it('Stats·rating-delta — all seats tied: all deltas are zero', () => {
    const deltas = svc.computeDeltas([1, 1, 1, 1], [1500, 1500, 1500, 1500]);
    expect(deltas).toEqual([0, 0, 0, 0]);
  });
});
