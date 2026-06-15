import { describe, it, expect } from 'vitest';
import {
  getVisibleTiles,
  getWinningTiles,
  countEffectiveDraws,
  rankDiscardCandidates,
  simulatePung,
  simulateChow,
  bestDistAfterClaim,
} from '../bot/effective-draws';
import type { TileType, SeatState } from '../types';

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeSeat(partial: Partial<SeatState> = {}): SeatState {
  return {
    wind: 'east',
    hand: [],
    openMelds: [],
    discards: [],
    score: 0,
    ...partial,
  };
}

const NO_JINGS: TileType[] = [];

// ── getVisibleTiles ───────────────────────────────────────────────────────────

describe('getVisibleTiles', () => {
  it('counts tiles in own hand', () => {
    const hand: TileType[] = ['1m', '2m', '3m'];
    const seats = [makeSeat(), makeSeat(), makeSeat(), makeSeat()];
    const visible = getVisibleTiles(hand, seats);
    expect(visible.get('1m')).toBe(1);
    expect(visible.get('2m')).toBe(1);
    expect(visible.get('3m')).toBe(1);
    expect(visible.get('4m')).toBeUndefined();
  });

  it('counts tiles in all players open melds', () => {
    const hand: TileType[] = ['1m'];
    const seats = [
      makeSeat(),
      makeSeat({
        openMelds: [{ kind: 'pung', tiles: ['5p', '5p', '5p'], concealed: false }],
      }),
      makeSeat(),
      makeSeat(),
    ];
    const visible = getVisibleTiles(hand, seats);
    expect(visible.get('5p')).toBe(3);
  });

  it('counts tiles in all players discard piles', () => {
    const hand: TileType[] = ['1m'];
    const seats = [
      makeSeat({ discards: ['east', 'east'] }),
      makeSeat({ discards: ['east'] }),
      makeSeat(),
      makeSeat(),
    ];
    const visible = getVisibleTiles(hand, seats);
    expect(visible.get('east')).toBe(3);
  });

  it('aggregates own hand + melds + discards', () => {
    const hand: TileType[] = ['9s', '9s'];
    const seats = [
      makeSeat({ discards: ['9s'] }),
      makeSeat({
        openMelds: [{ kind: 'pung', tiles: ['9s', '9s', '9s'], concealed: false }],
      }),
      makeSeat(),
      makeSeat(),
    ];
    const visible = getVisibleTiles(hand, seats);
    // Own: 2, seat0 discards: 1, seat1 pung: 3 = 6... but only 4 exist in the set.
    // The function just counts, it doesn't cap at 4.
    expect(visible.get('9s')).toBe(6);
  });
});

// ── getWinningTiles ───────────────────────────────────────────────────────────

describe('getWinningTiles', () => {
  it('returns winning tiles for a standard tenpai hand', () => {
    // Tenpai: pair 1m1m + melds 2m3m4m 5m6m7m 1p2p3p + partial 6p7p
    // Waiting for 5p (completing 5p6p7p) or 8p (completing 6p7p8p)
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
    const winners = getWinningTiles(hand, NO_JINGS);
    expect(winners).toContain('5p');
    expect(winners).toContain('8p');
  });

  it('includes jing tiles as winning tiles when jing completes the hand', () => {
    // Same tenpai hand, with 5p as a jing type — drawing a 5p (jing) should win
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
    const winners = getWinningTiles(hand, ['5p']);
    // A drawn 5p acts as a wildcard and completes the hand — should still be listed
    // (isWinningHand handles this)
    expect(winners.length).toBeGreaterThan(0);
  });

  it('returns winning tiles for seven pairs tenpai', () => {
    // 6 pairs + 1 singleton: waiting for 7m
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
      '6m',
      '7m',
    ];
    const winners = getWinningTiles(hand, NO_JINGS);
    expect(winners).toContain('7m');
  });

  it('returns empty array when hand is not tenpai', () => {
    // 3 isolated tiles — clearly not tenpai
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
      'east',
      'south',
      'west',
    ];
    const winners = getWinningTiles(hand, NO_JINGS);
    expect(winners.length).toBe(0);
  });
});

// ── countEffectiveDraws ───────────────────────────────────────────────────────

