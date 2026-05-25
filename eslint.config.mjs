import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { fixupPluginRules } from '@eslint/compat';
import i18nextPlugin from 'eslint-plugin-i18next';

export default tseslint.config(
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // ── i18n: ban raw string literals in JSX ─────────────────────────────────
  // Applied only to app/component source; tests and scripts are excluded.
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: ['apps/web/src/**/*.test.{ts,tsx}', 'apps/web/src/test-setup.ts'],
    plugins: {
      i18next: fixupPluginRules(i18nextPlugin),
    },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          mode: 'jsx-only',

          // ── JSX attribute names whose VALUES are never user-visible text ──────
          // The plugin option is `jsx-attributes.exclude`, NOT `ignoreAttribute`.
          // aria-* attributes will be revisited in the Phase 12 a11y pass.
          'jsx-attributes': {
            exclude: [
              // HTML / React element technical attributes
              'className',
              'styleName',
              'class',
              'style',
              'type',
              'id',
              'htmlFor',
              'tabIndex',
              'role',
              'key',
              'href',
              'src',
              'target',
              'rel',
              'name',
              'width',
              'height',
              'autoComplete',
              'autoCapitalize',
              'autoCorrect',
              'inputMode',
              'spellCheck',
              'maxLength',
              'pattern',
              'placeholder',
              'data-testid',
              // React Router — path strings are routes, not translatable text
              'to',
              'path',
              'from',
              'replace',
              // aria-* (Phase 12 a11y pass)
              'aria-label',
              'aria-labelledby',
              'aria-describedby',
              'aria-hidden',
              'aria-pressed',
              'aria-selected',
              'aria-live',
            ],
          },

          // ── Function / method calls whose string arguments are not UI text ───
          callees: {
            exclude: [
              // i18next / react-i18next
              'i18n(ext)?',
              't',
              // bundler / node
              'require',
              // browser APIs
              'addEventListener',
              'removeEventListener',
              'postMessage',
              'getElementById',
              // state management
              'dispatch',
              'commit',
              // string predicates
              'includes',
              'indexOf',
              'endsWith',
              'startsWith',
              // react-hook-form (field names are technical identifiers)
              'register',
              // react-router-dom (path strings are routes, not UI text)
              'navigate',
              // useState setters (internal state identifiers, e.g. setStep('confirm'))
              'set[A-Z].*',
            ],
          },

          // ── Literal string values that are never user-visible text ────────────
          words: {
            exclude: [
              // ASCII special chars / digit-only strings (plugin default)
              '[0-9!-/:-@[-`{-~]+',
              // ALL_CAPS identifiers (plugin default)
              '[A-Z_-]+',
              // Emoji (plugin default)
              /^\p{Emoji}+$/u,
              // Arrows, bullets, and typographic symbols used decoratively in JSX
              // (these are in the plugin's default HTML-entities regex; we list
              //  them explicitly here since we override the words.exclude array)
              '←',
              '→',
              '↑',
              '↓',
              '•',
              '…',
              '—',
              '–',
              '›',
              '‹',
              '«',
              '»',
              // Decorative check-mark used in confirmation-success boxes
              '✓',
              // camelCase identifiers: i18n keys, field names, route segments,
              // state values (e.g. 'signin', 'email', 'deleteConsequence1').
              // Requires ≥ 2 chars starting with lowercase — excludes visible
              // sentences (spaces), Chinese text, capitalised words, etc.
              '[a-z][a-zA-Z0-9]+',
            ],
          },
        },
      ],
    },
  },

  {
    ignores: ['**/dist/**', '**/build/**', '**/cdk.out/**', '**/coverage/**', '**/node_modules/**'],
  },
);
