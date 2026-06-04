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
    { seatIdx: 0, userId: 'u1', handle: 'h1', displayName: 'P1', ready: false, isHost: true },
    { seatIdx: 1, userId: null, handle: null, displayName: null, ready: false, isHost: false },
    { seatIdx: 2, userId: null, handle: null, displayName: null, ready: false, isHost: false },
    { seatIdx: 3, userId: null, handle: null, displayName: null, ready: false, isHost: false },
  ],
  settings: {
    rounds: 'east+south',
    terminationType: 'rounds',
    startingScore: 0,
    timerSecs: 30,
    minFan: 1,
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
