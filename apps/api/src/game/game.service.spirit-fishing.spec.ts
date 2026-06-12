/**
 * Spirit Fishing (精钓 / Dan Diao Jiang 单吊将) detection unit tests.
 *
 * The service detects Spirit Fishing by calling decomposeHand() on the 14-tile
 * winning hand and checking whether any decomposition uses the tsumo tile as the
 * pair.  These tests validate that logic in isolation, covering:
 *
 *  SpiritFishing·concealed-pair-with-jing   — fully concealed Dan Diao Jiang + Jing → detected
 *  SpiritFishing·concealed-pair-no-jing     — same structure, no Jing tile → NOT detected
 *  SpiritFishing·open-melds-still-works     — 4 open melds (original case) still detected
 *  SpiritFishing·tsumo-as-meld-not-pair     — tsumo tile completes a pung, not pair → NOT detected
 */

import { decomposeHand } from '@nanchang/engine';
import type { TileType } from '@nanchang/engine';

// ── Helper that mirrors the service's isSpiritFishing detection ───────────────

function detectSpiritFishing(
  winHand14: TileType[],
  tsumoTile: TileType,
  jingTypes: TileType[],
): boolean {
  const hasJing = winHand14.some((t) => jingTypes.includes(t));
  if (!hasJing) return false;
  const decomps = decomposeHand(winHand14, jingTypes);
  return decomps.some((d) => d.pair === tsumoTile);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SpiritFishing·detection', () => {
  // jingPrimary = 'zhong', jingSecondary = 'fa'
  const jingTypes: TileType[] = ['zhong', 'fa'];

  it('SpiritFishing·concealed-pair-with-jing — fully concealed Dan Diao Jiang + Jing detected', () => {
    // Hand structure (all concealed, no open melds):
    //   [1s 2s 3s][4s 5s 6s][7s 8s 9s][1p 2p 3p]  four chows (natural)
    //   [zhong 5m]                                  half-Jing pair (zhong=Jing acts as 5m)
    // tsumoTile = '5m' — the drawn tile that completed the pair
    const tsumoTile: TileType = '5m';
    const winHand14: TileType[] = [
      '1s',
      '2s',
      '3s',
      '4s',
      '5s',
      '6s',
      '7s',
      '8s',
      '9s',
      '1p',
      '2p',
      '3p',
      'zhong',
      '5m',
    ];

    expect(detectSpiritFishing(winHand14, tsumoTile, jingTypes)).toBe(true);
  });

  it('SpiritFishing·concealed-pair-no-jing — same structure without Jing is NOT Spirit Fishing', () => {
    // Identical to above but '9m' replaces 'zhong' — no Jing tile in hand.
    // The pair [5m 5m] is now a natural pair — but hasJing = false → not Spirit Fishing.
    const tsumoTile: TileType = '5m';
    const winHand14: TileType[] = [
      '1s',
      '2s',
      '3s',
      '4s',
      '5s',
      '6s',
      '7s',
      '8s',
      '9s',
      '1p',
      '2p',
      '3p',
      '5m',
      '5m',
    ];

    expect(detectSpiritFishing(winHand14, tsumoTile, jingTypes)).toBe(false);
  });

  it('SpiritFishing·open-melds-still-works — 4 open melds + lone concealed + Jing still detected', () => {
    // Simulates the classic 4-open-meld scenario.
    // Normalized open melds (3 tiles each): [1m 1m 1m][2m 2m 2m][3m 3m 3m][zhong 4m 4m]
    //   (zhong=Jing acts as the 3rd 4m in the last pung)
    // Concealed: [5p] lone tile.  tsumoTile = '5p' (draws 5p, completes pair [5p 5p]).
    const tsumoTile: TileType = '5p';
    const winHand14: TileType[] = [
      '1m',
      '1m',
      '1m',
      '2m',
      '2m',
      '2m',
      '3m',
      '3m',
      '3m',
      'zhong',
      '4m',
      '4m',
      '5p',
      '5p',
    ];

    expect(detectSpiritFishing(winHand14, tsumoTile, jingTypes)).toBe(true);
  });

  it('SpiritFishing·tsumo-as-meld-not-pair — tsumo tile completes a pung (not the pair) → NOT detected', () => {
    // Hand: [1m 2m 3m][4m 5m 6m][7m 8m 9m][fa fa fa] (fa=jingSecondary, pung)
    //       pair = [1p 1p]
    // tsumoTile = 'fa' — the drawn tile completes the fa pung, NOT the pair.
    // decomps.some(d => d.pair === 'fa') should be false (pair is '1p', not 'fa').
    const tsumoTile: TileType = 'fa';
    const winHand14: TileType[] = [
      '1m',
      '2m',
      '3m',
      '4m',
      '5m',
      '6m',
      '7m',
      '8m',
      '9m',
      'fa',
      'fa',
      'fa',
      '1p',
      '1p',
    ];

    // 'fa' is jingSecondary → hasJing = true, but tsumoTile is not the pair ('1p' is)
    expect(detectSpiritFishing(winHand14, tsumoTile, jingTypes)).toBe(false);
  });
});
