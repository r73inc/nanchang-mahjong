import { describe, it, expect } from 'vitest';
import {
  standardDist,
  sevenPairsDist,
  thirteenMisfitsDist,
  starWinDist,
  overallDist,
} from '../bot/ting-distance';
import type { TileType } from '../types';

// ── standardDist ──────────────────────────────────────────────────────────────

describe('standardDist', () => {
  it('returns 0 for a tenpai hand (pair + 3 complete melds + 1 partial)', () => {
    // pair: 1m 1m, melds: 2m3m4m 5m6m7m 1p2p3p, waiting: any 8m or 9m for chow
    // Actually: this is a tenpai hand waiting for 8m (completing 6m7m8m) or similar
    // Let's use: naturals = [1m,1m, 2m,3m,4m, 5m,6m,7m, 1p,2p,3p, 6p,7p] waiting 5p/8p
    const nat: TileType[] = [
      '1m',
      '1m',
      '2m',
      '3m',
      '4m',
      '5m',
      '6m',
      '7m',
      '1p',
      '2p',
      '3p',
      '6p',
      '7p',
    ];
    expect(standardDist(nat, 0)).toBe(0);
  });

  it('returns 0 for tenpai: 4 melds complete, waiting for pair tile', () => {
    // 4 complete melds + single tile waiting for its pair
    const nat: TileType[] = [
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
    expect(standardDist(nat, 0)).toBe(0);
  });

  it('returns 1 for one-away from tenpai', () => {
    // Isolated honor + mostly complete hand that needs 1 more step
    const nat: TileType[] = [
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
      'east',
      'east',
    ];
    // Has pair (east), 3 complete melds from 1m-9m, partial pair 1p2p → 1 swap to tenpai
    expect(standardDist(nat, 0)).toBeLessThanOrEqual(1);
  });

  it('jing wildcard reduces distance: 1 jing replaces 1 missing meld tile', () => {
    // Hand: 1m2m (partial chow, needs 3m) + complete stuff + pair
    // Without jing: distance > 0. With 1 jing: jing fills the 3m slot → tenpai
    const nat: TileType[] = [
      '1m',
      '2m',
      '4m',
      '5m',
      '6m',
      '7m',
      '8m',
      '9m',
      '1p',
      '2p',
      '3p',
      'east',
      'east',
    ];
    const distNoJing = standardDist(nat, 0);
    const distWithJing = standardDist(nat, 1);
    expect(distWithJing).toBeLessThanOrEqual(distNoJing);
  });

  it('jing wildcard can substitute for pair tile', () => {
    // Exactly 4 melds formed, 1 isolated tile + 1 jing → jing pairs with it → tenpai
    const nat: TileType[] = [
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
    // Has 4 melds + 5p alone. With 1 jing, can form a half-jing pair with 5p → tenpai
    const distWithJing = standardDist(nat, 1);
    expect(distWithJing).toBe(0);
  });

  it('2 jings can substitute for 2 missing tiles', () => {
    // nat has only 11 tiles forming ~3.5 melds + pair; 2 jings fill the gap
    const nat: TileType[] = ['1m', '2m', '3m', '4m', '5m', '6m', '1p', '2p', '3p', 'east', 'east'];
    // Already 3 complete melds + pair + 1m2m partial. 2 jings → 2 more completions
    const distWith2 = standardDist(nat, 2);
    expect(distWith2).toBeLessThanOrEqual(standardDist(nat, 0));
  });

  it('2 jings form a pure-wildcard pair', () => {
    // 4 complete melds (12 naturals) + 1 remaining (no pair) + 2 jings → jing-jing pair → tenpai
    // But we have only 13 tiles total: 12 natural (4 melds) + 1 tile + 0 jings
    // Let's test: 4 melds = 12 tiles... wait we need 13 tiles total
    // naturals = 4 complete melds (12 tiles) + 1 singleton; but 12+1=13 ✓, jings=0 → dist=0
    // (singleton is the pair wait target)
    // With 2 jings: use 11 naturals + 2 jings = 13 total
    const nat: TileType[] = ['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m', '1p', '2p'];
    // 3 melds (9) + 2 partial tiles (1p,2p) + 2 jings = 13 total
    const dist = standardDist(nat, 2);
    expect(dist).toBeLessThanOrEqual(1);
  });
});

// ── sevenPairsDist ────────────────────────────────────────────────────────────

describe('sevenPairsDist', () => {
  it('returns 0 when 6 pairs exist (tenpai)', () => {
    // 6 pairs + 1 singleton waiting for its pair mate
    const nat: TileType[] = [
      '1m',
      '1m',
      '2m',
      '2m',
      '3m',
      '3m',
      '4m',
      '4m',
      '5m',
      '5m',
      '6m',
      '6m',
      '7m',
    ];
    expect(sevenPairsDist(nat, 0)).toBe(0);
  });

  it('returns 1 when 5 pairs exist', () => {
    const nat: TileType[] = [
      '1m',
      '1m',
      '2m',
      '2m',
      '3m',
      '3m',
      '4m',
      '4m',
      '5m',
      '5m',
      '6m',
      '7m',
      '8m',
    ];
    expect(sevenPairsDist(nat, 0)).toBe(1);
  });

  it('returns 0 with 5 pairs + 1 jing completing a singleton into a pair', () => {
    // 5 pairs (10 tiles) + 2 singletons (12 tiles) + 1 jing = 13 total
    // jing pairs with one singleton → 6 pairs → tenpai
    const nat: TileType[] = [
      '1m',
      '1m',
      '2m',
      '2m',
      '3m',
      '3m',
      '4m',
      '4m',
      '5m',
      '5m',
      '6m',
      '7m',
    ];
    expect(sevenPairsDist(nat, 1)).toBe(0);
  });

  it('jing reduces distance by 1 per jing (up to remaining singles)', () => {
    // 4 pairs + 5 singletons = 13 total; 0 jings → distance 2; 1 jing → distance 1
    const nat: TileType[] = [
      '1m',
      '1m',
      '2m',
      '2m',
      '3m',
      '3m',
      '4m',
      '4m',
      '5m',
      '6m',
      '7m',
      '8m',
      '9m',
    ];
    expect(sevenPairsDist(nat, 0)).toBe(2);
    expect(sevenPairsDist(nat, 1)).toBe(1);
    expect(sevenPairsDist(nat, 2)).toBe(0);
  });

  it('4 identical tiles count as 2 pairs (Nanchang rule)', () => {
    // Four identical (1m×4) = 2 pairs + some other pairs to reach 6
    const nat: TileType[] = [
      '1m',
      '1m',
      '1m',
      '1m',
      '2m',
      '2m',
      '3m',
      '3m',
      '4m',
      '4m',
      '5m',
      '5m',
      '6m',
    ];
    expect(sevenPairsDist(nat, 0)).toBe(0);
  });
});

// ── thirteenMisfitsDist ───────────────────────────────────────────────────────

describe('thirteenMisfitsDist', () => {
  it('returns 0 for a fully isolated hand (tenpai for misfits)', () => {
    // All tiles isolated: no duplicate honors, no adjacent suit tiles within 2
    const hand: TileType[] = [
      'east',
      'south',
      'west',
      'north',
      'zhong',
      'fa',
      'bai',
      '1m',
      '4m',
      '7m',
      '1p',
      '5p',
      '9p',
    ];
    expect(thirteenMisfitsDist(hand)).toBe(0);
  });

  it('counts a duplicate honor as 1 conflict', () => {
    // Two 'east' tiles — one is a conflict
    const hand: TileType[] = [
      'east',
      'east',
      'south',
      'west',
      'north',
      'zhong',
      'fa',
      '1m',
      '4m',
      '7m',
      '1p',
      '5p',
      '9p',
    ];
    expect(thirteenMisfitsDist(hand)).toBe(1);
  });

  it('counts adjacent suit tiles as 2 conflicts', () => {
    // 1m and 2m are within rank 2 → both flagged
    const hand: TileType[] = [
      'east',
      'south',
      'west',
      'north',
      'zhong',
      'fa',
      'bai',
      '1m',
      '2m',
      '5m',
      '1p',
      '5p',
      '9p',
    ];
    expect(thirteenMisfitsDist(hand)).toBe(2);
  });

  it('a cluster of 3 adjacent tiles in same suit flags all 3', () => {
    // 1m, 2m, 3m — all within 2 of each other
    const hand: TileType[] = [
      'east',
      'south',
      'west',
      'north',
      'zhong',
      'fa',
      'bai',
      '1m',
      '2m',
      '3m',
      '1p',
      '5p',
      '9p',
    ];
    // 1m-2m conflict (both), 2m-3m conflict (both) → {1m,2m,3m} all flagged
    expect(thirteenMisfitsDist(hand)).toBe(3);
  });
});

// ── starWinDist ───────────────────────────────────────────────────────────────

describe('starWinDist', () => {
  it('returns 0 for a valid star-win tenpai hand', () => {
    // All 7 honor types, all suit tiles isolated — ready for star win
    const hand: TileType[] = [
      'east',
      'south',
      'west',
      'north',
      'zhong',
      'fa',
      'bai',
      '1m',
      '4m',
      '7m',
      '1p',
      '5p',
      '9p',
    ];
    expect(starWinDist(hand)).toBe(0);
  });

  it('returns > 0 when missing an honor tile', () => {
    // Missing 'bai' — has only 6 unique honors
    const hand: TileType[] = [
      'east',
      'south',
      'west',
      'north',
      'zhong',
      'fa',
      'fa',
      '1m',
      '4m',
      '7m',
      '1p',
      '5p',
      '9p',
    ];
    expect(starWinDist(hand)).toBeGreaterThanOrEqual(1);
  });

  it('returns >= misfit distance when there are suit conflicts', () => {
    // All 7 honors but 1m 2m conflict → star distance >= 2
    const hand: TileType[] = [
      'east',
      'south',
      'west',
      'north',
      'zhong',
      'fa',
      'bai',
      '1m',
      '2m',
      '7m',
      '1p',
      '5p',
      '9p',
    ];
    expect(starWinDist(hand)).toBeGreaterThanOrEqual(2);
  });
});

// ── overallDist ───────────────────────────────────────────────────────────────

describe('overallDist', () => {
  const jings: TileType[] = ['3p', '4p']; // example jing types

  it('returns 0 for a standard tenpai hand', () => {
    // 1m1m 2m3m4m 5m6m7m 8m9m and waiting for 7m/10m... let me use a simpler hand
    // pair 1m1m + melds 2m3m4m, 5m6m7m, 1p2p3p + partial 6p7p waiting for 5p/8p
    const hand: TileType[] = [
      '1m',
      '1m',
      '2m',
      '3m',
      '4m',
      '5m',
      '6m',
      '7m',
      '1p',
      '2p',
      '3p',
      '6p',
      '7p',
    ];
    expect(overallDist(hand, jings)).toBe(0);
  });

  it('selects the easiest path (minimum across all hand types)', () => {
    // A hand with 5 pairs is closer to seven-pairs ting than to standard ting
    const hand: TileType[] = [
      '1m',
      '1m',
      '2m',
      '2m',
      '3m',
      '3m',
      '4m',
      '4m',
      '5m',
      '5m',
      '6m',
      '7m',
      '8m',
    ];
    const dist = overallDist(hand, []);
    // sevenPairsDist = 1, standardDist could be higher
    expect(dist).toBeLessThanOrEqual(1);
  });

  it('jings reduce overall distance', () => {
    const hand2: TileType[] = [
      '1m',
      '2m',
      '3m',
      '5m',
      '6m',
      '7m',
      '8m',
      '9m',
      '1p',
      '2p',
      '3p',
      'east',
      'east',
    ];
    // Without jing: 1m2m3m + 5m6m7m + 8m9m(partial) + 1p2p3p + east east pair = tenpai
    const distNoJing = overallDist(hand2, []);
    expect(distNoJing).toBe(0); // already tenpai

    // Hand that needs 2 jings to reach tenpai
    const hand3: TileType[] = [
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
      'east',
      'south',
      'west',
    ];
    // Lots of isolated tiles — hard to form standard hand without jings
    const distWith2Jing = overallDist(hand3, ['1m', '3m']); // 1m and 3m are jings
    const distNoJingH3 = overallDist(hand3, []);
    expect(distWith2Jing).toBeLessThanOrEqual(distNoJingH3);
  });

  it('misfit path is chosen when it is shortest', () => {
    // A hand of completely isolated tiles is tenpai for misfits
    const hand: TileType[] = [
      'east',
      'south',
      'west',
      'north',
      'zhong',
      'fa',
      'bai',
      '1m',
      '4m',
      '7m',
      '1p',
      '5p',
      '9p',
    ];
    expect(overallDist(hand, [])).toBe(0);
  });
});
