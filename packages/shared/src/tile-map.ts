/**
 * Tile-ID adapter between engine TileType strings and the design component IDs.
 * Also provides canonical aria-labels in EN and ZH.
 *
 * Usage:
 *   engineToDesignTile('1m')        → 'c1'
 *   designToEngineTile('we')        → 'east'
 *   tileAriaLabel('zhong', 'en')    → 'Red Dragon'
 */

import type { TileType } from '@nanchang/engine';

// ── Mapping tables ────────────────────────────────────────────────────────────

const ENGINE_TO_DESIGN: Record<TileType, string> = {
  // Man / Character (萬)
  '1m': 'c1',
  '2m': 'c2',
  '3m': 'c3',
  '4m': 'c4',
  '5m': 'c5',
  '6m': 'c6',
  '7m': 'c7',
  '8m': 'c8',
  '9m': 'c9',
  // Pin / Dot (筒)
  '1p': 'd1',
  '2p': 'd2',
  '3p': 'd3',
  '4p': 'd4',
  '5p': 'd5',
  '6p': 'd6',
  '7p': 'd7',
  '8p': 'd8',
  '9p': 'd9',
  // Sou / Bamboo (條)
  '1s': 'b1',
  '2s': 'b2',
  '3s': 'b3',
  '4s': 'b4',
  '5s': 'b5',
  '6s': 'b6',
  '7s': 'b7',
  '8s': 'b8',
  '9s': 'b9',
  // Winds
  east: 'we',
  south: 'ws',
  west: 'ww',
  north: 'wn',
  // Dragons
  zhong: 'dr',
  fa: 'dg',
  bai: 'dw',
};

const DESIGN_TO_ENGINE = Object.fromEntries(
  Object.entries(ENGINE_TO_DESIGN).map(([k, v]) => [v, k as TileType]),
) as Record<string, TileType>;

const ARIA_LABELS: Record<TileType, { en: string; zh: string }> = {
  '1m': { en: '1 Character', zh: '1萬' },
  '2m': { en: '2 Character', zh: '2萬' },
  '3m': { en: '3 Character', zh: '3萬' },
  '4m': { en: '4 Character', zh: '4萬' },
  '5m': { en: '5 Character', zh: '5萬' },
  '6m': { en: '6 Character', zh: '6萬' },
  '7m': { en: '7 Character', zh: '7萬' },
  '8m': { en: '8 Character', zh: '8萬' },
  '9m': { en: '9 Character', zh: '9萬' },
  '1p': { en: '1 Dot', zh: '1筒' },
  '2p': { en: '2 Dot', zh: '2筒' },
  '3p': { en: '3 Dot', zh: '3筒' },
  '4p': { en: '4 Dot', zh: '4筒' },
  '5p': { en: '5 Dot', zh: '5筒' },
  '6p': { en: '6 Dot', zh: '6筒' },
  '7p': { en: '7 Dot', zh: '7筒' },
  '8p': { en: '8 Dot', zh: '8筒' },
  '9p': { en: '9 Dot', zh: '9筒' },
  '1s': { en: '1 Bamboo', zh: '1條' },
  '2s': { en: '2 Bamboo', zh: '2條' },
  '3s': { en: '3 Bamboo', zh: '3條' },
  '4s': { en: '4 Bamboo', zh: '4條' },
  '5s': { en: '5 Bamboo', zh: '5條' },
  '6s': { en: '6 Bamboo', zh: '6條' },
  '7s': { en: '7 Bamboo', zh: '7條' },
  '8s': { en: '8 Bamboo', zh: '8條' },
  '9s': { en: '9 Bamboo', zh: '9條' },
  east: { en: 'East Wind', zh: '東風' },
  south: { en: 'South Wind', zh: '南風' },
  west: { en: 'West Wind', zh: '西風' },
  north: { en: 'North Wind', zh: '北風' },
  zhong: { en: 'Red Dragon', zh: '紅中' },
  fa: { en: 'Green Dragon', zh: '發財' },
  bai: { en: 'White Dragon', zh: '白板' },
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Convert an engine TileType to the design component's tile id string.
 * @example engineToDesignTile('1m') → 'c1'
 */
export function engineToDesignTile(t: TileType): string {
  return ENGINE_TO_DESIGN[t];
}

/**
 * Convert a design component tile id back to an engine TileType.
 * Throws if the id is unrecognised.
 * @example designToEngineTile('c1') → '1m'
 */
export function designToEngineTile(id: string): TileType {
  const t = DESIGN_TO_ENGINE[id];
  if (!t) throw new Error(`Unknown design tile id: "${id}"`);
  return t;
}

/**
 * Canonical accessibility label for a tile.
 * Used as `aria-label` on every rendered MahjongTile.
 * @example tileAriaLabel('zhong', 'en') → 'Red Dragon'
 */
export function tileAriaLabel(t: TileType, lang: 'en' | 'zh'): string {
  return ARIA_LABELS[t][lang];
}
