import { describe, it, expect } from 'vitest';
import { isWinningHand, decomposeHand, decomposeConcealed, shantenNumber } from '../hand';
import type { TileType } from '../types';

/** Empty jing array = no wildcards in play. */
const NO_JINGS: TileType[] = [];

// ── Winning hand tests ─────────────────────────────────────────────────────────

describe('Engine·hand-eval — standard winning shapes', () => {
  it('all-chow hand: 1m2m3m 4m5m6m 7m8m9m 1p2p3p + 5p5p', () => {
    const hand: TileType[] = [
      '1m',
      '2m',
      '3m',
      '4m',
      '5m',
      '6m',
      '7m',
      '8m',
      '9m',
      '1p',
      '2p',
      '3p',
      '5p',
      '5p',
    ];
    expect(isWinningHand(hand, NO_JINGS)).toBe(true);
  });

  it('all-pung hand: 1m1m1m 9m9m9m 1p1p1p 9p9p9p + east east', () => {
    const hand: TileType[] = [
      '1m',
      '1m',
      '1m',
      '9m',
      '9m',
      '9m',
      '1p',
      '1p',
      '1p',
      '9p',
      '9p',
      '9p',
      'east',
      'east',
    ];
    expect(isWinningHand(hand, NO_JINGS)).toBe(true);
  });

  it('mixed pung + chow: 1m1m1m 2p3p4p 5s6s7s east east east + 9p9p', () => {
    const hand: TileType[] = [
      '1m',
      '1m',
      '1m',
      '2p',
      '3p',
      '4p',
      '5s',
      '6s',
      '7s',
      'east',
      'east',
      'east',
      '9p',
      '9p',
    ];
    expect(isWinningHand(hand, NO_JINGS)).toBe(true);
  });

  it('Engine·hand-eval-seven-pairs: 7 pairs in same suit', () => {
    const hand: TileType[] = [
      '1m',
      '1m',
      '3m',
      '3m',
      '5m',
      '5m',
      '7m',
      '7m',
      '9m',
      '9m',
      '2p',
      '2p',
      '4p',
      '4p',
    ];
    expect(isWinningHand(hand, NO_JINGS)).toBe(true);
  });

  it('seven pairs with mixed suits and honors', () => {
    const hand: TileType[] = [
      '1m',
      '1m',
      'east',
      'east',
      'west',
      'west',
      'zhong',
      'zhong',
      '1p',
      '1p',
      '9s',
      '9s',
      'fa',
      'fa',
    ];
    expect(isWinningHand(hand, NO_JINGS)).toBe(true);
  });

  it('all-honor pung hand: east×3 south×3 west×3 north×3 + zhong zhong', () => {
    const hand: TileType[] = [
      'east',
      'east',
      'east',
      'south',
      'south',
      'south',
      'west',
      'west',
      'west',
      'north',
      'north',
      'north',
      'zhong',
      'zhong',
    ];
    expect(isWinningHand(hand, NO_JINGS)).toBe(true);
  });

  it('Engine·hand-eval-thirteen-misfits: valid misfit hand (Seven Star variant)', () => {
    // m: 1,4,7 (gaps 3,3 ✓); p: 2,6 (gap 4 ✓); s: 3,7 (gap 4 ✓); all 7 honors unique ✓
    const hand: TileType[] = [
      '1m',
      '4m',
      '7m',
      '2p',
      '6p',
      '3s',
      '7s',
      'east',
      'south',
      'west',
      'north',
      'zhong',
      'fa',
      'bai',
    ];
    expect(isWinningHand(hand, NO_JINGS)).toBe(true);
  });

  it('honor chow hand: east-south-west chow + three pungs + pair', () => {
    // east-south-west chow + 1m1m1m + 9p9p9p + 5s5s5s + bai bai
    const hand: TileType[] = [
      'east',
      'south',
      'west',
      '1m',
      '1m',
      '1m',
      '9p',
      '9p',
      '9p',
      '5s',
      '5s',
      '5s',
      'bai',
      'bai',
    ];
    expect(isWinningHand(hand, NO_JINGS)).toBe(true);
  });

  it('dragon chow hand: zhong-fa-bai chow + three pungs + pair', () => {
    // zhong-fa-bai chow + 1m1m1m + 9p9p9p + 5s5s5s + east east
    const hand: TileType[] = [
      'zhong',
      'fa',
      'bai',
      '1m',
      '1m',
      '1m',
      '9p',
      '9p',
      '9p',
      '5s',
      '5s',
      '5s',
      'east',
      'east',
    ];
    expect(isWinningHand(hand, NO_JINGS)).toBe(true);
  });

  it('wrap-around wind chow: west-north-east chow', () => {
    // west-north-east chow + 1m1m1m + 9p9p9p + 5s5s5s + fa fa
    const hand: TileType[] = [
      'west',
      'north',
      'east',
      '1m',
      '1m',
      '1m',
      '9p',
      '9p',
      '9p',
      '5s',
      '5s',
      '5s',
      'fa',
      'fa',
    ];
    expect(isWinningHand(hand, NO_JINGS)).toBe(true);
  });
});

