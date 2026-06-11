/**
 * Wall — the physical ring-of-stacks wall model (BUG-037).
 *
 * Real-world setup this models:
 *   - The 136 tiles are divided into 4 walls, one in front of each seat.
 *   - Each wall is 17 stacks of 2 tiles (top + bottom), indexed left→right
 *     from the owning player's perspective.
 *   - Two dice rolls select where dealing begins: roll #1 (by the dealer)
 *     counts seats counter-clockwise inclusively from the dealer to select a
 *     wall; roll #2 (by the selected player) counts stacks inclusively from
 *     the LEFT of that player's wall to select the starting stack.
 *   - Taking proceeds stack by stack in increasing stack order; after a
 *     wall's 17th stack, taking continues on the next seat's wall (seat+1,
 *     counter-clockwise play order). Live drawing continues from exactly
 *     where the deal stopped.
 *   - Kong replacement draws come from the BACK of the wall — the last tile
 *     of the ring in draw order (the tail behind the deal-start stack).
 *   - The hand is wall-exhausted when the front and back draws meet
 *     (no reserved dead wall — every tile is drawable).
 *
 * Conventions (defined once, tested in wall.test.ts):
 *   - Physical layout: `layout[2g]` = top tile of global stack g,
 *     `layout[2g + 1]` = bottom tile, where g = seat * 17 + stackIdx.
 *   - Normal draws take top then bottom of each stack (drawOrder lists
 *     top before bottom).
 *   - Kong replacement draws take the current LAST tile of the wall in draw
 *     order (bottom of the back-most stack first), i.e. drawOrder[135 - k].
 */

import type { TileId, WallState } from './types';

export type { WallState };

export const WALL_COUNT = 4;
export const STACKS_PER_WALL = 17;
export const TOTAL_STACKS = WALL_COUNT * STACKS_PER_WALL; // 68
export const TOTAL_TILES = TOTAL_STACKS * 2; // 136

/** Global stack index (0–67) for a seat's stack. */
export function globalStackIndex(seat: 0 | 1 | 2 | 3, stackIdx: number): number {
  return seat * STACKS_PER_WALL + stackIdx;
}

/** The global stack index where dealing began. */
export function startGlobalStack(wall: WallState): number {
  return globalStackIndex(wall.dealStartSeat, wall.dealStartStack);
}

/**
 * Build the wall state from the shuffled physical layout and both dice rolls.
 *
 * @param layout - The 136 shuffled tiles laid into the ring:
 *   layout[2g] = top of global stack g, layout[2g+1] = bottom.
 * @param wallSelectionDice - Roll #1: sum counts seats CCW inclusively from
 *   the dealer (dealer = 1) to select whose wall dealing starts from.
 * @param dealStartDice - Roll #2: sum counts stacks inclusively from the left
 *   of the selected wall (1-based) to select the starting stack.
 * @param dealerSeat - The dealer for this hand.
 */
export function buildWallState(
  layout: readonly TileId[],
  wallSelectionDice: [number, number],
  dealStartDice: [number, number],
  dealerSeat: 0 | 1 | 2 | 3,
): WallState {
  if (layout.length !== TOTAL_TILES) {
    throw new Error(`Wall layout must have ${TOTAL_TILES} tiles, got ${layout.length}`);
  }

  // Roll #1: inclusive CCW count from the dealer (dealer = 1).
  const sum1 = wallSelectionDice[0] + wallSelectionDice[1];
  const dealStartSeat = ((dealerSeat + sum1 - 1) % 4) as 0 | 1 | 2 | 3;

  // Roll #2: inclusive count from the left of the selected wall (1-based).
  // Max two-dice sum is 12 ≤ 17 stacks, so the index never overflows.
  const sum2 = dealStartDice[0] + dealStartDice[1];
  const dealStartStack = sum2 - 1;

  const start = globalStackIndex(dealStartSeat, dealStartStack);
  const drawOrder: TileId[] = new Array<TileId>(TOTAL_TILES);
  for (let i = 0; i < TOTAL_TILES; i++) {
    const stack = (start + (i >> 1)) % TOTAL_STACKS;
    drawOrder[i] = layout[stack * 2 + (i & 1)];
  }

  return {
    drawOrder,
    wallSelectionDice,
    dealStartDice,
    dealStartSeat,
    dealStartStack,
    drawPtr: 0,
    kongDraws: 0,
    jingDice: null,
    jingStackGlobal: null,
  };
}

/** Tiles still available to draw (front + back combined). */
export function tilesRemaining(wall: WallState): number {
  return TOTAL_TILES - wall.drawPtr - wall.kongDraws;
}

/** Draw the next tile from the front of the wall (normal draw). */
export function drawFront(wall: WallState): { tile: TileId; wall: WallState } {
  if (tilesRemaining(wall) === 0) throw new Error('Wall exhausted');
  return {
    tile: wall.drawOrder[wall.drawPtr],
    wall: { ...wall, drawPtr: wall.drawPtr + 1 },
  };
}

/** Draw the next tile from the back of the wall (kong replacement). */
export function drawBack(wall: WallState): { tile: TileId; wall: WallState } {
  if (tilesRemaining(wall) === 0) throw new Error('Wall exhausted');
  return {
    tile: wall.drawOrder[TOTAL_TILES - 1 - wall.kongDraws],
    wall: { ...wall, kongDraws: wall.kongDraws + 1 },
  };
}

/**
 * Resolve the jing/settlement stack from the jing dice.
 *
 * The dice sum counts stacks backwards from the BACK of the wall, inclusive
 * (sum 1 = the back-most stack). In draw-order terms the back-most stack
 * occupies indices 134/135, so a sum of n resolves to top index 136 − 2n.
 */
export function resolveJingStack(
  wall: WallState,
  dice: [number, number],
): { stackGlobal: number; topIdx: number; bottomIdx: number } {
  const n = dice[0] + dice[1];
  const topIdx = TOTAL_TILES - 2 * n;
  const stackGlobal = (startGlobalStack(wall) + TOTAL_STACKS - n) % TOTAL_STACKS;
  return { stackGlobal, topIdx, bottomIdx: topIdx + 1 };
}

/**
 * Swap the top and bottom tiles of a stack in place (ruleTopBottomJing:
 * the flipped settlement tile is swapped with the tile below it; both stay
 * in the wall and are drawn normally when the draw reaches them).
 */
export function swapStackTiles(wall: WallState, topIdx: number): WallState {
  const drawOrder = [...wall.drawOrder];
  [drawOrder[topIdx], drawOrder[topIdx + 1]] = [drawOrder[topIdx + 1], drawOrder[topIdx]];
  return { ...wall, drawOrder };
}
