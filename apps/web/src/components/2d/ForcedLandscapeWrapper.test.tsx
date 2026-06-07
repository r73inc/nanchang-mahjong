/**
 * ForcedLandscapeWrapper.test.tsx — unit tests for the CSS-rotate fallback wrapper.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { ForcedLandscapeWrapper } from './ForcedLandscapeWrapper';

function renderWrapper(active: boolean) {
  return render(
    <I18nProvider>
      <ForcedLandscapeWrapper active={active}>
        <span data-testid="child">content</span>
      </ForcedLandscapeWrapper>
    </I18nProvider>,
  );
}

describe('ForcedLandscapeWrapper', () => {
  it('Wrapper·passthrough: renders children without rotation when active=false', () => {
    renderWrapper(false);
    expect(screen.getByTestId('child')).toBeInTheDocument();
    // The wrapper should not apply the mj-landscape-wrapper class when inactive.
    const container = screen.getByTestId('child').parentElement;
    expect(container?.className).not.toContain('mj-landscape-wrapper');
  });

  it('Wrapper·active: applies mj-landscape-wrapper class when active=true', () => {
    renderWrapper(true);
    const container = screen.getByTestId('child').parentElement;
    expect(container?.className).toContain('mj-landscape-wrapper');
  });

  it('Wrapper·rotate: active wrapper has rotate(90deg) transform', () => {
    renderWrapper(true);
    const container = screen.getByTestId('child').parentElement;
    expect(container?.style.transform).toContain('rotate(90deg)');
  });

  it('Wrapper·touch-action: active wrapper suppresses touch-action', () => {
    renderWrapper(true);
    const container = screen.getByTestId('child').parentElement;
    expect(container?.style.touchAction).toBe('none');
  });

  it('Wrapper·children: renders children when active=true', () => {
    render(
      <I18nProvider>
        <ForcedLandscapeWrapper active={true}>
          <span data-testid="inner">game content</span>
        </ForcedLandscapeWrapper>
      </I18nProvider>,
    );
    expect(screen.getByTestId('inner')).toBeInTheDocument();
    expect(screen.getByTestId('inner').textContent).toBe('game content');
  });

  // ── Phase 14C: a11y aria-label ───────────────────────────────────────────────

  it('A11y·aria-label: active wrapper has aria-label from i18n key gameLandscapeMode', () => {
    renderWrapper(true);
    const container = screen.getByTestId('child').parentElement;
    // The aria-label is set from t('gameLandscapeMode') — EN value in test env.
    expect(container).toHaveAttribute('aria-label', 'Game table rotated to landscape');
  });

  it('A11y·no-aria-label: inactive passthrough div has no aria-label', () => {
    renderWrapper(false);
    const container = screen.getByTestId('child').parentElement;
    expect(container).not.toHaveAttribute('aria-label');
  });
});