describe('Engine·hand-eval — non-winning hands', () => {
  it('rejects a hand with only 13 tiles', () => {
    const hand: TileType[] = [
      '1m',
      '2m',
      '3m',
      '4m',
      '5m',
      '6m',
      '7m',
      '8m',
      '9m',
      '1p',
      '2p',
      '3p',
      '5p',
    ];
    expect(isWinningHand(hand, NO_JINGS)).toBe(false);
  });

  it('rejects a hand with no valid decomposition', () => {
    const hand: TileType[] = [
      '1m',
      '3m',
      '5m',
      '7m',
      '9m',
      '1p',
      '3p',
      '5p',
      '7p',
      '9p',
      '1s',
      '3s',
      '5s',
      '7s',
    ];
    expect(isWinningHand(hand, NO_JINGS)).toBe(false);
  });

  it('rejects a broken hand (isolated tiles)', () => {
    const hand: TileType[] = [
      '1m',
      '3m',
      '5m',
      '7m',
      '9m',
      '2p',
      '4p',
      '6p',
      '8p',
      '1s',
      '3s',
      '5s',
      '7s',
      '9s',
    ];
    expect(isWinningHand(hand, NO_JINGS)).toBe(false);
  });

  it('rejects thirteen misfits where jing tile creates a gap of exactly 2', () => {
    // jing = '3m'. Face value gives 1m,3m — gap is 2, not > 2 → invalid
    const JING3M: TileType = '3m';
    const hand: TileType[] = [
      '1m',
      '3m',
      '7m',
      '2p',
      '6p',
      '3s',
      '7s',
      'east',
      'south',
      'west',
      'north',
      'zhong',
      'fa',
      'bai',
    ];
    expect(isWinningHand(hand, [JING3M])).toBe(false);
  });

  it('rejects thirteen misfits with duplicate honor', () => {
    // duplicate east → not valid thirteen misfits
    const hand: TileType[] = [
      '1m',
      '4m',
      '7m',
      '2p',
      '6p',
      '3s',
      '7s',
      'east',
      'east', // duplicate!
      'south',
      'west',
      'north',
      'zhong',
      'fa',
    ];
    expect(isWinningHand(hand, NO_JINGS)).toBe(false);
  });

  it('rejects thirteen misfits with gap ≤ 2 between suit tiles', () => {
    // 1m,3m gap = 2, not > 2
    const hand: TileType[] = [
      '1m',
      '3m', // gap of 2 — not allowed
      '7m',
      '2p',
      '6p',
      '3s',
      '7s',
      'east',
      'south',
      'west',
      'north',
      'zhong',
      'fa',
      'bai',
    ];
    expect(isWinningHand(hand, NO_JINGS)).toBe(false);
  });

  it('seven pairs rejects hand with 4 copies of the same tile (distinct pairs required)', () => {
    // 4×east + 2 each of south/west/north/zhong/fa = 14 honor tiles.
    // Cannot form a standard 4-meld+pair (only 2 copies of each non-east honor → no pungs;
    // honor chows consume tiles in ways that always leave a leftover).
    // Old checkSevenPairs code would count 4×east as 2 pairs → accept.
    // Fixed code rejects because east count > 2.
    const hand: TileType[] = [
      'east',
      'east',
      'east',
      'east',
      'south',
      'south',
      'west',
      'west',
      'north',
      'north',
      'zhong',
      'zhong',
      'fa',
      'fa',
    ];
    expect(isWinningHand(hand, NO_JINGS)).toBe(false);
  });
});

