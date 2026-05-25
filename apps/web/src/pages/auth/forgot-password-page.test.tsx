import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ForgotPasswordPage } from './forgot-password-page';
import { I18nProvider } from '../../i18n';

const mockMutateAsync = vi.fn().mockResolvedValue(undefined);

vi.mock('../../hooks/use-auth', () => ({
  useForgotPassword: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  getApiErrorMessage: vi.fn((_err: unknown, fallback: string) => fallback),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <MemoryRouter>
          <ForgotPasswordPage />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue(undefined);
  });

  it('renders the email form initially', () => {
    renderPage();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset code/i })).toBeInTheDocument();
  });

  it('advances to the "check inbox" step after submitting a valid email', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.click(screen.getByRole('button', { name: /send reset code/i }));

    // Success state should now be visible
    expect(await screen.findByText(/check your inbox/i)).toBeInTheDocument();
    expect(screen.getByText(/user@example\.com/)).toBeInTheDocument();
  });

  it('shows the "resend" option in the success step', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.click(screen.getByRole('button', { name: /send reset code/i }));

    expect(await screen.findByRole('button', { name: /resend/i })).toBeInTheDocument();
  });

  it('goes back to the email form when "Resend" is clicked', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.click(screen.getByRole('button', { name: /send reset code/i }));
    await screen.findByText(/check your inbox/i);

    await user.click(screen.getByRole('button', { name: /resend/i }));

    // Back to step 1
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });
});
