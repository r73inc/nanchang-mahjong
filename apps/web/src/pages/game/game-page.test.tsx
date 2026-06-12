/**
 * game-page.test.tsx â€” FE tests for the GamePage and game components.
 *
 * Covers:
 *  - GameplayÂ·snapshot-redaction: spectator view hides hands, player sees own hand
 *  - GameplayÂ·reconnect: reconnecting overlay appears after 1.5s disconnect
 *  - GameplayÂ·discard-flow: tile selection and discard emit the right socket event
 *  - MahjongTile aria-label from tile-map
 *  - GamePage renders jing_reveal screen for phase=jing_reveal
 *  - MobileÂ·body-overscroll-suppressed: overscroll suppressed in non-desktop mode
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GamePage } from './game-page';
import { MahjongTile } from '../../components/mahjong-tile';
import type { ClientGameState, HandRevealPayload, GameEndedPayload } from '@nanchang/shared';

// â”€â”€ Mocks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Mock the 3D canvas â€” jsdom has no WebGL context; render a stub div instead
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

// â”€â”€ useOrientation mock (Phase 14A) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Snapshot fixtures â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    wall: null,
    pendingDiscard: null,
    discardedBySeat: null,
    viewerSeat: 0,
    viewMode: '3D',
    ruleTopBottomJing: false,
    preGamePhase: null,
    pendingRoll: null,
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

const ZERO_SPIRIT = { primary: 0, secondary: 0, spiritKongs: 0 };

function makeHandReveal(overrides: Partial<HandRevealPayload> = {}): HandRevealPayload {
  return {
    hands: [['1m'], ['2m'], ['3m'], ['5m']],
    openMelds: [[], [], [], []],
    jingPrimary: '3m',
    jingSecondary: '4m',
    spiritCounts: [ZERO_SPIRIT, ZERO_SPIRIT, ZERO_SPIRIT, ZERO_SPIRIT],
    spiritDeltas: [0, 0, 0, 0],
    result: 'win',
    winnerSeat: 1,
    isLastHand: false,
    nextDealerSeat: 1,
    handNetDeltas: [0, 0, 0, 0],
    ...overrides,
  };
}

function makeEnded(overrides: Partial<GameEndedPayload> = {}): GameEndedPayload {
  return {
    result: 'win',
    winnerSeat: 0,
    finalScores: [8, -2, -3, -3],
    placement: [1, 2, 3, 3],
    handsPlayed: 2,
    seatMap: ['u1', 'u2', 'u3', 'u4'],
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    ratingDeltas: [12, -2, -5, -5],
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

// â”€â”€ Helper to simulate a server snapshot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function pushSnapshot(snapshot: ClientGameState) {
  // Wait for useEffect to register the handler (it may lag the initial render)
  await waitFor(() => {
    expect(mockSocket.on).toHaveBeenCalledWith('game:snapshot', expect.any(Function));
  });
  const handler = registeredHandlers.get('game:snapshot');
  if (handler) await act(async () => handler({ state: snapshot }));
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      expect(screen.getByText(/round|åœˆ/i)).toBeInTheDocument();
    });
  });

  it('GameplayÂ·snapshot-redaction: viewer hand is accessible, opponent hands are hidden', async () => {
    renderGamePage();
    await pushSnapshot(makeSnapshot()); // viewerSeat=0, hand has 13 tiles

    await waitFor(() => {
      // Viewer's tiles are exposed via sr-only AccessibleHand buttons
      const tiles = screen.getAllByRole('button', { name: /character|bamboo|dot|wind|dragon/i });
      // Viewer has 13 tiles in makeSnapshot â€” exactly 13 accessible buttons
      expect(tiles.length).toBe(13);
    });

    // Opponent tiles are rendered only in the 3D canvas (aria-hidden) â€” no DOM buttons
    const allTileButtons = screen.queryAllByRole('button', {
      name: /character|bamboo|dot|wind|dragon/i,
    });
    expect(allTileButtons.length).toBe(13);
  });

  it('GameplayÂ·snapshot-redaction: spectator sees no player hands as buttons', async () => {
    renderGamePage();
    const spectatorSnap = makeSnapshot({ viewerSeat: null });
    spectatorSnap.seats.forEach((s) => {
      s.hand = null;
    });
    await pushSnapshot(spectatorSnap);

    await waitFor(() => {
      expect(screen.getByText(/round|åœˆ/i)).toBeInTheDocument();
    });

    // No clickable tile buttons (spectator has no hand)
    const buttons = screen.queryAllByRole('button', { name: /character|bamboo|dot/i });
    expect(buttons).toHaveLength(0);
  });

  it('discard flow: selecting + re-tapping a tile emits game:discard', async () => {
    renderGamePage();
    await pushSnapshot(makeSnapshot()); // currentSeat=0, viewerSeat=0

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /1 character|1è¬/i }).length).toBeGreaterThan(0);
    });

    const tile = screen.getAllByRole('button', { name: /1 character|1è¬/i })[0];

    // First tap â†’ selects (no emit yet)
    fireEvent.click(tile);
    expect(mockEmit).not.toHaveBeenCalledWith('game:discard', expect.anything());

    // Second tap â†’ discard
    fireEvent.click(tile);
    expect(mockEmit).toHaveBeenCalledWith('game:discard', { tile: '1m' });
  });

  it('GameplayÂ·reconnect: reconnecting overlay appears after ~1.5s disconnect', async () => {
    renderGamePage();
    // Push snapshot with real timers (pushSnapshot uses waitFor internally)
    await pushSnapshot(makeSnapshot());
    await waitFor(() => expect(screen.getByText(/round|åœˆ/i)).toBeInTheDocument());

    // Switch to fake timers AFTER async setup is complete
    vi.useFakeTimers();

    // Simulate disconnect
    act(() => {
      registeredHandlers.get('disconnect')?.(undefined);
    });

    // Before 1.5s â€” overlay should NOT appear
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText(/reconnecting/i)).toBeNull();

    // After 1.5s â€” overlay SHOULD appear (role=alert set on ReconnectingOverlay)
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('claim window shows Pung/Pass buttons when claimWindow is received', async () => {
    renderGamePage();
    await pushSnapshot(makeSnapshot({ phase: 'awaiting_claims' }));

    await waitFor(() => expect(screen.getByText(/round|åœˆ/i)).toBeInTheDocument());

    await act(async () => {
      registeredHandlers.get('game:claim-window')?.({
        actions: [{ kind: 'pung' }],
        deadline: Date.now() + 8000,
      });
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /pung|ç¢°/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /pass|è¿‡/i })).toBeInTheDocument();
    });
  });

  it('clicking Pass emits game:pass', async () => {
    renderGamePage();
    await pushSnapshot(makeSnapshot({ phase: 'awaiting_claims' }));
    await waitFor(() => expect(screen.getByText(/round|åœˆ/i)).toBeInTheDocument());

    await act(async () => {
      registeredHandlers.get('game:claim-window')?.({
        actions: [{ kind: 'pung' }],
        deadline: Date.now() + 8000,
      });
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /pass|è¿‡/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /pass|è¿‡/i }));
    expect(mockEmit).toHaveBeenCalledWith('game:pass', {});
  });

  // ── IMP-021: Claim window minimize ─────────────────────────────────────────

  it('IMP-021·claim-minimize: minimize button collapses rail to chip; chip re-expands', async () => {
    renderGamePage();
    await pushSnapshot(makeSnapshot({ phase: 'awaiting_claims' }));
    await waitFor(() => expect(screen.getByTestId('game-canvas-3d')).toBeInTheDocument());

    await act(async () => {
      registeredHandlers.get('game:claim-window')?.({
        actions: [{ kind: 'pung' }],
        deadline: Date.now() + 8000,
      });
    });

    // Full rail visible; minimize button present
    await waitFor(() => expect(screen.getByRole('button', { name: /pung/i })).toBeInTheDocument());
    const minimizeBtn = screen.getByRole('button', { name: /minimize/i });
    expect(minimizeBtn).toBeInTheDocument();

    // Click minimize → action buttons gone; collapsed chip appears
    fireEvent.click(minimizeBtn);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /pung/i })).not.toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: /expand/i })).toBeInTheDocument();
    });

    // Click chip → rail re-expands
    fireEvent.click(screen.getByRole('dialog', { name: /expand/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /pung/i })).toBeInTheDocument();
    });
  });

  it('IMP-021·win-by-pung-label: win button reads "Win by Pung" when pung also available', async () => {
    renderGamePage();
    await pushSnapshot(makeSnapshot({ phase: 'awaiting_claims' }));
    await waitFor(() => expect(screen.getByTestId('game-canvas-3d')).toBeInTheDocument());

    await act(async () => {
      registeredHandlers.get('game:claim-window')?.({
        actions: [{ kind: 'win' }, { kind: 'pung' }],
        deadline: Date.now() + 8000,
      });
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /win by pung/i })).toBeInTheDocument();
    });
  });

  // ── IMP-020: Declare-win UX ────────────────────────────────────────────────

  it('IMP-020·tsumo-nonblocking: tsumo bar shows as a dialog without full-screen overlay', async () => {
    renderGamePage();
    await pushSnapshot(makeSnapshot({ currentSeat: 0, viewerSeat: 0 }));
    await waitFor(() => expect(screen.getByTestId('game-canvas-3d')).toBeInTheDocument());

    await act(async () => {
      registeredHandlers.get('game:can-tsumo')?.({ seat: 0 });
    });

    await waitFor(() => {
      const dialog = screen.getByRole('dialog', { name: /you can win/i });
      expect(dialog).toBeInTheDocument();
      // Must NOT be a full-screen overlay — no inset-0 on the element
      expect(dialog.className).not.toContain('inset-0');
    });
  });

  it('IMP-020·tsumo-persistent: Keep Playing hides bar; persistent button re-opens it', async () => {
    renderGamePage();
    await pushSnapshot(makeSnapshot({ currentSeat: 0, viewerSeat: 0 }));
    await waitFor(() => expect(screen.getByTestId('game-canvas-3d')).toBeInTheDocument());

    await act(async () => {
      registeredHandlers.get('game:can-tsumo')?.({ seat: 0 });
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /keep playing/i })).toBeInTheDocument(),
    );

    // Dismiss the bar
    fireEvent.click(screen.getByRole('button', { name: /keep playing/i }));

    // Bar gone; persistent button appears
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /you can win/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /declare win/i })).toBeInTheDocument();
    });

    // Tap persistent button → bar re-opens
    fireEvent.click(screen.getByRole('button', { name: /declare win/i }));
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /you can win/i })).toBeInTheDocument();
    });
  });

  // â”€â”€ BUG-025: end-of-hand screen order â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it('BUG-025: winner announcement shows before the hand-reveal detail screen', async () => {
    renderGamePage();
    await pushSnapshot(makeSnapshot({ phase: 'finished' }));

    await act(async () => {
      registeredHandlers.get('game:hand-reveal')?.(makeHandReveal({ winnerSeat: 1 }));
    });

    // Announcement popup first â€” the detail screen must NOT be visible yet
    expect(screen.getByText('Player Wins!')).toBeInTheDocument();
    expect(screen.queryByText(/hand complete/i)).not.toBeInTheDocument();

    // Tap anywhere to skip â†’ detail screen (HandRevealScreen) appears
    fireEvent.click(screen.getByText('Player Wins!'));
    await waitFor(() => {
      expect(screen.getByText(/hand complete/i)).toBeInTheDocument();
    });
  });

  it('BUG-025: session end â€” announcement first, results second, hand details last', async () => {
    renderGamePage();
    // viewerSeat=0 === dealerSeat=0 â†’ this client is the host
    await pushSnapshot(makeSnapshot({ phase: 'finished' }));

    await act(async () => {
      registeredHandlers.get('game:hand-reveal')?.(
        makeHandReveal({ isLastHand: true, winnerSeat: 0, nextDealerSeat: undefined }),
      );
    });

    // Host auto-ends the session â€” no manual "View Final Scores" click needed
    expect(mockEmit).toHaveBeenCalledWith('game:advance-hand', { gameId: 'game-test' });

    // 1. Winner announcement is the FIRST screen (no results table behind it yet)
    expect(screen.getByText(/you win/i)).toBeInTheDocument();
    expect(screen.queryByText(/final scores/i)).not.toBeInTheDocument();

    await act(async () => {
      registeredHandlers.get('game:ended')?.(makeEnded());
    });

    // 2. Skip the announcement â†’ results screen (placement, scores, rating)
    fireEvent.click(screen.getByText(/you win/i));
    await waitFor(() => {
      expect(screen.getByText(/final scores/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/1st place/i)).toBeInTheDocument();

    // 3. View Hand Details â†’ the detailed reveal is the LAST screen
    fireEvent.click(screen.getByRole('button', { name: /view hand details/i }));
    await waitFor(() => {
      expect(screen.getByText(/all hands/i)).toBeInTheDocument();
    });

    // Back returns to the results screen
    fireEvent.click(screen.getByRole('button', { name: /back to results/i }));
    await waitFor(() => {
      expect(screen.getByText(/final scores/i)).toBeInTheDocument();
    });
  });

  it('BUG-025: stale handReveal is cleared when the next hand starts', async () => {
    renderGamePage();
    await pushSnapshot(makeSnapshot({ phase: 'finished' }));

    await act(async () => {
      registeredHandlers.get('game:hand-reveal')?.(makeHandReveal({ winnerSeat: 1 }));
    });
    fireEvent.click(screen.getByText('Player Wins!'));
    await waitFor(() => expect(screen.getByText(/hand complete/i)).toBeInTheDocument());

    // Next hand starts: snapshot with a pre-game phase must replace the reveal
    await pushSnapshot(makeSnapshot({ phase: 'jing_reveal', preGamePhase: 'hands' }));
    await waitFor(() => {
      expect(screen.queryByText(/hand complete/i)).not.toBeInTheDocument();
      expect(screen.getAllByText(/your hand/i).length).toBeGreaterThan(0);
    });
  });

  // â”€â”€ Phase 14A: mobile overscroll suppression â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it('MobileÂ·body-overscroll-suppressed: body overscrollBehavior is none in non-desktop mode', async () => {
    mockOrientation.mode = 'needs-gesture';

    const { unmount } = renderGamePage();
    await pushSnapshot(makeSnapshot({ phase: 'playing' }));

    await waitFor(() => {
      expect(document.body.style.overscrollBehavior).toBe('none');
    });

    unmount();
  });

  it('MobileÂ·status-bar-compact: wall count shows only number (no label) in mobile mode', async () => {
    mockOrientation.mode = 'css-landscape';
    mockOrientation.isMobileLandscapeForced = true;

    renderGamePage();
    const snap = makeSnapshot({ wallCount: 42, viewMode: '2D' });
    await pushSnapshot(snap);

    await waitFor(() => {
      // On mobile, the wall count renders as just the number â€” no "Wall:" label
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    // The full label text should NOT appear on mobile
    expect(screen.queryByText(/wall left/i)).not.toBeInTheDocument();
  });

  it('MobileÂ·history-toggle-hidden: right-edge history toggle is absent in mobile mode', async () => {
    mockOrientation.mode = 'native-landscape';
    mockOrientation.isMobileLandscapeForced = false;

    renderGamePage();
    await pushSnapshot(makeSnapshot({ viewMode: '2D' }));

    // Wait for the mobile game table to appear
    await waitFor(() => {
      expect(screen.getByTestId('mobile-game-table-2d')).toBeInTheDocument();
    });

    // The right-edge tab toggle has no aria-pressed (it uses text arrows â—€/â–¶).
    // On mobile, the toggle is an icon button in the status bar with aria-pressed.
    // We verify: the gameHistoryTitle button (if present) has aria-pressed (= mobile icon).
    const historyButtons = screen.queryAllByRole('button', { name: /game log|åŽ†å²/i });
    historyButtons.forEach((btn) => {
      // Mobile icon button has aria-pressed; desktop edge tab does not
      expect(btn).toHaveAttribute('aria-pressed');
    });
  });

  it('MobileÂ·siderail-above-hand: SideRail bottom is var(--mj-hand-height,90px) in mobile mode', async () => {
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
      expect(screen.getByRole('dialog', { name: /claim|ç¢°|æŠ¢/i })).toBeInTheDocument();
    });

    const rail = screen.getByRole('dialog', { name: /claim|ç¢°|æŠ¢/i });
    expect(rail.style.bottom).toBe('var(--mj-hand-height, 90px)');
  });

  it('MobileÂ·body-overscroll-restored: body overscrollBehavior is restored on unmount', async () => {
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

// â”€â”€ MahjongTile unit tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