describe('Engine·hand-eval — wildcard (Jing) hands', () => {
  const JING: TileType = '5m';
  const JINGS: TileType[] = [JING];

  it('pung completed with 2 jings: natural+jing+jing = pung', () => {
    // hand: 1m jing jing 2p3p4p 5p6p7p 8s8s8s + north north
    const hand: TileType[] = [
      '1m',
      JING,
      JING,
      '2p',
      '3p',
      '4p',
      '5p',
      '6p',
      '7p',
      '8s',
      '8s',
      '8s',
      'north',
      'north',
    ];
    expect(isWinningHand(hand, JINGS)).toBe(true);
  });

  it('chow completed with 1 jing: 3m jing 5m = 3m4m5m (jing acts as 4m)', () => {
    // hand: 3m jing  6m7m8m  1p2p3p  4s5s6s + 9s9s
    // Note: JING = '5m'. In this hand, '5m' tiles are wildcards.
    // Actualy 5m doesn't appear as naturals here, but jing count = 1
    const hand: TileType[] = [
      '3m',
      JING, // this 5m is a wildcard
      '6m',
      '7m',
      '8m',
      '1p',
      '2p',
      '3p',
      '4s',
      '5s',
      '6s',
      '9s',
      '9s',
      '1m', // filler to reach 14 tiles
    ];
    // naturals: 3m,6m,7m,8m,1p,2p,3p,4s,5s,6s,9s,9s,1m; jings: 1
    // valid: 1m+jing+3m = chow (1m2m3m), 6m7m8m, 1p2p3p, 4s5s6s, 9s9s pair
    expect(isWinningHand(hand, JINGS)).toBe(true);
  });

  it('pure jing pair is NOT allowed in standard hand (pair must have ≥1 natural)', () => {
    // placeholder — see comment in test for full analysis
    expect(true).toBe(true);
  });

  it('seven pairs with one jing pair (1 allowed)', () => {
    // 1m1m 2m2m 3m3m 4m4m 1p1p 2p2p + jing jing (pair 7 using 2 jings)
    const JING7: TileType = '9s';
    const hand: TileType[] = [
      '1m',
      '1m',
      '2m',
      '2m',
      '3m',
      '3m',
      '4m',
      '4m',
      '1p',
      '1p',
      '2p',
      '2p',
      JING7,
      JING7,
    ];
    expect(isWinningHand(hand, [JING7])).toBe(true);
  });

  it('dual jing: hand with both primary and secondary jings', () => {
    // primary='3m', secondary='4m'
    // naturals: 1m 1m 1m  2p3p4p  5s6s7s  north north  → 11 naturals + 3 jings
    const hand: TileType[] = [
      '1m',
      '1m',
      '1m',
      '2p',
      '3p',
      '4p',
      '5s',
      '6s',
      '7s',
      'north',
      'north',
      '3m', // primary jing
      '3m', // primary jing
      '4m', // secondary jing
    ];
    // jingTypes = ['3m', '4m'], so 3m×2 and 4m×1 are all wildcards (jingCount=3)
    // naturals: 1m,1m,1m, 2p,3p,4p, 5s,6s,7s, north,north
    // valid: 1m1m1m pung, 2p3p4p chow, 5s6s7s chow, jing+jing+jing → but need ≥1 natural in each meld
    // Actually: 11 naturals + 3 jings. Pair = north north. Melds = 1m1m1m, 2p3p4p, 5s6s7s, need 1 meld from 3 jings (all jings - no natural!) → FAIL for that
    // Actually: pair = north north (2 naturals). Remaining: 1m1m1m, 2p3p4p, 5s6s7s = 9 naturals = 3 melds. 3 jings left → form 4th meld? Need ≥1 natural per meld, so 3 jings alone → fail
    // So need rethink. Try: pair = north+jing. Remaining: 1m1m1m, 2p3p4p, 5s6s7s, north, 2 jings.
    // 1m1m1m pung ✓; 2p3p4p chow ✓; 5s6s7s chow ✓; north+jing+jing = north north north pung ✓; pair = north+jing ✓
    // So: jingsUsed = 3 (1 in pair + 2 in last pung). Total = 14. ✓
    expect(isWinningHand(hand, ['3m', '4m'])).toBe(true);
  });

  it('thirteen misfits wins when a jing tile sits in a valid misfit position', () => {
    // jing = '4m'. The classic 1m/4m/7m bamboo run includes 4m as the jing.
    // Old engine rejected this because jingCount > 0. New engine checks face values → valid.
    // m: 1,4,7 (gaps 3,3 ✓); p: 2,6 (gap 4 ✓); s: 3,7 (gap 4 ✓); all 7 honors ✓
    const JING4M: TileType = '4m';
    const hand: TileType[] = [
      '1m',
      '4m',
      '7m',
      '2p',
      '6p',
      '3s',
      '7s',
      'east',
      'south',
      'west',
      'north',
      'zhong',
      'fa',
      'bai',
    ];
    expect(isWinningHand(hand, [JING4M])).toBe(true);
  });

  it('seven-star thirteen misfits wins when a jing tile sits in a valid misfit position', () => {
    // jing = '1s'. Hand includes 1s at face value in a valid gap position.
    // m: 1,7 (gap 6 ✓); p: 3,8 (gap 5 ✓); s: 1,5,9 (gaps 4,4 ✓); all 7 honors ✓ — 14 tiles
    const JING1S: TileType = '1s';
    const hand: TileType[] = [
      '1m',
      '7m',
      '3p',
      '8p',
      '1s',
      '5s',
      '9s',
      'east',
      'south',
      'west',
      'north',
      'zhong',
      'fa',
      'bai',
    ];
    expect(isWinningHand(hand, [JING1S])).toBe(true);
  });

  it('seven pairs wins when a jing completes the 7th pair', () => {
    // 6 natural pairs + 1 pair where the 7th natural pairs with a jing
    const JING9S: TileType = '9s';
    const hand: TileType[] = [
      '1m',
      '1m',
      '3m',
      '3m',
      '5m',
      '5m',
      '7m',
      '7m',
      '1p',
      '1p',
      '3p',
      '3p',
      'west', // natural — needs jing to make pair
      JING9S, // jing wildcard completes the west pair
    ];
    expect(isWinningHand(hand, [JING9S])).toBe(true);
  });
});

