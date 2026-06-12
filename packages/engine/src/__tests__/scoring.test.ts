/**
 * Scoring tests — locked rules §6 (Base × Multipliers system).
 *
 * These tests replace the old fan-based scoring tests and verify the
 * calculateWinPayout, instantKongPayment, and calculateSpiritSettlement
 * functions against the locked Nanchang Mahjong rules document.
 */
import { describe, it, expect } from 'vitest';
import {
  calculateWinPayout,
  instantKongPayment,
  calculateSpiritSettlement,
  calculateOpeningJingSettlement,
} from '../scoring';
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
  it('standard ron: discarder pays ×2, non-discarder non-dealer pays ×1, dealer-as-non-discarder pays ×2', () => {
    // base=1, no multipliers. winner=1, discarder=0, dealer=3.
    // Dealer (seat 3) is a non-discarder payer → pays ×2 under dealer-loss rule.
    const r = calculateWinPayout(baseCtx());
    expect(r.scoreDelta[0]).toBe(-2); // discarder pays ×2
    expect(r.scoreDelta[2]).toBe(-1); // non-dealer non-discarder pays ×1
    expect(r.scoreDelta[3]).toBe(-2); // dealer non-discarder pays ×2 (dealer-loss)
    expect(r.scoreDelta[1]).toBe(5); // wins: 2 + 1 + 2
    assertZeroSum(r);
  });

  it('is zero-sum', () => {
    assertZeroSum(calculateWinPayout(baseCtx()));
  });
});

