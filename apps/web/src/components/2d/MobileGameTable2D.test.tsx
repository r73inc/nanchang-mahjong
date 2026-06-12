/**
 * MobileGameTable2D.test.tsx â€” tests for the mobile absolute-positioned layout.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { MobileGameTable2D } from './MobileGameTable2D';
import { useGameStore } from '../../stores/game.store';
import type { ClientGameState, ClientSeatState } from '@nanchang/shared';

// â”€â”€ Store mocks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

vi.mock('../../stores/game.store', () => ({ useGameStore: vi.fn() }));
const mockUseGameStore = vi.mocked(useGameStore);

vi.mock('../../stores/auth.store', () => ({
  useAuthStore: vi
    .fn()
    .mockImplementation((sel: (s: { user: { displayName: string } | null }) => unknown) =>
      sel({ user: { displayName: 'TestPlayer' } }),
    ),
}));

// â”€â”€ Framer Motion passthrough â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// AnimatePresence holds exited elements without real browser RAF.
vi.mock('framer-motion', async (importOriginal) => {
  const mod = await importOriginal<typeof import('framer-motion')>();
  return {
    ...mod,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function makeSeat(overrides: Partial<ClientSeatState> = {}): ClientSeatState {
  return {
    wind: 'east',
    score: 0,
    connected: true,
    afk: false,
    openMelds: [],
    discards: [],
    hand: ['1m', '2m', '3m'],
    handCount: 3,
    seatName: 'Player',
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<ClientGameState> = {}): ClientGameState {
  return {
    gameId: 'test',
    phase: 'playing',
    jingIndicator: null,
    jingPrimary: null,
    jingSecondary: null,
    currentSeat: 0,
    dealerSeat: 0,
    roundWind: 'east',
    wallCount: 60,
    wall: null,
    pendingDiscard: null,
    discardedBySeat: null,
    viewerSeat: 0,
    viewMode: '2D',
    ruleTopBottomJing: false,
    preGamePhase: null,
    pendingRoll: null,
    seats: [
      makeSeat({ wind: 'east' }),
      makeSeat({ wind: 'south', hand: null }),
      makeSeat({ wind: 'west', hand: null }),
      makeSeat({ wind: 'north', hand: null }),
    ],
    ...overrides,
  };
}

function setupStore(snapshot: ClientGameState) {
  mockUseGameStore.mockImplementation((sel) =>
    sel({
      snapshot,
      claimWindow: null,
      pendingMove: false,
    } as Parameters<typeof sel>[0]),
  );
}

function renderMobileTable() {
  const onDiscard = vi.fn();
  const result = render(
    <I18nProvider>
      <MobileGameTable2D onDiscard={onDiscard} />
    </I18nProvider>,
  );
  return { ...result, onDiscard };
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('MobileGameTable2D', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('MobileTableÂ·renders-three-badges: all three opponent badges are rendered', () => {
    setupStore(makeSnapshot());
    renderMobileTable();
    // viewerSeat=0 â†’ across=2, left=3, right=1
    expect(screen.getByTestId('opponent-badge-1')).toBeInTheDocument();
    expect(screen.getByTestId('opponent-badge-2')).toBeInTheDocument();
    expect(screen.getByTestId('opponent-badge-3')).toBeInTheDocument();
  });

  it('MobileTableÂ·player-hand-present: viewer hand is rendered', () => {
    setupStore(makeSnapshot());
    renderMobileTable();
    expect(screen.getByTestId('player-hand-2d')).toBeInTheDocument();
  });

  it('MobileTableÂ·score-strip-present: score strip is rendered above the hand', () => {
    setupStore(makeSnapshot());
    renderMobileTable();
    expect(screen.getByTestId('mobile-score-strip')).toBeInTheDocument();
  });

  it('MobileTableÂ·no-legacy-pills: SeatLabel2D pill elements are absent from the mobile layout', () => {
    setupStore(makeSnapshot());
    renderMobileTable();
    // SeatLabel2D renders data-testid="seat-label-*" â€” must never appear in mobile.
    expect(screen.queryByTestId('seat-label-0')).toBeNull();
    expect(screen.queryByTestId('seat-label-1')).toBeNull();
    expect(screen.queryByTestId('seat-label-2')).toBeNull();
    expect(screen.queryByTestId('seat-label-3')).toBeNull();
  });

  it('MobileTableÂ·no-css-grid: container does not use display:grid', () => {
    setupStore(makeSnapshot());
    renderMobileTable();
    const container = screen.getByTestId('mobile-game-table-2d');
    expect(container.style.display).not.toBe('grid');
    // Absolute positioning â€” position: relative on the outer container
    expect(container.style.position).toBe('relative');
  });

  it('MobileTableÂ·discard-pool-visible: mobile-discard-pool rendered when discards exist', () => {
    const snapshot = makeSnapshot({
      seats: [
        makeSeat({ wind: 'east', discards: ['1m'] }),
        makeSeat({ wind: 'south', hand: null }),
        makeSeat({ wind: 'west', hand: null }),
        makeSeat({ wind: 'north', hand: null }),
      ],
    });
    setupStore(snapshot);
    renderMobileTable();
    expect(screen.getByTestId('mobile-discard-pool')).toBeInTheDocument();
  });

  it('MobileTableÂ·returns-null-without-snapshot: renders nothing when snapshot is null', () => {
    mockUseGameStore.mockImplementation((sel) =>
      sel({ snapshot: null, claimWindow: null, pendingMove: false } as Parameters<typeof sel>[0]),
    );
    const { container } = renderMobileTable();
    expect(container.firstChild).toBeNull();
  });
});