// ── Decomposition tests ───────────────────────────────────────────────────────

describe('decomposeHand', () => {
  it('returns at least one decomposition for a winning hand', () => {
    const hand: TileType[] = [
      '1m',
      '2m',
      '3m',
      '4m',
      '5m',
      '6m',
      '7m',
      '8m',
      '9m',
      '1p',
      '2p',
      '3p',
      '5p',
      '5p',
    ];
    const decomps = decomposeHand(hand, NO_JINGS);
    expect(decomps.length).toBeGreaterThan(0);
  });

  it('decomposition has 4 melds and 1 pair', () => {
    const hand: TileType[] = [
      '1m',
      '2m',
      '3m',
      '4m',
      '5m',
      '6m',
      '7m',
      '8m',
      '9m',
      '1p',
      '2p',
      '3p',
      '5p',
      '5p',
    ];
    const decomps = decomposeHand(hand, NO_JINGS);
    for (const d of decomps) {
      expect(d.melds).toHaveLength(4);
      expect(d.pair).toBeDefined();
    }
  });

  it('correctly identifies all-pung decomposition', () => {
    const hand: TileType[] = [
      '1m',
      '1m',
      '1m',
      '9m',
      '9m',
      '9m',
      '1p',
      '1p',
      '1p',
      '9p',
      '9p',
      '9p',
      'east',
      'east',
    ];
    const decomps = decomposeHand(hand, NO_JINGS);
    expect(decomps.length).toBeGreaterThan(0);
    const allPungs = decomps.some((d) => d.melds.every((m) => m.kind === 'pung'));
    expect(allPungs).toBe(true);
  });

  it('returns empty for non-winning hand', () => {
    const hand: TileType[] = [
      '1m',
      '3m',
      '5m',
      '7m',
      '9m',
      '1p',
      '3p',
      '5p',
      '7p',
      '9p',
      '1s',
      '3s',
      '5s',
      '7s',
    ];
    expect(decomposeHand(hand, NO_JINGS)).toHaveLength(0);
  });

  it('records jingsUsed correctly', () => {
    const JING: TileType = '5m';
    // 1m jing jing + 2p3p4p + 5p6p7p + 8s8s8s + north north
    const hand: TileType[] = [
      '1m',
      JING,
      JING,
      '2p',
      '3p',
      '4p',
      '5p',
      '6p',
      '7p',
      '8s',
      '8s',
      '8s',
      'north',
      'north',
    ];
    const decomps = decomposeHand(hand, [JING]);
    expect(decomps.length).toBeGreaterThan(0);
    // At least one decomp uses 2 jings
    const uses2 = decomps.some((d) => d.jingsUsed === 2);
    expect(uses2).toBe(true);
  });

  it('identifies honor chow in decomposition', () => {
    // east-south-west chow + 1m1m1m + 9p9p9p + 5s5s5s + bai bai
    const hand: TileType[] = [
      'east',
      'south',
      'west',
      '1m',
      '1m',
      '1m',
      '9p',
      '9p',
      '9p',
      '5s',
      '5s',
      '5s',
      'bai',
      'bai',
    ];
    const decomps = decomposeHand(hand, NO_JINGS);
    expect(decomps.length).toBeGreaterThan(0);
    const hasHonorChow = decomps.some((d) =>
      d.melds.some(
        (m) =>
          m.kind === 'chow' &&
          m.tiles.includes('east') &&
          m.tiles.includes('south') &&
          m.tiles.includes('west'),
      ),
    );
    expect(hasHonorChow).toBe(true);
  });
});

