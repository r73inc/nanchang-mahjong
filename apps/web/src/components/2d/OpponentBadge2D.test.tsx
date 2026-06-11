/**
 * OpponentBadge2D.test.tsx â€” unit tests for the compact mobile opponent badge.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { OpponentBadge2D } from './OpponentBadge2D';
import { useGameStore } from '../../stores/game.store';
import type { ClientGameState, ClientSeatState, Meld } from '@nanchang/shared';

// â”€â”€ Store mock â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

vi.mock('../../stores/game.store', () => ({ useGameStore: vi.fn() }));
const mockUseGameStore = vi.mocked(useGameStore);

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function makeSeat(overrides: Partial<ClientSeatState> = {}): ClientSeatState {
  return {
    wind: 'south',
    score: 0,
    connected: true,
    afk: false,
    openMelds: [],
    discards: [],
    hand: null,
    handCount: 13,
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
      makeSeat({ wind: 'east', score: 0 }),
      makeSeat({ wind: 'south', score: 0 }),
      makeSeat({ wind: 'west', score: 0 }),
      makeSeat({ wind: 'north', score: 0 }),
    ],
    ...overrides,
  };
}

function setupStore(snapshot: ClientGameState) {
  mockUseGameStore.mockImplementation((sel) =>
    sel({ snapshot, claimWindow: null, pendingMove: false } as Parameters<typeof sel>[0]),
  );
}

function renderBadge(seatIdx: 0 | 1 | 2 | 3 = 1) {
  return render(
    <I18nProvider>
      <OpponentBadge2D seatIdx={seatIdx} position="top" />
    </I18nProvider>,
  );
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('OpponentBadge2D', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('OpponentBadgeÂ·tile-count: shows tile count from handCount', () => {
    setupStore(
      makeSnapshot({ seats: [makeSeat(), makeSeat({ handCount: 13 }), makeSeat(), makeSeat()] }),
    );
    renderBadge(1);
    expect(screen.getByTestId('badge-tile-count-1').textContent).toContain('13');
  });

  it('OpponentBadgeÂ·active-glow: badge container has mj-opponent-badge-active class when it is the current seat', () => {
    setupStore(makeSnapshot({ currentSeat: 1 }));
    renderBadge(1);
    const badge = screen.getByTestId('opponent-badge-1');
    // The inner pill div (first child) carries the class
    const pill = badge.firstElementChild;
    expect(pill?.className).toContain('mj-opponent-badge-active');
  });

  it('OpponentBadgeÂ·no-active-glow: badge does NOT have active class when it is not the current seat', () => {
    setupStore(makeSnapshot({ currentSeat: 0 }));
    renderBadge(1);
    const badge = screen.getByTestId('opponent-badge-1');
    const pill = badge.firstElementChild;
    expect(pill?.className ?? '').not.toContain('mj-opponent-badge-active');
  });

  it('OpponentBadgeÂ·afk: AFK indicator present when seat.afk is true', () => {
    setupStore(
      makeSnapshot({
        seats: [makeSeat(), makeSeat({ afk: true }), makeSeat(), makeSeat()],
      }),
    );
    renderBadge(1);
    expect(screen.getByTestId('badge-afk-1')).toBeInTheDocument();
  });

  it('OpponentBadgeÂ·open-melds: meld strip rendered when openMelds are present', () => {
    const meld: Meld = { kind: 'pung', tiles: ['1m', '1m', '1m'], concealed: false };
    setupStore(
      makeSnapshot({
        seats: [makeSeat(), makeSeat({ openMelds: [meld] }), makeSeat(), makeSeat()],
      }),
    );
    renderBadge(1);
    expect(screen.getByTestId('badge-melds-1')).toBeInTheDocument();
    expect(screen.getByTestId('open-melds-1')).toBeInTheDocument();
  });
});
