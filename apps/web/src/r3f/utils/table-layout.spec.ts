/**
 * table-layout.spec.ts
 *
 * Unit tests for the pure 3D layout math in table-layout.ts.
 * No WebGL context, no React, no Three.js — plain Vitest.
 */

import { describe, it, expect } from 'vitest';
import {
  computeTableLayout,
  HAND_DIST,
  DISCARD_START,
  MELD_DIST,
  STANDING_Y,
  FLAT_Y,
  TILE_STRIDE_W,
  TILE_STRIDE_H,
  DISCARD_COLS,
} from './table-layout';
import type { ClientGameState, ClientSeatState, TileType, Meld } from '@nanchang/shared';

// ── Test fixtures ─────────────────────────────────────────────────────────────

function makeSeat(overrides: Partial<ClientSeatState> = {}): ClientSeatState {
  return {
    wind: 'east',
    score: 0,
    handCount: 0,
    hand: null,
    discards: [],
    openMelds: [],
    connected: true,
    afk: false,
    ...overrides,
  };
}

/**
 * Build a minimal ClientGameState for layout tests.
 * Only fields consumed by computeTableLayout need to be set.
 */
function makeSnapshot(overrides: {
  viewerSeat?: 0 | 1 | 2 | 3;
  viewerHandCount?: number;
  seats?: Partial<ClientSeatState>[];
}): ClientGameState {
  const { viewerSeat = 0, viewerHandCount = 0, seats: seatOverrides = [] } = overrides;

  const defaultSeats = [
    makeSeat({ hand: Array(viewerHandCount).fill('1m' as TileType) }),
    makeSeat(),
    makeSeat(),
    makeSeat(),
  ];

  const seats = defaultSeats.map((s, i) =>
    seatOverrides[i] ? { ...s, ...seatOverrides[i] } : s,
  ) as [ClientSeatState, ClientSeatState, ClientSeatState, ClientSeatState];

  return {
    gameId: 'test-game',
    phase: 'playing',
    roundWind: 'east',
    dealerSeat: 0,
    currentSeat: 0,
    wallCount: 70,
    deadWallCount: 0,
    pendingDiscard: null,
    discardedBySeat: null,
    jingIndicator: null,
    jingPrimary: null,
    jingSecondary: null,
    viewerSeat,
    seats,
    viewMode: '3D' as const,
  };
}

// Approximate equality helper for floating-point values
const APPROX = 0.001;
function approx(a: number, b: number, msg?: string) {
  expect(Math.abs(a - b), msg ?? `expected ${a} ≈ ${b}`).toBeLessThan(APPROX);
}

// ── Viewer hand ───────────────────────────────────────────────────────────────

describe('viewerHand', () => {
  it('returns one pose per tile in the viewer hand', () => {
    const layout = computeTableLayout(makeSnapshot({ viewerHandCount: 13 }));
    expect(layout.viewerHand).toHaveLength(13);
  });

  it('returns 14 poses when viewer has drawn a tile', () => {
    const layout = computeTableLayout(makeSnapshot({ viewerHandCount: 14 }));
    expect(layout.viewerHand).toHaveLength(14);
  });

  it('places viewer hand tiles at Z = HAND_DIST (south = Z+)', () => {
    const layout = computeTableLayout(makeSnapshot({ viewerSeat: 0, viewerHandCount: 13 }));
    for (const pose of layout.viewerHand) {
      approx(pose.z, HAND_DIST, `z should be ${HAND_DIST}`);
    }
  });

  it('tiles stand on the felt surface: y = STANDING_Y', () => {
    const layout = computeTableLayout(makeSnapshot({ viewerHandCount: 13 }));
    for (const pose of layout.viewerHand) {
      approx(pose.y, STANDING_Y);
    }
  });

  it('viewer hand is horizontally centered (first and last tiles are symmetric)', () => {
    const layout = computeTableLayout(makeSnapshot({ viewerHandCount: 13 }));
    const xs = layout.viewerHand.map((p) => p.x);
    const first = xs[0];
    const last = xs[xs.length - 1];
    approx(first + last, 0, 'hand should be centered: first.x + last.x ≈ 0');
  });

  it('viewer tiles are evenly spaced by TILE_STRIDE_W', () => {
    const layout = computeTableLayout(makeSnapshot({ viewerHandCount: 13 }));
    const xs = layout.viewerHand.map((p) => p.x);
    for (let i = 1; i < xs.length; i++) {
      approx(xs[i] - xs[i - 1], TILE_STRIDE_W);
    }
  });

  it('viewer tiles have no rotation (face toward camera)', () => {
    const layout = computeTableLayout(makeSnapshot({ viewerHandCount: 13 }));
    for (const pose of layout.viewerHand) {
      approx(pose.rx, 0);
      approx(pose.ry, 0);
      approx(pose.rz, 0);
    }
  });

  it('returns empty array when viewer hand is empty', () => {
    const layout = computeTableLayout(makeSnapshot({ viewerHandCount: 0 }));
    expect(layout.viewerHand).toHaveLength(0);
  });
});

