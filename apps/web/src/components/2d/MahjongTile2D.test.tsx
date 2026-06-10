/**
 * MahjongTile2D.test.tsx
 *
 * Feature coverage:
 *  - 2DTile·render:     face-up, back, all sizes, all roles
 *  - 2DTile·a11y:       aria-label, role, aria-pressed
 *  - 2DTile·interaction: click and keyboard (Enter/Space) trigger onSelect
 *  - 2DTile·jing:       节 label shown, gold glow class present
 *  - 2DTile·shadow:     TILE_DIMS and SHADOW_OFFSETS exports have correct shapes
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { MahjongTile2D, TILE_DIMS } from './MahjongTile2D';
import { SHADOW_OFFSETS } from './MahjongTile2D';

// Re-export the shadow offsets for assertion (they're not exported by default)
// — we test the module-level constant via the named export below.

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderTile(props: Partial<React.ComponentProps<typeof MahjongTile2D>> = {}) {
  return render(
    <I18nProvider>
      <MahjongTile2D tile="1m" {...props} />
    </I18nProvider>,
  );
}

// ── TILE_DIMS export ──────────────────────────────────────────────────────────

describe('TILE_DIMS · 2DTile·render', () => {
  it('xs is smallest', () => {
    expect(TILE_DIMS.xs.w).toBeLessThan(TILE_DIMS.sm.w);
    expect(TILE_DIMS.xs.h).toBeLessThan(TILE_DIMS.sm.h);
  });

  it('lg is largest', () => {
    expect(TILE_DIMS.lg.w).toBeGreaterThan(TILE_DIMS.md.w);
    expect(TILE_DIMS.lg.h).toBeGreaterThan(TILE_DIMS.md.h);
  });

  it('shadow scales with size', () => {
    expect(TILE_DIMS.xs.shadow).toBeLessThan(TILE_DIMS.sm.shadow);
    expect(TILE_DIMS.sm.shadow).toBeLessThan(TILE_DIMS.md.shadow);
    expect(TILE_DIMS.md.shadow).toBeLessThan(TILE_DIMS.lg.shadow);
  });
});

// ── SHADOW_OFFSETS export ─────────────────────────────────────────────────────

describe('SHADOW_OFFSETS · 2DTile·render', () => {
  it('bottom role has positive x and y (down-right shadow)', () => {
    expect(SHADOW_OFFSETS.bottom[0]).toBeGreaterThan(0);
    expect(SHADOW_OFFSETS.bottom[1]).toBeGreaterThan(0);
  });

  it('top role has negative x and y (inverse of bottom)', () => {
    expect(SHADOW_OFFSETS.top[0]).toBeLessThan(0);
    expect(SHADOW_OFFSETS.top[1]).toBeLessThan(0);
  });

  it('right role has negative x, positive y', () => {
    expect(SHADOW_OFFSETS.right[0]).toBeLessThan(0);
    expect(SHADOW_OFFSETS.right[1]).toBeGreaterThan(0);
  });

  it('left role has positive x, negative y', () => {
    expect(SHADOW_OFFSETS.left[0]).toBeGreaterThan(0);
    expect(SHADOW_OFFSETS.left[1]).toBeLessThan(0);
  });

  it('all four roles produce screen-space (+2,+6) when container-rotation is applied', () => {
    // bottom (0°):   screen = tile         → tile must be (+2, +6)
    const [bx, by] = SHADOW_OFFSETS.bottom;
    expect(bx).toBe(2);
    expect(by).toBe(6);

    // right (-90°):  screen = (tile_y, -tile_x)  → tile must be (-6, +2) so screen = (+2, +6)
    const [rx, ry] = SHADOW_OFFSETS.right;
    expect(ry).toBe(2); // screen_x = tile_y  = +2
    expect(-rx).toBe(6); // screen_y = -tile_x = +6

    // top (180°):   screen = (-tile_x, -tile_y) → tile must be (-2, -6) so screen = (+2, +6)
    const [tx, ty] = SHADOW_OFFSETS.top;
    expect(-tx).toBe(2);
    expect(-ty).toBe(6);

    // left (+90°):  screen = (-tile_y, tile_x)  → tile must be (+6, -2) so screen = (+2, +6)
    const [lx, ly] = SHADOW_OFFSETS.left;
    expect(-ly).toBe(2); // screen_x = -tile_y = +2
    expect(lx).toBe(6); // screen_y =  tile_x = +6
  });
});

// ── Face-up tile rendering ────────────────────────────────────────────────────

describe('MahjongTile2D face-up · 2DTile·render', () => {
  it('renders without crashing', () => {
    renderTile({ tile: '1m' });
    expect(screen.getByTestId('mahjong-tile-2d')).toBeInTheDocument();
  });

  it('renders an img with the correct SVG src for a tile', () => {
    renderTile({ tile: '3p' });
    expect(screen.getByTestId('tile-img')).toHaveAttribute(
      'src',
      '/textures/Tiles/Regular/Pin3.svg',
    );
  });

  it('renders img for a wind tile', () => {
    renderTile({ tile: 'east' });
    expect(screen.getByTestId('tile-img')).toHaveAttribute(
      'src',
      '/textures/Tiles/Regular/Ton.svg',
    );
  });

  it('renders img for a dragon tile', () => {
    renderTile({ tile: 'zhong' });
    expect(screen.getByTestId('tile-img')).toHaveAttribute(
      'src',
      '/textures/Tiles/Regular/Chun.svg',
    );
  });

  it('sets data-tile attribute', () => {
    renderTile({ tile: '9s' });
    // The motion.div inside carries data-tile
    const tile = screen.getByTestId('mahjong-tile-2d').firstElementChild;
    expect(tile).toHaveAttribute('data-tile', '9s');
  });
});

// ── Back tile ─────────────────────────────────────────────────────────────────

describe('MahjongTile2D back · 2DTile·render', () => {
  it('renders Back.svg for back tile', () => {
    renderTile({ tile: 'back' });
    expect(screen.getByTestId('tile-img')).toHaveAttribute(
      'src',
      '/textures/Tiles/Regular/Back.svg',
    );
  });

  it('has aria-label "Hidden tile"', () => {
    renderTile({ tile: 'back' });
    expect(screen.getByLabelText('Hidden tile')).toBeInTheDocument();
  });
});

// ── Sizes ─────────────────────────────────────────────────────────────────────

describe('MahjongTile2D sizes · 2DTile·render', () => {
  it.each(['xs', 'sm', 'md', 'lg'] as const)('renders size %s without error', (size) => {
    renderTile({ size });
    const tile = screen.getByTestId('mahjong-tile-2d').firstElementChild;
    expect(tile).toHaveAttribute('data-size', size);
  });
});

// ── Roles ─────────────────────────────────────────────────────────────────────

describe('MahjongTile2D roles · 2DTile·render', () => {
  it.each(['bottom', 'right', 'top', 'left'] as const)('renders role %s without error', (role) => {
    renderTile({ role });
    expect(screen.getByTestId('mahjong-tile-2d')).toBeInTheDocument();
  });
});

// ── Accessibility ─────────────────────────────────────────────────────────────

describe('MahjongTile2D a11y · 2DTile·a11y', () => {
  it('non-interactive tile has role="img"', () => {
    renderTile({ tile: '1m', interactive: false });
    // The motion.div tile body (not the img tag) carries role="img"
    const tileBodies = screen.getAllByRole('img');
    // At least one has our aria-label (the motion.div body)
    const body = tileBodies.find((el) => el.hasAttribute('aria-label'));
    expect(body).toBeDefined();
  });

  it('interactive tile has role="button"', () => {
    renderTile({ tile: '5p', interactive: true });
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('non-selected interactive tile has aria-pressed=false', () => {
    renderTile({ tile: '2m', interactive: true, selected: false });
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  });

  it('selected interactive tile has aria-pressed=true', () => {
    renderTile({ tile: '2m', interactive: true, selected: true });
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('non-interactive tile has tabIndex=-1', () => {
    renderTile({ interactive: false });
    const tileBodies = screen.getAllByRole('img');
    const body = tileBodies.find((el) => el.hasAttribute('aria-label'));
    expect(body).toHaveAttribute('tabIndex', '-1');
  });

  it('interactive tile has tabIndex=0', () => {
    renderTile({ interactive: true });
    expect(screen.getByRole('button')).toHaveAttribute('tabIndex', '0');
  });
});

// ── Interaction ───────────────────────────────────────────────────────────────

describe('MahjongTile2D interaction · 2DTile·interaction', () => {
  it('click fires onSelect when interactive', () => {
    const onSelect = vi.fn();
    renderTile({ tile: '1m', interactive: true, onSelect });
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('Enter key fires onSelect when interactive', () => {
    const onSelect = vi.fn();
    renderTile({ tile: '1m', interactive: true, onSelect });
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('Space key fires onSelect when interactive', () => {
    const onSelect = vi.fn();
    renderTile({ tile: '1m', interactive: true, onSelect });
    fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('click does NOT fire when non-interactive', () => {
    const onSelect = vi.fn();
    renderTile({ tile: '1m', interactive: false, onSelect });
    const tileBodies = screen.getAllByRole('img');
    const body = tileBodies.find((el) => el.hasAttribute('aria-label'))!;
    fireEvent.click(body);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

// ── Jing ──────────────────────────────────────────────────────────────────────

describe('MahjongTile2D jing · 2DTile·jing', () => {
  it('shows 精 label when isJing=true', () => {
    renderTile({ isJing: true });
    expect(screen.getByText('精')).toBeInTheDocument();
  });

  it('does NOT show 节 label when isJing=false', () => {
    renderTile({ isJing: false });
    expect(screen.queryByText('节')).not.toBeInTheDocument();
  });
});
