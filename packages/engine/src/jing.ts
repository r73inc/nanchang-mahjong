/**
 * Jing (经) wildcard mechanics.
 *
 * After the deal, the top tile of the dead wall is revealed as the "indicator".
 * The Jing (wildcard) tile is the tile ONE step above the indicator within its
 * category (with wrap-around). All four physical copies of the Jing type are
 * wildcards for this game.
 */
import { stepAbove } from './tiles';
import type { TileId, TileType } from './types';
import { typeOf } from './tiles';

/**
 * Given an indicator tile type, return the Jing (wildcard) tile type.
 *
 * Examples:
 *   indicator 3m → jing 4m
 *   indicator 9m → jing 1m  (wraps within suit)
 *   indicator north → jing east (wraps within winds)
 *   indicator bai → jing zhong (wraps within dragons)
 */
export function jingTypeFromIndicator(indicator: TileType): TileType {
  return stepAbove(indicator, 1);
}

/**
 * Given the indicator tile **ID** (from the dead wall), return the Jing tile type.
 */
export function jingTypeFromIndicatorId(indicatorId: TileId): TileType {
  return jingTypeFromIndicator(typeOf(indicatorId));
}

/**
 * True if `t` is the Jing (wildcard) for the current game.
 */
export function isJing(t: TileType, jingType: TileType): boolean {
  return t === jingType;
}

/**
 * Separate a hand (array of TileTypes) into natural tiles and Jing count.
 */
export function separateJing(
  hand: TileType[],
  jingType: TileType,
): { naturals: TileType[]; jingCount: number } {
  const naturals: TileType[] = [];
  let jingCount = 0;
  for (const t of hand) {
    if (isJing(t, jingType)) jingCount++;
    else naturals.push(t);
  }
  return { naturals, jingCount };
}
