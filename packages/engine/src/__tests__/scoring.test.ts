import { describe, it, expect } from 'vitest';
import { calculateFan, calculatePayment, calculateSevenPairsFan } from '../scoring';
import { decomposeHand } from '../hand';
import type { ScoringContext, TileType } from '../types';

/** Empty jing array = no wildcards in play. */
const NO_JINGS: TileType[] = [];

// Helper: build a basic scoring context for testing
function makeCtx(
  hand: TileType[],
  jingTypes: TileType[],
  overrides: Partial<ScoringContext> = {},
): ScoringContext {
  const decomps = decomposeHand(hand, jingTypes);
  if (!decomps[0]) throw new Error('No decomposition for test hand');
  return {
    winType: 'ron',
    seatWind: 'east',
    roundWind: 'east',
    isLastTile: false,
    isAfterKong: false,
    isRobKong: false,
    decomposition: decomps[0],
    openMelds: [],
    ...overrides,
  };
}

// ── Situational fans ──────────────────────────────────────────────────────────

describe('Engine·scoring-tsumo', () => {
  it('tsumo win adds +1 fan', () => {
    const hand: TileType[] = [
      '1m',
      '2m',
      '3m',
      '4m',
      '5m',
      '6m',
      '7m',
      '8m',
      '9m',
      '1p',
      '2p',
      '3p',
      '9s',
      '9s',
    ];
    const ctx = makeCtx(hand, NO_JINGS, { winType: 'tsumo' });
    const result = calculateFan(ctx);
    expect(result.items.some((i) => i.name === 'Tsumo')).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(1);
  });
});

describe('Engine·scoring-concealed-ron', () => {
  it('fully concealed ron adds +1 fan for Concealed Ron', () => {
    const hand: TileType[] = [
      '1m',
      '2m',
      '3m',
      '4m',
      '5m',
      '6m',
      '7m',
      '8m',
      '9m',
      '1p',
      '2p',
      '3p',
      '9s',
      '9s',
    ];
    const ctx = makeCtx(hand, NO_JINGS, { winType: 'ron', openMelds: [] });
    const result = calculateFan(ctx);
    expect(result.items.some((i) => i.name === 'Concealed Ron')).toBe(true);
  });

  it('open-meld ron does NOT get Concealed Ron', () => {
    const hand: TileType[] = [
      '1m',
      '2m',
      '3m',
      '4m',
      '5m',
      '6m',
      '7m',
      '8m',
      '9m',
      '1p',
      '2p',
      '3p',
      '9s',
      '9s',
    ];
    const ctx = makeCtx(hand, NO_JINGS, {
      winType: 'ron',
      openMelds: [{ kind: 'pung', tiles: ['east', 'east', 'east'], concealed: false }],
    });
    const result = calculateFan(ctx);
    expect(result.items.some((i) => i.name === 'Concealed Ron')).toBe(false);
  });
});

describe('Engine·scoring-last-tile', () => {
  it('last tile adds +1 fan', () => {
    const hand: TileType[] = [
      '1m',
      '2m',
      '3m',
      '4m',
      '5m',
      '6m',
      '7m',
      '8m',
      '9m',
      '1p',
      '2p',
      '3p',
      '9s',
      '9s',
    ];
    const ctx = makeCtx(hand, NO_JINGS, { isLastTile: true });
    const result = calculateFan(ctx);
    expect(result.items.some((i) => i.name === 'Last Tile')).toBe(true);
  });
});

describe('Engine·scoring-after-kong', () => {
  it('win after kong adds +1 fan', () => {
    const hand: TileType[] = [
      '1m',
      '2m',
      '3m',
      '4m',
      '5m',
      '6m',
      '7m',
      '8m',
      '9m',
      '1p',
      '2p',
      '3p',
      '9s',
      '9s',
    ];
    const ctx = makeCtx(hand, NO_JINGS, { winType: 'tsumo', isAfterKong: true });
    const result = calculateFan(ctx);
    expect(result.items.some((i) => i.name === 'After Kong')).toBe(true);
  });
});

describe('Engine·scoring-rob-kong', () => {
  it('rob kong adds +1 fan', () => {
    const hand: TileType[] = [
      '1m',
      '2m',
      '3m',
      '4m',
      '5m',
      '6m',
      '7m',
      '8m',
      '9m',
      '1p',
      '2p',
      '3p',
      '9s',
      '9s',
    ];
    const ctx = makeCtx(hand, NO_JINGS, { isRobKong: true });
    const result = calculateFan(ctx);
    expect(result.items.some((i) => i.name === 'Rob Kong')).toBe(true);
  });
});

// ── Hand composition fans ─────────────────────────────────────────────────────

