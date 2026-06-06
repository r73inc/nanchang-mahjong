/**
 * PlayerHand2D.test.tsx
 *
 * Feature coverage:
 *  - 2DHand·merge:        mergeLocalOrder pure-function logic
 *  - 2DHand·render:       hand tiles appear; empty/null snapshot renders nothing
 *  - 2DHand·select:       first tap selects; second tap triggers onDiscard
 *  - 2DHand·claim:        tiles are non-interactive during claim window / pendingMove
 *  - 2DHand·discard-hint: nudge shown when pendingDiscard is set
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { PlayerHand2D, mergeLocalOrder } from './PlayerHand2D';
import type { LocalEntry } from './PlayerHand2D';
import { useGameStore } from '../../stores/game.store';
import type { ClientGameState } from '@nanchang/shared';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../../stores/game.store', () => ({
  useGameStore: vi.fn(),
}));

// AnimatePresence holds exited elements in jsdom (exit animations never complete
// without a real browser RAF loop). Make it a transparent pass-through so DOM
// assertions about tile count remain reliable.
vi.mock('framer-motion', async (importOriginal) => {
  const mod = await importOriginal<typeof import('framer-motion')>();
  return {
    ...mod,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

const mockUseGameStore = vi.mocked(useGameStore);

/** Minimal valid ClientGameState with a 3-tile viewer hand at seat 0. */
function makeSnapshot(overrides: Partial<ClientGameState> = {}): ClientGameState {
  return {
    gameId: 'test-game',
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
      {
        wind: 'east',
        score: 0,
        connected: true,
        afk: false,
        openMelds: [],
        discards: [],
        hand: ['1m', '2m', '3m'],
        handCount: 3,
      },
      {
        wind: 'south',
        score: 0,
        connected: true,
        afk: false,
        openMelds: [],
        discards: [],
        hand: null,
        handCount: 13,
      },
      {
        wind: 'west',
        score: 0,
        connected: true,
        afk: false,
        openMelds: [],
        discards: [],
        hand: null,
        handCount: 13,
      },
      {
        wind: 'north',
        score: 0,
        connected: true,
        afk: false,
        openMelds: [],
        discards: [],
        hand: null,
        handCount: 13,
      },
    ],
    ...overrides,
  };
}

function setupStore({
  snapshot = makeSnapshot(),
  claimWindow = null,
  pendingMove = false,
}: {
  snapshot?: ClientGameState | null;
  claimWindow?: { actions: []; deadline: number } | null;
  pendingMove?: boolean;
} = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockUseGameStore.mockImplementation((selector: (s: any) => any) =>
    selector({ snapshot, claimWindow, pendingMove }),
  );
}

function renderHand(onDiscard = vi.fn()) {
  return render(
    <I18nProvider>
      <PlayerHand2D onDiscard={onDiscard} />
    </I18nProvider>,
  );
}

// ── mergeLocalOrder — pure function ──────────────────────────────────────────

