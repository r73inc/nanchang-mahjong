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
import { tileAriaLabel } from '@nanchang/shared';
import type { TileType } from '@nanchang/shared';
import { useI18n } from '../../i18n';
import { tileTexturePath, backTexturePath } from '../../r3f/utils/tile-texture-map';
import type { SeatRole } from './layout-2d';

// ── Module-level constants (avoids i18next/no-literal-string on JSX nodes) ────

// Jing spirit marker — shown below a tile identified as the round's spirit tile.
const JING_CHAR = '节' as const;

// Aria label for face-down tiles — not passed through t() because it is used
// as an HTML attribute value (aria-label), not a JSX text node.
const ARIA_HIDDEN_TILE = 'Hidden tile' as const;

// ── Size table ────────────────────────────────────────────────────────────────

/** Pixel dimensions at 800px reference width; scale via CSS container queries. */
export const TILE_DIMS = {
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
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /**
   * Seat role — controls the directional box-shadow offset so the simulated
   * light source is uniform across the board. Defaults to 'bottom' (viewer).
   */
  role?: SeatRole;
  /** Lift and gold-ring treatment when selected for discard. */
  selected?: boolean;
  /** Gold-glow treatment + 节 label for the round's spirit tile. */
  isJing?: boolean;
  /** When true pointer events fire and the tile is keyboard-focusable. */
  interactive?: boolean;
  /**
   * Framer Motion layoutId for shared-element transitions (Phase G).
   * Omit unless the parent orchestrates a discard-flight animation.
   */
  layoutId?: string;
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
  interactive = false,
  layoutId,
  onSelect,
}: MahjongTile2DProps) {
  const { lang } = useI18n();

  const dims = TILE_DIMS[size];
  const [sx, sy] = SHADOW_OFFSETS[role];
  const thickness = dims.shadow;

  const isBack = tile === 'back';
  const imgSrc = isBack ? backTexturePath() : tileTexturePath(tile as TileType);
  const ariaLabel = isBack ? ARIA_HIDDEN_TILE : tileAriaLabel(tile as TileType, lang);

  // Build box-shadow: directional thickness + optional selected ring + optional jing glow
  const shadowParts: string[] = [`${sx}px ${sy}px ${thickness}px rgba(0,0,0,0.6)`];
  if (selected) shadowParts.push('0 0 0 2px #c9a961');
  if (isJing) shadowParts.push('0 0 12px rgba(201,169,97,0.7)');
  const boxShadow = shadowParts.join(', ');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (interactive && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onSelect?.();
    }
  };

  return (
    <div
      style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}
      data-testid="mahjong-tile-2d"
    >
      <motion.div
        layout
        layoutId={layoutId}
        animate={{ y: selected ? -6 : 0 }}
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
          borderRadius: 4,
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
        <img
          src={imgSrc}
          alt=""
          aria-hidden="true"
          draggable={false}
          data-testid="tile-img"
          style={{
            width: '85%',
            height: '85%',
            objectFit: 'contain',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
      </motion.div>

      {isJing && (
        <span
          aria-hidden="true"
          style={{
            color: '#c9a961',
            fontSize: 10,
            lineHeight: 1,
            marginTop: 2,
            fontFamily: 'serif',
          }}
        >
          {JING_CHAR}
        </span>
      )}
    </div>
  );
}
