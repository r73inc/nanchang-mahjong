/**
 * MahjongTile — renders a single tile using the engine's TileType.
 *
 * Maps engine tile types to design IDs via engineToDesignTile() and provides
 * canonical aria-labels via tileAriaLabel() — satisfying Handoff §08.
 *
 * Visual rendering uses suit-coded colors and Chinese characters since the app
 * has no tile image assets (Phase 11 will add tile-pack switching). The tile
 * is always keyboard-focusable when onClick is provided.
 */

import { type KeyboardEvent } from 'react';
import { engineToDesignTile, tileAriaLabel } from '@nanchang/shared';
import type { TileType } from '@nanchang/shared';
import { useI18n } from '../i18n';

// ── Size variants ─────────────────────────────────────────────────────────────

const SIZE_CLASSES: Record<string, string> = {
  xs: 'w-[22px] h-[30px] text-[8px]',
  sm: 'w-[28px] h-[38px] text-[10px]',
  md: 'w-[36px] h-[50px] text-[13px]',
  lg: 'w-[46px] h-[62px] text-[16px]',
};

// ── Tile content mapping ──────────────────────────────────────────────────────

const TILE_LABEL: Record<TileType, string> = {
  '1m': '一萬',
  '2m': '二萬',
  '3m': '三萬',
  '4m': '四萬',
  '5m': '五萬',
  '6m': '六萬',
  '7m': '七萬',
  '8m': '八萬',
  '9m': '九萬',
  '1p': '一筒',
  '2p': '二筒',
  '3p': '三筒',
  '4p': '四筒',
  '5p': '五筒',
  '6p': '六筒',
  '7p': '七筒',
  '8p': '八筒',
  '9p': '九筒',
  '1s': '一條',
  '2s': '二條',
  '3s': '三條',
  '4s': '四條',
  '5s': '五條',
  '6s': '六條',
  '7s': '七條',
  '8s': '八條',
  '9s': '九條',
  east: '東',
  south: '南',
  west: '西',
  north: '北',
  zhong: '中',
  fa: '發',
  bai: '白',
};

const TILE_COLOR: Record<string, string> = {
  man: '#c0392b',
  pin: '#2563eb',
  sou: '#15803d',
  wind: '#64748b',
  zhong: '#dc2626',
  fa: '#16a34a',
  bai: '#9ca3af',
};

function getTileColor(tile: TileType): string {
  if (tile.endsWith('m')) return TILE_COLOR.man;
  if (tile.endsWith('p')) return TILE_COLOR.pin;
  if (tile.endsWith('s')) return TILE_COLOR.sou;
  if (tile === 'zhong') return TILE_COLOR.zhong;
  if (tile === 'fa') return TILE_COLOR.fa;
  if (tile === 'bai') return TILE_COLOR.bai;
  return TILE_COLOR.wind;
}

// ── Jing glow (for spirit tiles in JingReveal screen) ────────────────────────

const JING_GLOW = '0 0 16px rgba(201,169,97,0.5), 0 0 4px rgba(201,169,97,0.3)';

// ── Component ─────────────────────────────────────────────────────────────────

export interface MahjongTileProps {
  tile: TileType;
  /** Render the tile back (opponent tile / face-down). */
  faceDown?: boolean;
  /** Highlight ring (selected for discard). */
  selected?: boolean;
  /** Spirit tile glow (jing indicator). */
  isJing?: boolean;
  /** Drawn tile indicator (most recently drawn). */
  isDrawn?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  onClick?: () => void;
  className?: string;
  /** Extra aria-label text appended after the tile name. */
  ariaHint?: string;
}

export function MahjongTile({
  tile,
  faceDown = false,
  selected = false,
  isJing = false,
  isDrawn = false,
  size = 'md',
  onClick,
  className = '',
  ariaHint,
}: MahjongTileProps) {
  const { lang } = useI18n();
  const designId = engineToDesignTile(tile);
  const label = tileAriaLabel(tile, lang) + (ariaHint ? ` ${ariaHint}` : '');

  const interactive = !!onClick;

  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (interactive && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick?.();
    }
  };

  // Base tile card style
  const baseStyle: React.CSSProperties = faceDown
    ? {
        background: 'linear-gradient(165deg,#1c1c1c 0%,#141414 100%)',
        border: '1.5px solid rgba(201,169,97,0.2)',
        borderRadius: 4,
      }
    : {
        background: 'linear-gradient(165deg,#fffbeb 0%,#f5efdf 60%,#e8dfc5 100%)',
        border: isJing
          ? '2px solid #c9a961'
          : selected
            ? '2px solid #c9a961'
            : '1.5px solid rgba(201,169,97,0.35)',
        borderRadius: 4,
        boxShadow: isJing
          ? JING_GLOW
          : selected
            ? '0 0 0 2px rgba(201,169,97,0.4)'
            : isDrawn
              ? '0 0 0 1.5px rgba(201,169,97,0.25)'
              : undefined,
      };

  return (
    // data-tile exposes the design tile ID for easier debugging / FE tests
    <div
      data-tile={designId}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={label}
      aria-pressed={interactive ? selected : undefined}
      onClick={interactive ? onClick : undefined}
      onKeyDown={handleKey}
      className={[
        SIZE_CLASSES[size],
        'relative flex items-center justify-center select-none shrink-0',
        interactive
          ? 'cursor-pointer transition-transform duration-fast hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mj-gold focus-visible:outline-offset-1'
          : '',
        selected ? '-translate-y-2' : '',
        isDrawn && !selected ? 'opacity-90' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={baseStyle}
    >
      {faceDown ? (
        /* Face-down back: subtle bamboo pattern suggestion */
        <div
          aria-hidden="true"
          className="w-[60%] h-[75%] rounded-xs border border-mj-gold/10"
          style={{
            background:
              'repeating-linear-gradient(45deg,transparent,transparent 2px,rgba(201,169,97,0.06) 2px,rgba(201,169,97,0.06) 4px)',
          }}
        />
      ) : (
        <span
          aria-hidden="true"
          className="font-serif font-bold leading-none text-center"
          style={{ color: getTileColor(tile), fontSize: 'inherit' }}
        >
          {TILE_LABEL[tile]}
        </span>
      )}

      {/* Drawn tile pip */}
      {isDrawn && !faceDown && (
        <span
          aria-hidden="true"
          className="absolute top-[2px] right-[2px] w-[5px] h-[5px] rounded-full bg-mj-gold"
        />
      )}
    </div>
  );
}

/** Placeholder for a face-down tile — used when rendering opponent hands. */
export function FaceDownTile({
  size = 'md',
  className = '',
}: {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={[SIZE_CLASSES[size], 'shrink-0 rounded-xs', className].join(' ')}
      style={{
        background: 'linear-gradient(165deg,#1c1c1c 0%,#141414 100%)',
        border: '1.5px solid rgba(201,169,97,0.18)',
        borderRadius: 4,
      }}
    />
  );
}
