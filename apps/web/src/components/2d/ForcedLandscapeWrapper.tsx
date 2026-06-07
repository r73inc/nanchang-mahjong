/**
 * ForcedLandscapeWrapper — CSS rotate(90deg) fallback for mobile portrait devices
 * that cannot use the native Fullscreen API (e.g. iOS Safari).
 *
 * When `active` is true the wrapper applies:
 *   - width  = 100dvh minus vertical safe areas (physical height → logical width)
 *   - height = 100vw  minus horizontal safe areas (physical width → logical height)
 *   - transform: translate(-50%,-50%) rotate(90deg) — clockwise, centred
 *   - Safe-area CSS custom properties remapped from physical → logical axes
 *   - Long-press context menu suppression (-webkit-touch-callout, user-select)
 *   - Pull-to-refresh suppression (touch-action: none)
 *
 * When `active` is false a transparent passthrough div is returned so the
 * component can always be used unconditionally by the parent.
 */

import React from 'react';

export interface ForcedLandscapeWrapperProps {
  active: boolean;
  children: React.ReactNode;
}

export function ForcedLandscapeWrapper({ active, children }: ForcedLandscapeWrapperProps) {
  if (!active) {
    return <div className="w-full h-full">{children}</div>;
  }

  return (
    <div
      className="mj-landscape-wrapper"
      style={
        {
          position: 'fixed',
          top: '50%',
          left: '50%',
          // Physical height (now our logical width) minus notch/home-bar insets.
          width: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
          // Physical width (now our logical height) minus side insets.
          height: 'calc(100vw - env(safe-area-inset-left) - env(safe-area-inset-right))',
          transform: 'translate(-50%, -50%) rotate(90deg)',
          transformOrigin: 'center center',
          overflow: 'hidden',
          transition: 'transform 0.25s ease',
          // Pull-to-refresh + scroll passthrough suppression.
          touchAction: 'none',
          // Long-press context menu suppression (iOS Safari).
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
          // After 90° CW rotation the physical axes are remapped:
          //   physical top    (notch)    → visual left
          //   physical bottom (home bar) → visual right
          //   physical right             → visual top
          //   physical left              → visual bottom
          '--mj-safe-left': 'env(safe-area-inset-top)',
          '--mj-safe-right': 'env(safe-area-inset-bottom)',
          '--mj-safe-top': 'env(safe-area-inset-right)',
          '--mj-safe-bottom': 'env(safe-area-inset-left)',
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
