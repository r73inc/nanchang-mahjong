/**
 * Dice — pure, PRNG-injected dice rolls.
 *
 * Every dice moment in the game (wall selection, deal start, jing reveal)
 * MUST go through rollDice() with a seeded PRNG and emit a `dice_roll`
 * GameEvent carrying the individual die faces. No inline Math.random rolls.
 *
 * Each roll uses its own PRNG stream derived from the hand seed XOR a
 * purpose-specific salt, so every roll is independently reproducible from
 * the seed alone (replayHand re-derives the full physical setup with no
 * extra stored state).
 */

/** The purpose of a dice roll — one salt + one GameEvent per purpose. */
export type DicePurpose = 'wall_selection' | 'deal_start' | 'jing_reveal';

/**
 * Per-purpose seed salts (ASCII mnemonics: 'WALL', 'DEAL', 'JING').
 * XORed with the hand seed to derive an independent PRNG stream per roll.
 */
export const DICE_SALT: Record<DicePurpose, number> = {
  wall_selection: 0x57414c4c, // 'WALL'
  deal_start: 0x4445414c, // 'DEAL'
  jing_reveal: 0x4a494e47, // 'JING'
};

/**
 * Roll `count` six-sided dice using the supplied PRNG.
 * Returns the individual die faces (each 1–6), never just the sum.
 */
export function rollDice(rand: () => number, count = 2): number[] {
  const dice: number[] = [];
  for (let i = 0; i < count; i++) {
    dice.push(1 + Math.floor(rand() * 6));
  }
  return dice;
}

/** Sum of an array of die faces. */
export function diceSum(dice: readonly number[]): number {
  return dice.reduce((a, b) => a + b, 0);
}