// ── Opponent hands ─────────────────────────────────────────────────────────────

describe('opponentHands', () => {
  it('across opponent is at Z = -HAND_DIST', () => {
    const snap = makeSnapshot({
      seats: [{}, { handCount: 5 }, { handCount: 5 }, { handCount: 5 }],
    });
    const layout = computeTableLayout(snap);
    for (const pose of layout.opponentHands.across) {
      approx(pose.z, -HAND_DIST);
    }
  });

  it('right opponent is at X = +HAND_DIST', () => {
    const snap = makeSnapshot({
      seats: [{}, { handCount: 5 }, { handCount: 5 }, { handCount: 5 }],
    });
    const layout = computeTableLayout(snap);
    for (const pose of layout.opponentHands.right) {
      approx(pose.x, HAND_DIST);
    }
  });

  it('left opponent is at X = -HAND_DIST', () => {
    const snap = makeSnapshot({
      seats: [{}, { handCount: 5 }, { handCount: 5 }, { handCount: 5 }],
    });
    const layout = computeTableLayout(snap);
    for (const pose of layout.opponentHands.left) {
      approx(pose.x, -HAND_DIST);
    }
  });

  it('across opponent tiles face away from viewer (ry ≈ π)', () => {
    const snap = makeSnapshot({ seats: [{}, {}, { handCount: 5 }, {}] });
    const layout = computeTableLayout(snap);
    for (const pose of layout.opponentHands.across) {
      approx(pose.ry, Math.PI);
    }
  });

  it('right opponent count matches handCount', () => {
    const snap = makeSnapshot({ seats: [{}, { handCount: 7 }, {}, {}] });
    const layout = computeTableLayout(snap);
    expect(layout.opponentHands.right).toHaveLength(7);
  });

  it('across opponent tiles stand at y = STANDING_Y (upright)', () => {
    const snap = makeSnapshot({ seats: [{}, {}, { handCount: 4 }, {}] });
    const layout = computeTableLayout(snap);
    for (const pose of layout.opponentHands.across) {
      approx(pose.y, STANDING_Y);
    }
  });

  it('right/left opponent tiles stand upright at y = STANDING_Y', () => {
    const snap = makeSnapshot({
      seats: [{}, { handCount: 4 }, {}, { handCount: 4 }],
    });
    const layout = computeTableLayout(snap);
    for (const pose of [...layout.opponentHands.right, ...layout.opponentHands.left]) {
      approx(pose.y, STANDING_Y);
    }
  });

  it('right/left opponent tiles have rx = 0 (standing upright, face away from camera)', () => {
    const snap = makeSnapshot({
      seats: [{}, { handCount: 4 }, {}, { handCount: 4 }],
    });
    const layout = computeTableLayout(snap);
    for (const pose of [...layout.opponentHands.right, ...layout.opponentHands.left]) {
      approx(pose.rx, 0);
    }
  });
});

// ── Viewer seat rotation ───────────────────────────────────────────────────────

describe('viewerSeat rotation', () => {
  it('when viewerSeat=1, viewer hand is at X = +HAND_DIST', () => {
    const snap = makeSnapshot({ viewerSeat: 1, viewerHandCount: 5 });
    const layout = computeTableLayout(snap);
    for (const pose of layout.viewerHand) {
      approx(pose.x, HAND_DIST);
    }
  });

  it('when viewerSeat=2, viewer hand is at Z = -HAND_DIST', () => {
    const snap = makeSnapshot({ viewerSeat: 2, viewerHandCount: 5 });
    const layout = computeTableLayout(snap);
    for (const pose of layout.viewerHand) {
      approx(pose.z, -HAND_DIST);
    }
  });

  it('when viewerSeat=3, viewer hand is at X = -HAND_DIST', () => {
    const snap = makeSnapshot({ viewerSeat: 3, viewerHandCount: 5 });
    const layout = computeTableLayout(snap);
    for (const pose of layout.viewerHand) {
      approx(pose.x, -HAND_DIST);
    }
  });
});

