/**
 * a11y-h.test.tsx — Phase H accessibility tests (Phase 12B A11y deliverable).
 *
 * Feature coverage:
 *  - A11y·tile-aria:       aria-labels, roles, keyboard interaction on MahjongTile2D
 *                          and PlayerHand2D
 *  - A11y·reduced-motion:  global CSS media-query rule present in index.css
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { MahjongTile2D } from './MahjongTile2D';
import { PlayerHand2D } from './PlayerHand2D';
import { useGameStore } from '../../stores/game.store';
import type { ClientGameState } from '@nanchang/shared';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../../stores/game.store', () => ({ useGameStore: vi.fn() }));
const mockUseGameStore = vi.mocked(useGameStore);

// AnimatePresence holds exited elements in jsdom — mock as pass-through.
vi.mock('framer-motion', async (importOriginal) => {
  const mod = await importOriginal<typeof import('framer-motion')>();
  return {
    ...mod,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

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
    deadWallCount: 14,
    pendingDiscard: null,
    discardedBySeat: null,
    viewerSeat: 0,
    viewMode: '2D',
    ruleTopBottomJing: false,
    seats: [
      {
        wind: 'east',
        score: 0,
        connected: true,
        afk: false,
        openMelds: [],
        discards: [],
        hand: ['1m', '2m', '3m'],
        handCount: 3,
      },
      {
        wind: 'south',
        score: 0,
        connected: true,
        afk: false,
        openMelds: [],
        discards: [],
        hand: null,
        handCount: 13,
      },
      {
        wind: 'west',
        score: 0,
        connected: true,
        afk: false,
        openMelds: [],
        discards: [],
        hand: null,
        handCount: 13,
      },
      {
        wind: 'north',
        score: 0,
        connected: true,
        afk: false,
        openMelds: [],
        discards: [],
        hand: null,
        handCount: 13,
      },
    ],
    ...overrides,
  } as ClientGameState;
}

function setupStore(snapshot: ClientGameState | null = makeSnapshot()) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockUseGameStore.mockImplementation((sel: (s: any) => any) =>
    sel({ snapshot, claimWindow: null, pendingMove: false }),
  );
}

// ── A11y·tile-aria — MahjongTile2D ───────────────────────────────────────────

describe('MahjongTile2D · A11y·tile-aria', () => {
  it('face-up tile has aria-label matching the EN tile name', () => {
    render(
      <I18nProvider>
        <MahjongTile2D tile="1m" size="md" role="bottom" interactive={false} />
      </I18nProvider>,
    );
    // tileAriaLabel('1m', 'en') → '1 Character'
    expect(screen.getByRole('img', { name: '1 Character' })).toBeInTheDocument();
  });

  it('dragon tile has the correct EN aria-label', () => {
    render(
      <I18nProvider>
        <MahjongTile2D tile="zhong" size="md" role="bottom" interactive={false} />
      </I18nProvider>,
    );
    expect(screen.getByRole('img', { name: 'Red Dragon' })).toBeInTheDocument();
  });

  it('wind tile has the correct EN aria-label', () => {
    render(
      <I18nProvider>
        <MahjongTile2D tile="east" size="md" role="bottom" interactive={false} />
      </I18nProvider>,
    );
    expect(screen.getByRole('img', { name: 'East Wind' })).toBeInTheDocument();
  });

  it('bamboo tile has the correct EN aria-label', () => {
    render(
      <I18nProvider>
        <MahjongTile2D tile="5s" size="md" role="bottom" interactive={false} />
      </I18nProvider>,
    );
    expect(screen.getByRole('img', { name: '5 Bamboo' })).toBeInTheDocument();
  });

  it('back-face tile has aria-label "Hidden tile"', () => {
    render(
      <I18nProvider>
        <MahjongTile2D tile="back" size="xs" role="top" interactive={false} />
      </I18nProvider>,
    );
    expect(screen.getByRole('img', { name: 'Hidden tile' })).toBeInTheDocument();
  });

  it('non-interactive tile has role="img"', () => {
    render(
      <I18nProvider>
        <MahjongTile2D tile="2p" size="sm" role="bottom" interactive={false} />
      </I18nProvider>,
    );
    expect(screen.getByRole('img')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('interactive tile has role="button"', () => {
    render(
      <I18nProvider>
        <MahjongTile2D tile="3s" size="lg" role="bottom" interactive onSelect={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('interactive tile has tabIndex=0', () => {
    render(
      <I18nProvider>
        <MahjongTile2D tile="3m" size="lg" role="bottom" interactive onSelect={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByRole('button')).toHaveAttribute('tabindex', '0');
  });

  it('non-interactive tile has tabIndex=-1', () => {
    render(
      <I18nProvider>
        <MahjongTile2D tile="3m" size="md" role="bottom" interactive={false} />
      </I18nProvider>,
    );
    expect(screen.getByRole('img')).toHaveAttribute('tabindex', '-1');
  });

  it('interactive tile fires onSelect on Enter key', () => {
    const onSelect = vi.fn();
    render(
      <I18nProvider>
        <MahjongTile2D tile="4m" size="lg" role="bottom" interactive onSelect={onSelect} />
      </I18nProvider>,
    );
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('interactive tile fires onSelect on Space key', () => {
    const onSelect = vi.fn();
    render(
      <I18nProvider>
        <MahjongTile2D tile="4m" size="lg" role="bottom" interactive onSelect={onSelect} />
      </I18nProvider>,
    );
    fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('interactive tile has aria-pressed=false when not selected', () => {
    render(
      <I18nProvider>
        <MahjongTile2D
          tile="5m"
          size="lg"
          role="bottom"
          interactive
          selected={false}
          onSelect={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  });

  it('interactive tile has aria-pressed=true when selected', () => {
    render(
      <I18nProvider>
        <MahjongTile2D tile="5m" size="lg" role="bottom" interactive selected onSelect={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });
});

// ── A11y·tile-aria — PlayerHand2D ────────────────────────────────────────────

describe('PlayerHand2D · A11y·tile-aria', () => {
  beforeEach(() => setupStore());

  it('Reorder.Group has aria-label="Your hand"', () => {
    render(
      <I18nProvider>
        <PlayerHand2D onDiscard={vi.fn()} />
      </I18nProvider>,
    );
    // The Reorder.Group renders as a div with aria-label
    expect(screen.getByRole('generic', { name: 'Your hand' })).toBeInTheDocument();
  });

  it('Reorder.Group has aria-describedby pointing to the drag hint span', () => {
    render(
      <I18nProvider>
        <PlayerHand2D onDiscard={vi.fn()} />
      </I18nProvider>,
    );
    const group = screen.getByRole('generic', { name: 'Your hand' });
    expect(group).toHaveAttribute('aria-describedby', 'hand-drag-hint');
  });

  it('drag hint span is always present and sr-only', () => {
    render(
      <I18nProvider>
        <PlayerHand2D onDiscard={vi.fn()} />
      </I18nProvider>,
    );
    const hint = document.getElementById('hand-drag-hint');
    expect(hint).not.toBeNull();
    expect(hint).toHaveClass('sr-only');
  });

  it('hand tiles are non-interactive (role=img) during claim window', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseGameStore.mockImplementation((sel: (s: any) => any) =>
      sel({
        snapshot: makeSnapshot(),
        claimWindow: { actions: [], deadline: Date.now() + 8000 },
        pendingMove: false,
      }),
    );
    render(
      <I18nProvider>
        <PlayerHand2D onDiscard={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    // Tiles still rendered as images
    expect(screen.getAllByRole('img').length).toBeGreaterThan(0);
  });
});

// ── A11y·reduced-motion ───────────────────────────────────────────────────────

describe('index.css · A11y·reduced-motion', () => {
  // Read the actual CSS file via process.cwd() (= apps/web when Vitest runs).
  // This is more reliable than import.meta.url which Vitest resolves as an
  // http URL in jsdom mode rather than a file URL.
  const CSS_PATH = resolve(process.cwd(), 'src/index.css');
  let css: string;
  beforeEach(() => {
    css = readFileSync(CSS_PATH, 'utf-8');
  });

  it('contains a prefers-reduced-motion media query', () => {
    expect(css).toContain('prefers-reduced-motion');
  });

  it('sets animation-duration to near-zero inside the media query', () => {
    expect(css).toContain('animation-duration: 0.01ms');
  });

  it('sets transition-duration to near-zero inside the media query', () => {
    expect(css).toContain('transition-duration: 0.01ms');
  });

  it('resets animation-iteration-count to prevent looping reduced-motion animations', () => {
    expect(css).toContain('animation-iteration-count: 1');
  });

  it('disables smooth scroll in reduced-motion mode', () => {
    expect(css).toContain('scroll-behavior: auto');
  });
});
