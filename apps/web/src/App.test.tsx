import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { I18nProvider } from './i18n';
import { useAuthStore } from './stores/auth.store';

// ── Mock all hooks that make network calls ────────────────────────────────────

vi.mock('./stores/auth.store', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('./hooks/use-auth', () => ({
  useSignin: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSignup: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useChangePassword: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSignout: () => vi.fn(),
  getApiErrorMessage: vi.fn((_err: unknown, fallback: string) => fallback),
}));

const mockUseAuthStore = vi.mocked(useAuthStore);

function renderApp(initialPath = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <App />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe('App routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects / → /home → /auth when not authenticated', () => {
    mockUseAuthStore.mockReturnValue(null as never);
    renderApp('/');
    // ProtectedRoute redirects unauthenticated users to /auth which shows the brand mark
    expect(screen.getByLabelText(/nanchang mahjong/i)).toBeInTheDocument();
  });

  it('shows the home page when authenticated', () => {
    mockUseAuthStore.mockReturnValue('fake-token' as never);
    renderApp('/home');
    // HomeStubPage renders the home title (exact string avoids matching the "Play Nanchang Mahjong" button)
    expect(screen.getByText('Nanchang Mahjong')).toBeInTheDocument();
  });
});
