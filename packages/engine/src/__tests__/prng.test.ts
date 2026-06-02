import { describe, it, expect } from 'vitest';
import { mulberry32, seededShuffle } from '../prng';

describe('mulberry32', () => {
  it('produces deterministic values from the same seed', () => {
    const r1 = mulberry32(42);
    const r2 = mulberry32(42);
    const vals1 = Array.from({ length: 10 }, () => r1());
    const vals2 = Array.from({ length: 10 }, () => r2());
    expect(vals1).toEqual(vals2);
  });

  it('produces different values from different seeds', () => {
    const r1 = mulberry32(1);
    const r2 = mulberry32(2);
    expect(r1()).not.toBe(r2());
  });

  it('produces values in [0, 1)', () => {
    const rand = mulberry32(12345);
    for (let i = 0; i < 1000; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('sequence is never identical for a long run (no short cycle)', () => {
    const rand = mulberry32(99999);
    const vals = new Set(Array.from({ length: 100 }, () => rand()));
    // With 100 uniform [0,1) values there should be no repeats
    expect(vals.size).toBe(100);
  });
});

describe('seededShuffle', () => {
  it('returns the same permutation for the same seed', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const s1 = seededShuffle(arr, 42);
    const s2 = seededShuffle(arr, 42);
    expect(s1).toEqual(s2);
  });

  it('returns a different permutation for a different seed', () => {
    const arr = Array.from({ length: 20 }, (_, i) => i);
    const s1 = seededShuffle(arr, 1);
    const s2 = seededShuffle(arr, 2);
    expect(s1).not.toEqual(s2);
  });

  it('preserves all elements (bijection)', () => {
    const arr = [10, 20, 30, 40, 50];
    const shuffled = seededShuffle(arr, 7);
    expect(shuffled.slice().sort((a, b) => a - b)).toEqual([10, 20, 30, 40, 50]);
  });

  it('does not mutate the original array', () => {
    const arr = [1, 2, 3, 4, 5];
    const copy = [...arr];
    seededShuffle(arr, 42);
    expect(arr).toEqual(copy);
  });

  it('shuffles 136 tile IDs correctly (no duplicates)', () => {
    const wall = Array.from({ length: 136 }, (_, i) => i);
    const shuffled = seededShuffle(wall, 12345);
    expect(shuffled).toHaveLength(136);
    expect(new Set(shuffled).size).toBe(136);
  });

  it('Engine·deal-determinism: same seed → same hands', () => {
    const wall = Array.from({ length: 136 }, (_, i) => i);
    const a = seededShuffle(wall, 777);
    const b = seededShuffle(wall, 777);
    expect(a).toEqual(b);
  });
});
