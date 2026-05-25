// Theme context — single source of truth for tile/felt skinning.
// Persists to localStorage so the Customize screen and Gameplay screen stay in sync.

const DEFAULT_THEME = {
  felt:       '#0d3b2e',  // table cloth
  back:       '#0d3b2e',  // tile back fill
  backAccent: '#c9a961',  // tile back border / glyph
  face:       '#f5efdf',  // tile face fill
  edge:       '#d8cfb3',  // tile face edge gradient stop
  ink:        '#1f2937',  // primary ink
  redInk:     '#c0392b',  // red ink (characters, dragons)
  greenInk:   '#1f7a4d',  // green ink (dots, bams)
  sound: 0,               // sound pack index
};

// Felt presets — felt fills get a darker companion automatically through oklch().
const FELT_PRESETS = {
  '#0d3b2e': { ink: '#1f2937', face: '#f5efdf', edge: '#d8cfb3' },     // jade — default
  '#1a1a2e': { ink: '#1f2937', face: '#f5efdf', edge: '#d8cfb3' },     // midnight
  '#5c2a1e': { ink: '#1f2937', face: '#f5efdf', edge: '#d8cfb3' },     // mahogany
  '#2d4a3e': { ink: '#1f2937', face: '#f5efdf', edge: '#d8cfb3' },     // forest
  '#3a3a3a': { ink: '#1f2937', face: '#f5efdf', edge: '#d8cfb3' },     // slate
};

// Dark-face palette needs inverted ink so glyphs read.
function deriveInkForFace(face) {
  // crude luminance check on hex — dark face => light ink
  const m = /^#?([0-9a-f]{6})$/i.exec(face);
  if (!m) return { ink: '#1f2937', redInk: '#c0392b', greenInk: '#1f7a4d' };
  const v = parseInt(m[1], 16);
  const r = (v >> 16) & 0xff, g = (v >> 8) & 0xff, b = v & 0xff;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum < 0.4) {
    return { ink: '#f5efdf', redInk: '#ff8a7a', greenInk: '#7fc299' };
  }
  return { ink: '#1f2937', redInk: '#c0392b', greenInk: '#1f7a4d' };
}

const ThemeCtx = React.createContext({
  theme: DEFAULT_THEME,
  setTheme: () => {},
});

function ThemeProvider({ children }) {
  const [theme, setThemeState] = React.useState(() => {
    try {
      const raw = localStorage.getItem('mj_theme');
      if (raw) return { ...DEFAULT_THEME, ...JSON.parse(raw) };
    } catch {}
    return DEFAULT_THEME;
  });

  const setTheme = React.useCallback((next) => {
    setThemeState((prev) => {
      const partial = typeof next === 'function' ? next(prev) : next;
      const merged = { ...prev, ...partial };
      // when face changes, recompute ink colors
      if (partial.face && partial.face !== prev.face) {
        Object.assign(merged, deriveInkForFace(partial.face));
      }
      try { localStorage.setItem('mj_theme', JSON.stringify(merged)); } catch {}
      return merged;
    });
  }, []);

  return (
    <ThemeCtx.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeCtx.Provider>
  );
}

function useTheme() { return React.useContext(ThemeCtx); }

// Helper — felt gradient string used by GameScreen / Wildcard / EndGame
function feltGradient(felt) {
  return `radial-gradient(ellipse at center, oklch(from ${felt} calc(l * 1.25) c h) 0%, ${felt} 50%, oklch(from ${felt} calc(l * 0.4) c h) 100%)`;
}

function feltLinearGradient(felt) {
  return `linear-gradient(180deg, ${felt} 0%, oklch(from ${felt} calc(l * 0.45) c h) 100%)`;
}

Object.assign(window, { ThemeProvider, useTheme, feltGradient, feltLinearGradient, DEFAULT_THEME });
