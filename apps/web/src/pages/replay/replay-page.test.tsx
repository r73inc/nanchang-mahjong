/**
 * replay-page.test.tsx
 *
 * Feature coverage:
 *  - Replay·loading: shows loading indicator while data is fetching
 *  - Replay·not-found: shows error message on fetch failure
 *  - Replay·renders: scrub bar and transport controls appear with valid data
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../../i18n';
import { ReplayPage } from './replay-page';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../hooks/use-replay', () => ({
  useReplay: vi.fn(),
}));

vi.mock('../../lib/replay-engine', () => ({
  buildTimeline: vi.fn(),
}));

import { useReplay } from '../../hooks/use-replay';
import { buildTimeline } from '../../lib/replay-engine';
const mockUseReplay = vi.mocked(useReplay);
const mockBuildTimeline = vi.mocked(buildTimeline);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSeat(wind: 'east' | 'south' | 'west' | 'north') {
  return { wind, score: 100, hand: [], discards: [], openMelds: [], handCount: 13 };
}

const MOCK_STATE = {
  phase: 'playing',
  seats: [makeSeat('east'), makeSeat('south'), makeSeat('west'), makeSeat('north')],
  currentSeat: 0,
  dealerSeat: 0,
  roundWind: 'east',
  wall: [],
  deadWall: [],
  pendingDiscard: null,
  discardedBySeat: null,
  jingIndicator: null,
  jingPrimary: null,
  jingSecondary: null,
} as never;

const MOCK_PAYLOAD = {
  gameId: 'game-abc',
  seatMap: ['u1', 'u2', 'u3', 'u4'],
  settings: {},
  hands: [
    { seed: 1, startingScores: [100, 100, 100, 100], dealerSeat: 0, roundWind: 'east', events: [] },
  ],
  startedAt: '2025-06-01T09:00:00.000Z',
  endedAt: '2025-06-01T10:00:00.000Z',
  finalScores: [150, 80, 90, 80],
  placement: [1, 3, 2, 4],
  result: 'win',
} as never;

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <I18nProvider>
        <MemoryRouter initialEntries={['/replay/game-abc']}>
          <Routes>
            <Route path="/replay/:id" element={<ReplayPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ReplayPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Replay·loading — shows loading indicator while fetching', () => {
    mockUseReplay.mockReturnValue({ data: undefined, isLoading: true, isError: false } as never);
    mockBuildTimeline.mockReturnValue([]);
    renderPage();
    expect(screen.getByText(/loading replay/i)).toBeInTheDocument();
  });

  it('Replay·not-found — shows error message on fetch failure', () => {
    mockUseReplay.mockReturnValue({ data: undefined, isLoading: false, isError: true } as never);
    mockBuildTimeline.mockReturnValue([]);
    renderPage();
    expect(screen.getByText(/replay not found/i)).toBeInTheDocument();
  });

  it('Replay·renders — shows transport controls and scrubber for valid data', () => {
    mockUseReplay.mockReturnValue({
      data: MOCK_PAYLOAD,
      isLoading: false,
      isError: false,
    } as never);
    mockBuildTimeline.mockReturnValue([{ state: MOCK_STATE, handIdx: 0, event: null }]);
    renderPage();
    expect(screen.getByRole('slider', { name: /replay scrubber/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /share this hand/i })).toBeInTheDocument();
  });
});
