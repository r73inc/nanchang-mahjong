import { describe, it, expect } from 'vitest';
import {
  TILE_TYPES,
  SUIT_MAN,
  WINDS,
  DRAGONS,
  typeOf,
  idOf,
  sortTypes,
  isHonor,
  isSuit,
  isTerminal,
  isTerminalOrHonor,
  getSuit,
  getRank,
  stepAbove,
  suitDistance,
  buildWall,
} from '../tiles';
import type { TileType } from '../types';

describe('TILE_TYPES', () => {
  it('has exactly 34 unique tile types', () => {
    expect(TILE_TYPES).toHaveLength(34);
    expect(new Set(TILE_TYPES).size).toBe(34);
  });

  it('starts with man suit (1m–9m)', () => {
    expect(TILE_TYPES.slice(0, 9)).toEqual(SUIT_MAN);
  });

  it('ends with dragons (zhong, fa, bai)', () => {
    expect(TILE_TYPES.slice(-3)).toEqual(DRAGONS);
  });

  it('WINDS has 4 elements in correct order', () => {
    expect(WINDS).toEqual(['east', 'south', 'west', 'north']);
  });

  it('DRAGONS has 3 elements in correct order', () => {
    expect(DRAGONS).toEqual(['zhong', 'fa', 'bai']);
  });
});

describe('buildWall', () => {
  it('returns 136 tile IDs', () => {
    const wall = buildWall();
    expect(wall).toHaveLength(136);
  });

  it('IDs are 0–135 with no duplicates', () => {
    const wall = buildWall();
    expect(new Set(wall).size).toBe(136);
    expect(Math.min(...wall)).toBe(0);
    expect(Math.max(...wall)).toBe(135);
  });
});

describe('typeOf / idOf', () => {
  it('typeOf(0) is "1m"', () => expect(typeOf(0)).toBe('1m'));
  it('typeOf(3) is "1m" (last copy)', () => expect(typeOf(3)).toBe('1m'));
  it('typeOf(4) is "2m"', () => expect(typeOf(4)).toBe('2m'));
  it('typeOf(35) is "9m"', () => expect(typeOf(35)).toBe('9m'));
  it('typeOf(36) is "1p"', () => expect(typeOf(36)).toBe('1p'));
  it('typeOf(108) is "east"', () => expect(typeOf(108)).toBe('east'));
  it('typeOf(124) is "zhong"', () => expect(typeOf(124)).toBe('zhong'));
  it('typeOf(135) is "bai"', () => expect(typeOf(135)).toBe('bai'));

  it('idOf("1m", 0) is 0', () => expect(idOf('1m', 0)).toBe(0));
  it('idOf("1m", 3) is 3', () => expect(idOf('1m', 3)).toBe(3));
  it('idOf("2m", 0) is 4', () => expect(idOf('2m', 0)).toBe(4));
  it('idOf("east", 0) is 108', () => expect(idOf('east', 0)).toBe(108));
  it('idOf("bai", 3) is 135', () => expect(idOf('bai', 3)).toBe(135));

  it('round-trips: typeOf(idOf(t, c)) === t for all types and copies', () => {
    for (const t of TILE_TYPES) {
      for (const c of [0, 1, 2, 3] as const) {
        expect(typeOf(idOf(t, c))).toBe(t);
      }
    }
  });
});

describe('sortTypes', () => {
  it('returns a sorted copy without mutating input', () => {
    const input: TileType[] = ['9m', '1m', 'east', '1p'];
    const sorted = sortTypes(input);
    expect(sorted).toEqual(['1m', '9m', '1p', 'east']);
    expect(input).toEqual(['9m', '1m', 'east', '1p']); // not mutated
  });

  it('sorts identical tiles stably', () => {
    const input: TileType[] = ['3m', '3m', '3m'];
    expect(sortTypes(input)).toEqual(['3m', '3m', '3m']);
  });
});

describe('isHonor / isSuit', () => {
  it('1m is a suit tile', () => expect(isSuit('1m')).toBe(true));
  it('9s is a suit tile', () => expect(isSuit('9s')).toBe(true));
  it('east is an honor', () => expect(isHonor('east')).toBe(true));
  it('zhong is an honor', () => expect(isHonor('zhong')).toBe(true));
  it('5p is not an honor', () => expect(isHonor('5p')).toBe(false));
});

describe('isTerminal / isTerminalOrHonor', () => {
  it('1m is terminal', () => expect(isTerminal('1m')).toBe(true));
  it('9s is terminal', () => expect(isTerminal('9s')).toBe(true));
  it('5p is not terminal', () => expect(isTerminal('5p')).toBe(false));
  it('east is not terminal but isTerminalOrHonor', () => {
    expect(isTerminal('east')).toBe(false);
    expect(isTerminalOrHonor('east')).toBe(true);
  });
  it('5m is neither terminal nor honor', () => {
    expect(isTerminalOrHonor('5m')).toBe(false);
  });
});

describe('getSuit / getRank', () => {
  it('getSuit("3m") is "man"', () => expect(getSuit('3m')).toBe('man'));
  it('getSuit("7p") is "pin"', () => expect(getSuit('7p')).toBe('pin'));
  it('getSuit("2s") is "sou"', () => expect(getSuit('2s')).toBe('sou'));
  it('getSuit("east") is null', () => expect(getSuit('east')).toBeNull());
  it('getRank("3m") is 3', () => expect(getRank('3m')).toBe(3));
  it('getRank("9s") is 9', () => expect(getRank('9s')).toBe(9));
  it('getRank("north") is null', () => expect(getRank('north')).toBeNull());
});

describe('stepAbove', () => {
  it('1m → 2m', () => expect(stepAbove('1m')).toBe('2m'));
  it('9m wraps to 1m', () => expect(stepAbove('9m')).toBe('1m'));
  it('8p → 9p', () => expect(stepAbove('8p')).toBe('9p'));
  it('9s wraps to 1s', () => expect(stepAbove('9s')).toBe('1s'));
  it('east → south', () => expect(stepAbove('east')).toBe('south'));
  it('north wraps to east', () => expect(stepAbove('north')).toBe('east'));
  it('zhong → fa', () => expect(stepAbove('zhong')).toBe('fa'));
  it('fa → bai', () => expect(stepAbove('fa')).toBe('bai'));
  it('bai wraps to zhong', () => expect(stepAbove('bai')).toBe('zhong'));
  it('step of 2: 3m → 5m', () => expect(stepAbove('3m', 2)).toBe('5m'));
});

describe('suitDistance', () => {
  it('distance from 3m to 5m is 2', () => expect(suitDistance('3m', '5m')).toBe(2));
  it('distance from 5m to 5m is 0', () => expect(suitDistance('5m', '5m')).toBe(0));
  it('distance from 5m to 3m is null (negative)', () =>
    expect(suitDistance('5m', '3m')).toBeNull());
  it('different suits returns null', () => expect(suitDistance('3m', '3p')).toBeNull());
  it('honor tiles return null', () => expect(suitDistance('east', 'south')).toBeNull());
});
