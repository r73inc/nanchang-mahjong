/**
 * Fan (番) calculation and payment for Nanchang Mahjong.
 *
 * Fan system (additive):
 *   Each qualifying pattern contributes its fan count to the total.
 *   Minimum: 1 fan (hands that calculate to 0 pay at 1-fan rate).
 *
 * Payment: units = 2^(fan−1), capped at 64 (for 6+ fan).
 */
import { isHonor, isTerminalOrHonor, isSuit, getSuit, WINDS, DRAGONS } from './tiles';
import type { FanItem, FanResult, Meld, Payment, ScoringContext, TileType, WinType } from './types';

// ── Fan catalogue ─────────────────────────────────────────────────────────────

function fan(name: string, nameZh: string, f: number): FanItem {
  return { name, nameZh, fan: f };
}

/**
 * Compute all applicable fans for a winning hand.
 */
export function calculateFan(ctx: ScoringContext): FanResult {
  const { winType, isLastTile, isAfterKong, isRobKong, decomposition, openMelds } = ctx;
  const { pair, melds, jingsUsed } = decomposition;

  const items: FanItem[] = [];

  // All melds in the hand (including open melds from the game state)
  const allMelds: Meld[] = [...openMelds, ...melds];

  // ── Situational fans ────────────────────────────────────────────────────────

  if (winType === 'tsumo') {
    items.push(fan('Tsumo', '自摸', 1));
  } else {
    // Fully concealed off discard: all melds must be concealed
    const isConcealed = openMelds.length === 0;
    if (isConcealed) items.push(fan('Concealed Ron', '门清', 1));
  }

  if (isLastTile) items.push(fan('Last Tile', '海底捞月', 1));
  if (isAfterKong) items.push(fan('After Kong', '杠上花', 1));
  if (isRobKong) items.push(fan('Rob Kong', '抢杠', 1));

  // ── Jing fans ───────────────────────────────────────────────────────────────

  if (jingsUsed === 0) {
    items.push(fan('Clean Win', '净胡', 1));
  }

  // Concealed kongs count
  const concealedKongs = allMelds.filter((m) => m.kind === 'kong' && m.concealed).length;
  for (let i = 0; i < concealedKongs; i++) {
    items.push(fan('Concealed Kong', '暗杠', 1));
  }

  // Four Jing kongs (special)
  // (Jing-kong detection: a kong where all 4 are jing — marked by engine separately)

  // ── Hand composition fans ───────────────────────────────────────────────────

  const isAllPungs = allMelds.every((m) => m.kind === 'pung' || m.kind === 'kong');
  if (isAllPungs) items.push(fan('All Pungs', '对对胡', 2));

  // No terminals or honors (断幺)
  const pairIsSimple = !isTerminalOrHonor(pair);
  const meldsAreSimple = allMelds.every((m) => m.tiles.every((t) => !isTerminalOrHonor(t)));
  if (pairIsSimple && meldsAreSimple) {
    items.push(fan('All Simples', '断幺', 1));
  }

  // All terminals or honors in every meld (全带幺)
  const allToh =
    allMelds.every((m) => m.tiles.some((t) => isTerminalOrHonor(t))) && isTerminalOrHonor(pair);
  if (allToh) items.push(fan('All Terminals/Honors', '全带幺', 4));

  // Flush checks
  const suitTiles = [
    ...allMelds.flatMap((m) => m.tiles).filter(isSuit),
    ...(isSuit(pair) ? [pair] : []),
  ];
  const honorTiles = [
    ...allMelds.flatMap((m) => m.tiles).filter(isHonor),
    ...(isHonor(pair) ? [pair] : []),
  ];

  if (suitTiles.length > 0) {
    const suits = new Set(suitTiles.map((t) => getSuit(t)));
    if (suits.size === 1) {
      if (honorTiles.length === 0) {
        items.push(fan('Full Flush', '清一色', 4));
      } else {
        items.push(fan('Half Flush', '混一色', 2));
      }
    }
  }

  // Dragons (三元刻): all 3 dragon types as pungs/kongs
  const dragonPungs = new Set(
    allMelds
      .filter((m) => m.kind === 'pung' || m.kind === 'kong')
      .map((m) => m.tiles[0])
      .filter((t) => DRAGONS.includes(t as TileType)),
  );
  if (dragonPungs.size === 3) items.push(fan('Three Dragons', '三元刻', 5));

  // Wind pungs
  const windPungs = new Set(
    allMelds
      .filter((m) => m.kind === 'pung' || m.kind === 'kong')
      .map((m) => m.tiles[0])
      .filter((t) => WINDS.includes(t as TileType)),
  );
  const pairIsWind = WINDS.includes(pair as TileType);

  if (windPungs.size === 4) {
    items.push(fan('Big Four Winds', '大四喜', 8));
  } else if (windPungs.size === 3 && pairIsWind) {
    items.push(fan('Small Four Winds', '小四喜', 4));
  }

  // ── Total ───────────────────────────────────────────────────────────────────

  const total = Math.max(
    1,
    items.reduce((sum, i) => sum + i.fan, 0),
  );
  return { items, total };
}

/**
 * Calculate the seven-pairs fan result.
 */
export function calculateSevenPairsFan(
  ctx: Omit<ScoringContext, 'decomposition'> & {
    jingsUsed: number;
    hasLongPair: boolean; // one of the pairs is 4-of-a-kind (龙七对)
  },
): FanResult {
  const { winType, isLastTile, isAfterKong, isRobKong, jingsUsed, hasLongPair } = ctx;
  const items: FanItem[] = [];

  if (winType === 'tsumo') items.push(fan('Tsumo', '自摸', 1));
  if (isLastTile) items.push(fan('Last Tile', '海底捞月', 1));
  if (isAfterKong) items.push(fan('After Kong', '杠上花', 1));
  if (isRobKong) items.push(fan('Rob Kong', '抢杠', 1));
  if (jingsUsed === 0) items.push(fan('Clean Win', '净胡', 1));

  if (hasLongPair) {
    items.push(fan('Dragon Seven Pairs', '龙七对', 3));
  } else {
    items.push(fan('Seven Pairs', '七对子', 2));
  }

  const total = Math.max(
    1,
    items.reduce((sum, i) => sum + i.fan, 0),
  );
  return { items, total };
}

// ── Payment ───────────────────────────────────────────────────────────────────

/**
 * Calculate payment amounts given a fan total and win type.
 *
 * Units formula: 2^(fan − 1), capped at 64 (fan 6+).
 *
 * Ron: discarder pays `unitsPerPayer`; others pay 0.
 *     totalReceived = unitsPerPayer.
 * Tsumo: each of 3 losers pays `unitsPerPayer`.
 *     totalReceived = unitsPerPayer × 3.
 */
export function calculatePayment(fan: number, winType: WinType): Payment {
  const clampedFan = Math.min(fan, 6);
  const unitsPerPayer = Math.floor(Math.pow(2, clampedFan - 1));

  const totalReceived = winType === 'tsumo' ? unitsPerPayer * 3 : unitsPerPayer;
  return { unitsPerPayer, totalReceived };
}
