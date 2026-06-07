/**
 * game-page.test.tsx — FE tests for the GamePage and game components.
 *
 * Covers:
 *  - Gameplay·snapshot-redaction: spectator view hides hands, player sees own hand
 *  - Gameplay·reconnect: reconnecting overlay appears after 1.5s disconnect
 *  - Gameplay·discard-flow: tile selection and discard emit the right socket event
 *  - MahjongTile aria-label from tile-map
 *  - GamePage renders jing_reveal screen for phase=jing_reveal
 *  - Gameplay·back-intercept: leave-game sheet, confirm, cancel (BUG-2D-06)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GamePage } from './game-page';
import { MahjongTile } from '../../components/mahjong-tile';
import type { ClientGameState } from '@nanchang/shared';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock the 3D canvas — jsdom has no WebGL context; render a stub div instead
vi.mock('../../r3f/GameCanvas', () => ({
  GameCanvas: () => <div data-testid="game-canvas-3d" aria-hidden="true" />,
}));

vi.mock('../../stores/auth.store', () => ({
  useAuthStore: vi.fn((sel: (s: { user: { sub: string }; accessToken: string }) => unknown) =>
    sel({ user: { sub: 'u1' }, accessToken: 'tok' }),
  ),
}));

// Capture socket emit calls for assertions
const mockEmit = vi.fn();
let registeredHandlers: Map<string, (payload: unknown) => void> = new Map();

const mockSocket = {
  emit: mockEmit,
  on: vi.fn((event: string, handler: (payload: unknown) => void) => {
    registeredHandlers.set(event, handler);
  }),
  off: vi.fn((event: string) => {
    registeredHandlers.delete(event);
  }),
  connected: true,
};

vi.mock('../../lib/socket', () => ({
  connectSocket: vi.fn(),
  getSocket: vi.fn(() => mockSocket),
  disconnectSocket: vi.fn(),
}));

// ── useBlocker mock (BUG-2D-06) ───────────────────────────────────────────────
// Controls the blocker state so tests can simulate a blocked navigation
// without actually triggering router history changes.
const mockBlockerProceed = vi.fn();
const mockBlockerReset = vi.fn();
const mockBlocker = {
  state: 'unblocked' as 'unblocked' | 'blocked' | 'proceeding',
  proceed: mockBlockerProceed,
  reset: mockBlockerReset,
};

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useBlocker: () => mockBlocker };
});

// ── Snapshot fixtures ─────────────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<ClientGameState> = {}): ClientGameState {
  return {
    gameId: 'game-test',
    phase: 'playing',
    jingIndicator: '3m',
    jingPrimary: '3m',
    jingSecondary: '4m',
    currentSeat: 0,
    dealerSeat: 0,
    roundWind: 'east',
    wallCount: 40,
    deadWallCount: 14,
    pendingDiscard: null,
    discardedBySeat: null,
    viewerSeat: 0,
    viewMode: '3D',
    seats: [
      {
        wind: 'east',
        score: 0,
        connected: true,
        afk: false,
        openMelds: [],
        discards: [],
        hand: ['1m', '2m', '3m', '4m', '5m', '1p', '2p', '3p', '4p', '5p', '1s', '2s', '3s'],
        handCount: 13,
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

function mkQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderGamePage(gameId = 'game-test') {
  return render(
    <QueryClientProvider client={mkQC()}>
      <MemoryRouter initialEntries={[`/game/${gameId}`]}>
        <Routes>
          <Route path="/game/:id" element={<GamePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ── Helper to simulate a server snapshot ──────────────────────────────────────

async function pushSnapshot(snapshot: ClientGameState) {
  // Wait for useEffect to register the handler (it may lag the initial render)
  await waitFor(() => {
    expect(mockSocket.on).toHaveBeenCalledWith('game:snapshot', expect.any(Function));
  });
  const handler = registeredHandlers.get('game:snapshot');
  if (handler) await act(async () => handler({ state: snapshot }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GamePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registeredHandlers = new Map();
    mockBlocker.state = 'unblocked';
    mockBlockerProceed.mockClear();
    mockBlockerReset.mockClear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits game:join on mount', () => {
    renderGamePage();
    expect(mockEmit).toHaveBeenCalledWith('game:join', { gameId: 'game-test', spectate: false });
  });

  it('shows loading screen before first snapshot', () => {
    renderGamePage();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows jing_reveal screen when phase=jing_reveal', async () => {
    renderGamePage();
    await pushSnapshot(
      makeSnapshot({ phase: 'jing_reveal', jingPrimary: null, jingSecondary: null }),
    );

    await waitFor(() => {
      // The spirit-reveal text appears either in the button or the paragraph
      expect(screen.getAllByText(/reveal spirit|精牌|spirit tile/i).length).toBeGreaterThan(0);
    });
  });

  it('shows game table when phase=playing', async () => {
    renderGamePage();
    await pushSnapshot(makeSnapshot());

    await waitFor(() => {
      expect(screen.getByText(/round|圈/i)).toBeInTheDocument();
    });
  });

  it('Gameplay·snapshot-redaction: viewer hand is accessible, opponent hands are hidden', async () => {
    renderGamePage();
    await pushSnapshot(makeSnapshot()); // viewerSeat=0, hand has 13 tiles

    await waitFor(() => {
      // Viewer's tiles are exposed via sr-only AccessibleHand buttons
      const tiles = screen.getAllByRole('button', { name: /character|bamboo|dot|wind|dragon/i });
      // Viewer has 13 tiles in makeSnapshot — exactly 13 accessible buttons
      expect(tiles.length).toBe(13);
    });

    // Opponent tiles are rendered only in the 3D canvas (aria-hidden) — no DOM buttons
    const allTileButtons = screen.queryAllByRole('button', {
      name: /character|bamboo|dot|wind|dragon/i,
    });
    expect(allTileButtons.length).toBe(13);
  });

  it('Gameplay·snapshot-redaction: spectator sees no player hands as buttons', async () => {
    renderGamePage();
    const spectatorSnap = makeSnapshot({ viewerSeat: null });
    spectatorSnap.seats.forEach((s) => {
      s.hand = null;
    });
    await pushSnapshot(spectatorSnap);

    await waitFor(() => {
      expect(screen.getByText(/round|圈/i)).toBeInTheDocument();
    });

    // No clickable tile buttons (spectator has no hand)
    const buttons = screen.queryAllByRole('button', { name: /character|bamboo|dot/i });
    expect(buttons).toHaveLength(0);
  });

  it('discard flow: selecting + re-tapping a tile emits game:discard', async () => {
    renderGamePage();
    await pushSnapshot(makeSnapshot()); // currentSeat=0, viewerSeat=0

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /1 character|1萬/i }).length).toBeGreaterThan(0);
    });

    const tile = screen.getAllByRole('button', { name: /1 character|1萬/i })[0];

    // First tap → selects (no emit yet)
    fireEvent.click(tile);
    expect(mockEmit).not.toHaveBeenCalledWith('game:discard', expect.anything());

    // Second tap → discard
    fireEvent.click(tile);
    expect(mockEmit).toHaveBeenCalledWith('game:discard', { tile: '1m' });
  });

  it('Gameplay·reconnect: reconnecting overlay appears after ~1.5s disconnect', async () => {
    renderGamePage();
    // Push snapshot with real timers (pushSnapshot uses waitFor internally)
    await pushSnapshot(makeSnapshot());
    await waitFor(() => expect(screen.getByText(/round|圈/i)).toBeInTheDocument());

    // Switch to fake timers AFTER async setup is complete
    vi.useFakeTimers();

    // Simulate disconnect
    act(() => {
      registeredHandlers.get('disconnect')?.(undefined);
    });

    // Before 1.5s — overlay should NOT appear
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText(/reconnecting/i)).toBeNull();

    // After 1.5s — overlay SHOULD appear (role=alert set on ReconnectingOverlay)
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('claim window shows Pung/Pass buttons when claimWindow is received', async () => {
    renderGamePage();
    await pushSnapshot(makeSnapshot({ phase: 'awaiting_claims' }));

    await waitFor(() => expect(screen.getByText(/round|圈/i)).toBeInTheDocument());

    await act(async () => {
      registeredHandlers.get('game:claim-window')?.({
        actions: [{ kind: 'pung' }],
        deadline: Date.now() + 8000,
      });
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /pung|碰/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /pass|过/i })).toBeInTheDocument();
    });
  });

  it('clicking Pass emits game:pass', async () => {
    renderGamePage();
    await pushSnapshot(makeSnapshot({ phase: 'awaiting_claims' }));
    await waitFor(() => expect(screen.getByText(/round|圈/i)).toBeInTheDocument());

    await act(async () => {
      registeredHandlers.get('game:claim-window')?.({
        actions: [{ kind: 'pung' }],
        deadline: Date.now() + 8000,
      });
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /pass|过/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /pass|过/i }));
    expect(mockEmit).toHaveBeenCalledWith('game:pass', {});
  });

  // ── BUG-2D-06: back-button intercept ───────────────────────────────────────

  it('Gameplay·back-intercept: leave sheet appears when blocker is blocked', async () => {
    // Simulate the blocker firing (navigation was attempted and intercepted).
    mockBlocker.state = 'blocked';

    renderGamePage();
    await pushSnapshot(makeSnapshot({ phase: 'playing' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /leave game/i })).toBeInTheDocument();
    });

    // Reset blocker state for subsequent tests
    mockBlocker.state = 'unblocked';
  });

  it('Gameplay·back-intercept: confirming leave calls proceed() and clears localStorage', async () => {
    localStorage.setItem('mj:active-game', 'game-test');
    mockBlocker.state = 'blocked';

    renderGamePage();
    await pushSnapshot(makeSnapshot({ phase: 'playing' }));

    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: /leave game/i })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /^leave$/i }));

    expect(mockBlockerProceed).toHaveBeenCalledOnce();
    expect(localStorage.getItem('mj:active-game')).toBeNull();

    mockBlocker.state = 'unblocked';
  });

  it('Gameplay·back-intercept: cancelling leave calls reset() and keeps the player in-game', async () => {
    mockBlocker.state = 'blocked';

    renderGamePage();
    await pushSnapshot(makeSnapshot({ phase: 'playing' }));

    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: /leave game/i })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /stay in game/i }));

    expect(mockBlockerReset).toHaveBeenCalledOnce();
    expect(mockBlockerProceed).not.toHaveBeenCalled();

    mockBlocker.state = 'unblocked';
  });
});

// ── MahjongTile unit tests ─────────────────────────────────────────────────────

describe('MahjongTile', () => {
  it('renders with correct aria-label from tile-map (EN)', () => {
    render(
      <MemoryRouter>
        <MahjongTile tile="1m" size="md" />
      </MemoryRouter>,
    );
    // aria-label is set from tileAriaLabel (lang='en' fallback in test env)
    expect(screen.getByLabelText(/1 character/i)).toBeInTheDocument();
  });

  it('renders face-down tile with aria-hidden content', () => {
    const { container } = render(
      <MemoryRouter>
        <MahjongTile tile="1m" faceDown size="md" />
      </MemoryRouter>,
    );
    // The tile itself still has the aria-label (screen readers know what's under it)
    expect(container.querySelector('[aria-label]')).toBeInTheDocument();
  });

  it('fires onClick when clicked', () => {
    const handleClick = vi.fn();
    render(
      <MemoryRouter>
        <MahjongTile tile="east" size="md" onClick={handleClick} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /east wind/i }));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('has role=button with aria-pressed when onClick provided', () => {
    render(
      <MemoryRouter>
        <MahjongTile tile="zhong" size="md" onClick={() => undefined} selected />
      </MemoryRouter>,
    );
    const btn = screen.getByRole('button', { name: /red dragon/i });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('data-tile attribute reflects design tile id', () => {
    const { container } = render(
      <MemoryRouter>
        <MahjongTile tile="1m" size="md" />
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-tile="c1"]')).toBeInTheDocument();
  });
});
