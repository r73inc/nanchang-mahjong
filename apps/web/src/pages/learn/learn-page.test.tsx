/**
 * learn-page.test.tsx
 *
 * Feature coverage:
 *  - Learn·examples-render: every tab mounts without error and shows tile examples
 *  - Learn·all-strings-translated: EN and ZH locale files have identical learn key sets
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../../i18n';
import { LearnPage } from './learn-page';
import en from '../../i18n/en.json';
import zh from '../../i18n/zh.json';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <I18nProvider>
        <MemoryRouter initialEntries={['/learn']}>
          <Routes>
            <Route path="/learn" element={<LearnPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LearnPage', () => {
  it('Learn·examples-render — renders the Overview tab with tiles on mount', () => {
    renderPage();
    expect(screen.getByText('What is Nanchang Mahjong?')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /overview/i })).toBeInTheDocument();
    // Tab bar has all 6 tabs
    expect(screen.getAllByRole('tab')).toHaveLength(6);
  });

  it('Learn·examples-render — switching to Tiles tab renders tile suit content', () => {
    renderPage();
    const tilesTab = screen.getByRole('tab', { name: /tiles/i });
    fireEvent.click(tilesTab);
    expect(screen.getByRole('heading', { name: /suited tiles/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /honor tiles/i })).toBeInTheDocument();
  });

  it('Learn·examples-render — switching to Spirit tab renders spirit tile content', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /spirit/i }));
    // Labels use the specific i18n key text which includes the Chinese characters
    expect(screen.getByText(/Primary Spirit \(正精\)/)).toBeInTheDocument();
    expect(screen.getByText(/Secondary Spirit \(副精\)/)).toBeInTheDocument();
  });

  it('Learn·examples-render — switching to Hands tab renders winning hand types', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /hands/i }));
    expect(screen.getByText(/standard hand/i)).toBeInTheDocument();
    expect(screen.getByText(/small seven pairs/i)).toBeInTheDocument();
    expect(screen.getByText(/all triplets/i)).toBeInTheDocument();
  });

  it('Learn·examples-render — switching to Scoring tab renders scoring rules', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /scoring/i }));
    expect(screen.getByText(/base points/i)).toBeInTheDocument();
    expect(screen.getByText(/self-draw/i)).toBeInTheDocument();
  });

  it('Learn·all-strings-translated — EN and ZH have matching learn* key sets', () => {
    const enKeys = Object.keys(en).filter((k) => k.startsWith('learn'));
    const zhKeys = Object.keys(zh).filter((k) => k.startsWith('learn'));
    expect(enKeys.sort()).toEqual(zhKeys.sort());
    expect(enKeys.length).toBeGreaterThan(30);
  });
});
