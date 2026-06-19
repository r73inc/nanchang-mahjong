import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LobbyPage } from './lobby-page';
import type { RoomState } from '@nanchang/shared';
import * as apiModule from '../../lib/api';
import * as socket from '../../lib/socket';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../lib/socket', () => ({
  connectSocket: vi.fn().mockReturnValue({}),
  getSocket: vi.fn(),
  disconnectSocket: vi.fn(),
}));

vi.mock('../../stores/auth.store', () => ({
  useAuthStore: vi.fn((sel: (s: { user: null; accessToken: string }) => unknown) =>
    sel({ user: null, accessToken: 'tok' }),
  ),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const SAMPLE_ROOM: RoomState = {
  roomId: 'r1',
  code: 'AB-1234',
  hostUserId: 'u1',
  status: 'waiting',
  seats: [
    { seatIdx: 0, userId: 'u1', handle: 'h1', ready: false, isHost: true },
    { seatIdx: 1, userId: null, handle: null, ready: false, isHost: false },
    { seatIdx: 2, userId: null, handle: null, ready: false, isHost: false },
    { seatIdx: 3, userId: null, handle: null, ready: false, isHost: false },
  ],
  settings: {
    rounds: 'east+south',
    terminationType: 'rounds',
    maxHands: 1,
    startingScore: 0,
    timerSecs: 30,
    viewMode: '3D',
    ruleTopBottomJing: false,
    claimWindowSecs: 8,
    isSolo: false,
  },
  createdAt: '2024-01-01T00:00:00.000Z',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function mkQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderLobby() {
  return render(
    <QueryClientProvider client={mkQC()}>
      <MemoryRouter>
        <LobbyPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LobbyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(socket, 'connectSocket').mockReturnValue(
      {} as ReturnType<typeof socket.connectSocket>,
    );
  });

  it('Room·create-join-leave: create navigates to /room/:code', async () => {
    vi.spyOn(apiModule.api, 'post').mockResolvedValue({ data: SAMPLE_ROOM });
    renderLobby();

    // "Create a Room" button text from en.json createRoom key
    fireEvent.click(screen.getByRole('button', { name: /create a room/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/room/AB-1234');
    });
  });

  it('shows join code input when Join is clicked', () => {
    renderLobby();
    // First "Join a Room" button in the page
    fireEvent.click(screen.getAllByRole('button', { name: /join a room/i })[0]);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('join navigates to /room/:code when code is valid', async () => {
    vi.spyOn(apiModule.api, 'post').mockResolvedValue({ data: SAMPLE_ROOM });
    renderLobby();

    // Open the join input
    fireEvent.click(screen.getAllByRole('button', { name: /join a room/i })[0]);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'AB-1234' } });

    // Click the now-visible "Join a Room" submit button
    fireEvent.click(screen.getByRole('button', { name: /join a room/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/room/AB-1234');
    });
  });

  // ── BUG-2D-06: rejoin card ────────────────────────────────────────────────

  it('Lobby·rejoin-card: shows rejoin card when an active game is stored in localStorage', () => {
    localStorage.setItem('mj:active-game', 'game-abc123');
    renderLobby();
    expect(screen.getByTestId('rejoin-card')).toBeInTheDocument();
    expect(screen.getByText(/game in progress/i)).toBeInTheDocument();
  });

  it('Lobby·rejoin-navigate: clicking Rejoin navigates to /game/:id', () => {
    localStorage.setItem('mj:active-game', 'game-abc123');
    renderLobby();
    fireEvent.click(screen.getByRole('button', { name: /rejoin game/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/game/game-abc123');
  });

  it('Lobby·rejoin-dismiss: clicking Dismiss hides the card and clears localStorage', () => {
    localStorage.setItem('mj:active-game', 'game-abc123');
    renderLobby();
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByTestId('rejoin-card')).not.toBeInTheDocument();
    expect(localStorage.getItem('mj:active-game')).toBeNull();
  });

  it('Lobby·rejoin-absent: no rejoin card when no game is stored', () => {
    renderLobby();
    expect(screen.queryByTestId('rejoin-card')).not.toBeInTheDocument();
  });

  it('shows error message on API failure', async () => {
    // The mock rejection is not a real AxiosError so getApiErrorMessage returns the fallback
    vi.spyOn(apiModule.api, 'post').mockRejectedValue(new Error('Network error'));

    renderLobby();
    fireEvent.click(screen.getByRole('button', { name: /create a room/i }));

    // Fallback error copy shown when API call fails
    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
  });
});
