/**
 * GameTable2D.test.tsx
 *
 * Feature coverage:
 *  - 2DBoard·smoke:   full board renders without crashing
 *  - 2DBoard·zones:   all four seat zones are present
 *  - 2DBoard·discards: discard pool shows correct tile count
 *  - 2DBoard·melds:   open melds section present when melds exist
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { GameTable2D } from './GameTable2D';
import { useGameStore } from '../../stores/game.store';
import type { ClientGameState, ClientSeatState, Meld, TileType } from '@nanchang/shared';

// ── Store mock ────────────────────────────────────────────────────────────────

vi.mock('../../stores/game.store', () => ({ useGameStore: vi.fn() }));
const mockUseGameStore = vi.mocked(useGameStore);

// Stub the Framer Motion canvas components that don't need real 3D in tests
vi.mock('../../r3f/GameCanvas', () => ({
  GameCanvas: () => <div data-testid="game-canvas-stub" />,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

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
    deadWallCount: 14,
    pendingDiscard: null,
    discardedBySeat: null,
    viewerSeat: 0,
    viewMode: '2D',
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
    selector({ snapshot, claimWindow: null, pendingMove: false }),
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GameTable2D · 2DBoard·smoke', () => {
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

describe('GameTable2D · 2DBoard·zones', () => {
  beforeEach(() => setupStore());

  it('renders seat labels for the three opponent seats', () => {
    renderTable();
    // Viewer (seat 0, role=bottom) shows PlayerHand2D — no SeatLabel2D
    expect(screen.queryByTestId('seat-label-0')).not.toBeInTheDocument();
    // Each opponent zone has a nameplate
    expect(screen.getByTestId('seat-label-1')).toBeInTheDocument();
    expect(screen.getByTestId('seat-label-2')).toBeInTheDocument();
    expect(screen.getByTestId('seat-label-3')).toBeInTheDocument();
  });

  it('renders opponent hand for each non-viewer seat', () => {
    renderTable();
    // Seats 1, 2, 3 are opponents
    expect(screen.getByTestId('opponent-hand-1')).toBeInTheDocument();
    expect(screen.getByTestId('opponent-hand-2')).toBeInTheDocument();
    expect(screen.getByTestId('opponent-hand-3')).toBeInTheDocument();
    // Seat 0 is the viewer — has PlayerHand2D, not OpponentHand2D
    expect(screen.queryByTestId('opponent-hand-0')).not.toBeInTheDocument();
  });

  it('renders the viewer PlayerHand2D', () => {
    renderTable();
    expect(screen.getByTestId('player-hand-2d')).toBeInTheDocument();
  });
});

describe('GameTable2D · 2DBoard·discards', () => {
  it('shows discard pool when a seat has discards', () => {
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
    // Seat 0 and seat 1 discard pools are present
    expect(screen.getByTestId('discard-pool-0')).toBeInTheDocument();
    expect(screen.getByTestId('discard-pool-1')).toBeInTheDocument();
    // Seat 2 has no discards
    expect(screen.queryByTestId('discard-pool-2')).not.toBeInTheDocument();
  });

  it('discard pool renders one tile per discard', () => {
    setupStore(
      makeSnapshot({
        seats: [
          makeSeat({
            wind: 'east',
            hand: ['1m'] as TileType[],
            handCount: 1,
            discards: ['4m', '5m', '6m'] as TileType[],
          }),
          makeSeat({ wind: 'south' }),
          makeSeat({ wind: 'west' }),
          makeSeat({ wind: 'north' }),
        ],
      }),
    );
    renderTable();
    const pool = screen.getByTestId('discard-pool-0');
    // Each MahjongTile2D wrapper has data-testid="mahjong-tile-2d"
    expect(pool.querySelectorAll('[data-testid="mahjong-tile-2d"]')).toHaveLength(3);
  });
});

describe('GameTable2D · 2DBoard·melds', () => {
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
