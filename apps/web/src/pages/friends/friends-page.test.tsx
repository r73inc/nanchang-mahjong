import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../../i18n';
import { FriendsPage } from './friends-page';
import type { FriendWithProfile, SearchResult } from '../../hooks/use-friends';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSendRequest = vi.fn();
const mockAcceptRequest = vi.fn();
const mockDeclineRequest = vi.fn();
const mockRemoveFriend = vi.fn();

vi.mock('../../hooks/use-friends', () => ({
  useFriends: vi.fn(),
  useSearchUsers: vi.fn(),
  useSendRequest: vi.fn(),
  useAcceptRequest: vi.fn(),
  useDeclineRequest: vi.fn(),
  useRemoveFriend: vi.fn(),
}));

import {
  useFriends,
  useSearchUsers,
  useSendRequest,
  useAcceptRequest,
  useDeclineRequest,
  useRemoveFriend,
} from '../../hooks/use-friends';

const mockUseFriends = vi.mocked(useFriends);
const mockUseSearchUsers = vi.mocked(useSearchUsers);
const mockUseSendRequest = vi.mocked(useSendRequest);
const mockUseAcceptRequest = vi.mocked(useAcceptRequest);
const mockUseDeclineRequest = vi.mocked(useDeclineRequest);
const mockUseRemoveFriend = vi.mocked(useRemoveFriend);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const acceptedFriend: FriendWithProfile = {
  friendSub: 'bob-sub',
  handle: 'bob',
  displayName: 'Bob',
  status: 'accepted',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const incomingFriend: FriendWithProfile = {
  friendSub: 'charlie-sub',
  handle: 'charlie',
  displayName: 'Charlie',
  status: 'pending_received',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const outgoingFriend: FriendWithProfile = {
  friendSub: 'diana-sub',
  handle: 'diana',
  displayName: 'Diana',
  status: 'pending_sent',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const searchResultNoFriend: SearchResult = {
  sub: 'eve-sub',
  handle: 'eve',
  displayName: 'Eve',
  friendStatus: null,
};

const searchResultAlreadyFriend: SearchResult = {
  sub: 'bob-sub',
  handle: 'bob',
  displayName: 'Bob',
  friendStatus: 'accepted',
};

// ── Render helper ─────────────────────────────────────────────────────────────

function renderFriendsPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <MemoryRouter initialEntries={['/friends']}>
          <Routes>
            <Route path="/home" element={<div>Home</div>} />
            <Route path="/friends" element={<FriendsPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

function setupDefaultMocks() {
  mockUseFriends.mockReturnValue({ data: [acceptedFriend], isLoading: false } as never);
  mockUseSearchUsers.mockReturnValue({ data: undefined, isFetching: false } as never);
  mockUseSendRequest.mockReturnValue({
    mutate: mockSendRequest,
    isPending: false,
    variables: undefined,
  } as never);
  mockUseAcceptRequest.mockReturnValue({
    mutate: mockAcceptRequest,
    isPending: false,
    variables: undefined,
  } as never);
  mockUseDeclineRequest.mockReturnValue({
    mutate: mockDeclineRequest,
    isPending: false,
    variables: undefined,
  } as never);
  mockUseRemoveFriend.mockReturnValue({
    mutate: mockRemoveFriend,
    isPending: false,
    variables: undefined,
  } as never);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FriendsPage — friends list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('renders accepted friends', () => {
    renderFriendsPage();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('@bob')).toBeInTheDocument();
  });

  it('shows empty state when no friends', () => {
    mockUseFriends.mockReturnValue({ data: [], isLoading: false } as never);
    renderFriendsPage();
    expect(screen.getByText('No friends yet.')).toBeInTheDocument();
  });

  it('shows loading spinner while fetching', () => {
    mockUseFriends.mockReturnValue({ data: undefined, isLoading: true } as never);
    renderFriendsPage();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
  });

  it('shows Remove button for accepted friend', () => {
    renderFriendsPage();
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
  });

  it('calls removeFriend when Remove is clicked', () => {
    renderFriendsPage();
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    expect(mockRemoveFriend).toHaveBeenCalledWith('bob-sub');
  });

  it('shows Accept + Decline buttons for incoming request', () => {
    mockUseFriends.mockReturnValue({ data: [incomingFriend], isLoading: false } as never);
    renderFriendsPage();
    expect(screen.getByText('Incoming')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /decline/i })).toBeInTheDocument();
  });

  it('calls acceptRequest when Accept is clicked', () => {
    mockUseFriends.mockReturnValue({ data: [incomingFriend], isLoading: false } as never);
    renderFriendsPage();
    fireEvent.click(screen.getByRole('button', { name: /accept/i }));
    expect(mockAcceptRequest).toHaveBeenCalledWith('charlie-sub');
  });

  it('calls declineRequest when Decline is clicked', () => {
    mockUseFriends.mockReturnValue({ data: [incomingFriend], isLoading: false } as never);
    renderFriendsPage();
    fireEvent.click(screen.getByRole('button', { name: /decline/i }));
    expect(mockDeclineRequest).toHaveBeenCalledWith('charlie-sub');
  });

  it('shows Pending badge for outgoing sent request (no action buttons)', () => {
    mockUseFriends.mockReturnValue({ data: [outgoingFriend], isLoading: false } as never);
    renderFriendsPage();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /remove|accept|decline/i }),
    ).not.toBeInTheDocument();
  });
});

describe('FriendsPage — search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('shows search results when query is entered', () => {
    mockUseSearchUsers.mockReturnValue({
      data: [searchResultNoFriend],
      isFetching: false,
    } as never);

    renderFriendsPage();
    fireEvent.change(screen.getByPlaceholderText('Search by handle…'), {
      target: { value: 'eve' },
    });

    expect(screen.getByText('Eve')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
  });

  it('calls sendRequest when Add is clicked', () => {
    mockUseSearchUsers.mockReturnValue({
      data: [searchResultNoFriend],
      isFetching: false,
    } as never);

    renderFriendsPage();
    fireEvent.change(screen.getByPlaceholderText('Search by handle…'), {
      target: { value: 'eve' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    expect(mockSendRequest).toHaveBeenCalledWith('eve-sub');
  });

  it('shows no Add button for already-accepted result', () => {
    mockUseSearchUsers.mockReturnValue({
      data: [searchResultAlreadyFriend],
      isFetching: false,
    } as never);

    renderFriendsPage();
    fireEvent.change(screen.getByPlaceholderText('Search by handle…'), {
      target: { value: 'bob' },
    });
    expect(screen.queryByRole('button', { name: /add/i })).not.toBeInTheDocument();
  });

  it('shows no results empty state', () => {
    mockUseSearchUsers.mockReturnValue({ data: [], isFetching: false } as never);
    renderFriendsPage();
    fireEvent.change(screen.getByPlaceholderText('Search by handle…'), {
      target: { value: 'xyz' },
    });
    expect(screen.getByText('No players found.')).toBeInTheDocument();
  });
});
