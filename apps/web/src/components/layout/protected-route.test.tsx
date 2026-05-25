import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './protected-route';
import { useAuthStore } from '../../stores/auth.store';

// Mock the Zustand auth store so we control the token value per test.
vi.mock('../../stores/auth.store', () => ({
  useAuthStore: vi.fn(),
}));

const mockUseAuthStore = vi.mocked(useAuthStore);

function renderProtected(initialPath = '/home') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/auth" element={<div>Auth Page</div>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/home" element={<div>Home Page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the protected outlet when the user is authenticated', () => {
    mockUseAuthStore.mockReturnValue('fake-access-token' as never);
    renderProtected('/home');
    expect(screen.getByText('Home Page')).toBeInTheDocument();
    expect(screen.queryByText('Auth Page')).not.toBeInTheDocument();
  });

  it('redirects to /auth when there is no access token', () => {
    mockUseAuthStore.mockReturnValue(null as never);
    renderProtected('/home');
    expect(screen.getByText('Auth Page')).toBeInTheDocument();
    expect(screen.queryByText('Home Page')).not.toBeInTheDocument();
  });
});
