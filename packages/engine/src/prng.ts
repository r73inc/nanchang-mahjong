/**
 * Seeded pseudo-random number generator (mulberry32).
 *
 * mulberry32 is a fast, high-quality 32-bit PRNG with a 32-bit seed.
 * Being deterministic it makes games fully reproducible from the seed alone.
 *
 * Reference: https://gist.github.com/tommyettinger/46a874533244883189143505d203312c
 */

/** Returns a PRNG function seeded with `seed`. Each call returns a float [0, 1). */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let z = Math.imul(s ^ (s >>> 15), 1 | s);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Return a **new** array that is a Fisher-Yates shuffle of `arr` using `seed`.
 * The original array is not mutated.
 */
export function seededShuffle<T>(arr: readonly T[], seed: number): T[] {
  const result = arr.slice();
  const rand = mulberry32(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
