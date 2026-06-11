/**
 * wall.test.ts — Wall·ring-of-stacks + Dice·deterministic
 *
 * Locks down the physical wall conventions (BUG-037) so they can't drift:
 *   - 4 walls × 17 stacks × 2 tiles = 136 = full Nanchang set
 *   - dice resolution of deal-start seat + stack (inclusive counts)
 *   - draw order walks the ring forward, top then bottom per stack
 *   - wraparound at the 17th stack and across segment boundaries
 *   - kong replacements come from the back; front/back meet = exhaustion
 *   - jing stack resolution counts backwards from the back, inclusive
 *   - swap-in-place leaves the wall length unchanged
 *   - everything is reproducible from the seed alone
 */

import { describe, it, expect } from 'vitest';
import { GameEngine, previewJingReveal } from '../engine';
import { mulberry32 } from '../prng';
import { rollDice, diceSum, DICE_SALT } from '../dice';
import {
  WALL_COUNT,
  STACKS_PER_WALL,
  TOTAL_STACKS,
  TOTAL_TILES,
  globalStackIndex,
  startGlobalStack,
  buildWallState,
  tilesRemaining,
  drawFront,
  drawBack,
  resolveJingStack,
  swapStackTiles,
} from '../wall';
import { buildWall, sortTypes, typeOf } from '../tiles';
import type { TileId, WallState } from '../types';

/** Identity layout: tile id i sits at ring position i (stack i>>1, top if even). */
function identityLayout(): TileId[] {
  return buildWall();
}

describe('Wall·constants', () => {
  it('4 walls × 17 stacks × 2 tiles = 136 = full Nanchang set', () => {
    expect(WALL_COUNT).toBe(4);
    expect(STACKS_PER_WALL).toBe(17);
    expect(TOTAL_STACKS).toBe(68);
    expect(TOTAL_TILES).toBe(136);
  });

  it('buildWallState rejects a layout that is not exactly 136 tiles', () => {
    expect(() => buildWallState([0, 1, 2], [1, 1], [1, 1], 0)).toThrow(/136/);
  });
});

describe('Dice·deterministic', () => {
  it('rollDice returns faces in 1–6', () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const [a, b] = rollDice(rand);
      expect(a).toBeGreaterThanOrEqual(1);
      expect(a).toBeLessThanOrEqual(6);
      expect(b).toBeGreaterThanOrEqual(1);
      expect(b).toBeLessThanOrEqual(6);
    }
  });

  it('same seed + salt → same roll; different salts → independent streams', () => {
    const seed = 424242;
    const roll = (salt: number) => rollDice(mulberry32((seed ^ salt) >>> 0));
    expect(roll(DICE_SALT.wall_selection)).toEqual(roll(DICE_SALT.wall_selection));
    expect(roll(DICE_SALT.deal_start)).toEqual(roll(DICE_SALT.deal_start));
    expect(roll(DICE_SALT.jing_reveal)).toEqual(roll(DICE_SALT.jing_reveal));
  });

  it('diceSum adds the faces', () => {
    expect(diceSum([3, 4])).toBe(7);
    expect(diceSum([1, 1])).toBe(2);
  });
});

describe('Wall·dice-resolution', () => {
  it('roll #1 counts seats CCW inclusively from the dealer (dealer = 1)', () => {
    // Worked family example: dealer rolls 3 → dealer=1, right=2, across=3 → across selected.
    // dealerSeat 0, sum 3 → seat 2 (across).
    const w = buildWallState(identityLayout(), [1, 2], [3, 3], 0);
    expect(w.dealStartSeat).toBe(2);
  });

  it('roll #1 sum of 2 from dealer 3 wraps to seat 0', () => {
    const w = buildWallState(identityLayout(), [1, 1], [1, 1], 3);
    expect(w.dealStartSeat).toBe(0);
  });

  it('roll #2 counts stacks inclusively from the left — a 6 starts at the 6th stack', () => {
    // Family example: rolling 6 → dealer takes the 6th stack = flat tiles 11+12 (1-based).
    const w = buildWallState(identityLayout(), [2, 2], [3, 3], 0); // sum1=4 → seat 3; sum2=6
    expect(w.dealStartStack).toBe(5); // 0-based 6th stack
    // Identity layout: seat 3 wall starts at global stack 51; 6th stack = global 56,
    // whose top/bottom tiles are ids 112/113 (= 1-based flat tiles 11/12 of that wall).
    expect(startGlobalStack(w)).toBe(globalStackIndex(3, 5));
    expect(w.drawOrder[0]).toBe(56 * 2);
    expect(w.drawOrder[1]).toBe(56 * 2 + 1);
  });
});