describe('countEffectiveDraws', () => {
  it('counts unseen winning tiles for a tenpai hand', () => {
    // Tenpai waiting for 5p (4 copies) or 8p (4 copies) = 8 max
    // If 1 copy of 5p is visible, effective draws = 3 + 4 = 7
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
    const visible = new Map<TileType, number>([['5p', 1]]);
    const count = countEffectiveDraws(hand, NO_JINGS, visible);
    expect(count).toBe(7); // 3 unseen 5p + 4 unseen 8p
  });

  it('returns 0 when all winning tiles are seen', () => {
    // Tenpai for 5p and 8p, but all 4 of each are visible
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
    const visible = new Map<TileType, number>([
      ['5p', 4],
      ['8p', 4],
    ]);
    const count = countEffectiveDraws(hand, NO_JINGS, visible);
    expect(count).toBe(0);
  });

  it('counts distance-reducing tiles when not in tenpai', () => {
    // A hand that needs 1 more step to tenpai: drawing the right tile reduces distance
    // 1m2m (partial chow) + rest forming 3 melds + pair + isolated tile
    const hand: TileType[] = [
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
    const visible = new Map<TileType, number>();
    const count = countEffectiveDraws(hand, NO_JINGS, visible);
    // Drawing 3m completes the chow → reduces distance → counted
    expect(count).toBeGreaterThan(0);
  });
});

// ── rankDiscardCandidates ─────────────────────────────────────────────────────

describe('rankDiscardCandidates', () => {
  it('ranks lower-distance candidates first', () => {
    // Hand that strongly benefits from discarding the isolated honor
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
      'east',
    ];
    const visible = new Map<TileType, number>();
    const candidates = rankDiscardCandidates(hand, NO_JINGS, visible);
    expect(candidates.length).toBeGreaterThan(0);
    // First candidate should have the lowest distAfterDiscard
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i].distAfterDiscard).toBeGreaterThanOrEqual(candidates[0].distAfterDiscard);
    }
  });

  it('among equal distances, higher effectiveDraws ranks first', () => {
    // Build a hand where two discards give the same distance but different winning tile counts
    // Tenpai hand + one extra tile that creates two equal-distance paths
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
      'east',
    ];
    // Discarding 'east' leaves the tenpai hand (dist=0)
    // Discarding '6p' or '7p' also might give dist=0 or dist=1
    const visible = new Map<TileType, number>();
    const candidates = rankDiscardCandidates(hand, NO_JINGS, visible);
    // Among dist=0 candidates, the one with more effective draws comes first
    const dist0 = candidates.filter((c) => c.distAfterDiscard === 0);
    for (let i = 1; i < dist0.length; i++) {
      expect(dist0[i].effectiveDraws).toBeLessThanOrEqual(dist0[0].effectiveDraws);
    }
  });

  it('never includes jing tiles as candidates', () => {
    const jings: TileType[] = ['5p'];
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
      '5p',
      '5p',
      '5p',
      'east',
    ];
    const candidates = rankDiscardCandidates(hand, jings, new Map());
    const candidateTiles = candidates.map((c) => c.tile);
    expect(candidateTiles).not.toContain('5p');
  });

  it('jing wildcard reduces the distance of the best discard path', () => {
    // Without jings: a difficult hand needs 2 steps. With 1 jing, should need 1 or 0.
    const nat = [
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
    ] as TileType[];
    const jings: TileType[] = ['1m'];
    // With 1m as a jing, the naturals have 12 tiles + 1 jing
    // The hand is: ['3m','5m','7m','9m','1p','3p','5p','7p','9p','east','south','west'] + 1 jing
    const hand = nat; // '1m' appears once and is the jing
    const candidatesNoJing = rankDiscardCandidates(hand, [], new Map());
    const candidatesWithJing = rankDiscardCandidates(hand, jings, new Map());
    const bestNoJing = candidatesNoJing[0]?.distAfterDiscard ?? 8;
    const bestWithJing = candidatesWithJing[0]?.distAfterDiscard ?? 8;
    expect(bestWithJing).toBeLessThanOrEqual(bestNoJing);
  });
});

// ── simulatePung ──────────────────────────────────────────────────────────────

describe('simulatePung', () => {
  it('removes 2 copies of the discarded tile', () => {
    const hand: TileType[] = ['1m', '1m', '1m', '2m', '3m'];
    const result = simulatePung(hand, '1m');
    expect(result).not.toBeNull();
    expect(result!.length).toBe(3);
    expect(result!.filter((t) => t === '1m').length).toBe(1);
  });

  it('returns null when fewer than 2 copies are held', () => {
    const hand: TileType[] = ['1m', '2m', '3m'];
    expect(simulatePung(hand, '1m')).toBeNull();
  });
});

// ── simulateChow ──────────────────────────────────────────────────────────────

describe('simulateChow', () => {
  it('removes the two non-discarded sequence tiles', () => {
    const hand: TileType[] = ['2m', '3m', '4m', '5m', '6m'];
    const seq: [TileType, TileType, TileType] = ['2m', '3m', '4m'];
    // discardedTile is '2m' — hand must contribute '3m' and '4m'
    const result = simulateChow(hand, '2m', seq);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(3);
    expect(result!).toContain('5m');
    expect(result!).toContain('6m');
  });

  it('returns null when required hand tiles are missing', () => {
    const hand: TileType[] = ['1m', '5m', '6m'];
    const seq: [TileType, TileType, TileType] = ['2m', '3m', '4m'];
    expect(simulateChow(hand, '2m', seq)).toBeNull();
  });
});

// ── bestDistAfterClaim ────────────────────────────────────────────────────────

describe('bestDistAfterClaim', () => {
  it('finds the minimum distance after an optimal discard from the 11-tile hand', () => {
    // After a pung claim, bot has 11 tiles and needs to discard 1
    // Well-formed 11-tile hand (3 melds + pair possible after discard)
    const hand11: TileType[] = [
      '1m',
      '2m',
      '3m',
      '4m',
      '5m',
      '6m',
      '7m',
      '8m',
      '9m',
      'east',
      'east',
    ];
    const dist = bestDistAfterClaim(hand11, NO_JINGS);
    // 10-tile sub-hand after discarding 1: pair=east,east + 3 suit melds → dist=0
    expect(dist).toBeLessThanOrEqual(1);
  });

  it('jing reduces best distance after claim', () => {
    const hand11WithJing: TileType[] = [
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
    ];
    const jings: TileType[] = ['3m'];
    // '3m' in hand counts as a jing wildcard
    const distJ = bestDistAfterClaim(hand11WithJing, jings);
    expect(distJ).toBeLessThanOrEqual(bestDistAfterClaim(hand11WithJing, []));
  });
});