// ── Discards ──────────────────────────────────────────────────────────────────

describe('discards', () => {
  it('returns 4 discard arrays (one per seat)', () => {
    const layout = computeTableLayout(makeSnapshot({}));
    expect(layout.discards).toHaveLength(4);
  });

  it('each discard array has the same length as the seat discard count', () => {
    const snap = makeSnapshot({
      seats: [
        { discards: ['1m', '2m', '3m'] as TileType[] },
        { discards: ['1p'] as TileType[] },
        { discards: [] },
        { discards: ['1s', '2s'] as TileType[] },
      ],
    });
    const layout = computeTableLayout(snap);
    expect(layout.discards[0]).toHaveLength(3);
    expect(layout.discards[1]).toHaveLength(1);
    expect(layout.discards[2]).toHaveLength(0);
    expect(layout.discards[3]).toHaveLength(2);
  });

  it('viewer discards lie flat at y = FLAT_Y', () => {
    const snap = makeSnapshot({
      seats: [{ discards: ['1m', '2m', '3m'] as TileType[] }, {}, {}, {}],
    });
    const layout = computeTableLayout(snap);
    for (const pose of layout.discards[0]) {
      approx(pose.y, FLAT_Y);
    }
  });

  it('viewer discards start near DISCARD_START (first tile at Z ≈ DISCARD_START)', () => {
    const snap = makeSnapshot({
      seats: [{ discards: ['1m'] as TileType[] }, {}, {}, {}],
    });
    const layout = computeTableLayout(snap);
    approx(layout.discards[0][0].z, DISCARD_START);
  });

  it('6 discards all fit in one row (same Z for viewer)', () => {
    const six = Array(DISCARD_COLS).fill('1m') as TileType[];
    const snap = makeSnapshot({ seats: [{ discards: six }, {}, {}, {}] });
    const layout = computeTableLayout(snap);
    const zValues = layout.discards[0].map((p) => p.z);
    const firstZ = zValues[0];
    for (const z of zValues) {
      approx(z, firstZ, 'all 6 discards should be in the same row (same Z)');
    }
  });

  it('7th discard starts a new row (different Z from first 6)', () => {
    const seven = Array(DISCARD_COLS + 1).fill('1m') as TileType[];
    const snap = makeSnapshot({ seats: [{ discards: seven }, {}, {}, {}] });
    const layout = computeTableLayout(snap);
    const row1Z = layout.discards[0][0].z;
    const row2Z = layout.discards[0][DISCARD_COLS].z;
    expect(Math.abs(row2Z - row1Z)).toBeGreaterThan(0.5); // should differ by ~TILE_STRIDE_H
  });

  it('discard row stride matches TILE_STRIDE_H', () => {
    const seven = Array(DISCARD_COLS + 1).fill('1m') as TileType[];
    const snap = makeSnapshot({ seats: [{ discards: seven }, {}, {}, {}] });
    const layout = computeTableLayout(snap);
    const row1Z = layout.discards[0][0].z;
    const row2Z = layout.discards[0][DISCARD_COLS].z;
    approx(Math.abs(row2Z - row1Z), TILE_STRIDE_H);
  });

  it('discards lie flat (rx = -π/2)', () => {
    const snap = makeSnapshot({ seats: [{ discards: ['1m', '2m'] as TileType[] }, {}, {}, {}] });
    const layout = computeTableLayout(snap);
    for (const pose of layout.discards[0]) {
      approx(pose.rx, -Math.PI / 2);
    }
  });

  it('across seat discards are on the far side (z < 0)', () => {
    // viewerSeat=0, across=seat2
    const snap = makeSnapshot({
      seats: [{}, {}, { discards: ['1m'] as TileType[] }, {}],
    });
    const layout = computeTableLayout(snap);
    expect(layout.discards[2][0].z).toBeLessThan(0);
  });

  it('right seat discards are on the right side (x > 0)', () => {
    // viewerSeat=0, right=seat1
    const snap = makeSnapshot({
      seats: [{}, { discards: ['1m'] as TileType[] }, {}, {}],
    });
    const layout = computeTableLayout(snap);
    expect(layout.discards[1][0].x).toBeGreaterThan(0);
  });
});

// ── Open melds ────────────────────────────────────────────────────────────────