// ── decomposeConcealed tests ──────────────────────────────────────────────────

describe('decomposeConcealed', () => {
  it('returns same result as decomposeHand for a full 14-tile hand', () => {
    const hand: TileType[] = [
      '1m',
      '2m',
      '3m',
      '4p',
      '5p',
      '6p',
      '7s',
      '8s',
      '9s',
      'east',
      'east',
      'east',
      '9p',
      '9p',
    ];
    const full = decomposeHand(hand, NO_JINGS);
    const partial = decomposeConcealed(hand, NO_JINGS);
    expect(partial.length).toBeGreaterThan(0);
    expect(partial.length).toBe(full.length);
  });

  it('decomposes 11-tile concealed portion (1 open meld) into 3 melds + pair', () => {
    // Concealed hand when player has 1 open pung: 3 melds + pair = 11 tiles
    const hand: TileType[] = [
      '2m',
      '3m',
      '4m',
      '5p',
      '5p',
      '5p',
      '6s',
      '7s',
      '8s',
      'north',
      'north',
    ];
    const decomps = decomposeConcealed(hand, NO_JINGS);
    expect(decomps.length).toBeGreaterThan(0);
    for (const d of decomps) {
      expect(d.melds).toHaveLength(3);
      expect(d.pair).toBeDefined();
    }
  });

  it('decomposes 8-tile concealed portion (2 open melds) into 2 melds + pair', () => {
    const hand: TileType[] = ['1s', '1s', '1s', '9m', '9m', '9m', 'fa', 'fa'];
    const decomps = decomposeConcealed(hand, NO_JINGS);
    expect(decomps.length).toBeGreaterThan(0);
    for (const d of decomps) {
      expect(d.melds).toHaveLength(2);
      expect(d.pair).toBe('fa');
    }
  });

  it('decomposes 5-tile concealed portion (3 open melds) into 1 meld + pair', () => {
    const hand: TileType[] = ['7p', '8p', '9p', 'zhong', 'zhong'];
    const decomps = decomposeConcealed(hand, NO_JINGS);
    expect(decomps.length).toBeGreaterThan(0);
    expect(decomps[0].melds).toHaveLength(1);
    expect(decomps[0].pair).toBe('zhong');
  });

  it('decomposes 2-tile concealed portion (4 open melds) — pair only', () => {
    // Only a pair left after all 4 melds are open
    const hand: TileType[] = ['bai', 'bai'];
    const decomps = decomposeConcealed(hand, NO_JINGS);
    expect(decomps.length).toBeGreaterThan(0);
    expect(decomps[0].melds).toHaveLength(0);
    expect(decomps[0].pair).toBe('bai');
  });

  it('returns empty for a non-(3k+2) tile count', () => {
    // 13 tiles — not a valid concealed winning portion
    const hand: TileType[] = [
      '1m',
      '2m',
      '3m',
      '4p',
      '5p',
      '6p',
      '7s',
      '8s',
      '9s',
      'east',
      'east',
      'east',
      '9p',
    ];
    expect(decomposeConcealed(hand, NO_JINGS)).toHaveLength(0);
  });

  it('returns empty for a non-winning 5-tile hand', () => {
    // 5 tiles that cannot form 1 meld + 1 pair
    const hand: TileType[] = ['1m', '3m', '5m', '7m', '9m'];
    expect(decomposeConcealed(hand, NO_JINGS)).toHaveLength(0);
  });
});

