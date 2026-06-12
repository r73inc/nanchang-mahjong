import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../../i18n';
import { ProfilePage } from './profile-page';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockMutateAsync = vi.fn();

vi.mock('../../hooks/use-profile', () => ({
  useMyProfile: vi.fn(),
  useUpdateProfile: vi.fn(),
  useUploadAvatar: vi.fn(),
}));

import { useMyProfile, useUpdateProfile, useUploadAvatar } from '../../hooks/use-profile';

const mockUseMyProfile = vi.mocked(useMyProfile);
const mockUseUpdateProfile = vi.mocked(useUpdateProfile);
const mockUseUploadAvatar = vi.mocked(useUploadAvatar);

// ── Fixture ───────────────────────────────────────────────────────────────────

const sampleProfile = {
  sub: 'alice-sub',
  handle: 'alice',
  role: 'user' as const,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  disabled: false,
  gamesPlayed: 10,
  gamesWon: 4,
  rating: 1520,
  streak: 2,
};

// ── Render helper ─────────────────────────────────────────────────────────────

function renderProfilePage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <MemoryRouter initialEntries={['/profile']}>
          <Routes>
            <Route path="/home" element={<div>Home</div>} />
            <Route path="/profile" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

function setupDefaultMocks() {
  mockUseMyProfile.mockReturnValue({ data: sampleProfile, isLoading: false } as never);
  mockUseUpdateProfile.mockReturnValue({ mutateAsync: mockMutateAsync, isPending: false } as never);
  mockUseUploadAvatar.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('renders the handle', () => {
    renderProfilePage();
    expect(screen.getByText('@alice')).toBeInTheDocument();
  });

  it('renders stat tiles', () => {
    renderProfilePage();
    expect(screen.getByText('1520')).toBeInTheDocument(); // rating
    expect(screen.getByText('10')).toBeInTheDocument(); // gamesPlayed
    expect(screen.getByText('4')).toBeInTheDocument(); // gamesWon
    expect(screen.getByText('2')).toBeInTheDocument(); // streak
  });

  it('shows a spinner while loading', () => {
    mockUseMyProfile.mockReturnValue({ data: undefined, isLoading: true } as never);
    renderProfilePage();
    expect(screen.queryByText('@alice')).not.toBeInTheDocument();
  });

  it('shows edit form when "Edit Profile" is clicked', () => {
    renderProfilePage();
    fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));
    expect(screen.getByDisplayValue('alice')).toBeInTheDocument();
  });

  it('calls updateProfile on save and shows success message', async () => {
    mockMutateAsync.mockResolvedValue(undefined);
    renderProfilePage();

    fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith({ handle: 'alice' }));
    await waitFor(() => expect(screen.getByText('Profile updated.')).toBeInTheDocument());
  });

  it('shows an error message when updateProfile fails', async () => {
    mockMutateAsync.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: 'Handle is already taken' } },
      message: 'Request failed with status code 409',
    });
    renderProfilePage();

    fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Handle is already taken'),
    );
  });

  it('cancels edit and returns to view mode', () => {
    renderProfilePage();
    fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByDisplayValue('alice')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit profile/i })).toBeInTheDocument();
  });
});
