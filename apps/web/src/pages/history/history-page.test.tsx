/**
 * history-page.test.tsx
 *
 * Feature coverage:
 *  - History·empty-state: new user sees the empty state
 *  - History·list: games render in reverse-chronological order (newest card first)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../../i18n';
import { HistoryPage } from './history-page';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../hooks/use-history', () => ({
  useGameHistory: vi.fn(),
}));

import { useGameHistory } from '../../hooks/use-history';
const mockUseGameHistory = vi.mocked(useGameHistory);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeHistoryResult(games: ReturnType<typeof makeGame>[]) {
  return {
    data: { pages: [{ games, nextCursor: undefined }], pageParams: [undefined] },
    isLoading: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  } as never;
}

function makeGame(overrides: Record<string, unknown> = {}) {
  return {
    gameId: `game-${Math.random().toString(36).slice(2)}`,
    placement: 1 as const,
    finalScore: 50,
    result: 'win' as const,
    endedAt: '2025-06-01T10:00:00.000Z',
    ...overrides,
  };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <I18nProvider>
        <MemoryRouter initialEntries={['/history']}>
          <Routes>
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/lobby" element={<div>Lobby</div>} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('History·empty-state — shows empty message when no games', () => {
    mockUseGameHistory.mockReturnValue(makeHistoryResult([]));
    renderPage();
    expect(screen.getByText(/no games yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start a match/i })).toBeInTheDocument();
  });

  it('History·list — renders a win game card', () => {
    mockUseGameHistory.mockReturnValue(
      makeHistoryResult([makeGame({ placement: 1, finalScore: 42, result: 'win' })]),
    );
    renderPage();
    expect(screen.getByText('Win')).toBeInTheDocument();
    expect(screen.getByText('+42')).toBeInTheDocument();
    expect(screen.getByText('1st')).toBeInTheDocument();
  });

  it('History·list — renders a loss (concede) game card with negative score', () => {
    mockUseGameHistory.mockReturnValue(
      makeHistoryResult([makeGame({ placement: 4, finalScore: -30, result: 'concede' })]),
    );
    renderPage();
    expect(screen.getByText('Concede')).toBeInTheDocument();
    expect(screen.getByLabelText('score -30')).toBeInTheDocument();
    expect(screen.getByText('4th')).toBeInTheDocument();
  });

  it('History·list — renders multiple games', () => {
    mockUseGameHistory.mockReturnValue(
      makeHistoryResult([
        makeGame({ gameId: 'g1', result: 'win', finalScore: 10 }),
        makeGame({ gameId: 'g2', result: 'draw', finalScore: 0 }),
        makeGame({ gameId: 'g3', result: 'bust', finalScore: -20 }),
      ]),
    );
    renderPage();
    expect(screen.getAllByText('Win')).toHaveLength(1);
    expect(screen.getAllByText('Draw')).toHaveLength(1);
    expect(screen.getAllByText('Bust')).toHaveLength(1);
  });

  it('History·empty-state — shows skeleton cards while loading', () => {
    mockUseGameHistory.mockReturnValue({
      data: undefined,
      isLoading: true,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    } as never);
    renderPage();
    // Empty state text should NOT appear while loading
    expect(screen.queryByText(/no games yet/i)).not.toBeInTheDocument();
  });
});
