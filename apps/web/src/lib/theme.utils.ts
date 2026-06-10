/**
 * theme.utils.ts — theme definitions, CSS-var application, and contrast guard.
 *
 * CSS custom properties written to :root by applyTheme():
 *
 *   --felt-top     table gradient top stop
 *   --felt-bottom  table gradient bottom stop
 *   --felt-header  sticky header overlay colour
 *
 *   --tile-face-top     tile face gradient top stop
 *   --tile-face-bottom  tile face gradient bottom stop
 *   --tile-man          Man (Character) glyph colour
 *   --tile-pin          Dot (Pin) glyph colour
 *   --tile-sou          Bamboo (Sou) glyph colour
 *   --tile-wind         Wind tile glyph colour
 *   --tile-zhong        Red Dragon glyph colour
 *   --tile-fa           Green Dragon glyph colour
 *   --tile-bai          White Dragon glyph colour
 *
 * ScreenShell and MahjongTile reference these vars so every screen
 * repaint automatically when the theme changes.
 */

import type { FeltTheme, TilePalette } from '../stores/theme.store';

// ── Felt configs ──────────────────────────────────────────────────────────────

interface FeltConfig {
  top: string;
  bottom: string;
  header: string;
  /** Representative hex for swatches / UI display. */
  swatch: string;
}

export const FELT_CONFIGS: Record<FeltTheme, FeltConfig> = {
  jade: {
    top: '#0d3b2e',
    bottom: '#051a13',
    header: 'rgba(8,30,23,0.6)',
    swatch: '#0d3b2e',
  },
  crimson: {
    top: '#3b0d0d',
    bottom: '#1a0505',
    header: 'rgba(30,8,8,0.6)',
    swatch: '#3b0d0d',
  },
  slate: {
    top: '#0d1a2e',
    bottom: '#050a13',
    header: 'rgba(8,13,30,0.6)',
    swatch: '#0d1a2e',
  },
  navy: {
    top: '#0d1f3b',
    bottom: '#050d1a',
    header: 'rgba(8,15,30,0.6)',
    swatch: '#0d1f3b',
  },
  yellow: {
    top: '#e8d630',
    bottom: '#b8a714',
    header: 'rgba(180,160,0,0.3)',
    swatch: '#e8d630',
  },
};

// ── Tile palette configs ──────────────────────────────────────────────────────

interface TileConfig {
  faceTop: string;
  faceBottom: string;
  man: string;
  pin: string;
  sou: string;
  wind: string;
  zhong: string;
  fa: string;
  bai: string;
  /** Representative face hex for swatches. */
  swatch: string;
}

export const TILE_CONFIGS: Record<TilePalette, TileConfig> = {
  classic: {
    faceTop: '#fffbeb',
    faceBottom: '#e8dfc5',
    man: '#c0392b',
    pin: '#2563eb',
    sou: '#15803d',
    wind: '#64748b',
    zhong: '#dc2626',
    fa: '#16a34a',
    bai: '#9ca3af',
    swatch: '#f5efdf',
  },
  sepia: {
    faceTop: '#f5e6c8',
    faceBottom: '#d4b896',
    man: '#8b3a3a',
    pin: '#2c5b8b',
    sou: '#2d6b3a',
    wind: '#7a6a5a',
    zhong: '#8b2020',
    fa: '#2d6b2d',
    bai: '#8a7a6a',
    swatch: '#e8d4b0',
  },
  dark: {
    faceTop: '#2c2c2c',
    faceBottom: '#1a1a1a',
    man: '#ef5350',
    pin: '#42a5f5',
    sou: '#66bb6a',
    wind: '#90a4ae',
    zhong: '#ef5350',
    fa: '#66bb6a',
    bai: '#e0e0e0',
    swatch: '#2c2c2c',
  },
};

// ── CSS custom-property injection ─────────────────────────────────────────────

/**
 * Write theme tokens to :root as CSS custom properties.
 * Called once on mount and whenever the user changes a preference.
 */
export function applyTheme(felt: FeltTheme, palette: TilePalette): void {
  const f = FELT_CONFIGS[felt];
  const t = TILE_CONFIGS[palette];
  const r = document.documentElement;

  r.style.setProperty('--felt-top', f.top);
  r.style.setProperty('--felt-bottom', f.bottom);
  r.style.setProperty('--felt-header', f.header);

  r.style.setProperty('--tile-face-top', t.faceTop);
  r.style.setProperty('--tile-face-bottom', t.faceBottom);
  r.style.setProperty('--tile-man', t.man);
  r.style.setProperty('--tile-pin', t.pin);
  r.style.setProperty('--tile-sou', t.sou);
  r.style.setProperty('--tile-wind', t.wind);
  r.style.setProperty('--tile-zhong', t.zhong);
  r.style.setProperty('--tile-fa', t.fa);
  r.style.setProperty('--tile-bai', t.bai);
}

// ── Contrast guard ────────────────────────────────────────────────────────────

/**
 * Returns the relative luminance (0–1) of a 6-digit hex colour.
 * Uses the WCAG 2 formula.
 */
export function hexLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Given a background hex colour, returns a foreground ink colour that
 * meets WCAG AA contrast. Dark backgrounds → light ink; light → dark ink.
 *
 * Threshold 0.179 chosen so that the WCAG 4.5:1 ratio is met for both ends.
 */
export function contrastGuard(bgHex: string): string {
  return hexLuminance(bgHex) > 0.179 ? '#1f2937' : '#f5efdf';
}
