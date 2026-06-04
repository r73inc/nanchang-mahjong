/**
 * customize-page.test.tsx
 *
 * Feature coverage:
 *  - Customize·persistence: choosing a theme stores the value in localStorage
 *  - Customize·contrast-guard: hexLuminance / contrastGuard returns correct ink
 *  - Customize·renders: all three sections render (felt, palette, sound)
 *  - Customize·sound-toggle: sound switch flips the store and UI
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../../i18n';
import { CustomizePage } from './customize-page';
import { useThemeStore } from '../../stores/theme.store';
import { hexLuminance, contrastGuard } from '../../lib/theme.utils';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <I18nProvider>
        <MemoryRouter initialEntries={['/customize']}>
          <Routes>
            <Route path="/customize" element={<CustomizePage />} />
            <Route path="/home" element={<div>Home</div>} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Customize·contrast-guard', () => {
  it('returns light ink for a dark background', () => {
    expect(hexLuminance('#1a1a1a')).toBeLessThan(0.179);
    expect(contrastGuard('#1a1a1a')).toBe('#f5efdf');
  });

  it('returns dark ink for a light background', () => {
    expect(hexLuminance('#fffbeb')).toBeGreaterThan(0.179);
    expect(contrastGuard('#fffbeb')).toBe('#1f2937');
  });

  it('handles white correctly', () => {
    expect(contrastGuard('#ffffff')).toBe('#1f2937');
  });

  it('handles black correctly', () => {
    expect(contrastGuard('#000000')).toBe('#f5efdf');
  });
});

describe('CustomizePage', () => {
  beforeEach(() => {
    // Reset store to defaults before each test
    useThemeStore.setState({ felt: 'jade', tilePalette: 'classic', soundEnabled: false });
  });

  it('Customize·renders — shows all three sections', () => {
    renderPage();
    expect(screen.getByText(/table felt/i)).toBeInTheDocument();
    expect(screen.getByText(/tile face/i)).toBeInTheDocument();
    expect(screen.getAllByText(/sound effects/i).length).toBeGreaterThan(0);
  });

  it('Customize·renders — shows all four felt options', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /jade/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /crimson/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /slate/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /navy/i })).toBeInTheDocument();
  });

  it('Customize·persistence — selecting crimson felt updates the store', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /crimson/i }));
    expect(useThemeStore.getState().felt).toBe('crimson');
  });

  it('Customize·persistence — selecting dark palette updates the store', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /dark/i }));
    expect(useThemeStore.getState().tilePalette).toBe('dark');
  });

  it('Customize·persistence — store change is reflected in localStorage key', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /navy/i }));
    const raw = localStorage.getItem('nanchang-theme');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as { state: { felt: string } };
    expect(parsed.state.felt).toBe('navy');
  });

  it('Customize·sound-toggle — clicking the switch toggles sound on', () => {
    renderPage();
    const toggle = screen.getByRole('switch', { name: /sound effects/i });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(useThemeStore.getState().soundEnabled).toBe(true);
  });
});
