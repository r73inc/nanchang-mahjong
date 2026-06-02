/**
 * Jing (精) wildcard mechanics.
 *
 * After the deal, the top tile of the dead wall is revealed as the "indicator".
 * Primary Spirit (正精): The indicator tile itself. All four physical copies are wildcards.
 * Secondary Spirit (副精): The tile ONE step above the indicator within its
 * category (with wrap-around). All four physical copies are also wildcards.
 */
import { stepAbove } from './tiles';
import type { TileType } from './types';

/**
 * Given an indicator tile type, return the Secondary Spirit (Fu Jing) tile type
 * (the tile one step above the indicator).
 *
 * Examples:
 *   indicator 3m → secondary 4m
 *   indicator 9m → secondary 1m  (wraps within suit)
 *   indicator north → secondary east (wraps within winds)
 *   indicator bai → secondary zhong (wraps within dragons)
 */
export function jingTypeFromIndicator(indicator: TileType): TileType {
  return stepAbove(indicator, 1);
}

/**
 * Given an indicator tile type, return both Jing (wildcard) tile types as a tuple.
 * [0] = Primary Spirit (正精): the indicator tile itself.
 * [1] = Secondary Spirit (副精): one step above the indicator.
 */
export function jingTypesFromIndicator(indicator: TileType): [TileType, TileType] {
  return [indicator, stepAbove(indicator, 1)];
}

/**
 * True if `t` is one of the active Jing (wildcard) types for the current game.
 */
export function isJing(t: TileType, jingTypes: TileType[]): boolean {
  return jingTypes.includes(t);
}

/**
 * Separate a hand (array of TileTypes) into natural tiles and Jing count.
 */
export function separateJing(
  hand: TileType[],
  jingTypes: TileType[],
): { naturals: TileType[]; jingCount: number } {
  const naturals: TileType[] = [];
  let jingCount = 0;
  for (const t of hand) {
    if (isJing(t, jingTypes)) jingCount++;
    else naturals.push(t);
  }
  return { naturals, jingCount };
}
