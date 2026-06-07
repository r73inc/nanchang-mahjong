/**
 * home-stub-page.test.tsx
 *
 * Feature coverage:
 *  - Home·render:      welcome banner and nav shortcuts render for authenticated users
 *  - Home·push:        push toggle shown/hidden based on isSupported, flips on click
 *  - Home·push-denied: denied permission shows static label, toggle hidden
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HomeStubPage } from './home-stub-page';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../../stores/auth.store', () => ({
  useAuthStore: vi.fn(
    (sel: (s: { user: { displayName: string; handle: string; role: string } }) => unknown) =>
      sel({ user: { displayName: 'Ah Mei', handle: 'ahmei', role: 'player' } }),
  ),
}));

vi.mock('../../hooks/use-auth', () => ({
  useSignout: vi.fn(() => vi.fn()),
}));

// Mutable push state — tests mutate individual fields in beforeEach.
const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn();
const mockPushState = {
  isSupported: true,
  permission: 'default' as NotificationPermission,
  isSubscribed: false,
  isLoading: false,
  subscribe: mockSubscribe,
  unsubscribe: mockUnsubscribe,
};

vi.mock('../../hooks/use-push-notifications', () => ({
  usePushNotifications: () => mockPushState,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function mkQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderHome() {
  return render(
    <QueryClientProvider client={mkQC()}>
      <MemoryRouter>
        <HomeStubPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Find the push toggle button by its data-testid. */
function getPushToggle() {
  return screen.queryByTestId('push-toggle') as HTMLButtonElement | null;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HomeStubPage · Home·render', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mockPushState, {
      isSupported: true,
      permission: 'default',
      isSubscribed: false,
      isLoading: false,
    });
  });

  it('shows the user display name', () => {
    renderHome();
    expect(screen.getByText('Ah Mei')).toBeInTheDocument();
  });

  it('shows the user handle', () => {
    renderHome();
    expect(screen.getByText('@ahmei')).toBeInTheDocument();
  });

  it('renders the Play with Friends button', () => {
    renderHome();
    expect(screen.getByRole('button', { name: /play.*friends|好友/i })).toBeInTheDocument();
  });

  it('renders nav shortcuts (Profile and Learn visible)', () => {
    renderHome();
    expect(screen.getByRole('button', { name: /profile|个人/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /learn|学习/i })).toBeInTheDocument();
  });
});

describe('HomeStubPage · Home·push', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mockPushState, {
      isSupported: true,
      permission: 'default',
      isSubscribed: false,
      isLoading: false,
    });
  });

  it('push toggle row is visible when isSupported=true', () => {
    renderHome();
    expect(screen.getByText(/turn notifications/i)).toBeInTheDocument();
  });

  it('push toggle row is hidden when isSupported=false', () => {
    mockPushState.isSupported = false;
    renderHome();
    expect(screen.queryByText(/turn notifications/i)).not.toBeInTheDocument();
  });

  it('toggle button is rendered with data-testid="push-toggle"', () => {
    renderHome();
    expect(getPushToggle()).toBeInTheDocument();
  });

  it('toggle button has aria-pressed=false when not subscribed', () => {
    renderHome();
    expect(getPushToggle()).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggle button has aria-pressed=true when subscribed', () => {
    mockPushState.isSubscribed = true;
    renderHome();
    expect(getPushToggle()).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking toggle calls subscribe() when not subscribed', () => {
    renderHome();
    fireEvent.click(getPushToggle()!);
    expect(mockSubscribe).toHaveBeenCalledOnce();
  });

  it('clicking toggle calls unsubscribe() when already subscribed', () => {
    mockPushState.isSubscribed = true;
    renderHome();
    fireEvent.click(getPushToggle()!);
    expect(mockUnsubscribe).toHaveBeenCalledOnce();
  });

  it('toggle is disabled while isLoading=true', () => {
    mockPushState.isLoading = true;
    renderHome();
    expect(getPushToggle()).toBeDisabled();
  });
});

describe('HomeStubPage · Home·push-denied', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mockPushState, {
      isSupported: true,
      permission: 'denied' as NotificationPermission,
      isSubscribed: false,
      isLoading: false,
    });
  });

  it('shows "Blocked by browser" description when permission is denied', () => {
    renderHome();
    // The description paragraph (in the row left section) uses t('pushDenied')
    const deniedTexts = screen.getAllByText(/blocked by browser/i);
    expect(deniedTexts.length).toBeGreaterThan(0);
  });

  it('does not show the toggle button when permission is denied', () => {
    renderHome();
    expect(getPushToggle()).toBeNull();
  });
});
