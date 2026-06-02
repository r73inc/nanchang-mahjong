import { describe, it, expect } from 'vitest';
import {
  canWin,
  canPung,
  canKongFromDiscard,
  concealedKongOptions,
  chowOptions,
  isTenpai,
  tenpaiTiles,
} from '../calls';
import type { TileType } from '../types';

/** Empty jing array = no wildcards in play. */
const NO_JINGS: TileType[] = [];
const JING: TileType = '5m';
const JINGS: TileType[] = [JING];

// ── canWin ────────────────────────────────────────────────────────────────────

describe('canWin', () => {
  it('recognises a winning tile for a tenpai hand', () => {
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
    expect(canWin(hand, '9s', NO_JINGS)).toBe(true);
  });

  it('rejects a non-winning tile', () => {
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
    expect(canWin(hand, '1p', NO_JINGS)).toBe(false);
  });

  it('rejects a hand with 12 tiles (too short)', () => {
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
    ];
    expect(canWin(hand, '9s', NO_JINGS)).toBe(false);
  });

  it('works with jing wildcard filling the gap', () => {
    // 13-tile hand: 1m2m3m 4m*6m 7m8m9m 1p2p3p 9s (jing fills 5m spot in 4m5m6m)
    const h13: TileType[] = [
      '1m',
      '2m',
      '3m',
      '4m',
      '6m',
      '7m',
      '8m',
      '9m',
      '1p',
      '2p',
      '3p',
      JING,
      '9s',
    ];
    // Adding 9s → pair → 1m2m3m 4m JING 6m 7m8m9m 1p2p3p 9s9s → win!
    expect(canWin(h13, '9s', JINGS)).toBe(true);
  });
});

// ── canPung ───────────────────────────────────────────────────────────────────

describe('canPung', () => {
  it('can pung with 2 natural matching tiles', () => {
    const hand: TileType[] = ['3m', '3m', '7p', '8p', 'east'];
    expect(canPung(hand, '3m', NO_JINGS)).toBe(true);
  });

  it('cannot pung with only 1 matching tile', () => {
    const hand: TileType[] = ['3m', '7p', '8p', 'east'];
    expect(canPung(hand, '3m', NO_JINGS)).toBe(false);
  });

  it('can pung with 1 natural + 1 jing', () => {
    const hand: TileType[] = ['3m', JING, '7p'];
    expect(canPung(hand, '3m', JINGS)).toBe(true);
  });

  it('can pung with 2 jings (discard is the natural anchor)', () => {
    const hand: TileType[] = [JING, JING, '7p', '8p'];
    expect(canPung(hand, '3m', JINGS)).toBe(true);
  });

  it('Engine·call-priority: pung eligibility correctly reported', () => {
    const hand: TileType[] = ['east', 'east', '1m', '2m', '3m'];
    expect(canPung(hand, 'east', NO_JINGS)).toBe(true);
    expect(canPung(hand, '1m', NO_JINGS)).toBe(false);
  });
});

// ── canKong ───────────────────────────────────────────────────────────────────

describe('canKongFromDiscard', () => {
  it('can kong with 3 natural matching tiles', () => {
    const hand: TileType[] = ['9p', '9p', '9p', '1m', '2m'];
    expect(canKongFromDiscard(hand, '9p', NO_JINGS)).toBe(true);
  });

  it('cannot kong with only 2 matching tiles', () => {
    const hand: TileType[] = ['9p', '9p', '1m', '2m'];
    expect(canKongFromDiscard(hand, '9p', NO_JINGS)).toBe(false);
  });

  it('can kong with 2 naturals + 1 jing', () => {
    const hand: TileType[] = ['9p', '9p', JING, '1m'];
    expect(canKongFromDiscard(hand, '9p', JINGS)).toBe(true);
  });

  it('can kong with 0 naturals + 3 jings (discard is natural anchor)', () => {
    const hand: TileType[] = [JING, JING, JING, '1m'];
    expect(canKongFromDiscard(hand, '9p', JINGS)).toBe(true);
  });
});

