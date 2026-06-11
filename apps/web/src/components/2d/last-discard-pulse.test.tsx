/**
 * last-discard-pulse.test.tsx â€” BUG-020 regression tests.
 *
 * The last-discard red pulse is driven by the store's `lastDiscard` field
 * (set by game:event {kind:'discard'}). These tests use the REAL game store
 * (not a mock) so they exercise the same selector wiring as live gameplay â€”
 * the original bug survived six fixes because every test mocked the store
 * and the mobile pool (the component phones actually render) was never
 * covered at all.
 *
 * Coverage:
 *  - MobileDiscardPool2D pulses the matching tile with NO claim window set
 *    (the discarder and non-claiming viewers never receive game:claim-window).
 *  - MobileDiscardPool2D keeps the pulsing tile visible (the old version left
 *    it stuck at opacity 0 via the repeat:Infinity animate bleed).
 *  - CombinedDiscardPool2D (desktop) pulses the matching tile.
 *  - No pulse when lastDiscard is null.
 *  - setSnapshot preserves lastDiscard across no-claim snapshots (batching).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { CombinedDiscardPool2D } from './CombinedDiscardPool2D';
import { MobileDiscardPool2D } from './MobileDiscardPool2D';
import { useGameStore } from '../../stores/game.store';
import type { ClientGameState, ClientSeatState, TileType } from '@nanchang/shared';

// â”€â”€ Snapshot helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function makeSeat(overrides: Partial<ClientSeatState> = {}): ClientSeatState {
  return {
    wind: 'east',
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
    phase: 'awaiting_claims',
    jingIndicator: null,
    jingPrimary: null,
    jingSecondary: null,
    currentSeat: 1,
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
    seats: [
      makeSeat({ wind: 'east', discards: ['1m', '9p'] as TileType[] }),
      makeSeat({ wind: 'south', discards: ['5s'] as TileType[] }),
      makeSeat({ wind: 'west' }),
      makeSeat({ wind: 'north' }),
    ],
    ...overrides,
  } as ClientGameState;
}

function renderPool(pool: 'mobile' | 'desktop') {
  return render(
    <I18nProvider>
      {pool === 'mobile' ? <MobileDiscardPool2D /> : <CombinedDiscardPool2D />}
    </I18nProvider>,
  );
}

beforeEach(() => {
  act(() => {
    useGameStore.getState().reset();
  });
});

// â”€â”€ MobileDiscardPool2D (the component phones actually render) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('MobileDiscardPool2D Â· BUG-020 last-discard pulse', () => {
  it('pulses the last-discarded tile WITHOUT a claim window', () => {
    act(() => {
      useGameStore.getState().setSnapshot(makeSnapshot());
      // game:event {kind:'discard'} â€” seat 1 discarded 5s. No claimWindow:
      // the server only sends game:claim-window to seats with eligible claims.
      useGameStore.getState().setLastDiscard({ seat: 1, tile: '5s' as TileType });
    });

    renderPool('mobile');

    const pulses = screen.getAllByTestId('last-discard-pulse');
    expect(pulses).toHaveLength(1);
    // The pulse overlay must sit on the 5s tile.
    const tile = pulses[0].parentElement?.querySelector('[data-tile="5s"]');
    expect(tile).not.toBeNull();
  });

  it('keeps the pulsing tile visible (no opacity-0 bleed from entry animation)', () => {
    act(() => {
      useGameStore.getState().setSnapshot(makeSnapshot());
      useGameStore.getState().setLastDiscard({ seat: 1, tile: '5s' as TileType });
    });

    renderPool('mobile');

    // The wrapper of the pulsing tile mounts with initial = {opacity:1, scale:1},
    // so its inline style must not pin opacity at 0 (the old implementation did).
    const pulse = screen.getByTestId('last-discard-pulse');
    const wrapper = pulse.closest('[data-testid="mobile-discard-pool"] > div') as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.style.opacity).not.toBe('0');
  });

  it('shows no pulse when lastDiscard is null', () => {
    act(() => {
      useGameStore.getState().setSnapshot(makeSnapshot());
    });

    renderPool('mobile');

    expect(screen.queryByTestId('last-discard-pulse')).not.toBeInTheDocument();
  });
});

// â”€â”€ CombinedDiscardPool2D (desktop 2D) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('CombinedDiscardPool2D Â· BUG-020 last-discard pulse', () => {
  it('pulses the last-discarded tile from the real store', () => {
    act(() => {
      useGameStore.getState().setSnapshot(makeSnapshot());
      useGameStore.getState().setLastDiscard({ seat: 1, tile: '5s' as TileType });
    });

    renderPool('desktop');

    const pulses = screen.getAllByTestId('last-discard-pulse');
    expect(pulses).toHaveLength(1);
    const tile = pulses[0].parentElement?.querySelector('[data-tile="5s"]');
    expect(tile).not.toBeNull();
  });

  it('shows no pulse when lastDiscard is null', () => {
    act(() => {
      useGameStore.getState().setSnapshot(makeSnapshot());
    });

    renderPool('desktop');

    expect(screen.queryByTestId('last-discard-pulse')).not.toBeInTheDocument();
  });
});

// â”€â”€ Store wiring â€” lastDiscard survives the no-claim snapshot batch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('game.store Â· BUG-020 lastDiscard lifecycle', () => {
  it('setSnapshot preserves lastDiscard when pendingDiscard is already null', () => {
    act(() => {
      useGameStore.getState().setLastDiscard({ seat: 2, tile: '7p' as TileType });
      // No-claim turn: by the time the post-draw snapshot arrives,
      // pendingDiscard has been cleared server-side.
      useGameStore
        .getState()
        .setSnapshot(makeSnapshot({ pendingDiscard: null, discardedBySeat: null }));
    });

    expect(useGameStore.getState().lastDiscard).toEqual({ seat: 2, tile: '7p' });
  });

  it('setSnapshot restores lastDiscard from a mid-claim-window snapshot (reconnect)', () => {
    act(() => {
      useGameStore
        .getState()
        .setSnapshot(makeSnapshot({ pendingDiscard: '5s' as TileType, discardedBySeat: 1 }));
    });

    expect(useGameStore.getState().lastDiscard).toEqual({ seat: 1, tile: '5s' });
  });
});
