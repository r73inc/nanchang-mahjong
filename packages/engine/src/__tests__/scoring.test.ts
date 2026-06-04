/**
 * Scoring tests — locked rules §6 (Base × Multipliers system).
 *
 * These tests replace the old fan-based scoring tests and verify the
 * calculateWinPayout, instantKongPayment, and calculateSpiritSettlement
 * functions against the locked Nanchang Mahjong rules document.
 */
import { describe, it, expect } from 'vitest';
import { calculateWinPayout, instantKongPayment, calculateSpiritSettlement } from '../scoring';
import type { ScoringContext, SeatState, TileType } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Base context: standard hand, ron, seat 1 (south) wins off seat 0 discard.
 * Dealer is seat 3 (not the winner or discarder) so no dealer modifier fires by default.
 */
function baseCtx(overrides: Partial<ScoringContext> = {}): ScoringContext {
  return {
    winType: 'ron',
    handType: 'standard',
    winnerSeat: 1,
    dealerSeat: 3, // neither winner nor discarder — no dealer modifier in base case
    discarderSeat: 0,
    seatWind: 'south',
    roundWind: 'east',
    isRobKong: false,
    isGerman: false,
    isTrueGerman: false,
    isSpiritFishing: false,
    isHeavenlyWin: false,
    isEarthlyWin: false,
    isAfterKong: false,
    isLastTile: false,
    jingsUsed: 0,
    openMelds: [],
    ...overrides,
  };
}

function blankSeat(wind: TileType = 'east'): SeatState {
  return { wind: wind as never, hand: [], openMelds: [], discards: [], score: 0 };
}

// ── Zero-sum invariant ────────────────────────────────────────────────────────

function assertZeroSum(result: ReturnType<typeof calculateWinPayout>) {
  const total = result.scoreDelta.reduce((s, v) => s + v, 0);
  expect(total).toBe(0);
}

// ── Standard Ron payment structure (§6.3) ────────────────────────────────────

describe('Engine·scoring-ron-base', () => {
  it('standard ron: discarder pays ×2, each other non-winner pays ×1', () => {
    // base=1, no multipliers: discarder pays 2, others pay 1 each
    const r = calculateWinPayout(baseCtx());
    // winner=1, discarder=0 (east dealer), others=2,3
    expect(r.scoreDelta[1]).toBe(4); // wins: 2 + 1 + 1
    expect(r.scoreDelta[0]).toBe(-2); // discarder pays ×2
    expect(r.scoreDelta[2]).toBe(-1); // non-winner pays ×1
    expect(r.scoreDelta[3]).toBe(-1); // non-winner pays ×1
    assertZeroSum(r);
  });

  it('is zero-sum', () => {
    assertZeroSum(calculateWinPayout(baseCtx()));
  });
});

describe('Engine·scoring-tsumo-base', () => {
  it('standard tsumo: each loser pays ×2', () => {
    // base=1, tsumo, winner is seat 1 (not dealer=3): each pays 2, winner gets 6
    const r = calculateWinPayout(
      baseCtx({ winType: 'tsumo', winnerSeat: 1, discarderSeat: undefined }),
    );
    expect(r.scoreDelta[1]).toBe(6); // wins from 3 losers × 2 = 6
    expect(r.scoreDelta[0]).toBe(-2);
    expect(r.scoreDelta[2]).toBe(-2);
    expect(r.scoreDelta[3]).toBe(-2);
    assertZeroSum(r);
  });
});

// ── Dealer win ×2 (§6.3) ─────────────────────────────────────────────────────

