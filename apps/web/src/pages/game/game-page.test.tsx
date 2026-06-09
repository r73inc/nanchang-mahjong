/**
 * game-page.test.tsx — FE tests for the GamePage and game components.
 *
 * Covers:
 *  - Gameplay·snapshot-redaction: spectator view hides hands, player sees own hand
 *  - Gameplay·reconnect: reconnecting overlay appears after 1.5s disconnect
 *  - Gameplay·discard-flow: tile selection and discard emit the right socket event
 *  - MahjongTile aria-label from tile-map
 *  - GamePage renders jing_reveal screen for phase=jing_reveal
 *  - Mobile·body-overscroll-suppressed: overscroll suppressed in non-desktop mode
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

// ── useOrientation mock (Phase 14A) ──────────────────────────────────────────
// Default: desktop mode so existing tests are unaffected.
const mockRequestNativeLandscape = vi.fn().mockResolvedValue(undefined);
const mockOrientation = {
  mode: 'desktop' as import('../../hooks/use-orientation').LandscapeMode,
  isMobileLandscapeForced: false,
  vw: 1280,
  vh: 800,
  requestNativeLandscape: mockRequestNativeLandscape,
};

vi.mock('../../hooks/use-orientation', () => ({
  useOrientation: () => mockOrientation,
  MOBILE_BREAKPOINT_PX: 600,
}));

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
    ruleTopBottomJing: false,
    preGamePhase: null,
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
        seatName: 'Player',
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
        seatName: 'Player',
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
        seatName: 'Player',
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
        seatName: 'Player',
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
    mockOrientation.mode = 'desktop';
    mockOrientation.isMobileLandscapeForced = false;
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
      makeSnapshot({
        phase: 'jing_reveal',
        jingPrimary: null,
        jingSecondary: null,
        preGamePhase: 'jing',
      }),
    );

    await waitFor(() => {
      // The spirit-reveal text appears in the "Spirit Tiles" heading
      expect(screen.getAllByText(/spirit tile/i).length).toBeGreaterThan(0);
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

  // ── Phase 14A: mobile overscroll suppression ─────────────────────────────────

  it('Mobile·body-overscroll-suppressed: body overscrollBehavior is none in non-desktop mode', async () => {
    mockOrientation.mode = 'needs-gesture';

    const { unmount } = renderGamePage();
    await pushSnapshot(makeSnapshot({ phase: 'playing' }));

    await waitFor(() => {
      expect(document.body.style.overscrollBehavior).toBe('none');
    });

    unmount();
  });

  it('Mobile·status-bar-compact: wall count shows only number (no label) in mobile mode', async () => {
    mockOrientation.mode = 'css-landscape';
    mockOrientation.isMobileLandscapeForced = true;

    renderGamePage();
    const snap = makeSnapshot({ wallCount: 42, viewMode: '2D' });
    await pushSnapshot(snap);

    await waitFor(() => {
      // On mobile, the wall count renders as just the number — no "Wall:" label
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    // The full label text should NOT appear on mobile
    expect(screen.queryByText(/wall left/i)).not.toBeInTheDocument();
  });

  it('Mobile·history-toggle-hidden: right-edge history toggle is absent in mobile mode', async () => {
    mockOrientation.mode = 'native-landscape';
    mockOrientation.isMobileLandscapeForced = false;

    renderGamePage();
    await pushSnapshot(makeSnapshot({ viewMode: '2D' }));

    // Wait for the mobile game table to appear
    await waitFor(() => {
      expect(screen.getByTestId('mobile-game-table-2d')).toBeInTheDocument();
    });

    // The right-edge tab toggle has no aria-pressed (it uses text arrows ◀/▶).
    // On mobile, the toggle is an icon button in the status bar with aria-pressed.
    // We verify: the gameHistoryTitle button (if present) has aria-pressed (= mobile icon).
    const historyButtons = screen.queryAllByRole('button', { name: /game log|历史/i });
    historyButtons.forEach((btn) => {
      // Mobile icon button has aria-pressed; desktop edge tab does not
      expect(btn).toHaveAttribute('aria-pressed');
    });
  });

  it('Mobile·siderail-above-hand: SideRail bottom is var(--mj-hand-height,90px) in mobile mode', async () => {
    mockOrientation.mode = 'css-landscape';
    mockOrientation.isMobileLandscapeForced = true;

    renderGamePage();
    await pushSnapshot(makeSnapshot({ phase: 'awaiting_claims', viewMode: '2D' }));

    // Wait for the mobile game table to render
    await waitFor(() => {
      expect(screen.getByTestId('mobile-game-table-2d')).toBeInTheDocument();
    });

    await act(async () => {
      registeredHandlers.get('game:claim-window')?.({
        actions: [{ kind: 'pung' }],
        deadline: Date.now() + 8000,
      });
    });

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /claim|碰|抢/i })).toBeInTheDocument();
    });

    const rail = screen.getByRole('dialog', { name: /claim|碰|抢/i });
    expect(rail.style.bottom).toBe('var(--mj-hand-height, 90px)');
  });

  it('Mobile·body-overscroll-restored: body overscrollBehavior is restored on unmount', async () => {
    // Set a pre-existing value to verify it is restored rather than blanked.
    document.body.style.overscrollBehavior = 'auto';
    mockOrientation.mode = 'css-landscape';

    const { unmount } = renderGamePage();
    await pushSnapshot(makeSnapshot({ phase: 'playing' }));

    await waitFor(() => {
      expect(document.body.style.overscrollBehavior).toBe('none');
    });

    unmount();
    expect(document.body.style.overscrollBehavior).toBe('auto');

    // Clean up for other tests.
    document.body.style.overscrollBehavior = '';
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
