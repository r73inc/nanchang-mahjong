/**
 * GameTable2D.test.tsx
 *
 * Feature coverage:
 *  - 2DBoardÂ·smoke:    full board renders without crashing
 *  - 2DBoardÂ·zones:    all four seat zones are present
 *  - 2DBoardÂ·discards: discard pool shows correct tile count
 *  - 2DBoardÂ·melds:    open melds section present when melds exist
 *  - 2DBoardÂ·scale:    computeTileScale returns sensible values (BUG-2D-02)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { GameTable2D } from './GameTable2D';
import { computeTileScale, TILE_SCALE_MIN } from './Table2DContext';
import { useGameStore } from '../../stores/game.store';
import type { ClientGameState, ClientSeatState, Meld, TileType } from '@nanchang/shared';

// â”€â”€ Store mock â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

vi.mock('../../stores/game.store', () => ({ useGameStore: vi.fn() }));
const mockUseGameStore = vi.mocked(useGameStore);

// Stub the Framer Motion canvas components that don't need real 3D in tests
vi.mock('../../r3f/GameCanvas', () => ({
  GameCanvas: () => <div data-testid="game-canvas-stub" />,
}));

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function makeSeat(overrides: Partial<ClientSeatState> = {}): ClientSeatState {
  return {
    wind: 'east',
    score: 0,
    connected: true,
    afk: false,
    openMelds: [],
    discards: [],
    hand: null,
    handCount: 13,
    seatName: 'Player',
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<ClientGameState> = {}): ClientGameState {
  return {
    gameId: 'test',
    phase: 'playing',
    jingIndicator: null,
    jingPrimary: null,
    jingSecondary: null,
    currentSeat: 0,
    dealerSeat: 0,
    roundWind: 'east',
    wallCount: 60,
    wall: null,
    pendingDiscard: null,
    discardedBySeat: null,
    viewerSeat: 0,
    viewMode: '2D',
    ruleTopBottomJing: false,
    preGamePhase: null,
    pendingRoll: null,
    seats: [
      makeSeat({ wind: 'east', hand: ['1m', '2m', '3m'] as TileType[], handCount: 3 }),
      makeSeat({ wind: 'south' }),
      makeSeat({ wind: 'west' }),
      makeSeat({ wind: 'north' }),
    ],
    ...overrides,
  } as ClientGameState;
}

function setupStore(snapshot: ClientGameState | null = makeSnapshot()) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockUseGameStore.mockImplementation((selector: (s: any) => any) =>
    selector({ snapshot, claimWindow: null, pendingMove: false, lastDiscard: null }),
  );
}

function renderTable() {
  const onDiscard = vi.fn();
  const result = render(
    <I18nProvider>
      <GameTable2D onDiscard={onDiscard} />
    </I18nProvider>,
  );
  return { ...result, onDiscard };
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('GameTable2D Â· 2DBoardÂ·smoke', () => {
  beforeEach(() => setupStore());

  it('renders the table container', () => {
    renderTable();
    expect(screen.getByTestId('game-table-2d')).toBeInTheDocument();
  });

  it('renders without crashing when snapshot is null', () => {
    setupStore(null);
    renderTable();
    expect(screen.getByTestId('game-table-2d')).toBeInTheDocument();
  });
});

describe('GameTable2D Â· 2DBoardÂ·zones', () => {
  beforeEach(() => setupStore());

  it('BUG-042: seat labels are not inside the rotated zone containers (moved to SeatHUD overlay)', () => {
    renderTable();
    // SeatLabel2D was removed from rotated containers to fix drifting info blocks
    // (BUG-042). Opponent nameplates are now provided by the SeatHUD overlay in
    // game-page.tsx, which uses absolute positioning independent of meld tiles.
    expect(screen.queryByTestId('seat-label-0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('seat-label-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('seat-label-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('seat-label-3')).not.toBeInTheDocument();
  });

  it('renders opponent hand for each non-viewer seat', () => {
    renderTable();
    // Seats 1, 2, 3 are opponents
    expect(screen.getByTestId('opponent-hand-1')).toBeInTheDocument();
    expect(screen.getByTestId('opponent-hand-2')).toBeInTheDocument();
    expect(screen.getByTestId('opponent-hand-3')).toBeInTheDocument();
    // Seat 0 is the viewer â€” has PlayerHand2D, not OpponentHand2D
    expect(screen.queryByTestId('opponent-hand-0')).not.toBeInTheDocument();
  });

  it('renders the viewer PlayerHand2D', () => {
    renderTable();
    expect(screen.getByTestId('player-hand-2d')).toBeInTheDocument();
  });
});

// BUG-2D-05: all discards are merged into a single combined-discard-pool.
describe('GameTable2D Â· 2DBoardÂ·discards', () => {
  it('renders the combined discard pool when any seat has discards', () => {
    setupStore(
      makeSnapshot({
        seats: [
          makeSeat({
            wind: 'east',
            hand: ['1m', '2m', '3m'] as TileType[],
            handCount: 3,
            discards: ['4m', '5m'] as TileType[],
          }),
          makeSeat({ wind: 'south', discards: ['1p', '2p', '3p'] as TileType[] }),
          makeSeat({ wind: 'west' }),
          makeSeat({ wind: 'north' }),
        ],
      }),
    );
    renderTable();
    // A single combined pool is present (seats 0 and 1 have discards).
    expect(screen.getByTestId('combined-discard-pool')).toBeInTheDocument();
  });

  it('does not render the combined pool when no seat has discards', () => {
    setupStore(); // default snapshot â€” all seats have empty discard arrays
    renderTable();
    expect(screen.queryByTestId('combined-discard-pool')).not.toBeInTheDocument();
  });

  it('combined pool renders the total tile count across all discarding seats', () => {
    // Seat 0: 3 discards, seat 1: 2 discards â†’ 5 tiles total in combined pool.
    setupStore(
      makeSnapshot({
        seats: [
          makeSeat({
            wind: 'east',
            hand: ['1m'] as TileType[],
            handCount: 1,
            discards: ['4m', '5m', '6m'] as TileType[],
          }),
          makeSeat({ wind: 'south', discards: ['1p', '2p'] as TileType[] }),
          makeSeat({ wind: 'west' }),
          makeSeat({ wind: 'north' }),
        ],
      }),
    );
    renderTable();
    const pool = screen.getByTestId('combined-discard-pool');
    // Round-robin: s0[0], s1[0], s0[1], s1[1], s0[2] â†’ 5 tiles
    expect(pool.querySelectorAll('[data-testid="mahjong-tile-2d"]')).toHaveLength(5);
  });
});

describe('GameTable2D Â· 2DBoardÂ·melds', () => {
  it('renders open melds section when a seat has open melds', () => {
    const pung: Meld = {
      kind: 'pung',
      tiles: ['1m', '1m', '1m'] as [TileType, TileType, TileType],
      concealed: false,
    };
    setupStore(
      makeSnapshot({
        seats: [
          makeSeat({
            wind: 'east',
            hand: ['2m', '3m'] as TileType[],
            handCount: 2,
            openMelds: [pung],
          }),
          makeSeat({ wind: 'south' }),
          makeSeat({ wind: 'west' }),
          makeSeat({ wind: 'north' }),
        ],
      }),
    );
    renderTable();
    expect(screen.getByTestId('open-melds-0')).toBeInTheDocument();
  });

  it('does not render melds section when seat has no melds', () => {
    setupStore();
    renderTable();
    // Default snapshot has no melds
    expect(screen.queryByTestId('open-melds-0')).not.toBeInTheDocument();
  });
});

// â”€â”€ BUG-2D-02: computeTileScale â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('GameTable2D Â· 2DBoardÂ·scale', () => {
  it('returns 1.0 at the 800 Ã— 600 reference canvas', () => {
    // At reference size both constraints resolve above 1.0 and the result is
    // capped at 1.0.
    const s = computeTileScale(800, 600);
    expect(s).toBeGreaterThanOrEqual(0.5); // comfortable margin for reference
    expect(s).toBeLessThanOrEqual(1.0);
  });

  it('returns 1.0 on a large desktop viewport (1920 Ã— 1080)', () => {
    expect(computeTileScale(1920, 1080)).toBe(1.0);
  });

  it('returns a reduced scale on a narrow viewport (600 Ã— 400)', () => {
    const s = computeTileScale(600, 400);
    expect(s).toBeLessThan(1.0);
    expect(s).toBeGreaterThanOrEqual(TILE_SCALE_MIN);
  });

  it('is always â‰¥ TILE_SCALE_MIN regardless of viewport size', () => {
    // Tiny viewport (e.g. very small embedded webview)
    const s = computeTileScale(200, 150);
    expect(s).toBeGreaterThanOrEqual(TILE_SCALE_MIN);
  });

  it('returns smaller scale on a narrow viewport than on a wide one', () => {
    const narrow = computeTileScale(400, 800);
    const wide = computeTileScale(1200, 800);
    expect(narrow).toBeLessThanOrEqual(wide);
  });

  it('returns smaller scale on a short viewport than on a tall one', () => {
    const short = computeTileScale(1200, 400);
    const tall = computeTileScale(1200, 900);
    expect(short).toBeLessThanOrEqual(tall);
  });
});
