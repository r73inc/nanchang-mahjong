import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../../i18n';
import { AdminRoute } from '../../components/layout/admin-route';
import { AdminPage } from './admin-page';
import { useAuthStore } from '../../stores/auth.store';
import type { AdminUser, InviteRecord } from '../../hooks/use-admin';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../stores/auth.store', () => ({
  useAuthStore: vi.fn(),
}));

const mockCreateInvites = vi.fn();
const mockRevokeInvite = vi.fn();
const mockSetRole = vi.fn();
const mockSetDisabled = vi.fn();
const mockSetPermission = vi.fn();
const mockApproveAiRequest = vi.fn();
const mockRejectAiRequest = vi.fn();
const mockRetryAiJob = vi.fn();

vi.mock('../../hooks/use-admin', () => ({
  useAdminInvites: vi.fn(),
  useCreateInvites: vi.fn(),
  useRevokeInvite: vi.fn(),
  useAdminUsers: vi.fn(),
  useSetRole: vi.fn(),
  useSetDisabled: vi.fn(),
  useSetPermission: vi.fn(),
  useAiPendingRequests: vi.fn(),
  useApproveAiRequest: vi.fn(),
  useRejectAiRequest: vi.fn(),
  useAiFailedJobs: vi.fn(),
  useRetryAiJob: vi.fn(),
}));

import {
  useAdminInvites,
  useCreateInvites,
  useRevokeInvite,
  useAdminUsers,
  useSetRole,
  useSetDisabled,
  useSetPermission,
  useAiPendingRequests,
  useApproveAiRequest,
  useRejectAiRequest,
  useAiFailedJobs,
  useRetryAiJob,
} from '../../hooks/use-admin';

const mockUseAuthStore = vi.mocked(useAuthStore);
const mockUseAdminInvites = vi.mocked(useAdminInvites);
const mockUseCreateInvites = vi.mocked(useCreateInvites);
const mockUseRevokeInvite = vi.mocked(useRevokeInvite);
const mockUseAdminUsers = vi.mocked(useAdminUsers);
const mockUseSetRole = vi.mocked(useSetRole);
const mockUseSetDisabled = vi.mocked(useSetDisabled);
const mockUseSetPermission = vi.mocked(useSetPermission);
const mockUseAiPendingRequests = vi.mocked(useAiPendingRequests);
const mockUseApproveAiRequest = vi.mocked(useApproveAiRequest);
const mockUseRejectAiRequest = vi.mocked(useRejectAiRequest);
const mockUseAiFailedJobs = vi.mocked(useAiFailedJobs);
const mockUseRetryAiJob = vi.mocked(useRetryAiJob);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const adminUser = {
  sub: 'admin-sub',
  handle: 'admin',
  role: 'admin' as const,
};