describe('concealedKongOptions', () => {
  it('identifies a concealed kong with 4 natural tiles', () => {
    // 14-tile hand with four 7p
    const hand: TileType[] = [
      '7p',
      '7p',
      '7p',
      '7p',
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
    ];
    const opts = concealedKongOptions(hand, NO_JINGS);
    expect(opts).toContain('7p');
  });

  it('returns empty when no 4-of-a-kind', () => {
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
      '9s',
    ];
    expect(concealedKongOptions(hand, NO_JINGS)).toHaveLength(0);
  });

  it('identifies kong with 3 naturals + 1 jing', () => {
    const hand: TileType[] = [
      '7p',
      '7p',
      '7p',
      JING,
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
    ];
    const opts = concealedKongOptions(hand, JINGS);
    expect(opts).toContain('7p');
  });
});

// ── chowOptions ───────────────────────────────────────────────────────────────

describe('chowOptions', () => {
  it('returns a chow option when hand has the two flanking tiles', () => {
    const hand: TileType[] = ['1m', '3m', '5m', 'east']; // discard 2m → chow 1m2m3m
    const options = chowOptions(hand, '2m', NO_JINGS);
    expect(options.length).toBeGreaterThan(0);
    expect(options).toContainEqual(['1m', '2m', '3m']);
  });

  it('returns multiple options when multiple chows are possible', () => {
    const hand: TileType[] = ['1m', '3m', '5m', '7m']; // discard 2m
    // [1m,2m,3m] needs 1m+3m from hand ✓; [2m,3m,4m] needs 3m+4m — no 4m
    const options = chowOptions(hand, '2m', NO_JINGS);
    expect(options).toContainEqual(['1m', '2m', '3m']);
  });

  it('returns empty when hand lacks needed tiles for a suit chow', () => {
    const hand: TileType[] = ['9m', '1p', '2p', 'east']; // discard 5m, hand has nothing adjacent
    expect(chowOptions(hand, '5m', NO_JINGS)).toHaveLength(0);
  });

  it('Engine·call-priority: chow only available with correct tiles', () => {
    const hand: TileType[] = ['4m', '6m', '1p', '2p'];
    const options = chowOptions(hand, '5m', NO_JINGS);
    expect(options).toContainEqual(['4m', '5m', '6m']);
  });

  it('can chow using a jing wildcard to fill a gap in a suit chow', () => {
    // hand has 1m and jing; discard is 2m → 1m2m3m with jing as 3m
    const hand: TileType[] = ['1m', JING, 'east'];
    const options = chowOptions(hand, '2m', JINGS);
    expect(options.length).toBeGreaterThan(0);
  });

  it('can chow a wind honor tile to form an honor chow', () => {
    // discarded east, hand has south + west → can form east-south-west chow
    const hand: TileType[] = ['south', 'west', '1m', '2m'];
    const options = chowOptions(hand, 'east', NO_JINGS);
    expect(options).toContainEqual(['east', 'south', 'west']);
  });

  it('can chow a dragon honor tile to form the dragon chow', () => {
    // discarded zhong, hand has fa + bai → zhong-fa-bai chow
    const hand: TileType[] = ['fa', 'bai', '1m', '2m'];
    const options = chowOptions(hand, 'zhong', NO_JINGS);
    expect(options).toContainEqual(['zhong', 'fa', 'bai']);
  });

  it('wrap-around wind chow: west-north-east (discard east, hand has west+north)', () => {
    const hand: TileType[] = ['west', 'north', '1p', '2p'];
    const options = chowOptions(hand, 'east', NO_JINGS);
    expect(options).toContainEqual(['west', 'north', 'east']);
  });

  it('returns empty for honor tile when no valid chow sequence possible', () => {
    // discarded east, but hand has no south, west, or north
    const hand: TileType[] = ['1m', '2m', '3m', 'zhong'];
    expect(chowOptions(hand, 'east', NO_JINGS)).toHaveLength(0);
  });
});

// ── isTenpai ──────────────────────────────────────────────────────────────────

describe('isTenpai', () => {
  it('recognises a tenpai hand', () => {
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
    expect(isTenpai(hand, NO_JINGS)).toBe(true);
  });

  it('returns false for a non-tenpai hand', () => {
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
    expect(isTenpai(hand, NO_JINGS)).toBe(false);
  });

  it('tenpai tiles includes the correct waiting tile', () => {
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
    const waiting = tenpaiTiles(hand, NO_JINGS);
    expect(waiting).toContain('9s');
  });
});