describe('mergeLocalOrder · 2DHand·merge', () => {
  it('initializes from empty prev + server hand', () => {
    const result = mergeLocalOrder([], ['1m', '2m', '3m']);
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.tile)).toEqual(['1m', '2m', '3m']);
  });

  it('each entry gets a unique id', () => {
    const result = mergeLocalOrder([], ['1m', '1m', '2m']);
    const ids = result.map((e) => e.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('preserves existing entries in user order when hand is unchanged', () => {
    const prev: LocalEntry[] = [
      { id: 'a', tile: '3m' },
      { id: 'b', tile: '1m' },
      { id: 'c', tile: '2m' },
    ];
    const result = mergeLocalOrder(prev, ['1m', '2m', '3m']);
    // user-sorted order preserved: 3m, 1m, 2m
    expect(result.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(result.map((e) => e.tile)).toEqual(['3m', '1m', '2m']);
  });

  it('appends a newly drawn tile at the end with a new id', () => {
    const prev: LocalEntry[] = [
      { id: 'a', tile: '1m' },
      { id: 'b', tile: '2m' },
    ];
    const result = mergeLocalOrder(prev, ['1m', '2m', '4m']);
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('a');
    expect(result[1].id).toBe('b');
    expect(result[2].tile).toBe('4m');
    expect(result[2].id).not.toBe('a');
    expect(result[2].id).not.toBe('b');
  });

  it('removes a discarded tile while keeping others in user order', () => {
    const prev: LocalEntry[] = [
      { id: 'a', tile: '3m' },
      { id: 'b', tile: '1m' },
      { id: 'c', tile: '2m' },
    ];
    // 2m was discarded
    const result = mergeLocalOrder(prev, ['1m', '3m']);
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('handles duplicate tile types correctly', () => {
    const prev: LocalEntry[] = [
      { id: 'a', tile: '1m' },
      { id: 'b', tile: '1m' },
      { id: 'c', tile: '2m' },
    ];
    // one 1m was discarded
    const result = mergeLocalOrder(prev, ['1m', '2m']);
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual(['a', 'c']);
  });

  it('returns empty array when server hand is empty', () => {
    const prev: LocalEntry[] = [{ id: 'a', tile: '1m' }];
    expect(mergeLocalOrder(prev, [])).toEqual([]);
  });

  it('stable IDs survive multiple consecutive draws', () => {
    const start: LocalEntry[] = [{ id: 'x', tile: '1m' }];
    const after1 = mergeLocalOrder(start, ['1m', '2m']);
    expect(after1[0].id).toBe('x');
    const draw1Id = after1[1].id;

    const after2 = mergeLocalOrder(after1, ['1m', '2m', '3m']);
    expect(after2[0].id).toBe('x'); // original
    expect(after2[1].id).toBe(draw1Id); // draw-1 tile
    expect(after2[2].tile).toBe('3m'); // draw-2 tile (new)
  });
});

// ── PlayerHand2D — render ─────────────────────────────────────────────────────

describe('PlayerHand2D render · 2DHand·render', () => {
  beforeEach(() => setupStore());

  it('renders the hand container', () => {
    renderHand();
    expect(screen.getByTestId('player-hand-2d')).toBeInTheDocument();
  });

  it('renders one MahjongTile2D wrapper per tile', () => {
    renderHand();
    expect(screen.getAllByTestId('mahjong-tile-2d')).toHaveLength(3);
  });

  it('renders nothing when snapshot is null', () => {
    setupStore({ snapshot: null });
    const { container } = renderHand();
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when viewer hand is empty', () => {
    setupStore({
      snapshot: makeSnapshot({
        seats: [
          {
            wind: 'east',
            score: 0,
            connected: true,
            afk: false,
            openMelds: [],
            discards: [],
            hand: [],
            handCount: 0,
          },
          {
            wind: 'south',
            score: 0,
            connected: true,
            afk: false,
            openMelds: [],
            discards: [],
            hand: null,
            handCount: 13,
          },
          {
            wind: 'west',
            score: 0,
            connected: true,
            afk: false,
            openMelds: [],
            discards: [],
            hand: null,
            handCount: 13,
          },
          {
            wind: 'north',
            score: 0,
            connected: true,
            afk: false,
            openMelds: [],
            discards: [],
            hand: null,
            handCount: 13,
          },
        ],
      }),
    });
    const { container } = renderHand();
    expect(container.firstChild).toBeNull();
  });
});

// ── PlayerHand2D — select and discard ────────────────────────────────────────

describe('PlayerHand2D select/discard · 2DHand·select', () => {
  beforeEach(() => setupStore());

  it('first tile tap selects it (aria-pressed becomes true)', () => {
    renderHand();
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
  });

  it('tapping a different tile moves the selection', () => {
    renderHand();
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'false');
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'true');
  });

  it('double-tap on selected tile calls onDiscard with the tile', () => {
    const onDiscard = vi.fn();
    renderHand(onDiscard);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]); // select
    fireEvent.click(buttons[0]); // discard
    expect(onDiscard).toHaveBeenCalledOnce();
    expect(onDiscard).toHaveBeenCalledWith('1m');
  });

  it('tile count decrements optimistically after discard', () => {
    renderHand();
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[0]);
    expect(screen.getAllByTestId('mahjong-tile-2d')).toHaveLength(2);
  });
});

// ── PlayerHand2D — claim window / pendingMove disable interaction ─────────────

describe('PlayerHand2D claim window · 2DHand·claim', () => {
  it('tiles have role="img" (non-interactive) during an active claim window', () => {
    setupStore({ claimWindow: { actions: [], deadline: Date.now() + 8000 } });
    renderHand();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('tiles have role="img" when pendingMove is true', () => {
    setupStore({ pendingMove: true });
    renderHand();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

// ── PlayerHand2D — discard hint ───────────────────────────────────────────────

describe('PlayerHand2D discard hint · 2DHand·discard-hint', () => {
  it('shows "Tap to discard" when pendingDiscard is set and it is viewer turn', () => {
    setupStore({ snapshot: makeSnapshot({ pendingDiscard: '5p' }) });
    renderHand();
    expect(screen.getByText('Tap to discard')).toBeInTheDocument();
  });

  it('hides hint when pendingDiscard is null', () => {
    setupStore({ snapshot: makeSnapshot({ pendingDiscard: null }) });
    renderHand();
    expect(screen.queryByText('Tap to discard')).not.toBeInTheDocument();
  });
});