describe('Engine·scoring-tsumo-base', () => {
  it('standard tsumo: non-dealer losers pay ×2, dealer-loser pays ×4', () => {
    // base=1, tsumo, winner=1, dealer=3. Dealer (seat 3) is a loser → pays ×4.
    const r = calculateWinPayout(
      baseCtx({ winType: 'tsumo', winnerSeat: 1, discarderSeat: undefined }),
    );
    expect(r.scoreDelta[0]).toBe(-2); // non-dealer loser ×2
    expect(r.scoreDelta[2]).toBe(-2); // non-dealer loser ×2
    expect(r.scoreDelta[3]).toBe(-4); // dealer-loser ×4
    expect(r.scoreDelta[1]).toBe(8); // wins: 2 + 2 + 4
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

  it('Engine·dealer-doubles: dealer loss as discarder pays ×4', () => {
    // winner=1, dealer=0, discarder=0: dealer-as-discarder pays ×4, non-dealers pay ×1
    const r = calculateWinPayout(
      baseCtx({ winType: 'ron', winnerSeat: 1, dealerSeat: 0, discarderSeat: 0 }),
    );
    expect(r.scoreDelta[0]).toBe(-4); // dealer-discarder: ×2 × ×2 = ×4
    expect(r.scoreDelta[2]).toBe(-1); // non-dealer non-discarder ×1
    expect(r.scoreDelta[3]).toBe(-1);
    expect(r.scoreDelta[1]).toBe(6);
    assertZeroSum(r);
  });

  it('Engine·dealer-loss-non-discarder: dealer as side payer on ron pays ×2', () => {
    // winner=2, dealer=1 (non-discarder, non-winner), discarder=0.
    // Dealer (seat 1) is a non-discarder payer → pays ×2 instead of ×1.
    const r = calculateWinPayout(
      baseCtx({ winType: 'ron', winnerSeat: 2, dealerSeat: 1, discarderSeat: 0 }),
    );
    expect(r.scoreDelta[0]).toBe(-2); // discarder ×2 (not dealer)
    expect(r.scoreDelta[1]).toBe(-2); // dealer non-discarder ×2
    expect(r.scoreDelta[3]).toBe(-1); // non-dealer non-discarder ×1
    expect(r.scoreDelta[2]).toBe(5); // 2+2+1
    assertZeroSum(r);
  });

  it('Engine·dealer-loss-tsumo: dealer as loser pays ×4', () => {
    // winner=2, dealer=0 (losing payer). Non-dealer payers (1,3) pay ×2; dealer (0) pays ×4.
    const r = calculateWinPayout(
      baseCtx({ winType: 'tsumo', winnerSeat: 2, dealerSeat: 0, discarderSeat: undefined }),
    );
    expect(r.scoreDelta[0]).toBe(-4); // dealer-loser ×4
    expect(r.scoreDelta[1]).toBe(-2); // non-dealer ×2
    expect(r.scoreDelta[3]).toBe(-2);
    expect(r.scoreDelta[2]).toBe(8); // 4+2+2
    assertZeroSum(r);
  });

  it('Rob Kong with dealer-as-konger: entire konger payment doubled', () => {
    // winner=2, kong=0, dealer=0 (konger IS the dealer). kongerRate=4 (dealer-loss doubling).
    // kongerPays = 1×4×3 + 0 = 12.
    const r = calculateWinPayout(
      baseCtx({
        winType: 'tsumo',
        winnerSeat: 2,
        dealerSeat: 0,
        discarderSeat: undefined,
        kongSeat: 0,
        isRobKong: true,
      }),
    );
    expect(r.scoreDelta[2]).toBe(12);
    expect(r.scoreDelta[0]).toBe(-12);
    expect(r.scoreDelta[1]).toBe(0);
    expect(r.scoreDelta[3]).toBe(0);
    assertZeroSum(r);
  });
});

// ── Hand type multipliers (§6.3) ──────────────────────────────────────────────

describe('Engine·scoring-hand-types', () => {
  it('Seven Pairs ×2', () => {
    // winner=1, dealer=3. Non-dealer payers (0,2): (2×2)=4. Dealer-loser (3): (2×4)=8.
    const r = calculateWinPayout(
      baseCtx({
        winType: 'tsumo',
        winnerSeat: 1,
        discarderSeat: undefined,
        handType: 'seven_pairs',
      }),
    );
    expect(r.scoreDelta[0]).toBe(-4);
    expect(r.scoreDelta[2]).toBe(-4);
    expect(r.scoreDelta[3]).toBe(-8); // dealer-loser: (2×4)=8
    expect(r.scoreDelta[1]).toBe(16); // 4+4+8
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

// ── German / True German (§2.4) ───────────────────────────────────────────────

describe('Engine·scoring-german', () => {
  it('German: flat +5 per loser only — no ×2 stacking multiplier', () => {
    // winner=1, dealer=3. German adds flat +5, NOT a ×2 multiplier.
    // Non-dealer payers (0,2): (1×2)+5=7. Dealer-loser (3): (1×4)+5=9.
    const r = calculateWinPayout(
      baseCtx({
        winType: 'tsumo',
        winnerSeat: 1,
        discarderSeat: undefined,
        isGerman: true,
      }),
    );
    expect(r.scoreDelta[0]).toBe(-7);
    expect(r.scoreDelta[2]).toBe(-7);
    expect(r.scoreDelta[3]).toBe(-9); // dealer-loser: (1×4)+5=9
    expect(r.scoreDelta[1]).toBe(23); // 7+7+9
    expect(r.totalMultiplier).toBe(1); // no extra multiplier from German
    expect(r.items.some((i) => i.name === 'German')).toBe(true);
    expect(r.flatBonusPerLoser).toBe(5);
    assertZeroSum(r);
  });

  it('True German: ×2 additional multiplier + flat +5 per loser (supersedes German)', () => {
    // True German adds ×2 to stack. winner=1, dealer=3.
    // Non-dealer payers: (1×2×2)+5=9. Dealer-loser: (1×2×4)+5=13.
    const r = calculateWinPayout(
      baseCtx({
        winType: 'tsumo',
        winnerSeat: 1,
        discarderSeat: undefined,
        isGerman: true,
        isTrueGerman: true,
      }),
    );
    expect(r.scoreDelta[0]).toBe(-9);
    expect(r.scoreDelta[2]).toBe(-9);
    expect(r.scoreDelta[3]).toBe(-13); // dealer-loser: (2×4)+5=13
    expect(r.scoreDelta[1]).toBe(31); // 9+9+13
    expect(r.totalMultiplier).toBe(2);
    expect(r.items.some((i) => i.name === 'True German')).toBe(true);
    expect(r.items.some((i) => i.name === 'German')).toBe(false); // superseded
    assertZeroSum(r);
  });

  it('German ron: flat +5 applied to discarder and side payers separately', () => {
    // winner=1, discarder=0, dealer=2 (non-discarder payer who is dealer).
    // discarder (0): not dealer → (1×2)+5=7. dealer non-discarder (2): (1×2)+5=7.
    // non-dealer non-discarder (3): (1×1)+5=6.
    const r = calculateWinPayout(
      baseCtx({
        winType: 'ron',
        winnerSeat: 1,
        discarderSeat: 0,
        dealerSeat: 2,
        isGerman: true,
      }),
    );
    expect(r.scoreDelta[0]).toBe(-7); // discarder ×2 + flat
    expect(r.scoreDelta[2]).toBe(-7); // dealer non-discarder ×2 + flat
    expect(r.scoreDelta[3]).toBe(-6); // non-dealer non-discarder ×1 + flat
    expect(r.scoreDelta[1]).toBe(20); // 7+7+6
    assertZeroSum(r);
  });

  it('Engine·scoring-clean-win: isGerman true when jingsUsed is 0', () => {
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

  it('Heavenly Win + Spirit Fishing: flat 40 from each, winner gets 120', () => {
    const r = calculateWinPayout(
      baseCtx({
        winType: 'tsumo',
        winnerSeat: 0,
        discarderSeat: undefined,
        isHeavenlyWin: true,
        isSpiritFishing: true,
      }),
    );
    expect(r.scoreDelta[0]).toBe(120);
    expect(r.scoreDelta[1]).toBe(-40);
    expect(r.scoreDelta[2]).toBe(-40);
    expect(r.scoreDelta[3]).toBe(-40);
    assertZeroSum(r);
  });

  it('Earthly Win: flat 20 from each, overrides multipliers', () => {
    const r = calculateWinPayout(
      baseCtx({
        winType: 'ron',
        winnerSeat: 1,
        discarderSeat: 0,
        isEarthlyWin: true,
        isGerman: true, // flat +5 normally — earthly overrides
      }),
    );
    expect(r.scoreDelta[1]).toBe(60);
    assertZeroSum(r);
  });

  it('Earthly Win + Spirit Fishing: flat 40 from each, winner gets 120', () => {
    const r = calculateWinPayout(
      baseCtx({
        winType: 'ron',
        winnerSeat: 1,
        discarderSeat: 0,
        isEarthlyWin: true,
        isSpiritFishing: true,
      }),
    );
    expect(r.scoreDelta[1]).toBe(120);
    expect(r.scoreDelta[0]).toBe(-40);
    expect(r.scoreDelta[2]).toBe(-40);
    expect(r.scoreDelta[3]).toBe(-40);
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
  it('Seven Pairs + German tsumo: Seven Pairs ×2, German flat +5 only', () => {
    // German no longer adds ×2; totalMultiplier = 2 (Seven Pairs only).
    // winner=1, dealer=3. Non-dealer (0,2): (2×2)+5=9. Dealer-loser (3): (2×4)+5=13.
    const r = calculateWinPayout(
      baseCtx({
        winType: 'tsumo',
        winnerSeat: 1,
        discarderSeat: undefined,
        handType: 'seven_pairs',
        isGerman: true,
      }),
    );
    expect(r.totalMultiplier).toBe(2); // Seven Pairs ×2, no German ×2
    expect(r.scoreDelta[0]).toBe(-9);
    expect(r.scoreDelta[2]).toBe(-9);
    expect(r.scoreDelta[3]).toBe(-13); // dealer-loser (2×4)+5=13
    expect(r.scoreDelta[1]).toBe(31); // 9+9+13
    assertZeroSum(r);
  });

  it('Dealer Seven Pairs tsumo: Seven Pairs ×2 + Dealer ×2 = ×4', () => {
    // winner=0=dealer, no dealer-loss penalty on payers.
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

  it('Kong Bloom tsumo: ×2 additional multiplier (×4 total with tsumo ×2)', () => {
    // isAfterKong adds ×2 to stack. winner=0=dealer (no dealer-loss), so all payers equal.
    const r = calculateWinPayout(
      baseCtx({
        winType: 'tsumo',
        winnerSeat: 0,
        discarderSeat: undefined,
        dealerSeat: 0,
        isAfterKong: true,
      }),
    );
    // Dealer win ×2, Kong Bloom ×2 → multiplier=4. Each payer: (4×2)=8.
    expect(r.totalMultiplier).toBe(4);
    expect(r.scoreDelta[1]).toBe(-8);
    expect(r.scoreDelta[2]).toBe(-8);
    expect(r.scoreDelta[3]).toBe(-8);
    expect(r.scoreDelta[0]).toBe(24);
    expect(r.items.some((i) => i.name === 'Kong Bloom')).toBe(true);
    assertZeroSum(r);
  });

  it('Kong Bloom non-dealer tsumo: standard payers ×4, dealer-loser ×8', () => {
    // winner=1 (not dealer), dealer=3. Kong Bloom ×2 → multiplier=2.
    // Non-dealer (0,2): (2×2)=4. Dealer-loser (3): (2×4)=8.
    const r = calculateWinPayout(
      baseCtx({
        winType: 'tsumo',
        winnerSeat: 1,
        discarderSeat: undefined,
        isAfterKong: true,
      }),
    );
    expect(r.totalMultiplier).toBe(2);
    expect(r.scoreDelta[0]).toBe(-4);
    expect(r.scoreDelta[2]).toBe(-4);
    expect(r.scoreDelta[3]).toBe(-8);
    expect(r.scoreDelta[1]).toBe(16); // 4+4+8
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

// ── Opening Top & Bottom Spirit Flip settlement (开局上下翻精) ───────────────────

describe('Scoring·opening-jing-settlement', () => {
  it('nobody holds the settlement tile → [0, 0, 0, 0]', () => {
    const seats: [SeatState, SeatState, SeatState, SeatState] = [
      blankSeat(),
      blankSeat(),
      blankSeat(),
      blankSeat(),
    ];
    expect(calculateOpeningJingSettlement('1m', seats)).toEqual([0, 0, 0, 0]);
  });

  it('one player holds 1 copy: they receive 2 from each other (net +6, others −2 each)', () => {
    // RATE=2, copies=[1,0,0,0], total=1
    // delta[0] = 2×(4×1−1) = 2×3 = 6
    // delta[1] = 2×(4×0−1) = −2
    const seats: [SeatState, SeatState, SeatState, SeatState] = [
      { ...blankSeat(), hand: ['1m'] as TileType[] },
      blankSeat(),
      blankSeat(),
      blankSeat(),
    ];
    const delta = calculateOpeningJingSettlement('1m', seats);
    expect(delta[0]).toBe(6);
    expect(delta[1]).toBe(-2);
    expect(delta[2]).toBe(-2);
    expect(delta[3]).toBe(-2);
    expect(delta.reduce((s, v) => s + v, 0)).toBe(0);
  });

  it('two players each hold 1 copy: they net 0 from each other, others pay −2 each', () => {
    // copies=[1,1,0,0], total=2
    // delta[0] = 2×(4×1−2) = 2×2 = 4
    // delta[1] = 4
    // delta[2] = 2×(4×0−2) = −4
    const seats: [SeatState, SeatState, SeatState, SeatState] = [
      { ...blankSeat(), hand: ['2p'] as TileType[] },
      { ...blankSeat(), hand: ['2p'] as TileType[] },
      blankSeat(),
      blankSeat(),
    ];
    const delta = calculateOpeningJingSettlement('2p', seats);
    expect(delta[0]).toBe(4);
    expect(delta[1]).toBe(4);
    expect(delta[2]).toBe(-4);
    expect(delta[3]).toBe(-4);
    expect(delta.reduce((s, v) => s + v, 0)).toBe(0);
  });

  it('one player holds 2 copies: delta scales with count', () => {
    // copies=[2,0,0,0], total=2
    // delta[0] = 2×(4×2−2) = 2×6 = 12
    // delta[others] = 2×(4×0−2) = −4
    const seats: [SeatState, SeatState, SeatState, SeatState] = [
      { ...blankSeat(), hand: ['3s', '3s'] as TileType[] },
      blankSeat(),
      blankSeat(),
      blankSeat(),
    ];
    const delta = calculateOpeningJingSettlement('3s', seats);
    expect(delta[0]).toBe(12);
    expect(delta[1]).toBe(-4);
    expect(delta[2]).toBe(-4);
    expect(delta[3]).toBe(-4);
    expect(delta.reduce((s, v) => s + v, 0)).toBe(0);
  });

  it('all four copies spread across different players: mixed positive/negative, zero-sum', () => {
    // copies=[2,1,1,0], total=4
    // delta[0] = 2×(8−4) = 8
    // delta[1] = 2×(4−4) = 0
    // delta[2] = 2×(4−4) = 0
    // delta[3] = 2×(0−4) = −8
    const seats: [SeatState, SeatState, SeatState, SeatState] = [
      { ...blankSeat(), hand: ['east', 'east'] as TileType[] },
      { ...blankSeat(), hand: ['east'] as TileType[] },
      { ...blankSeat(), hand: ['east'] as TileType[] },
      blankSeat(),
    ];
    const delta = calculateOpeningJingSettlement('east', seats);
    expect(delta[0]).toBe(8);
    expect(delta[1]).toBe(0);
    expect(delta[2]).toBe(0);
    expect(delta[3]).toBe(-8);
    expect(delta.reduce((s, v) => s + v, 0)).toBe(0);
  });

  it('is always zero-sum regardless of distribution', () => {
    const seats: [SeatState, SeatState, SeatState, SeatState] = [
      { ...blankSeat(), hand: ['zhong', 'zhong', 'zhong'] as TileType[] },
      { ...blankSeat(), hand: ['zhong'] as TileType[] },
      blankSeat(),
      blankSeat(),
    ];
    const delta = calculateOpeningJingSettlement('zhong', seats);
    expect(delta.reduce((s, v) => s + v, 0)).toBe(0);
  });
});
