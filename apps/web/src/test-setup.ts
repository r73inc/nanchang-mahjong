import '@testing-library/jest-dom';

// Initialize i18next with English translations so components can call t() in tests.
// This must run before any component renders.
import './i18n/i18n';

// ResizeObserver is not implemented in jsdom. Provide a no-op stub that
// immediately reports a fixed 800 × 600 content rect so GameTable2D's
// ResizeObserver-based tile-scale computation runs without error in tests.
// The scale will be 1.0 (reference size) since 800 × 600 is the design canvas.
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserverStub {
    private cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb;
    }
    observe(target: Element) {
      // Report fixed 800 × 600 dims immediately so tileScale resolves to 1.0
      this.cb(
        [
          {
            target,
            contentRect: {
              width: 800,
              height: 600,
              top: 0,
              left: 0,
              bottom: 600,
              right: 800,
              x: 0,
              y: 0,
              toJSON: () => ({}),
            },
            borderBoxSize: [],
            contentBoxSize: [],
            devicePixelContentBoxSize: [],
          },
        ],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  };
}
