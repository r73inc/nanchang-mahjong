/**
 * Theme store — persisted to localStorage as 'nanchang-theme'.
 *
 * Drives:
 *  - Table felt color (4 presets)
 *  - Tile face palette (3 presets)
 *  - Sound effects toggle
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type FeltTheme = 'jade' | 'crimson' | 'slate' | 'navy';
export type TilePalette = 'classic' | 'sepia' | 'dark';

interface ThemeState {
  felt: FeltTheme;
  tilePalette: TilePalette;
  soundEnabled: boolean;
  setFelt: (f: FeltTheme) => void;
  setTilePalette: (p: TilePalette) => void;
  setSoundEnabled: (v: boolean) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      felt: 'jade',
      tilePalette: 'classic',
      soundEnabled: false,
      setFelt: (felt) => set({ felt }),
      setTilePalette: (tilePalette) => set({ tilePalette }),
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
    }),
    { name: 'nanchang-theme' },
  ),
);
