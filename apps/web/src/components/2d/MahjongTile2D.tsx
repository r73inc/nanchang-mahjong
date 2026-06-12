/**
 * MahjongTile2D — core CSS tile primitive for the 2.5D DOM game table.
 *
 * Each tile is a styled motion.div that reads --tile-face-top / --tile-face-bottom
 * custom properties (written by applyTheme) so all three tile palettes
 * (classic / sepia / dark) work automatically.
 *
 * The directional box-shadow simulates a single overhead light source at
 * screen-space vector (+2px, +6px). Because each seat zone container is
 * CSS-rotated by a different angle, the tile-local shadow offsets are
 * inverse-rotated to compensate — the result is a physically uniform light
 * source across all four seats. See layout-2d.ts for the rotation angles.
 *
 * Phase G will thread layoutId props for shared-element discard animations.
 */

import { motion } from 'framer-motion';
import { useState, useCallback } from 'react';
import { tileAriaLabel } from '@nanchang/shared';
import type { TileType } from '@nanchang/shared';
import { useI18n } from '../../i18n';
import { tileTexturePath, backTexturePath } from '../../r3f/utils/tile-texture-map';
import { useTable2DScale } from './Table2DContext';
import type { SeatRole } from './layout-2d';

// ── Module-level constants (avoids i18next/no-literal-string on JSX nodes) ────

// Jing spirit marker — shown below a tile identified as the round's spirit tile.
const JING_CHAR = '精' as const;

// Aria label for face-down tiles — not passed through t() because it is used
// as an HTML attribute value (aria-label), not a JSX text node.
const ARIA_HIDDEN_TILE = 'Hidden tile' as const;

// ── Last-discard overlay animation (isolated from entry animations) ───────────
// These constants live here — not in the pool components — so the animation is
// owned by the element that actually renders it. The overlay motion.div has no
// `initial`, so repeat:Infinity only touches boxShadow and never bleeds into
// the entry opacity/scale keyframes of the parent wrapper.

// Keyframes for the pulsing glow on the last-discarded tile.
// Using actual blur radius (not zero) so the glow is visible on any background.
// The static border: '2px solid' on the overlay div provides an always-on fallback
// so even if boxShadow rendering is clipped by a parent, a hard edge is visible.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LAST_DISCARD_SHADOW: any[] = [
  '0 0 4px 1px rgb(220, 38, 38)',
  '0 0 10px 3px rgb(220, 38, 38)',
  '0 0 4px 1px rgb(220, 38, 38)',
];
const LAST_DISCARD_ANIMATE = { boxShadow: LAST_DISCARD_SHADOW };
const LAST_DISCARD_TRANSITION = {
  duration: 0.85,
  repeat: Infinity,
  ease: 'easeInOut' as const,
};

// ── Size table ────────────────────────────────────────────────────────────────

/** Pixel dimensions at 800px reference width; scale via CSS container queries. */
export const TILE_DIMS = {
  xxs: { w: 20, h: 27, shadow: 2 },
  xs: { w: 28, h: 38, shadow: 4 },
  sm: { w: 36, h: 48, shadow: 5 },
  md: { w: 44, h: 60, shadow: 6 },
  lg: { w: 56, h: 76, shadow: 8 },
} as const;

// ── Shadow direction table ────────────────────────────────────────────────────

/**
 * Tile-local shadow offsets (x, y) in pixels.
 *
 * Target screen-space vector: (+2, +6) — light from top-left, shadow down-right.
 * Each seat container is CSS-rotated, so the tile-local offset is inverse-rotated:
 *
 *   bottom (0°):    (+2, +6) → screen (+2, +6) ✓
 *   right  (−90°):  (−6, +2) → screen (+2, +6) ✓
 *   top    (180°):  (−2, −6) → screen (+2, +6) ✓
 *   left   (+90°):  (+6, −2) → screen (+2, +6) ✓
 */
