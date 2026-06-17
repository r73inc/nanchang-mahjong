/**
 * Theme store — persisted to localStorage as 'nanchang-theme'.
 *
 * Drives:
 *  - Table felt color (4 presets)
 *  - Tile face palette (3 presets)
 *  - Sound effects toggle
 *  - Tile size preference (IMP-037)
 *  - Auto-sort drawn tile toggle (IMP-038)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type FeltTheme = 'jade' | 'crimson' | 'slate' | 'navy' | 'yellow';
export type TilePalette =
  | 'classic'
  | 'sepia'
  | 'dark'
  | 'lime'
  | 'frosted-blue'
  | 'tomato-jam'
  | 'pastel-petal'
  | 'radioactive-grass'
  | 'indigo-ink';
export type TileSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** Scale multipliers for each user-selectable tile size. */
export const TILE_USER_SCALE: Record<TileSize, number> = {
  xs: 0.5,
  sm: 0.75,
  md: 1.0,
  lg: 1.25,
  xl: 1.5,
};

interface ThemeState {
  felt: FeltTheme;
  tilePalette: TilePalette;
  soundEnabled: boolean;
  tileSize: TileSize;
  autoSortDrawnTile: boolean;
  setFelt: (f: FeltTheme) => void;
  setTilePalette: (p: TilePalette) => void;
  setSoundEnabled: (v: boolean) => void;
  setTileSize: (s: TileSize) => void;
  setAutoSortDrawnTile: (v: boolean) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      felt: 'jade',
      tilePalette: 'classic',
      soundEnabled: true,
      tileSize: 'md',
      autoSortDrawnTile: false,
      setFelt: (felt) => set({ felt }),
      setTilePalette: (tilePalette) => set({ tilePalette }),
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      setTileSize: (tileSize) => set({ tileSize }),
      setAutoSortDrawnTile: (autoSortDrawnTile) => set({ autoSortDrawnTile }),
    }),
    { name: 'nanchang-theme' },
  ),
);
