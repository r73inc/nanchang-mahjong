import { describe, it, expect } from 'vitest';
import { jingTypeFromIndicator, jingTypesFromIndicator, isJing, separateJing } from '../jing';
import type { TileType } from '../types';

describe('jingTypeFromIndicator', () => {
  it('3m indicator → 4m secondary jing', () => expect(jingTypeFromIndicator('3m')).toBe('4m'));
  it('8m indicator → 9m secondary jing', () => expect(jingTypeFromIndicator('8m')).toBe('9m'));
  it('9m indicator → 1m secondary jing (wrap)', () =>
    expect(jingTypeFromIndicator('9m')).toBe('1m'));

  it('3p indicator → 4p secondary jing', () => expect(jingTypeFromIndicator('3p')).toBe('4p'));
  it('9p indicator → 1p secondary jing (wrap)', () =>
    expect(jingTypeFromIndicator('9p')).toBe('1p'));

  it('5s indicator → 6s secondary jing', () => expect(jingTypeFromIndicator('5s')).toBe('6s'));
  it('9s indicator → 1s secondary jing (wrap)', () =>
    expect(jingTypeFromIndicator('9s')).toBe('1s'));

  it('east indicator → south secondary jing', () =>
    expect(jingTypeFromIndicator('east')).toBe('south'));
  it('south indicator → west secondary jing', () =>
    expect(jingTypeFromIndicator('south')).toBe('west'));
  it('west indicator → north secondary jing', () =>
    expect(jingTypeFromIndicator('west')).toBe('north'));
  it('north indicator → east secondary jing (wrap)', () =>
    expect(jingTypeFromIndicator('north')).toBe('east'));

  it('zhong indicator → fa secondary jing', () =>
    expect(jingTypeFromIndicator('zhong')).toBe('fa'));
  it('fa indicator → bai secondary jing', () => expect(jingTypeFromIndicator('fa')).toBe('bai'));
  it('bai indicator → zhong secondary jing (wrap)', () =>
    expect(jingTypeFromIndicator('bai')).toBe('zhong'));
});

describe('jingTypesFromIndicator', () => {
  it('3m indicator → [3m, 4m] (primary=indicator, secondary=one above)', () => {
    expect(jingTypesFromIndicator('3m')).toEqual(['3m', '4m']);
  });
  it('9m indicator → [9m, 1m] (secondary wraps)', () => {
    expect(jingTypesFromIndicator('9m')).toEqual(['9m', '1m']);
  });
  it('north indicator → [north, east] (secondary wraps winds)', () => {
    expect(jingTypesFromIndicator('north')).toEqual(['north', 'east']);
  });
  it('bai indicator → [bai, zhong] (secondary wraps dragons)', () => {
    expect(jingTypesFromIndicator('bai')).toEqual(['bai', 'zhong']);
  });
});

describe('isJing', () => {
  it('4m is jing when jingTypes includes 4m', () => expect(isJing('4m', ['4m'])).toBe(true));
  it('3m is not jing when jingTypes is [4m]', () => expect(isJing('3m', ['4m'])).toBe(false));
  it('east is jing when jingTypes includes east', () =>
    expect(isJing('east', ['east'])).toBe(true));
  it('tile matches either of dual jing types', () => expect(isJing('5m', ['4m', '5m'])).toBe(true));
  it('tile not in dual jing types', () => expect(isJing('3m', ['4m', '5m'])).toBe(false));
  it('empty jingTypes → nothing is jing', () => expect(isJing('4m', [])).toBe(false));
});

describe('separateJing', () => {
  it('separates jing from naturals (single jing type)', () => {
    const hand: TileType[] = ['1m', '4m', '4m', '5m', '4m'];
    const { naturals, jingCount } = separateJing(hand, ['4m']);
    expect(jingCount).toBe(3);
    expect(naturals).toEqual(['1m', '5m']);
  });

  it('separates both primary and secondary jings', () => {
    const hand: TileType[] = ['1m', '3m', '3m', '4m', '5m'];
    // primary='3m', secondary='4m'
    const { naturals, jingCount } = separateJing(hand, ['3m', '4m']);
    expect(jingCount).toBe(3); // both 3m copies + the 4m copy
    expect(naturals).toEqual(['1m', '5m']);
  });

  it('returns all naturals when no jings in hand', () => {
    const hand: TileType[] = ['1m', '2m', '3m'];
    const { naturals, jingCount } = separateJing(hand, ['9s']);
    expect(jingCount).toBe(0);
    expect(naturals).toEqual(['1m', '2m', '3m']);
  });

  it('all tiles are jing', () => {
    const hand: TileType[] = ['east', 'east', 'east', 'east'];
    const { naturals, jingCount } = separateJing(hand, ['east']);
    expect(jingCount).toBe(4);
    expect(naturals).toHaveLength(0);
  });

  it('empty jingTypes → all tiles are natural', () => {
    const hand: TileType[] = ['1m', '2m', '3m'];
    const { naturals, jingCount } = separateJing(hand, []);
    expect(jingCount).toBe(0);
    expect(naturals).toEqual(['1m', '2m', '3m']);
  });
});