const sampleInvite: InviteRecord = {
  code: 'ABCD1234',
  status: 'active',
  createdBy: 'admin-sub',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const sampleUser: AdminUser = {
  sub: 'user-sub',
  handle: 'alice',
  role: 'user',
  permissions: [],
  disabled: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

// ── Render helper ─────────────────────────────────────────────────────────────

function renderAdminPage(initialPath = '/admin') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/auth" element={<div>Auth Page</div>} />
            <Route path="/home" element={<div>Home Page</div>} />
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<AdminPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

function setupDefaultMocks() {
  mockUseAdminInvites.mockReturnValue({
    data: [sampleInvite],
    isLoading: false,
  } as never);
  mockUseCreateInvites.mockReturnValue({
    mutateAsync: mockCreateInvites,
    isPending: false,
  } as never);
  mockUseRevokeInvite.mockReturnValue({
    mutate: mockRevokeInvite,
    isPending: false,
    variables: undefined,
  } as never);
  mockUseAdminUsers.mockReturnValue({
    data: [sampleUser],
    isLoading: false,
  } as never);
  mockUseSetRole.mockReturnValue({
    mutate: mockSetRole,
    isPending: false,
    variables: undefined,
  } as never);
  mockUseSetDisabled.mockReturnValue({
    mutate: mockSetDisabled,
    isPending: false,
    variables: undefined,
  } as never);
  mockUseSetPermission.mockReturnValue({
    mutate: mockSetPermission,
    isPending: false,
    variables: undefined,
  } as never);
  mockUseAiPendingRequests.mockReturnValue({ data: [], isLoading: false } as never);
  mockUseApproveAiRequest.mockReturnValue({
    mutate: mockApproveAiRequest,
    isPending: false,
    variables: undefined,
  } as never);
  mockUseRejectAiRequest.mockReturnValue({
    mutate: mockRejectAiRequest,
    isPending: false,
    variables: undefined,
  } as never);
  mockUseAiFailedJobs.mockReturnValue({ data: [], isLoading: false } as never);
  mockUseRetryAiJob.mockReturnValue({
    mutate: mockRetryAiJob,
    isPending: false,
    variables: undefined,
  } as never);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AdminRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('redirects unauthenticated users to /auth', () => {
    mockUseAuthStore.mockReturnValue(null as never);
    renderAdminPage();
    expect(screen.getByText('Auth Page')).toBeInTheDocument();
    expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument();
  });

  it('redirects non-admin users to /home', () => {
    mockUseAuthStore.mockReturnValue({ role: 'user' } as never);
    renderAdminPage();
    expect(screen.getByText('Home Page')).toBeInTheDocument();
    expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument();
  });

  it('renders the admin page for an admin user', () => {
    mockUseAuthStore.mockReturnValue(adminUser as never);
    renderAdminPage();
    expect(screen.getByText('Admin Panel')).toBeInTheDocument();
  });
});

describe('AdminPage — Invites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
    mockUseAuthStore.mockReturnValue(adminUser as never);
  });

  it('renders the invite list', () => {
    renderAdminPage();
    expect(screen.getByText('ABCD1234')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  it('shows empty state when there are no invites', () => {
    mockUseAdminInvites.mockReturnValue({ data: [], isLoading: false } as never);
    renderAdminPage();
    expect(screen.getByText('No invite codes yet.')).toBeInTheDocument();
  });

  it('shows a loading spinner while fetching invites', () => {
    mockUseAdminInvites.mockReturnValue({ data: undefined, isLoading: true } as never);
    renderAdminPage();
    // Spinner renders as an svg or similar — we confirm the list is absent
    expect(screen.queryByText('ABCD1234')).not.toBeInTheDocument();
  });

  it('calls createInvites on generate button click', async () => {
    mockCreateInvites.mockResolvedValue([sampleInvite]);
    renderAdminPage();
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));
    await waitFor(() => expect(mockCreateInvites).toHaveBeenCalledTimes(1));
    expect(mockCreateInvites).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }));
  });

  it('calls revokeInvite when revoke button is clicked', () => {
    renderAdminPage();
    fireEvent.click(screen.getByRole('button', { name: /revoke abcd1234/i }));
    expect(mockRevokeInvite).toHaveBeenCalledWith('ABCD1234');
  });

  it('does not show revoke button for non-active invites', () => {
    mockUseAdminInvites.mockReturnValue({
      data: [{ ...sampleInvite, status: 'revoked' as const }],
      isLoading: false,
    } as never);
    renderAdminPage();
    expect(screen.queryByRole('button', { name: /revoke/i })).not.toBeInTheDocument();
  });
});

describe('AdminPage — Users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
    mockUseAuthStore.mockReturnValue(adminUser as never);
  });

  it('renders the user list', () => {
    renderAdminPage();
    expect(screen.getByText('@alice')).toBeInTheDocument();
    expect(screen.getByText('User')).toBeInTheDocument();
  });

  it('shows empty state when no users match search', () => {
    mockUseAdminUsers.mockReturnValue({ data: [], isLoading: false } as never);
    renderAdminPage();
    expect(screen.getByText('No users found.')).toBeInTheDocument();
  });

  it('calls useAdminUsers with debounced search term', async () => {
    renderAdminPage();
    fireEvent.change(screen.getByPlaceholderText('Search by handle'), {
      target: { value: 'alice' },
    });
    // Immediately after typing the debounce hasn't fired yet
    expect(mockUseAdminUsers).toHaveBeenLastCalledWith(undefined);
    // After debounce delay
    await waitFor(() => expect(mockUseAdminUsers).toHaveBeenCalledWith('alice'), { timeout: 500 });
  });

  it('calls setRole when role toggle is clicked', () => {
    renderAdminPage();
    fireEvent.click(screen.getByRole('button', { name: /make admin/i }));
    expect(mockSetRole).toHaveBeenCalledWith({ sub: 'user-sub', role: 'admin' });
  });

  it('calls setDisabled(true) when disable button is clicked', () => {
    renderAdminPage();
    fireEvent.click(screen.getByRole('button', { name: /disable/i }));
    expect(mockSetDisabled).toHaveBeenCalledWith({ sub: 'user-sub', disabled: true });
  });

  it('calls setDisabled(false) when enable button is clicked for a disabled user', () => {
    mockUseAdminUsers.mockReturnValue({
      data: [{ ...sampleUser, disabled: true }],
      isLoading: false,
    } as never);
    renderAdminPage();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /enable/i }));
    expect(mockSetDisabled).toHaveBeenCalledWith({ sub: 'user-sub', disabled: false });
  });

  it('hides action buttons for the acting admin own row', () => {
    // The acting admin's own sub is 'admin-sub'; render a user list that includes them
    mockUseAdminUsers.mockReturnValue({
      data: [{ ...adminUser, disabled: false, createdAt: '', updatedAt: '' }],
      isLoading: false,
    } as never);
    renderAdminPage();
    // No role toggle or disable button should appear for self
    expect(
      screen.queryByRole('button', { name: /make user|make admin|disable|enable/i }),
    ).not.toBeInTheDocument();
  });
});