describe('openMelds', () => {
  function makeMeld(count: 3 | 4): Meld {
    const tiles = Array(count).fill('1m') as
      | [TileType, TileType, TileType]
      | [TileType, TileType, TileType, TileType];
    return { kind: count === 4 ? 'kong' : 'pung', tiles, concealed: false };
  }

  it('returns 4 openMelds arrays (one per seat)', () => {
    const layout = computeTableLayout(makeSnapshot({}));
    expect(layout.openMelds).toHaveLength(4);
  });

  it('each seat openMelds array length matches the number of melds', () => {
    const snap = makeSnapshot({
      seats: [{ openMelds: [makeMeld(3), makeMeld(3)] }, { openMelds: [makeMeld(4)] }, {}, {}],
    });
    const layout = computeTableLayout(snap);
    expect(layout.openMelds[0]).toHaveLength(2);
    expect(layout.openMelds[1]).toHaveLength(1);
    expect(layout.openMelds[2]).toHaveLength(0);
  });

  it('each meld array has one pose per tile in the meld', () => {
    const snap = makeSnapshot({
      seats: [{ openMelds: [makeMeld(3), makeMeld(4)] }, {}, {}, {}],
    });
    const layout = computeTableLayout(snap);
    expect(layout.openMelds[0][0]).toHaveLength(3); // pung
    expect(layout.openMelds[0][1]).toHaveLength(4); // kong
  });

  it('viewer open meld tiles lie flat at y = FLAT_Y', () => {
    const snap = makeSnapshot({
      seats: [{ openMelds: [makeMeld(3)] }, {}, {}, {}],
    });
    const layout = computeTableLayout(snap);
    for (const pose of layout.openMelds[0][0]) {
      approx(pose.y, FLAT_Y);
    }
  });

  it('viewer open meld tiles are near MELD_DIST (between hand and discards)', () => {
    const snap = makeSnapshot({
      seats: [{ openMelds: [makeMeld(3)] }, {}, {}, {}],
    });
    const layout = computeTableLayout(snap);
    for (const pose of layout.openMelds[0][0]) {
      approx(pose.z, MELD_DIST, `z should be near MELD_DIST (${MELD_DIST})`);
    }
  });

  it('second meld group does not overlap first (different column offset)', () => {
    const snap = makeSnapshot({
      seats: [{ openMelds: [makeMeld(3), makeMeld(3)] }, {}, {}, {}],
    });
    const layout = computeTableLayout(snap);
    const firstMeldCenterX = layout.openMelds[0][0].reduce((s, p) => s + p.x, 0) / 3;
    const secondMeldCenterX = layout.openMelds[0][1].reduce((s, p) => s + p.x, 0) / 3;
    expect(Math.abs(secondMeldCenterX - firstMeldCenterX)).toBeGreaterThan(0.5);
  });

  it('open meld tiles lie flat (rx = -π/2)', () => {
    const snap = makeSnapshot({
      seats: [{ openMelds: [makeMeld(3)] }, {}, {}, {}],
    });
    const layout = computeTableLayout(snap);
    for (const pose of layout.openMelds[0][0]) {
      approx(pose.rx, -Math.PI / 2);
    }
  });
});

// ── Full layout structural check ──────────────────────────────────────────────

describe('computeTableLayout', () => {
  it('returns all required top-level keys', () => {
    const layout = computeTableLayout(makeSnapshot({}));
    expect(layout).toHaveProperty('viewerHand');
    expect(layout).toHaveProperty('opponentHands');
    expect(layout).toHaveProperty('discards');
    expect(layout).toHaveProperty('openMelds');
  });

  it('opponentHands has right, across, and left keys', () => {
    const layout = computeTableLayout(makeSnapshot({}));
    expect(layout.opponentHands).toHaveProperty('right');
    expect(layout.opponentHands).toHaveProperty('across');
    expect(layout.opponentHands).toHaveProperty('left');
  });

  it('viewer hand and discards do not spatially overlap (Z ordering)', () => {
    const snap = makeSnapshot({
      viewerHandCount: 13,
      seats: [{ discards: Array(6).fill('1m') as TileType[] }, {}, {}, {}],
    });
    const layout = computeTableLayout(snap);
    const handMinZ = Math.min(...layout.viewerHand.map((p) => p.z));
    const discardMaxZ = Math.max(...layout.discards[0].map((p) => p.z));
    // Hand should be farther from center than any discard
    expect(handMinZ).toBeGreaterThan(discardMaxZ);
  });

  it('viewer melds sit between hand and discards (DISCARD_START < MELD_DIST < HAND_DIST)', () => {
    expect(DISCARD_START).toBeLessThan(MELD_DIST);
    expect(MELD_DIST).toBeLessThan(HAND_DIST);
  });
});
