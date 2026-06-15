import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RoomPage } from './room-page';
import { useRoomStore } from '../../stores/room.store';
import type { RoomState } from '@nanchang/shared';
import * as socketLib from '../../lib/socket';
import * as apiModule from '../../lib/api';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../lib/socket', () => ({
  connectSocket: vi.fn().mockReturnValue({}),
  getSocket: vi.fn(() => {
    throw new Error('socket not initialised in test');
  }),
  disconnectSocket: vi.fn(),
}));

vi.mock('../../stores/auth.store', () => ({
  useAuthStore: vi.fn(
    (sel: (s: { user: { sub: string } | null; accessToken: string | null }) => unknown) =>
      sel({ user: { sub: 'user-host' }, accessToken: 'tok' }),
  ),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const HOST_ROOM: RoomState = {
  roomId: 'room-1',
  code: 'AB-1234',
  hostUserId: 'user-host',
  status: 'waiting',
  seats: [
    {
      seatIdx: 0,
      userId: 'user-host',
      handle: 'host',
      ready: false,
      isHost: true,
    },
    { seatIdx: 1, userId: null, handle: null, ready: false, isHost: false },
    { seatIdx: 2, userId: null, handle: null, ready: false, isHost: false },
    { seatIdx: 3, userId: null, handle: null, ready: false, isHost: false },
  ],
  settings: {
    rounds: 'east+south',
    terminationType: 'rounds',
    startingScore: 0,
    timerSecs: 30,
    viewMode: '3D',
    ruleTopBottomJing: false,
    claimWindowSecs: 8,
  },
  createdAt: '2024-01-01T00:00:00.000Z',
};

function mkQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderRoom(room: RoomState | null = HOST_ROOM) {
  const store = useRoomStore.getState();
  store.clearRoom();
  if (room) store.setRoom(room);

  // Always stub GET so the useEffect fetch (when room=null) resolves cleanly
  vi.spyOn(apiModule.api, 'get').mockRejectedValue({
    response: { data: { message: 'Room not found' } },
  });

  return render(
    <QueryClientProvider client={mkQC()}>
      <MemoryRouter initialEntries={['/room/AB-1234']}>
        <Routes>
          <Route path="/room/:code" element={<RoomPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RoomPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(socketLib, 'getSocket').mockImplementation(() => {
      throw new Error('socket not initialised');
    });
    useRoomStore.getState().clearRoom();
  });

  it('renders the room code', () => {
    renderRoom();
    expect(screen.getByText('AB-1234')).toBeInTheDocument();
  });

  it('Room·create-join-leave: shows 1/4 players with host', () => {
    renderRoom();
    expect(screen.getByText(/1 \/ 4/)).toBeInTheDocument();
  });

  it('shows waiting spinner when only 1 seat is filled', () => {
    renderRoom();
    expect(screen.getByText(/waiting for players/i)).toBeInTheDocument();
  });

  it('Room·host-leaves: Start button is disabled when not all ready', () => {
    renderRoom();
    // When !allReady the button text is "Waiting… N not ready", not "Start Match"
    // getByRole only searches for buttons, so this won't collide with seat "Waiting…" text
    const startBtn = screen.queryByRole('button', { name: /start match/i });
    if (startBtn) {
      // Already-ready path (allReady=true)
      expect(startBtn).toHaveAttribute('aria-disabled', 'true');
    } else {
      // Button has dynamic "Waiting…" label instead
      expect(screen.getByRole('button', { name: /waiting/i })).toBeInTheDocument();
    }
  });

  it('Room·full: Start button enabled when all 4 players ready', () => {
    const fullReadyRoom: RoomState = {
      ...HOST_ROOM,
      seats: [0, 1, 2, 3].map((n) => ({
        seatIdx: n,
        userId: `user-${n}`,
        handle: `h${n}`,
        ready: true,
        isHost: n === 0,
      })),
    };
    renderRoom(fullReadyRoom);

    const startBtn = screen.getByRole('button', { name: /start match/i });
    expect(startBtn.getAttribute('aria-disabled')).not.toBe('true');
  });

  it('navigates to /game/:id when start succeeds', async () => {
    const fullReadyRoom: RoomState = {
      ...HOST_ROOM,
      seats: [0, 1, 2, 3].map((n) => ({
        seatIdx: n,
        userId: `user-${n}`,
        handle: `h${n}`,
        ready: true,
        isHost: n === 0,
      })),
    };
    vi.spyOn(apiModule.api, 'post').mockResolvedValue({
      data: { roomId: 'room-1', gameId: 'game-abc' },
    });

    renderRoom(fullReadyRoom);

    const startBtn = screen.getByRole('button', { name: /start match/i });

    await act(async () => {
      fireEvent.click(startBtn);
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/game/game-abc');
    });
  });

  it('shows error state when API call fails and no room in store', async () => {
    // api.get is already mocked to reject in renderRoom(null).
    // The mock throws a plain Error (not a real AxiosError) so getApiErrorMessage
    // returns its fallback "Something went wrong."
    renderRoom(null);

    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
  });
});
