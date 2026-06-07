/**
 * ForcedLandscapeWrapper.test.tsx — unit tests for the CSS-rotate fallback wrapper.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ForcedLandscapeWrapper } from './ForcedLandscapeWrapper';

describe('ForcedLandscapeWrapper', () => {
  it('Wrapper·passthrough: renders children without rotation when active=false', () => {
    render(
      <ForcedLandscapeWrapper active={false}>
        <span data-testid="child">content</span>
      </ForcedLandscapeWrapper>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
    // The wrapper should not apply the mj-landscape-wrapper class when inactive.
    const container = screen.getByTestId('child').parentElement;
    expect(container?.className).not.toContain('mj-landscape-wrapper');
  });

  it('Wrapper·active: applies mj-landscape-wrapper class when active=true', () => {
    render(
      <ForcedLandscapeWrapper active={true}>
        <span data-testid="child">content</span>
      </ForcedLandscapeWrapper>,
    );
    const container = screen.getByTestId('child').parentElement;
    expect(container?.className).toContain('mj-landscape-wrapper');
  });

  it('Wrapper·rotate: active wrapper has rotate(90deg) transform', () => {
    render(
      <ForcedLandscapeWrapper active={true}>
        <span data-testid="child">content</span>
      </ForcedLandscapeWrapper>,
    );
    const container = screen.getByTestId('child').parentElement;
    expect(container?.style.transform).toContain('rotate(90deg)');
  });

  it('Wrapper·touch-action: active wrapper suppresses touch-action', () => {
    render(
      <ForcedLandscapeWrapper active={true}>
        <span data-testid="child">content</span>
      </ForcedLandscapeWrapper>,
    );
    const container = screen.getByTestId('child').parentElement;
    expect(container?.style.touchAction).toBe('none');
  });

  it('Wrapper·children: renders children when active=true', () => {
    render(
      <ForcedLandscapeWrapper active={true}>
        <span data-testid="inner">game content</span>
      </ForcedLandscapeWrapper>,
    );
    expect(screen.getByTestId('inner')).toBeInTheDocument();
    expect(screen.getByTestId('inner').textContent).toBe('game content');
  });
});