describe('AdminPage — AI queue', () => {
  const aiAdmin = { ...adminUser, permissions: ['admin-ai-features'] };

  const sampleRequest = {
    reqId: 'req-1',
    targetType: 'game' as const,
    targetId: 'game-abc',
    requestedBy: 'user-sub',
    requestedAt: '2025-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
    mockUseAuthStore.mockReturnValue(aiAdmin as never);
  });

  it('AdminAi·hidden — AI sections absent when acting admin lacks ai-features permission', () => {
    mockUseAuthStore.mockReturnValue(adminUser as never);
    renderAdminPage();
    expect(screen.queryByText('AI Request Queue')).not.toBeInTheDocument();
    expect(screen.queryByText('Failed AI Jobs')).not.toBeInTheDocument();
  });

  it('AdminAi·visible — AI sections present for admin with ai-features permission', () => {
    renderAdminPage();
    expect(screen.getByText('AI Request Queue')).toBeInTheDocument();
    expect(screen.getByText('Failed AI Jobs')).toBeInTheDocument();
  });

  it('AdminAi·queue-empty — shows empty state when no pending requests', () => {
    renderAdminPage();
    expect(screen.getByText('No pending requests.')).toBeInTheDocument();
  });

  it('AdminAi·queue-row — shows request row with approve and reject buttons', () => {
    mockUseAiPendingRequests.mockReturnValue({
      data: [sampleRequest],
      isLoading: false,
    } as never);
    renderAdminPage();
    expect(screen.getByText('game-abc')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^reject$/i })).toBeInTheDocument();
  });

  it('AdminAi·approve — calls approve mutation with reqId', () => {
    mockUseAiPendingRequests.mockReturnValue({
      data: [sampleRequest],
      isLoading: false,
    } as never);
    renderAdminPage();
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(mockApproveAiRequest).toHaveBeenCalledWith('req-1');
  });

  it('AdminAi·reject — calls reject mutation with reqId', () => {
    mockUseAiPendingRequests.mockReturnValue({
      data: [sampleRequest],
      isLoading: false,
    } as never);
    renderAdminPage();
    fireEvent.click(screen.getByRole('button', { name: /^reject$/i }));
    expect(mockRejectAiRequest).toHaveBeenCalledWith('req-1');
  });

  it('AdminAi·failed-empty — shows empty state when no failed jobs', () => {
    renderAdminPage();
    expect(screen.getByText('No failed jobs.')).toBeInTheDocument();
  });

  it('AdminAi·failed-row — shows failed job row with retry button', () => {
    mockUseAiFailedJobs.mockReturnValue({
      data: [
        {
          targetType: 'game' as const,
          targetId: 'game-xyz',
          attempts: 2,
          requestedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      isLoading: false,
    } as never);
    renderAdminPage();
    expect(screen.getByText('game-xyz')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('AdminAi·retry — calls retry mutation with targetType and targetId', () => {
    mockUseAiFailedJobs.mockReturnValue({
      data: [
        {
          targetType: 'game' as const,
          targetId: 'game-xyz',
          attempts: 2,
          requestedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      isLoading: false,
    } as never);
    renderAdminPage();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(mockRetryAiJob).toHaveBeenCalledWith({ targetType: 'game', targetId: 'game-xyz' });
  });
});

describe('AdminPage — AI features permission toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
    mockUseAuthStore.mockReturnValue(adminUser as never);
  });

  it('AdminAi·badge — shows AI Admin badge for user holding ai-features permission', () => {
    mockUseAdminUsers.mockReturnValue({
      data: [{ ...sampleUser, permissions: ['admin-ai-features'] }],
      isLoading: false,
    } as never);
    renderAdminPage();
    expect(screen.getByText('AI Admin')).toBeInTheDocument();
  });

  it('AdminAi·grant — calls setPermission grant for admin-ai-features', () => {
    renderAdminPage();
    fireEvent.click(screen.getByRole('button', { name: /grant ai admin/i }));
    expect(mockSetPermission).toHaveBeenCalledWith({
      sub: 'user-sub',
      permission: 'admin-ai-features',
      grant: true,
    });
  });

  it('AdminAi·revoke — calls setPermission revoke for admin-ai-features', () => {
    mockUseAdminUsers.mockReturnValue({
      data: [{ ...sampleUser, permissions: ['admin-ai-features'] }],
      isLoading: false,
    } as never);
    renderAdminPage();
    fireEvent.click(screen.getByRole('button', { name: /revoke ai admin/i }));
    expect(mockSetPermission).toHaveBeenCalledWith({
      sub: 'user-sub',
      permission: 'admin-ai-features',
      grant: false,
    });
  });
});
