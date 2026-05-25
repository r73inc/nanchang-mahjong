import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthPage } from './auth-page';
import { I18nProvider } from '../../i18n';

// Mock auth hooks — we're testing UI behaviour, not API calls.
vi.mock('../../hooks/use-auth', () => ({
  useSignin: () => ({ mutateAsync: vi.fn().mockResolvedValue({}), isPending: false }),
  useSignup: () => ({ mutateAsync: vi.fn().mockResolvedValue({}), isPending: false }),
  getApiErrorMessage: vi.fn((_err: unknown, fallback: string) => fallback),
}));

function renderAuthPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <MemoryRouter>
          <AuthPage />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe('AuthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the sign-in form by default', () => {
    renderAuthPage();
    // Tab is selected
    const signinTab = screen.getByRole('tab', { name: /sign in/i });
    expect(signinTab).toHaveAttribute('aria-selected', 'true');
    // Form fields
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    // Forgot password link
    expect(screen.getByRole('link', { name: /forgot password/i })).toBeInTheDocument();
  });

  it('switches to the sign-up form when the Create Account tab is clicked', async () => {
    const user = userEvent.setup();
    renderAuthPage();

    const signupTab = screen.getByRole('tab', { name: /create account/i });
    await user.click(signupTab);

    expect(signupTab).toHaveAttribute('aria-selected', 'true');
    // Sign-up specific fields
    expect(screen.getByLabelText(/invite code/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/handle/i)).toBeInTheDocument();
  });

  it('renders the brand mark', () => {
    renderAuthPage();
    expect(screen.getByLabelText(/nanchang mahjong/i)).toBeInTheDocument();
  });
});
