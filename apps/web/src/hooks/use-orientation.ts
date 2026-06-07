/**
 * useOrientation — mobile landscape mode state machine.
 *
 * Four modes:
 *   'desktop'           — viewport ≥ 600px wide, or already landscape: normal rendering
 *   'needs-gesture'     — portrait mobile, waiting for user tap to request fullscreen
 *   'native-landscape'  — fullscreen + screen.orientation.lock('landscape') granted
 *   'css-landscape'     — fullscreen API rejected (iOS Safari); CSS rotate fallback active
 *
 * On mobile portrait the caller should show a "Tap to Play" overlay that invokes
 * requestNativeLandscape(). If that Promise rejects the hook self-transitions to
 * 'css-landscape' automatically.
 */

import { useState, useCallback, useEffect, useRef } from 'react';

export const MOBILE_BREAKPOINT_PX = 600;

export type LandscapeMode = 'desktop' | 'needs-gesture' | 'native-landscape' | 'css-landscape';

export interface OrientationState {
  mode: LandscapeMode;
  /** Shorthand: mode === 'css-landscape' */
  isMobileLandscapeForced: boolean;
  vw: number;
  vh: number;
  requestNativeLandscape: () => Promise<void>;
}

function getInitialMode(vw: number, vh: number): LandscapeMode {
  if (vw >= MOBILE_BREAKPOINT_PX || vw > vh) return 'desktop';
  return 'needs-gesture';
}

export function useOrientation(): OrientationState {
  const [vw, setVw] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1024));
  const [vh, setVh] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 768));
  const [mode, setMode] = useState<LandscapeMode>(() => {
    if (typeof window === 'undefined') return 'desktop';
    return getInitialMode(window.innerWidth, window.innerHeight);
  });

  // Track last known mode so we can restore 'needs-gesture' on fullscreen exit.
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Debounced resize / orientation change.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let timer: ReturnType<typeof setTimeout>;

    function handleResize() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        setVw(w);
        setVh(h);
        // Only auto-update mode when we are not already in a native/css-landscape session.
        setMode((prev) => {
          if (prev === 'native-landscape' || prev === 'css-landscape') return prev;
          return getInitialMode(w, h);
        });
      }, 50);
    }

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // Detect fullscreen exit so we can revert to 'needs-gesture'.
  useEffect(() => {
    if (typeof document === 'undefined') return;

    function handleFullscreenChange() {
      if (!document.fullscreenElement) {
        // Fullscreen was dismissed (user pressed Escape or browser back).
        setMode((prev) => {
          if (prev === 'native-landscape') {
            // Return to the gate overlay so user can re-enter.
            return 'needs-gesture';
          }
          return prev;
        });
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const requestNativeLandscape = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      // screen.orientation.lock is experimental; cast to any for TS compatibility.
      await (screen.orientation as { lock?: (o: string) => Promise<void> }).lock?.('landscape');
      setMode('native-landscape');
    } catch {
      // iOS Safari and other environments that reject fullscreen API.
      setMode('css-landscape');
    }
  }, []);

  return {
    mode,
    isMobileLandscapeForced: mode === 'css-landscape',
    vw,
    vh,
    requestNativeLandscape,
  };
}
