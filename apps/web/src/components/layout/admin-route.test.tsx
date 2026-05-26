import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AdminRoute } from './admin-route';
import { useAuthStore } from '../../stores/auth.store';

vi.mock('../../stores/auth.store', () => ({
  useAuthStore: vi.fn(),
}));

const mockUseAuthStore = vi.mocked(useAuthStore);

function renderAdminRoute(initialPath = '/admin') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/auth" element={<div>Auth Page</div>} />
        <Route path="/home" element={<div>Home Page</div>} />
        <Route element={<AdminRoute />}>
          <Route path="/admin" element={<div>Admin Page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminRoute', () => {
  beforeEach(() => vi.clearAllMocks());

  it('redirects to /auth when user is null (unauthenticated)', () => {
    mockUseAuthStore.mockReturnValue(null as never);
    renderAdminRoute();
    expect(screen.getByText('Auth Page')).toBeInTheDocument();
    expect(screen.queryByText('Admin Page')).not.toBeInTheDocument();
  });

  it('redirects to /home when user role is "user"', () => {
    mockUseAuthStore.mockReturnValue({ role: 'user' } as never);
    renderAdminRoute();
    expect(screen.getByText('Home Page')).toBeInTheDocument();
    expect(screen.queryByText('Admin Page')).not.toBeInTheDocument();
  });

  it('renders the outlet when user role is "admin"', () => {
    mockUseAuthStore.mockReturnValue({ role: 'admin' } as never);
    renderAdminRoute();
    expect(screen.getByText('Admin Page')).toBeInTheDocument();
    expect(screen.queryByText('Auth Page')).not.toBeInTheDocument();
    expect(screen.queryByText('Home Page')).not.toBeInTheDocument();
  });
});
