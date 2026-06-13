/**
 * MobileLandscapeGate.test.tsx — tests for the mode-based gate orchestrator.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileLandscapeGate } from './MobileLandscapeGate';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderGate(
  mode: Parameters<typeof MobileLandscapeGate>[0]['mode'],
  onRequestNative = vi.fn(),
) {
  return render(
    <MobileLandscapeGate mode={mode} onRequestNative={onRequestNative}>
      <div data-testid="game-content">game</div>
    </MobileLandscapeGate>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MobileLandscapeGate', () => {
  it('Gate·desktop: renders children without overlay in desktop mode', () => {
    renderGate('desktop');
    expect(screen.getByTestId('game-content')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-tap-to-play-overlay')).not.toBeInTheDocument();
  });

  it('Gate·native-landscape: renders children without overlay in native-landscape mode', () => {
    renderGate('native-landscape');
    expect(screen.getByTestId('game-content')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-tap-to-play-overlay')).not.toBeInTheDocument();
  });

  it('Gate·needs-gesture: shows tap-to-play overlay and hides children', () => {
    renderGate('needs-gesture');
    expect(screen.getByTestId('mobile-tap-to-play-overlay')).toBeInTheDocument();
    expect(screen.queryByTestId('game-content')).not.toBeInTheDocument();
  });

  it('Gate·cta-fires: tapping the CTA button calls onRequestNative', () => {
    const onRequestNative = vi.fn().mockResolvedValue(undefined);
    renderGate('needs-gesture', onRequestNative);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(onRequestNative).toHaveBeenCalledTimes(1);
  });

  it('Gate·css-landscape: renders children as passthrough when css-landscape', () => {
    // ForcedLandscapeWrapper is now applied at the GameTable level (game-page.tsx)
    // so all overlays rotate together with the game surface. MobileLandscapeGate
    // is a plain passthrough for css-landscape.
    renderGate('css-landscape');
    expect(screen.getByTestId('game-content')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-tap-to-play-overlay')).not.toBeInTheDocument();
    const container = screen.getByTestId('game-content').parentElement;
    expect(container?.className).not.toContain('mj-landscape-wrapper');
  });
});