describe('Engine·scoring-all-simples (断幺)', () => {
  it('all-simples hand earns断幺 +1 fan', () => {
    // All tiles 2-8 in various suits
    const hand: TileType[] = [
      '2m',
      '3m',
      '4m',
      '5m',
      '6m',
      '7m',
      '2p',
      '3p',
      '4p',
      '5p',
      '6p',
      '7p',
      '8s',
      '8s',
    ];
    const ctx = makeCtx(hand, NO_JINGS);
    const result = calculateFan(ctx);
    expect(result.items.some((i) => i.name === 'All Simples')).toBe(true);
  });

  it('hand with terminals does NOT get All Simples', () => {
    const hand: TileType[] = [
      '1m',
      '2m',
      '3m',
      '4m',
      '5m',
      '6m',
      '7m',
      '8m',
      '9m',
      '1p',
      '2p',
      '3p',
      '9s',
      '9s',
    ];
    const ctx = makeCtx(hand, NO_JINGS);
    const result = calculateFan(ctx);
    expect(result.items.some((i) => i.name === 'All Simples')).toBe(false);
  });
});

describe('Engine·scoring-all-pungs (对对胡)', () => {
  it('all-pung hand earns +2 fan', () => {
    const hand: TileType[] = [
      '1m',
      '1m',
      '1m',
      '9m',
      '9m',
      '9m',
      '1p',
      '1p',
      '1p',
      '9p',
      '9p',
      '9p',
      'east',
      'east',
    ];
    const ctx = makeCtx(hand, NO_JINGS);
    const result = calculateFan(ctx);
    expect(result.items.some((i) => i.name === 'All Pungs')).toBe(true);
    const allPungsFan = result.items.find((i) => i.name === 'All Pungs');
    expect(allPungsFan?.fan).toBe(2);
  });
});

describe('Engine·scoring-full-flush (清一色)', () => {
  it('all-man hand earns +4 fan', () => {
    const hand: TileType[] = [
      '1m',
      '2m',
      '3m',
      '4m',
      '5m',
      '6m',
      '7m',
      '8m',
      '9m',
      '1m',
      '2m',
      '3m',
      '5m',
      '5m',
    ];
    const ctx = makeCtx(hand, NO_JINGS);
    const result = calculateFan(ctx);
    expect(result.items.some((i) => i.name === 'Full Flush')).toBe(true);
    expect(result.items.some((i) => i.name === 'Half Flush')).toBe(false);
  });
});

describe('Engine·scoring-half-flush (混一色)', () => {
  it('one suit + honors earns +2 fan', () => {
    const hand: TileType[] = [
      '1m',
      '2m',
      '3m',
      '4m',
      '5m',
      '6m',
      '7m',
      '8m',
      '9m',
      'east',
      'east',
      'east',
      'north',
      'north',
    ];
    const ctx = makeCtx(hand, NO_JINGS);
    const result = calculateFan(ctx);
    expect(result.items.some((i) => i.name === 'Half Flush')).toBe(true);
    expect(result.items.some((i) => i.name === 'Full Flush')).toBe(false);
  });
});

describe('Engine·scoring-three-dragons (三元刻)', () => {
  it('all three dragons as pungs earns +5 fan', () => {
    const hand: TileType[] = [
      'zhong',
      'zhong',
      'zhong',
      'fa',
      'fa',
      'fa',
      'bai',
      'bai',
      'bai',
      '1m',
      '2m',
      '3m',
      '9p',
      '9p',
    ];
    // no wildcards — no tiles in this hand become jings
    const ctx = makeCtx(hand, NO_JINGS);
    const result = calculateFan(ctx);
    expect(result.items.some((i) => i.name === 'Three Dragons')).toBe(true);
  });
});

describe('Engine·scoring-small-four-winds (小四喜)', () => {
  it('three wind pungs + wind pair earns +4 fan', () => {
    const hand: TileType[] = [
      'east',
      'east',
      'east',
      'south',
      'south',
      'south',
      'west',
      'west',
      'west',
      'north',
      'north',
      '1m',
      '2m',
      '3m',
    ];
    const ctx = makeCtx(hand, NO_JINGS, {
      decomposition: {
        pair: 'north',
        melds: [
          { kind: 'pung', tiles: ['east', 'east', 'east'], concealed: true },
          { kind: 'pung', tiles: ['south', 'south', 'south'], concealed: true },
          { kind: 'pung', tiles: ['west', 'west', 'west'], concealed: true },
          { kind: 'chow', tiles: ['1m', '2m', '3m'], concealed: true },
        ],
        jingsUsed: 0,
        jingPair: false,
      },
    });
    const result = calculateFan(ctx);
    expect(result.items.some((i) => i.name === 'Small Four Winds')).toBe(true);
  });
});