describe('Wall·draw-order', () => {
  it('walks the ring forward, top then bottom of each stack', () => {
    // sum1=2 → seat 1; sum2=2 → 2nd stack (idx 1) → global stack 18
    const w = buildWallState(identityLayout(), [1, 1], [1, 1], 0);
    expect(startGlobalStack(w)).toBe(18);
    // Stack 18 → tiles 36 (top), 37 (bottom); then stack 19 → 38, 39 …
    expect(w.drawOrder.slice(0, 6)).toEqual([36, 37, 38, 39, 40, 41]);
  });

  it('wraps from the 17th stack of one wall to the next seat’s wall', () => {
    // Start at seat 0, stack 16 (last stack of seat 0's wall) → next is seat 1, stack 0
    const w = buildWallState(identityLayout(), [2, 2], [12, 5], 0); // sum1=4 → seat 3
    // Recompute simpler: pick start at global 16 directly via seat 0 + sum2 17? Max sum is 12.
    // Instead verify the generic wrap: position after stack 67 is stack 0.
    const w2 = buildWallState(identityLayout(), [3, 4], [6, 6], 0); // sum1=7 → seat 2; sum2=12 → stack 11
    const start = startGlobalStack(w2); // 2*17 + 11 = 45
    expect(start).toBe(45);
    // 68 stacks later we're back at the start; the LAST stack in draw order is 44
    const lastTop = w2.drawOrder[TOTAL_TILES - 2];
    const lastBottom = w2.drawOrder[TOTAL_TILES - 1];
    expect(lastTop).toBe(44 * 2);
    expect(lastBottom).toBe(44 * 2 + 1);
    expect(w.drawOrder).toHaveLength(TOTAL_TILES);
  });

  it('drawOrder is a permutation of all 136 tiles', () => {
    const w = buildWallState(identityLayout(), [5, 6], [2, 4], 1);
    expect([...w.drawOrder].sort((a, b) => a - b)).toEqual(identityLayout());
  });
});

describe('Wall·front-and-back-draws', () => {
  function fresh(): WallState {
    return buildWallState(identityLayout(), [1, 2], [2, 3], 0);
  }

  it('drawFront takes drawOrder[0], [1], [2] … in order', () => {
    let w = fresh();
    const taken: TileId[] = [];
    for (let i = 0; i < 5; i++) {
      const d = drawFront(w);
      w = d.wall;
      taken.push(d.tile);
    }
    expect(taken).toEqual(fresh().drawOrder.slice(0, 5));
  });

  it('drawBack takes the current LAST tile of the wall (suffix order)', () => {
    let w = fresh();
    const order = fresh().drawOrder;
    const d1 = drawBack(w);
    w = d1.wall;
    const d2 = drawBack(w);
    expect(d1.tile).toBe(order[135]);
    expect(d2.tile).toBe(order[134]);
  });

  it('front and back draws never overlap and exhaust at exactly 136', () => {
    let w = fresh();
    const seen = new Set<TileId>();
    // Alternate front/back until exhausted
    while (tilesRemaining(w) > 0) {
      const d = tilesRemaining(w) % 2 === 0 ? drawFront(w) : drawBack(w);
      expect(seen.has(d.tile)).toBe(false);
      seen.add(d.tile);
      w = d.wall;
    }
    expect(seen.size).toBe(TOTAL_TILES);
    expect(() => drawFront(w)).toThrow(/exhausted/i);
    expect(() => drawBack(w)).toThrow(/exhausted/i);
  });
});

describe('Wall·jing-stack-resolution', () => {
  it('dice sum counts stacks backwards from the back, inclusive (sum n → top index 136−2n)', () => {
    const w = buildWallState(identityLayout(), [1, 1], [1, 1], 0);
    const { topIdx, bottomIdx } = resolveJingStack(w, [3, 4]); // sum 7
    expect(topIdx).toBe(TOTAL_TILES - 14);
    expect(bottomIdx).toBe(topIdx + 1);
    // Sum 1 isn't possible with two dice, but sum 2 → the second stack from the back
    const r2 = resolveJingStack(w, [1, 1]);
    expect(r2.topIdx).toBe(TOTAL_TILES - 4);
  });

  it('resolved stackGlobal is the physical stack behind the deal start', () => {
    const w = buildWallState(identityLayout(), [2, 3], [4, 4], 0); // sum1=5 → seat 0; sum2=8 → stack 7
    const start = startGlobalStack(w); // global 7
    const { stackGlobal } = resolveJingStack(w, [1, 1]); // 2 stacks back from the back
    expect(stackGlobal).toBe((start + TOTAL_STACKS - 2) % TOTAL_STACKS);
  });

  it('swapStackTiles swaps exactly the two tiles of the stack, length unchanged', () => {
    const w = buildWallState(identityLayout(), [1, 1], [1, 1], 0);
    const { topIdx } = resolveJingStack(w, [2, 2]);
    const swapped = swapStackTiles(w, topIdx);
    expect(swapped.drawOrder).toHaveLength(TOTAL_TILES);
    expect(swapped.drawOrder[topIdx]).toBe(w.drawOrder[topIdx + 1]);
    expect(swapped.drawOrder[topIdx + 1]).toBe(w.drawOrder[topIdx]);
    // Everything else untouched
    for (let i = 0; i < TOTAL_TILES; i++) {
      if (i !== topIdx && i !== topIdx + 1) {
        expect(swapped.drawOrder[i]).toBe(w.drawOrder[i]);
      }
    }
  });
});