export const SHADOW_OFFSETS: Record<SeatRole, readonly [number, number]> = {
  bottom: [2, 6],
  right: [-6, 2],
  top: [-2, -6],
  left: [6, -2],
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface MahjongTile2DProps {
  /** TileType for a face-up tile; 'back' for a hidden / face-down tile. */
  tile: TileType | 'back';
  /** Visual size category. Defaults to 'md'. */
  size?: keyof typeof TILE_DIMS;
  /**
   * Seat role — controls the directional box-shadow offset so the simulated
   * light source is uniform across the board. Defaults to 'bottom' (viewer).
   */
  role?: SeatRole;
  /** Lift and gold-ring treatment when selected for discard. */
  selected?: boolean;
  /** Gold-glow treatment + 精 label for the round's spirit tile. */
  isJing?: boolean;
  /** When false, suppresses the 精 character below the tile even when isJing is true. Defaults to true. */
  showJingLabel?: boolean;
  /** When true pointer events fire and the tile is keyboard-focusable. */
  interactive?: boolean;
  /**
   * Framer Motion layoutId for shared-element transitions (Phase G).
   * Omit unless the parent orchestrates a discard-flight animation.
   */
  layoutId?: string;
  /**
   * When true, mounts a dedicated overlay motion.div that pulses a red ring
   * around the tile. The overlay is absolutely positioned and isolated from
   * the tile's own entry/exit animations so repeat:Infinity on the boxShadow
   * keyframes never bleeds into opacity or scale interpolation.
   */
  isLastDiscard?: boolean;
  /** Fired when an interactive tile is clicked or activated via keyboard. */
  onSelect?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MahjongTile2D({
  tile,
  size = 'md',
  role = 'bottom',
  selected = false,
  isJing = false,
  showJingLabel = true,
  interactive = false,
  layoutId,
  isLastDiscard = false,
  onSelect,
}: MahjongTile2DProps) {
  const { lang } = useI18n();
  const { tileScale } = useTable2DScale();

  // Scale all pixel dimensions by tileScale so tiles shrink proportionally
  // on narrow or short viewports. Math.round prevents sub-pixel blurriness;
  // Math.max guards against dimensions collapsing to 0.
  const ref = TILE_DIMS[size];
  const dims = {
    w: Math.max(8, Math.round(ref.w * tileScale)),
    h: Math.max(11, Math.round(ref.h * tileScale)),
    shadow: Math.max(1, Math.round(ref.shadow * tileScale)),
    radius: Math.max(2, Math.round(4 * tileScale)),
  };

  const [sxRef, syRef] = SHADOW_OFFSETS[role];
  const sx = Math.round(sxRef * tileScale);
  const sy = Math.round(syRef * tileScale);
  const thickness = dims.shadow;
  // Tile lift when selected — scale proportionally so it doesn't look exaggerated
  // at small tile sizes.
  const liftY = Math.round(-6 * tileScale);

  const isBack = tile === 'back';
  const baseSrc = isBack ? backTexturePath() : tileTexturePath(tile as TileType);
  const ariaLabel = isBack ? ARIA_HIDDEN_TILE : tileAriaLabel(tile as TileType, lang);

  // ── Image error recovery ──────────────────────────────────────────────────
  // When the browser caches a 404 (e.g. Vite dev-server hiccup during hot-reload),
  // React never updates the <img> src, so the broken-image icon sticks.
  // State is keyed to the specific asset URL so the count resets synchronously
  // during the render pass — no useEffect race that could flush one extra cycle
  // at retryCount=1 against the new src and needlessly invalidate the browser cache.
  const [errorTracking, setErrorTracking] = useState({ src: baseSrc, count: 0 });

  // Synchronous reset: if baseSrc changed this render, reset immediately.
  // React detects the setState-during-render pattern and re-renders before
  // committing, so the browser never sees the stale count against the new URL.
  if (errorTracking.src !== baseSrc) {
    setErrorTracking({ src: baseSrc, count: 0 });
  }

  const handleImgError = useCallback(() => {
    setErrorTracking((prev) => ({ ...prev, count: Math.min(prev.count + 1, 2) }));
  }, []);

  // Derive the actual src: normal → cache-bust retry → null (hide img).
  const imgSrc =
    errorTracking.count === 0 ? baseSrc : errorTracking.count === 1 ? `${baseSrc}?r=1` : null;

  // Build box-shadow: directional thickness + optional selected ring + optional jing glow.
  // Ring width and glow radius also scale so they remain proportional to tile size.
  const ringPx = Math.max(1, Math.round(2 * tileScale));
  const glowPx = Math.max(4, Math.round(12 * tileScale));
  const shadowParts: string[] = [`${sx}px ${sy}px ${thickness}px rgba(0,0,0,0.6)`];
  if (selected) shadowParts.push(`0 0 0 ${ringPx}px #c9a961`);
  if (isJing) shadowParts.push(`0 0 ${glowPx}px rgba(201,169,97,0.7)`);
  const boxShadow = shadowParts.join(', ');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (interactive && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onSelect?.();
    }
  };

  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        // position:relative is required so the absolutely-positioned pulse
        // overlay is scoped to this tile and not the discard pool grid.
        position: 'relative',
      }}
      data-testid="mahjong-tile-2d"
    >
      <motion.div
        layout
        layoutId={layoutId}
        animate={{ y: selected ? liftY : 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        role={interactive ? 'button' : 'img'}
        aria-label={ariaLabel}
        aria-pressed={interactive ? selected : undefined}
        tabIndex={interactive ? 0 : -1}
        onClick={interactive ? onSelect : undefined}
        onKeyDown={handleKeyDown}
        data-tile={tile}
        data-size={size}
        style={{
          width: dims.w,
          height: dims.h,
          borderRadius: dims.radius,
          background: isBack
            ? 'linear-gradient(165deg, #1c1c1c 0%, #141414 100%)'
            : 'linear-gradient(to bottom, var(--tile-face-top, #fffbeb) 0%, var(--tile-face-bottom, #e8dfc5) 100%)',
          border: selected || isJing ? '1.5px solid #c9a961' : '1.5px solid rgba(201,169,97,0.35)',
          boxShadow,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flexShrink: 0,
          cursor: interactive ? 'pointer' : 'default',
          userSelect: 'none',
        }}
      >
        {imgSrc !== null && (
          <img
            src={imgSrc}
            alt=""
            aria-hidden="true"
            draggable={false}
            data-testid="tile-img"
            onError={handleImgError}
            style={{
              width: '85%',
              height: '85%',
              objectFit: 'contain',
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          />
        )}
      </motion.div>

      {/*
       * Last-discard pulse overlay — mounted only when this tile is the most
       * recently discarded tile awaiting a claim decision.
       *
       * Kept as a separate motion.div so its repeat:Infinity transition on
       * boxShadow is completely isolated from the entry animation's opacity/
       * scale keyframes in the parent pool wrapper. Without this separation,
       * Framer Motion applies the repeat:Infinity transition to ALL properties
       * animating from `initial`, looping the tile's opacity back to 0 and
       * making the pulse invisible.
       *
       * No `initial` prop → Framer Motion starts from the element's natural
       * CSS state (boxShadow: none) and immediately begins the keyframe loop.
       * Unmounts cleanly when isLastDiscard becomes false.
       */}
      {isLastDiscard && (
        <motion.div
          aria-hidden="true"
          data-testid="last-discard-pulse"
          animate={LAST_DISCARD_ANIMATE}
          transition={LAST_DISCARD_TRANSITION}
          style={{
            position: 'absolute',
            // Cover only the tile face, not the jing label below it.
            top: 0,
            left: 0,
            width: dims.w,
            height: dims.h,
            borderRadius: dims.radius,
            pointerEvents: 'none',
            // zIndex ensures this overlay paints above the tile's motion.div even
            // when Framer Motion's will-change:transform creates a new stacking
            // context on the sibling. Without this, the overlay renders underneath.
            zIndex: 20,
            // Explicit border is an always-on fallback: even if boxShadow is clipped
            // by an ancestor overflow:hidden, the hard red edge remains visible.
            border: '2px solid rgb(220, 38, 38)',
          }}
        />
      )}

      {isJing && showJingLabel && (
        <span
          aria-hidden="true"
          style={{
            color: '#c9a961',
            fontSize: Math.max(8, Math.round(10 * tileScale)),
            lineHeight: 1,
            marginTop: Math.max(1, Math.round(2 * tileScale)),
            fontFamily: 'serif',
          }}
        >
          {JING_CHAR}
        </span>
      )}
    </div>
  );
}