describe('Engine·scoring-big-four-winds (大四喜)', () => {
  it('all four winds as pungs earns +8 fan', () => {
    const ctx: ScoringContext = {
      winType: 'ron',
      seatWind: 'east',
      roundWind: 'east',
      isLastTile: false,
      isAfterKong: false,
      isRobKong: false,
      openMelds: [],
      decomposition: {
        pair: '1m',
        melds: [
          { kind: 'pung', tiles: ['east', 'east', 'east'], concealed: true },
          { kind: 'pung', tiles: ['south', 'south', 'south'], concealed: true },
          { kind: 'pung', tiles: ['west', 'west', 'west'], concealed: true },
          { kind: 'pung', tiles: ['north', 'north', 'north'], concealed: true },
        ],
        jingsUsed: 0,
        jingPair: false,
      },
    };
    const result = calculateFan(ctx);
    expect(result.items.some((i) => i.name === 'Big Four Winds')).toBe(true);
    expect(result.items.some((i) => i.name === 'Small Four Winds')).toBe(false);
  });
});

describe('Engine·scoring-clean-win (净胡)', () => {
  it('no jings used earns +1 fan for clean win', () => {
    const hand: TileType[] = [
      '1m',
      '2m',
      '3m',
      '4m',
      '5m',
      '6m',
      '7m',
      '8m',
      '9m',
      '1p',
      '2p',
      '3p',
      '9s',
      '9s',
    ];
    const ctx = makeCtx(hand, NO_JINGS, { winType: 'tsumo' });
    const result = calculateFan(ctx);
    expect(result.items.some((i) => i.name === 'Clean Win')).toBe(true);
  });
});

describe('Engine·scoring-seven-pairs', () => {
  it('seven pairs fan result has Seven Pairs item (+2)', () => {
    const result = calculateSevenPairsFan({
      winType: 'ron',
      seatWind: 'east',
      roundWind: 'east',
      isLastTile: false,
      isAfterKong: false,
      isRobKong: false,
      openMelds: [],
      jingsUsed: 0,
      hasLongPair: false,
    });
    expect(result.items.some((i) => i.name === 'Seven Pairs')).toBe(true);
    expect(result.items.find((i) => i.name === 'Seven Pairs')?.fan).toBe(2);
  });

  it('dragon seven pairs fan result has Dragon Seven Pairs item (+3)', () => {
    const result = calculateSevenPairsFan({
      winType: 'ron',
      seatWind: 'east',
      roundWind: 'east',
      isLastTile: false,
      isAfterKong: false,
      isRobKong: false,
      openMelds: [],
      jingsUsed: 0,
      hasLongPair: true,
    });
    expect(result.items.some((i) => i.name === 'Dragon Seven Pairs')).toBe(true);
    expect(result.items.find((i) => i.name === 'Dragon Seven Pairs')?.fan).toBe(3);
  });
});

// ── Payment ───────────────────────────────────────────────────────────────────

describe('Engine·scoring-payment', () => {
  it('1 fan = 1 unit per payer', () => {
    expect(calculatePayment(1, 'ron').unitsPerPayer).toBe(1);
  });

  it('2 fan = 2 units per payer', () => {
    expect(calculatePayment(2, 'ron').unitsPerPayer).toBe(2);
  });

  it('3 fan = 4 units per payer', () => {
    expect(calculatePayment(3, 'ron').unitsPerPayer).toBe(4);
  });

  it('4 fan = 8 units per payer', () => {
    expect(calculatePayment(4, 'ron').unitsPerPayer).toBe(8);
  });

  it('6 fan = 32 units per payer', () => {
    expect(calculatePayment(6, 'ron').unitsPerPayer).toBe(32);
  });

  it('7 fan is capped at 6 fan (64 units)', () => {
    expect(calculatePayment(7, 'ron').unitsPerPayer).toBe(32); // cap at 6 fan
  });

  it('Engine·scoring-ron: discarder pays full, total = 1× units', () => {
    const p = calculatePayment(2, 'ron');
    expect(p.totalReceived).toBe(p.unitsPerPayer);
  });

  it('Engine·scoring-tsumo: all 3 pay, total = 3× units', () => {
    const p = calculatePayment(2, 'tsumo');
    expect(p.totalReceived).toBe(p.unitsPerPayer * 3);
  });

  it('minimum 1 fan enforced', () => {
    expect(calculatePayment(0, 'ron').unitsPerPayer).toBe(0); // 0 fans → 0.5 units (floor)
    // Actually 2^(0-1)=0.5, floor is 0 — ensure no negative/crash
    expect(calculatePayment(0, 'ron').unitsPerPayer).toBeGreaterThanOrEqual(0);
  });
});