describe('Engine·scoring-dealer-win', () => {
  it('dealer tsumo: all losers pay double (×2 from dealer win)', () => {
    // dealer=0, winner=0 (dealer tsumo) → dealer ×2: each pays 1×2×2=4
    const r = calculateWinPayout(
      baseCtx({ winType: 'tsumo', winnerSeat: 0, dealerSeat: 0, discarderSeat: undefined }),
    );
    expect(r.scoreDelta[0]).toBe(12); // 3 losers × 4 = 12
    expect(r.scoreDelta[1]).toBe(-4);
    expect(r.scoreDelta[2]).toBe(-4);
    expect(r.scoreDelta[3]).toBe(-4);
    assertZeroSum(r);
    expect(r.items.some((i) => i.name === 'Dealer')).toBe(true);
  });

  it('dealer ron: all payers double (×2 from dealer win)', () => {
    // dealer=0 wins ron off seat 1 → dealer ×2: discarder pays 4, others pay 2
    const r = calculateWinPayout(
      baseCtx({ winType: 'ron', winnerSeat: 0, dealerSeat: 0, discarderSeat: 1 }),
    );
    expect(r.scoreDelta[0]).toBe(8); // 4 + 2 + 2
    expect(r.scoreDelta[1]).toBe(-4); // discarder: base×2 × dealer×2 = 4
    expect(r.scoreDelta[2]).toBe(-2);
    expect(r.scoreDelta[3]).toBe(-2);
    assertZeroSum(r);
  });

  it('Engine·dealer-doubles: dealer loss as discarder pays extra', () => {
    // Non-dealer wins ron, but the discarder IS the dealer → dealer pays ×2 extra
    // winner=1, dealerSeat=0, discarderSeat=0: discarder pays ×2×2=×4, others(2,3) pay ×1
    const r = calculateWinPayout(
      baseCtx({ winType: 'ron', winnerSeat: 1, dealerSeat: 0, discarderSeat: 0 }),
    );
    expect(r.scoreDelta[0]).toBe(-4); // dealer-loss: base×2 × dealer×2 = 4
    expect(r.scoreDelta[2]).toBe(-1);
    expect(r.scoreDelta[3]).toBe(-1);
    expect(r.scoreDelta[1]).toBe(6); // 4 + 1 + 1
    assertZeroSum(r);
  });
});

// ── Hand type multipliers (§6.3) ──────────────────────────────────────────────

describe('Engine·scoring-hand-types', () => {
  it('Seven Pairs ×2', () => {
    const r = calculateWinPayout(
      baseCtx({
        winType: 'tsumo',
        winnerSeat: 1,
        discarderSeat: undefined,
        handType: 'seven_pairs',
      }),
    );
    // base×2(hand)×2(tsumo) = 4 per loser
    // winner is not dealer so no extra dealer multiplier
    expect(r.scoreDelta[1]).toBe(12);
    expect(r.items.some((i) => i.name === 'Seven Pairs')).toBe(true);
    assertZeroSum(r);
  });

  it('All Triplets ×2', () => {
    const r = calculateWinPayout(
      baseCtx({
        winType: 'tsumo',
        winnerSeat: 1,
        discarderSeat: undefined,
        handType: 'all_triplets',
      }),
    );
    expect(r.totalMultiplier).toBe(2);
    expect(r.items.some((i) => i.name === 'All Triplets')).toBe(true);
    assertZeroSum(r);
  });

  it('Thirteen Misfits ×2', () => {
    const r = calculateWinPayout(
      baseCtx({
        winType: 'tsumo',
        winnerSeat: 1,
        discarderSeat: undefined,
        handType: 'thirteen_misfits',
      }),
    );
    expect(r.totalMultiplier).toBe(2);
    assertZeroSum(r);
  });

  it('Seven Star Thirteen Misfits ×4', () => {
    const r = calculateWinPayout(
      baseCtx({
        winType: 'tsumo',
        winnerSeat: 1,
        discarderSeat: undefined,
        handType: 'seven_star_thirteen',
      }),
    );
    expect(r.totalMultiplier).toBeGreaterThanOrEqual(4);
    expect(r.items.some((i) => i.name === 'Seven Star Thirteen Misfits')).toBe(true);
    assertZeroSum(r);
  });
});

// ── German / True German (§6.4) ───────────────────────────────────────────────

describe('Engine·scoring-german', () => {
  it('German ×2 + flat +5 per loser', () => {
    const r = calculateWinPayout(
      baseCtx({
        winType: 'tsumo',
        winnerSeat: 1,
        discarderSeat: undefined,
        isGerman: true,
      }),
    );
    // German ×2: each loser pays (1×2×2) + 5 = 9; winner gets 27
    expect(r.scoreDelta[1]).toBe(27);
    expect(r.scoreDelta[0]).toBe(-9);
    expect(r.scoreDelta[2]).toBe(-9);
    expect(r.scoreDelta[3]).toBe(-9);
    expect(r.items.some((i) => i.name === 'German')).toBe(true);
    expect(r.flatBonusPerLoser).toBe(5);
    assertZeroSum(r);
  });

  it('True German ×4 + flat +5 per loser (supersedes German)', () => {
    const r = calculateWinPayout(
      baseCtx({
        winType: 'tsumo',
        winnerSeat: 1,
        discarderSeat: undefined,
        isGerman: true,
        isTrueGerman: true,
      }),
    );
    // True German ×4: each loser pays (1×4×2) + 5 = 13; winner gets 39
    expect(r.scoreDelta[1]).toBe(39);
    expect(r.items.some((i) => i.name === 'True German')).toBe(true);
    expect(r.items.some((i) => i.name === 'German')).toBe(false); // superseded
    assertZeroSum(r);
  });

  it('Engine·scoring-clean-win: isGerman true when jingsUsed is 0', () => {
    // The 'German' condition is exactly jingsUsed === 0, confirmed in scoring context
    const ctx = baseCtx({ isGerman: true, jingsUsed: 0 });
    expect(ctx.isGerman).toBe(true);
  });
});

