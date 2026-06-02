import { describe, it, expect } from 'vitest';
import { jingTypeFromIndicator, isJing, separateJing } from '../jing';
import type { TileType } from '../types';

describe('jingTypeFromIndicator', () => {
  it('3m indicator → 4m jing', () => expect(jingTypeFromIndicator('3m')).toBe('4m'));
  it('8m indicator → 9m jing', () => expect(jingTypeFromIndicator('8m')).toBe('9m'));
  it('9m indicator → 1m jing (wrap)', () => expect(jingTypeFromIndicator('9m')).toBe('1m'));

  it('3p indicator → 4p jing', () => expect(jingTypeFromIndicator('3p')).toBe('4p'));
  it('9p indicator → 1p jing (wrap)', () => expect(jingTypeFromIndicator('9p')).toBe('1p'));

  it('5s indicator → 6s jing', () => expect(jingTypeFromIndicator('5s')).toBe('6s'));
  it('9s indicator → 1s jing (wrap)', () => expect(jingTypeFromIndicator('9s')).toBe('1s'));

  it('east indicator → south jing', () => expect(jingTypeFromIndicator('east')).toBe('south'));
  it('south indicator → west jing', () => expect(jingTypeFromIndicator('south')).toBe('west'));
  it('west indicator → north jing', () => expect(jingTypeFromIndicator('west')).toBe('north'));
  it('north indicator → east jing (wrap)', () =>
    expect(jingTypeFromIndicator('north')).toBe('east'));

  it('zhong indicator → fa jing', () => expect(jingTypeFromIndicator('zhong')).toBe('fa'));
  it('fa indicator → bai jing', () => expect(jingTypeFromIndicator('fa')).toBe('bai'));
  it('bai indicator → zhong jing (wrap)', () => expect(jingTypeFromIndicator('bai')).toBe('zhong'));
});

describe('isJing', () => {
  it('4m is jing when jingType is 4m', () => expect(isJing('4m', '4m')).toBe(true));
  it('3m is not jing when jingType is 4m', () => expect(isJing('3m', '4m')).toBe(false));
  it('east is jing when jingType is east', () => expect(isJing('east', 'east')).toBe(true));
});

describe('separateJing', () => {
  it('separates jing from naturals', () => {
    const hand: TileType[] = ['1m', '4m', '4m', '5m', '4m'];
    const { naturals, jingCount } = separateJing(hand, '4m');
    expect(jingCount).toBe(3);
    expect(naturals).toEqual(['1m', '5m']);
  });

  it('returns all naturals when no jings in hand', () => {
    const hand: TileType[] = ['1m', '2m', '3m'];
    const { naturals, jingCount } = separateJing(hand, '9s');
    expect(jingCount).toBe(0);
    expect(naturals).toEqual(['1m', '2m', '3m']);
  });

  it('all tiles are jing', () => {
    const hand: TileType[] = ['east', 'east', 'east', 'east'];
    const { naturals, jingCount } = separateJing(hand, 'east');
    expect(jingCount).toBe(4);
    expect(naturals).toHaveLength(0);
  });
});
