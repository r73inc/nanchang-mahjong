/**
 * AiSummaryPanel.test.tsx
 *
 * Feature coverage:
 *  - AiSummary·collapsed: panel is collapsed by default (body not visible)
 *  - AiSummary·expand: clicking the header expands the panel
 *  - AiSummary·request-button: shows request button when no summary exists
 *  - AiSummary·pending: shows queue message when status is 'requested'
 *  - AiSummary·processing: shows generating message when status is 'processing'
 *  - AiSummary·done: renders summary text when status is 'done'
 *  - AiSummary·failed: shows failure message when status is 'failed'
 *  - AiSummary·lang-fallback: falls back to the other language when preferred is absent
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '../i18n';
import { AiSummaryPanel } from './AiSummaryPanel';
import type { AiSummaryPublic } from '@nanchang/shared';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPanel(props: {
  summary?: AiSummaryPublic | null;
  isLoading?: boolean;
  isRequesting?: boolean;
  onRequest?: () => void;
  label?: string;
}) {
  return render(
    <I18nProvider>
      <AiSummaryPanel
        summary={props.summary ?? null}
        isLoading={props.isLoading ?? false}
        isRequesting={props.isRequesting ?? false}
        onRequest={props.onRequest ?? vi.fn()}
        label={props.label}
      />
    </I18nProvider>,
  );
}

function expandPanel() {
  const toggle = screen.getByRole('button', { name: /expand ai commentary/i });
  fireEvent.click(toggle);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AiSummaryPanel', () => {
  it('AiSummary·collapsed — body is not visible by default', () => {
    renderPanel({ summary: null });
    expect(screen.queryByRole('button', { name: /request ai summary/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /expand ai commentary/i })).toBeInTheDocument();
  });

  it('AiSummary·expand — clicking header reveals the body', () => {
    renderPanel({ summary: null });
    expandPanel();
    expect(screen.getByRole('button', { name: /request ai summary/i })).toBeInTheDocument();
  });

  it('AiSummary·request-button — calls onRequest when the request button is clicked', () => {
    const onRequest = vi.fn();
    renderPanel({ summary: null, onRequest });
    expandPanel();
    fireEvent.click(screen.getByRole('button', { name: /request ai summary/i }));
    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  it('AiSummary·pending — shows queue message for requested status', () => {
    renderPanel({ summary: { status: 'requested' } });
    expandPanel();
    expect(screen.getByText(/in the queue/i)).toBeInTheDocument();
  });

  it('AiSummary·processing — shows generating message for processing status', () => {
    renderPanel({ summary: { status: 'processing' } });
    expandPanel();
    expect(screen.getByText(/generating/i)).toBeInTheDocument();
  });

  it('AiSummary·done — renders the summary text when status is done', () => {
    const summary: AiSummaryPublic = {
      status: 'done',
      text: { en: 'Great game!', zh: '好棋！' },
    };
    renderPanel({ summary });
    expandPanel();
    expect(screen.getByText('Great game!')).toBeInTheDocument();
  });

  it('AiSummary·failed — shows failure message for failed status', () => {
    renderPanel({ summary: { status: 'failed' } });
    expandPanel();
    expect(screen.getByText(/generation failed/i)).toBeInTheDocument();
  });

  it('AiSummary·lang-fallback — falls back to zh when en text is missing', () => {
    const summary: AiSummaryPublic = {
      status: 'done',
      text: { en: '', zh: '好棋！' },
    };
    renderPanel({ summary });
    expandPanel();
    expect(screen.getByText('好棋！')).toBeInTheDocument();
  });
});