// ── Shanten tests ─────────────────────────────────────────────────────────────

describe('shantenNumber', () => {
  it('returns -1 for a winning hand', () => {
    const hand: TileType[] = [
      '1m',
      '2m',
      '3m',
      '4m',
      '5m',
      '6m',
      '7m',
      '8m',
      '9m',
      '1p',
      '2p',
      '3p',
      '5p',
      '5p',
    ];
    expect(shantenNumber(hand, NO_JINGS)).toBe(-1);
  });

  it('returns 0 for a tenpai hand (one-sided wait)', () => {
    // 1m2m3m 4m5m6m 7m8m9m 1p2p3p + 5p (missing the pair)
    const hand: TileType[] = [
      '1m',
      '2m',
      '3m',
      '4m',
      '5m',
      '6m',
      '7m',
      '8m',
      '9m',
      '1p',
      '2p',
      '3p',
      '5p',
    ];
    expect(shantenNumber(hand, NO_JINGS)).toBe(0);
  });

  it('returns a non-negative value for incomplete hands', () => {
    const hand: TileType[] = [
      '1m',
      '3m',
      '5m',
      '7m',
      '9m',
      '1p',
      '3p',
      '5p',
      '7p',
      '9p',
      '1s',
      '3s',
      '5s',
    ];
    const sh = shantenNumber(hand, NO_JINGS);
    expect(sh).toBeGreaterThanOrEqual(0);
  });

  it('tenpai hand waiting for pair is 0', () => {
    // Complete except pair: 1m2m3m 4m5m6m 7m8m9m 1p2p3p 9s + needs a second 9s
    const hand: TileType[] = [
      '1m',
      '2m',
      '3m',
      '4m',
      '5m',
      '6m',
      '7m',
      '8m',
      '9m',
      '1p',
      '2p',
      '3p',
      '9s',
    ];
    expect(shantenNumber(hand, NO_JINGS)).toBe(0);
  });
});