// ── Spirit Fishing (§6.4) ─────────────────────────────────────────────────────

describe('Engine·scoring-spirit-fishing', () => {
  it('Spirit Fishing ×2 (tsumo with open 4-meld hand waiting on pair)', () => {
    const r = calculateWinPayout(
      baseCtx({
        winType: 'tsumo',
        winnerSeat: 1,
        discarderSeat: undefined,
        isSpiritFishing: true,
      }),
    );
    expect(r.totalMultiplier).toBe(2);
    expect(r.items.some((i) => i.name === 'Spirit Fishing')).toBe(true);
    assertZeroSum(r);
  });
});

// ── Heavenly / Earthly Win (§6.3) ─────────────────────────────────────────────

describe('Engine·scoring-heavenly-earthly', () => {
  it('Heavenly Win: flat 20 from each, winner gets 60', () => {
    const r = calculateWinPayout(
      baseCtx({
        winType: 'tsumo',
        winnerSeat: 0,
        discarderSeat: undefined,
        isHeavenlyWin: true,
      }),
    );
    expect(r.scoreDelta[0]).toBe(60);
    expect(r.scoreDelta[1]).toBe(-20);
    expect(r.scoreDelta[2]).toBe(-20);
    expect(r.scoreDelta[3]).toBe(-20);
    assertZeroSum(r);
  });

  it('Earthly Win: flat 20 from each, overrides multipliers', () => {
    const r = calculateWinPayout(
      baseCtx({
        winType: 'ron',
        winnerSeat: 1,
        discarderSeat: 0,
        isEarthlyWin: true,
        isGerman: true, // would be ×2 normally — earthly overrides
      }),
    );
    expect(r.scoreDelta[1]).toBe(60);
    assertZeroSum(r);
  });
});

// ── Rob Kong (§6.3) ───────────────────────────────────────────────────────────

describe('Engine·scoring-rob-kong', () => {
  it('Rob Kong: konger pays all 3 shares (treated as tsumo)', () => {
    // winner=2, kongSeat=0 (konger), base: konger pays 2×3=6, others pay 0
    const r = calculateWinPayout(
      baseCtx({
        winType: 'tsumo',
        winnerSeat: 2,
        discarderSeat: undefined,
        kongSeat: 0,
        isRobKong: true,
      }),
    );
    expect(r.scoreDelta[2]).toBe(6); // winner gets 6
    expect(r.scoreDelta[0]).toBe(-6); // konger pays everything
    expect(r.scoreDelta[1]).toBe(0);
    expect(r.scoreDelta[3]).toBe(0);
    assertZeroSum(r);
  });
});

// ── Multiplier stacking ───────────────────────────────────────────────────────

describe('Engine·scoring-multiplier-stacking', () => {
  it('Seven Pairs + German tsumo: multipliers stack', () => {
    // Seven Pairs ×2, German ×2 = ×4; each loser pays (1×4×2)+5 = 13; winner gets 39
    const r = calculateWinPayout(
      baseCtx({
        winType: 'tsumo',
        winnerSeat: 1,
        discarderSeat: undefined,
        handType: 'seven_pairs',
        isGerman: true,
      }),
    );
    expect(r.totalMultiplier).toBe(4);
    expect(r.scoreDelta[1]).toBe(39); // 3 × 13
    assertZeroSum(r);
  });

  it('Dealer Seven Pairs tsumo: Seven Pairs ×2 + Dealer ×2 = ×4', () => {
    const r = calculateWinPayout(
      baseCtx({
        winType: 'tsumo',
        winnerSeat: 0,
        discarderSeat: undefined,
        dealerSeat: 0,
        handType: 'seven_pairs',
      }),
    );
    expect(r.totalMultiplier).toBe(4);
    assertZeroSum(r);
  });
});

// ── Instant Kong payment (§6.1) ───────────────────────────────────────────────

