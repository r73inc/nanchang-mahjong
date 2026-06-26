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
    // isSelfDraw=true: Thirteen Misfits is only valid by self-draw.
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
    expect(isWinningHand(hand, NO_JINGS, true)).toBe(true);
    // Ron (isSelfDraw=false) must NOT recognise this as a winning hand.
    expect(isWinningHand(hand, NO_JINGS, false)).toBe(false);
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

  it('accepts thirteen misfits where jing tile face value would create a gap ≤ 2 (jing is a wildcard)', () => {
    // jing = '3m'. As a wildcard, 3m represents any valid tile (e.g. 4m or 9m),
    // NOT its face value. Naturals: 1m, 7m (gap 6 ✓); 2p, 6p; 3s, 7s; all 7 honors.
    // All natural tiles are valid → hand is a winning Thirteen Misfits by tsumo.
    const JING3M: TileType = '3m';
    const hand: TileType[] = [
      '1m',
      '3m', // jing — wildcard, does NOT force a 1m/3m gap of 2
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
    expect(isWinningHand(hand, [JING3M], true)).toBe(true);
    expect(isWinningHand(hand, [JING3M], false)).toBe(false); // tsumo only
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

  it('Nanchang rule: 4 identical tiles count as 2 pairs in Seven Pairs (小七对)', () => {
    // 4×east (= 2 pairs) + 2 each of south/west/north/zhong/fa (= 5 pairs) = 7 pairs total.
    // No standard 4-meld+pair decomposition exists for this hand (2 copies of each
    // non-east honor cannot form pungs; honor chows always leave leftovers).
    // Nanchang does NOT impose the Japanese Chiitoitsu "distinct pairs" restriction.
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
    expect(isWinningHand(hand, NO_JINGS)).toBe(true);
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
    expect(isWinningHand(hand, [JING4M], true)).toBe(true);
    expect(isWinningHand(hand, [JING4M], false)).toBe(false); // ron not allowed
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
    expect(isWinningHand(hand, [JING1S], true)).toBe(true);
    expect(isWinningHand(hand, [JING1S], false)).toBe(false); // ron not allowed
  });

  it('thirteen misfits with multiple same-face-value jings is valid (BUG regression)', () => {
    // jings = ['7p', '8p'] (adjacent dots, gap 1). Player holds 7p×2 + 8p×1 = 3 wilds.
    // Old code: 7p,7p gap=0 and 7p,8p gap=1 both ≤ 2 → incorrectly rejected.
    // New code: naturals only — no dot conflicts; wildcards fill valid positions.
    // Naturals: 1m,4m | 1p,4p | 1s,5s,9s | east,south,west,north — all valid ✓
    const hand: TileType[] = [
      '1m',
      '4m',
      '1p',
      '4p',
      '7p',
      '7p',
      '8p', // all three are jings
      '1s',
      '5s',
      '9s',
      'east',
      'south',
      'west',
      'north',
    ];
    expect(isWinningHand(hand, ['7p', '8p'], true)).toBe(true);
    expect(isWinningHand(hand, ['7p', '8p'], false)).toBe(false); // tsumo only
  });

  it('thirteen misfits with adjacent jing types as the only dots is valid', () => {
    // jings = ['7p', '8p']. Hand has one 7p and one 8p jing in dots.
    // Old code: gap(8p - 7p) = 1 ≤ 2 → rejected. New code: no natural dots → no conflicts.
    const hand: TileType[] = [
      '1m',
      '4m',
      '8m',
      '7p',
      '8p', // both jings — appear adjacent at face value but are wildcards
      '2s',
      '6s',
      'east',
      'south',
      'west',
      'north',
      'zhong',
      'fa',
      'bai',
    ];
    expect(isWinningHand(hand, ['7p', '8p'], true)).toBe(true);
    expect(isWinningHand(hand, ['7p', '8p'], false)).toBe(false); // tsumo only
  });

  it('thirteen misfits is invalid when natural tiles have gap ≤ 2 (wildcards cannot fix this)', () => {
    // 1m and 3m are both natural — gap 2, not > 2. No wildcard can fix a natural conflict.
    const hand: TileType[] = [
      '1m',
      '3m', // natural conflict — gap 2
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
    expect(isWinningHand(hand, [], true)).toBe(false);
    // Also invalid when an unrelated jing is present — natural conflict still there
    const hand2: TileType[] = [
      '1m',
      '3m', // still a natural conflict
      '7m',
      '2p',
      '6p',
      '3s',
      'east',
      'south',
      'west',
      'north',
      'zhong',
      'fa',
      '9p', // 9p is jing
    ];
    expect(isWinningHand(hand2, ['9p'], true)).toBe(false);
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

  it('pure jing pair is NOT allowed in standard hand (pair must have ≥1 natural)', () => {
    // 3 complete suit melds (9 naturals) + 3 isolated tiles that cannot form
    // a 4th meld + 2 jings.
    //
    // The only structurally plausible pair is jing+jing (pure-wildcard pair),
    // which Nanchang rules forbid. A half-jing pair (natural+jing) is also
    // impossible: using 1 jing for the pair leaves [1s, 9s, east] + 1 jing for
    // the 4th meld, but those three tiles span incompatible suits/types and
    // cannot form any valid meld even with jing assistance.
    const JING2: TileType = '9p';
    const hand: TileType[] = [
      '1m',
      '2m',
      '3m', // complete chow
      '4m',
      '5m',
      '6m', // complete chow
      '7m',
      '8m',
      '9m', // complete chow
      '1s', // isolated — far from 9s; no adjacent suit tile
      '9s', // isolated — far from 1s
      'east', // isolated honor — no other wind tiles present
      JING2,
      JING2, // pure-jing pair candidate (forbidden by rules)
    ];
    expect(isWinningHand(hand, [JING2])).toBe(false);
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

// ── BUG-056 regression: wildcard in low chow position ────────────────────────

describe('Engine·BUG-056 — wildcard fills lowest position in a suit chow', () => {
  // Jing = '9s' (the wildcard used in the reported playtest)
  const JING9S: TileType = '9s';
  const JINGS9S: TileType[] = [JING9S];

  it('all-chow hand where wild is the LOW tile: wild+7s+8s = 6s7s8s', () => {
    // melds: [wild,7s,8s]=6s7s8s  1p2p3p  4p5p6p  7p8p9p  pair: 1m1m
    const hand: TileType[] = [
      JING9S,
      '7s',
      '8s',
      '1p',
      '2p',
      '3p',
      '4p',
      '5p',
      '6p',
      '7p',
      '8p',
      '9p',
      '1m',
      '1m',
    ];
    expect(isWinningHand(hand, JINGS9S)).toBe(true);
  });

  it('all-chow hand where wild is the LOW tile at rank boundary: wild+8s+9s', () => {
    // melds: [wild,8s,9s]=7s8s9s  1p2p3p  4p5p6p  7p8p9p  pair: east east
    const hand: TileType[] = [
      JING9S,
      '8s',
      '9s',
      '1p',
      '2p',
      '3p',
      '4p',
      '5p',
      '6p',
      '7p',
      '8p',
      '9p',
      'east',
      'east',
    ];
    expect(isWinningHand(hand, JINGS9S)).toBe(true);
  });

  it('all-chow hand with two wilds both filling low positions', () => {
    // Primary='9s', Secondary='1m' (stepAbove 9s). Both are wildcards.
    // melds: [wild,7s,8s]=6s7s8s  [wild,2p,3p]=1p2p3p  4p5p6p  7p8p9p  pair: east east
    const JING1M: TileType = '1m';
    const hand: TileType[] = [
      JING9S, // wildcard 1 → fills low of 6s7s8s
      '7s',
      '8s',
      JING1M, // wildcard 2 → fills low of 1p2p3p
      '2p',
      '3p',
      '4p',
      '5p',
      '6p',
      '7p',
      '8p',
      '9p',
      'east',
      'east',
    ];
    expect(isWinningHand(hand, [JING9S, JING1M])).toBe(true);
  });

  it('pair contains a wild; remaining melds are all sequential with wild in low pos', () => {
    // melds: [wild,7s,8s]=6s7s8s  1p2p3p  4p5p6p  7p8p9p  pair: east+wild
    const hand: TileType[] = [
      JING9S, // wildcard 1 → fills low of 6s7s8s
      '7s',
      '8s',
      '1p',
      '2p',
      '3p',
      '4p',
      '5p',
      '6p',
      '7p',
      '8p',
      '9p',
      'east',
      JING9S, // wildcard 2 → completes east pair
    ];
    expect(isWinningHand(hand, JINGS9S)).toBe(true);
  });
});