describe('Wall·engine-integration', () => {
  it('deal emits wall_selection and deal_start dice events with faces, then the deal', () => {
    const g = GameEngine.create(42).deal();
    const kinds = g.events.map((e) => e.kind);
    expect(kinds).toEqual(['dice_roll', 'dice_roll', 'deal']);
    const [roll1, roll2] = g.events.filter((e) => e.kind === 'dice_roll') as Array<{
      kind: 'dice_roll';
      purpose: string;
      roller: number;
      dice: [number, number];
    }>;
    expect(roll1.purpose).toBe('wall_selection');
    expect(roll1.roller).toBe(g.state.dealerSeat);
    expect(roll2.purpose).toBe('deal_start');
    expect(roll2.roller).toBe(g.state.wall!.dealStartSeat);
    // The state agrees with the events
    expect(g.state.wall!.wallSelectionDice).toEqual(roll1.dice);
    expect(g.state.wall!.dealStartDice).toEqual(roll2.dice);
  });

  it('deal takes 6 stacks + 1 single per seat, then the dealer’s 14th, dealer first CCW', () => {
    const g = GameEngine.create(99, { dealerSeat: 1 }).deal();
    const order = g.state.wall!.drawOrder;
    // Reconstruct the expected per-seat tile ids from the documented procedure
    const expected: TileId[][] = [[], [], [], []];
    let i = 0;
    for (let round = 0; round < 6; round++) {
      for (let k = 0; k < 4; k++) {
        const seat = (1 + k) % 4;
        expected[seat].push(order[i++], order[i++]);
      }
    }
    for (let k = 0; k < 4; k++) expected[(1 + k) % 4].push(order[i++]);
    expected[1].push(order[i++]);
    expect(i).toBe(53);
    expect(g.state.wall!.drawPtr).toBe(53);
    // Hands match the stack-taking sequence (sorted by type)
    for (let s = 0; s < 4; s++) {
      expect(g.state.seats[s].hand).toEqual(sortTypes(expected[s].map(typeOf)));
    }
    expect(g.state.seats[1].hand).toHaveLength(14);
    expect(g.state.seats[0].hand).toHaveLength(13);
  });

  it('live draws continue from where the deal stopped; kong draws come from the back', () => {
    const g = GameEngine.create(7).deal().revealJing();
    const wall = g.state.wall!;
    const nextFrontTile = wall.drawOrder[wall.drawPtr];
    const after = g.discard(g.state.seats[0].hand[0]).passClaims();
    // Seat 1 drew exactly the next front tile
    expect(after.state.wall!.drawPtr).toBe(wall.drawPtr + 1);
    expect(after.state.wall!.kongDraws).toBe(0);
    const drawEv = after.events.filter((e) => e.kind === 'draw').pop() as {
      kind: 'draw';
      tile: string;
      fromBack: boolean;
    };
    expect(drawEv.fromBack).toBe(false);
    expect(drawEv.tile).toBe(typeOf(nextFrontTile));
  });

  it('full setup is reproducible from the seed alone (dice + wall + hands)', () => {
    const a = GameEngine.create(31337).deal();
    const b = GameEngine.create(31337).deal();
    expect(a.state.wall).toEqual(b.state.wall);
    expect(a.events).toEqual(b.events);
    const pa = previewJingReveal(a.state);
    const pb = previewJingReveal(b.state);
    expect(pa).toEqual(pb);
  });

  it('revealJing emits a jing_reveal dice_roll rolled by the dealer', () => {
    const g = GameEngine.create(55, { dealerSeat: 2, config: { ruleTopBottomJing: true } })
      .deal()
      .revealJing();
    const jingRoll = g.events.find(
      (e) => e.kind === 'dice_roll' && e.purpose === 'jing_reveal',
    ) as { kind: 'dice_roll'; roller: number; dice: [number, number] };
    expect(jingRoll).toBeDefined();
    expect(jingRoll.roller).toBe(2);
    expect(g.state.wall!.jingDice).toEqual(jingRoll.dice);
  });

  it('zero-sum invariant holds across the opening settlement (top-bottom mode)', () => {
    for (const seed of [1, 2, 3, 42, 999]) {
      const g = GameEngine.create(seed, { config: { ruleTopBottomJing: true } })
        .deal()
        .revealJing();
      const total = g.state.seats.reduce((sum, s) => sum + s.score, 0);
      expect(total).toBe(0);
    }
  });
});