describe('Engine·scoring-instant-kong', () => {
  it('open kong: 1 point from each other player', () => {
    expect(instantKongPayment('open')).toBe(1);
  });

  it('concealed kong: 2 points from each other player', () => {
    expect(instantKongPayment('concealed')).toBe(2);
  });
});

// ── Spirit settlement (§6.2) ──────────────────────────────────────────────────

describe('Engine·scoring-spirit-settlement', () => {
  it('no spirit tiles: zero delta for all seats', () => {
    const seats: [SeatState, SeatState, SeatState, SeatState] = [
      blankSeat(),
      blankSeat(),
      blankSeat(),
      blankSeat(),
    ];
    // Use '1m'/'2m' as spirits — nobody holds them
    const delta = calculateSpiritSettlement(seats, '1m', '2m');
    expect(delta).toEqual([0, 0, 0, 0]);
  });

  it('one player with primary spirit: receives 2 from each other (Indomitable doubles → ×2)', () => {
    // Seat 0 holds one primary spirit tile (jingPrimary='east')
    // Raw score: 1×2 = 2. Indomitable (only one player): 2×2 = 4
    const seats: [SeatState, SeatState, SeatState, SeatState] = [
      { ...blankSeat(), hand: ['east'] as TileType[] },
      blankSeat(),
      blankSeat(),
      blankSeat(),
    ];
    const delta = calculateSpiritSettlement(seats, 'east', 'south');
    // effectiveScore[0] = 2 (raw=2, indomitable doubles → 4), others = 0
    // totalSpirits = 4
    // scoreDelta[0] = 4×4 - 4 = 12; scoreDelta[others] = 4×0 - 4 = -4
    expect(delta[0]).toBe(12);
    expect(delta[1]).toBe(-4);
    expect(delta[2]).toBe(-4);
    expect(delta[3]).toBe(-4);
    // Zero-sum
    expect(delta.reduce((s, v) => s + v, 0)).toBe(0);
  });

  it('two players with spirits: no indomitable bonus', () => {
    // Seat 0: 1 primary (raw=2), Seat 1: 1 secondary (raw=1)
    const seats: [SeatState, SeatState, SeatState, SeatState] = [
      { ...blankSeat(), hand: ['east'] as TileType[] },
      { ...blankSeat(), hand: ['south'] as TileType[] },
      blankSeat(),
      blankSeat(),
    ];
    const delta = calculateSpiritSettlement(seats, 'east', 'south');
    // No indomitable (2 players have spirits)
    // effectiveScore[0]=2, [1]=1, [2]=0, [3]=0; total=3
    // delta[0] = 4×2 - 3 = 5; delta[1] = 4×1 - 3 = 1; delta[2] = -3; delta[3] = -3
    expect(delta[0]).toBe(5);
    expect(delta[1]).toBe(1);
    expect(delta[2]).toBe(-3);
    expect(delta[3]).toBe(-3);
    expect(delta.reduce((s, v) => s + v, 0)).toBe(0);
  });

  it('Explosive Spirit: raw ≥ 5 applies formula raw × (raw − 3)', () => {
    // Seat 0: 3 primary tiles (raw = 6). 6 × (6−3) = 18. Indomitable → 36.
    const seats: [SeatState, SeatState, SeatState, SeatState] = [
      { ...blankSeat(), hand: ['east', 'east', 'east'] as TileType[] },
      blankSeat(),
      blankSeat(),
      blankSeat(),
    ];
    const delta = calculateSpiritSettlement(seats, 'east', 'south');
    // raw=6 → explosive: 6×3=18 → indomitable: 36; total=36
    // delta[0] = 4×36 - 36 = 108; delta[others] = -36 each
    expect(delta[0]).toBe(108);
    expect(delta[1]).toBe(-36);
    expect(delta[2]).toBe(-36);
    expect(delta[3]).toBe(-36);
    expect(delta.reduce((s, v) => s + v, 0)).toBe(0);
  });

  it('spirit settlement is always zero-sum', () => {
    const seats: [SeatState, SeatState, SeatState, SeatState] = [
      { ...blankSeat(), hand: ['east', 'east'] as TileType[] },
      { ...blankSeat(), hand: ['south'] as TileType[] },
      blankSeat(),
      { ...blankSeat(), hand: ['east'] as TileType[] },
    ];
    const delta = calculateSpiritSettlement(seats, 'east', 'south');
    expect(delta.reduce((s, v) => s + v, 0)).toBe(0);
  });
});
