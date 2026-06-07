/**
 * use-orientation.test.ts — unit tests for the useOrientation hook.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOrientation, MOBILE_BREAKPOINT_PX } from './use-orientation';

// ── Browser API stubs ─────────────────────────────────────────────────────────

function setWindowSize(w: number, h: number) {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: h, configurable: true, writable: true });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useOrientation', () => {
  beforeEach(() => {
    // Default: desktop landscape
    setWindowSize(1280, 800);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Orientation·desktop: wide viewport starts in desktop mode', () => {
    setWindowSize(1280, 800);
    const { result } = renderHook(() => useOrientation());
    expect(result.current.mode).toBe('desktop');
    expect(result.current.isMobileLandscapeForced).toBe(false);
  });

  it('Orientation·needs-gesture: narrow portrait viewport starts in needs-gesture mode', () => {
    setWindowSize(390, 844); // iPhone portrait
    const { result } = renderHook(() => useOrientation());
    expect(result.current.mode).toBe('needs-gesture');
  });

  it('Orientation·breakpoint: exactly MOBILE_BREAKPOINT_PX wide is desktop mode', () => {
    setWindowSize(MOBILE_BREAKPOINT_PX, 900);
    const { result } = renderHook(() => useOrientation());
    expect(result.current.mode).toBe('desktop');
  });

  it('Orientation·css-landscape: requestNativeLandscape sets css-landscape on fullscreen rejection', async () => {
    setWindowSize(390, 844);

    // Simulate fullscreen API rejection (iOS Safari behaviour).
    // jsdom doesn't implement requestFullscreen, so we stub it on the prototype.
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      value: vi.fn().mockRejectedValue(new Error('Not allowed')),
      configurable: true,
      writable: true,
    });

    const { result } = renderHook(() => useOrientation());
    expect(result.current.mode).toBe('needs-gesture');

    await act(async () => {
      await result.current.requestNativeLandscape();
    });

    expect(result.current.mode).toBe('css-landscape');
    expect(result.current.isMobileLandscapeForced).toBe(true);
  });

  it('Orientation·native-landscape: requestNativeLandscape sets native-landscape on success', async () => {
    setWindowSize(390, 844);

    const lockMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      value: vi.fn().mockResolvedValue(undefined),
      configurable: true,
      writable: true,
    });
    Object.defineProperty(screen, 'orientation', {
      value: { lock: lockMock },
      configurable: true,
    });

    const { result } = renderHook(() => useOrientation());
    await act(async () => {
      await result.current.requestNativeLandscape();
    });

    expect(result.current.mode).toBe('native-landscape');
    expect(lockMock).toHaveBeenCalledWith('landscape');
  });

  it('Orientation·vw-vh: exposes current viewport dimensions', () => {
    setWindowSize(414, 896);
    const { result } = renderHook(() => useOrientation());
    expect(result.current.vw).toBe(414);
    expect(result.current.vh).toBe(896);
  });

  it('Orientation·fullscreen-exit: mode reverts to needs-gesture when fullscreen exits', async () => {
    setWindowSize(390, 844);
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      value: vi.fn().mockResolvedValue(undefined),
      configurable: true,
      writable: true,
    });
    const lockMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(screen, 'orientation', {
      value: { lock: lockMock },
      configurable: true,
    });

    const { result } = renderHook(() => useOrientation());
    await act(async () => {
      await result.current.requestNativeLandscape();
    });
    expect(result.current.mode).toBe('native-landscape');

    // Simulate fullscreen exit (document.fullscreenElement becomes null).
    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      configurable: true,
    });
    await act(async () => {
      document.dispatchEvent(new Event('fullscreenchange'));
    });

    expect(result.current.mode).toBe('needs-gesture');
  });
});
