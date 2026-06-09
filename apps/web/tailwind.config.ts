import type { Config } from 'tailwindcss';

// Design tokens transcribed from the Handoff Sheet.
// See: Family Mahjong webap-handoff/family-mahjong-webap/project/Handoff Sheet.html
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // ── Colors ───────────────────────────────────────────────
      colors: {
        // Brand pair
        'mj-gold': '#c9a961',
        'mj-gold-2': '#a88a45',
        'mj-jade': '#0d3b2e',
        'mj-jade-deep': '#051a13',
        // Ink
        'mj-bone': '#f5efdf',
        'mj-slate': '#1f2937',
        // Semantic
        'mj-win': '#7fc299',
        'mj-win-deep': '#1f7a4d',
        'mj-loss': '#c0392b',
        'mj-loss-light': '#e88080',
        // Dark surfaces
        'mj-bg-page': '#0a0a0a',
        'mj-bg-card': '#141414',
        'mj-bg-elev': '#1c1c1c',
        // Player winds (compass seats)
        'mj-east': '#c9a961', // You (bottom seat)
        'mj-south': '#a36d3e',
        'mj-west': '#5a7d8c',
        'mj-north': '#7d4f4f',
      },

      // ── Typography ───────────────────────────────────────────
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        serif: ['"Noto Serif SC"', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },

      // ── Spacing (4px base, s-1 through s-9) ─────────────────
      spacing: {
        's-1': '4px',
        's-2': '8px',
        's-3': '12px',
        's-4': '16px',
        's-5': '20px',
        's-6': '24px',
        's-7': '32px',
        's-8': '48px',
        's-9': '64px',
      },

      // ── Border radius ────────────────────────────────────────
      borderRadius: {
        xs: '4px', // tile inner
        sm: '8px', // chips, small buttons
        md: '12px', // standard card
        lg: '16px', // hero card
        xl: '22px', // modal, sheet
        pill: '999px', // pills, badges
      },

      // ── Shadows (three elevation levels) ────────────────────
      boxShadow: {
        cta: '0 6px 18px rgba(201, 169, 97, 0.3)',
        overlay: '0 12px 40px rgba(0, 0, 0, 0.55)',
        viewport:
          '0 30px 80px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(201, 169, 97, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
      },

      // ── Max widths ───────────────────────────────────────────
      maxWidth: {
        viewport: '460px', // phone-column on tablet+
      },

      // ── Motion tokens ────────────────────────────────────────
      transitionTimingFunction: {
        'mj-standard': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'mj-emphasized': 'cubic-bezier(0.2, 0, 0, 1)',
      },
      transitionDuration: {
        fast: '200ms',
        base: '400ms',
        emphasized: '600ms',
      },
      animationDuration: {
        fast: '200ms',
        base: '400ms',
        emphasized: '600ms',
        ambient: '1600ms',
      },

      // ── Keyframes (choreographed moments from Handoff Sheet §07) ──
      keyframes: {
        'tile-discard': {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(0.9)', opacity: '0.8' },
          '100%': { transform: 'scale(0)', opacity: '0' },
        },
        'call-prompt-enter': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'last-discard-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(201, 169, 97, 0)' },
          '50%': { boxShadow: '0 0 0 6px rgba(201, 169, 97, 0.35)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'your-turn-flash': {
          '0%': { opacity: '0', transform: 'scale(0.88)' },
          '18%': { opacity: '1', transform: 'scale(1.0)' },
          '70%': { opacity: '1', transform: 'scale(1.0)' },
          '100%': { opacity: '0', transform: 'scale(0.96)' },
        },
      },
      animation: {
        'tile-discard': 'tile-discard 280ms cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'call-prompt-enter': 'call-prompt-enter 250ms cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'last-discard-pulse': 'last-discard-pulse 1600ms ease-in-out infinite',
        shimmer: 'shimmer 1400ms linear infinite',
        'your-turn-flash': 'your-turn-flash 2000ms ease-out forwards',
      },
    },
  },
  plugins: [],
};

export default config;
