/**
 * MobileLandscapeGate — orchestrates the mobile landscape mode state machine.
 *
 * Renders differently based on the current LandscapeMode:
 *
 *   'desktop' | 'native-landscape' | 'css-landscape'
 *     → transparent passthrough div; children render normally.
 *       For 'css-landscape' the ForcedLandscapeWrapper is applied at the
 *       GameTable level (game-page.tsx) so ALL overlays rotate together.
 *
 *   'needs-gesture'
 *     → MobileTapToPlayOverlay (portal to document.body) only.
 *       Children are NOT rendered — avoids mounting a heavy game tree before
 *       the user has consented to the orientation change.
 *
 * The overlay is rendered as a React Portal so it escapes any aria-hidden
 * ancestor (e.g. the `<div aria-hidden="true">` table renderer wrapper in
 * game-page.tsx) and remains accessible to screen readers.
 */

import React from 'react';
import { createPortal } from 'react-dom';
import type { LandscapeMode } from '../../hooks/use-orientation';
import { useI18n } from '../../i18n';

// ── Tap-to-play overlay ───────────────────────────────────────────────────────

interface MobileTapToPlayOverlayProps {
  onEnter: () => void;
}

function MobileTapToPlayOverlay({ onEnter }: MobileTapToPlayOverlayProps) {
  const { t } = useI18n();

  const content = (
    <div
      data-testid="mobile-tap-to-play-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
        background: 'rgba(10, 10, 10, 0.96)',
        padding: '32px',
        textAlign: 'center',
      }}
    >
      {/* Phone-rotate icon */}
      <svg
        aria-hidden="true"
        width="56"
        height="56"
        viewBox="0 0 56 56"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          x="14"
          y="8"
          width="28"
          height="40"
          rx="4"
          stroke="#c9a961"
          strokeWidth="2.5"
          fill="none"
        />
        <circle cx="28" cy="44" r="2" fill="#c9a961" />
        {/* Rotation arrow arc */}
        <path
          d="M38 18 A14 14 0 0 1 42 28"
          stroke="#c9a961"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
        <polyline
          points="42,22 42,28 36,28"
          stroke="#c9a961"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>

      {/* Title */}
      <h2
        style={{
          color: '#f5efdf',
          fontSize: '20px',
          fontWeight: 700,
          margin: 0,
          lineHeight: 1.3,
        }}
      >
        {t('gameMobileEnterTitle')}
      </h2>

      {/* Description */}
      <p
        style={{
          color: 'rgba(245, 239, 223, 0.6)',
          fontSize: '14px',
          margin: 0,
          maxWidth: '280px',
          lineHeight: 1.5,
        }}
      >
        {t('gameMobileEnterDesc')}
      </p>

      {/* CTA button */}
      <button
        onClick={onEnter}
        style={{
          marginTop: '8px',
          padding: '14px 36px',
          borderRadius: '14px',
          background: 'linear-gradient(180deg, #c9a961 0%, #a88a45 100%)',
          boxShadow: '0 6px 18px rgba(201, 169, 97, 0.35)',
          border: 'none',
          color: '#1a1108',
          fontSize: '15px',
          fontWeight: 700,
          cursor: 'pointer',
          WebkitTouchCallout: 'none' as React.CSSProperties['WebkitTouchCallout'],
          userSelect: 'none',
        }}
      >
        {t('gameMobileEnterCta')}
      </button>
    </div>
  );

  // Portal escapes aria-hidden ancestors so the overlay is screen-reader accessible.
  return createPortal(content, document.body);
}

// ── Gate component ────────────────────────────────────────────────────────────

export interface MobileLandscapeGateProps {
  mode: LandscapeMode;
  onRequestNative: () => Promise<void>;
  children: React.ReactNode;
}

export function MobileLandscapeGate({ mode, onRequestNative, children }: MobileLandscapeGateProps) {
  if (mode === 'needs-gesture') {
    return <MobileTapToPlayOverlay onEnter={onRequestNative} />;
  }

  // 'desktop' | 'native-landscape' | 'css-landscape' — passthrough.
  // For 'css-landscape' the ForcedLandscapeWrapper is applied at the GameTable
  // level in game-page.tsx so the status bar and ALL overlays rotate together.
  return <div className="w-full h-full">{children}</div>;
}
