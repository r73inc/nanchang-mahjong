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

/**
 * Simulate a touch device (phone/tablet) by setting maxTouchPoints > 1.
 * Desktop browsers report 0 (the jsdom default).
 */
function setMaxTouchPoints(n: number) {
  Object.defineProperty(navigator, 'maxTouchPoints', {
    value: n,
    configurable: true,
    writable: true,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useOrientation', () => {
  beforeEach(() => {
    // Default: non-touch desktop with a wide viewport.
    setMaxTouchPoints(0);
    setWindowSize(1280, 800);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Initial mode detection ──────────────────────────────────────────────────

  it('Orientation·desktop: non-touch device starts in desktop mode regardless of width', () => {
    setMaxTouchPoints(0);
    setWindowSize(1280, 800);
    const { result } = renderHook(() => useOrientation());
    expect(result.current.mode).toBe('desktop');
    expect(result.current.isMobileLandscapeForced).toBe(false);
  });

  it('Orientation·desktop-tablet: touch tablet (both dims ≥ breakpoint) starts in desktop mode', () => {
    // iPad-like: both dimensions ≥ 600px — treated as desktop-class touch device.
    setMaxTouchPoints(5);
    setWindowSize(768, 1024);
    const { result } = renderHook(() => useOrientation());
    expect(result.current.mode).toBe('desktop');
  });

  it('Orientation·desktop-tablet-landscape: touch tablet in landscape starts in desktop mode', () => {
    setMaxTouchPoints(5);
    setWindowSize(1024, 768);
    const { result } = renderHook(() => useOrientation());
    expect(result.current.mode).toBe('desktop');
  });

  it('Orientation·needs-gesture: portrait phone starts in needs-gesture mode', () => {
    setMaxTouchPoints(5);
    setWindowSize(390, 844); // iPhone portrait
    const { result } = renderHook(() => useOrientation());
    expect(result.current.mode).toBe('needs-gesture');
  });

  it('Orientation·needs-gesture-landscape: phone already in landscape starts in needs-gesture mode', () => {
    // BUG-FIX regression: previously getInitialMode(844, 390) returned 'desktop'
    // because innerWidth (844) >= MOBILE_BREAKPOINT_PX (600).
    // With maxTouchPoints detection, landscape phones correctly get 'needs-gesture'.
    setMaxTouchPoints(5);
    setWindowSize(844, 390); // iPhone landscape (e.g. opened app with phone already rotated)
    const { result } = renderHook(() => useOrientation());
    expect(result.current.mode).toBe('needs-gesture');
  });

  it('Orientation·breakpoint: touch tablet at exactly MOBILE_BREAKPOINT_PX in both dims is desktop', () => {
    setMaxTouchPoints(5);
    setWindowSize(MOBILE_BREAKPOINT_PX, MOBILE_BREAKPOINT_PX);
    const { result } = renderHook(() => useOrientation());
    expect(result.current.mode).toBe('desktop');
  });

  // ── Fullscreen API transitions ──────────────────────────────────────────────

  it('Orientation·css-landscape: requestNativeLandscape sets css-landscape on fullscreen rejection', async () => {
    setMaxTouchPoints(5);
    setWindowSize(390, 844);

    // Simulate fullscreen API rejection (iOS Safari behaviour).
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
    setMaxTouchPoints(5);
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

  // ── Viewport dimensions ─────────────────────────────────────────────────────

  it('Orientation·vw-vh: exposes current viewport dimensions', () => {
    setMaxTouchPoints(5);
    setWindowSize(414, 896);
    const { result } = renderHook(() => useOrientation());
    expect(result.current.vw).toBe(414);
    expect(result.current.vh).toBe(896);
  });

  // ── Fullscreen exit ─────────────────────────────────────────────────────────

  it('Orientation·fullscreen-exit: mode reverts to needs-gesture when fullscreen exits', async () => {
    setMaxTouchPoints(5);
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
