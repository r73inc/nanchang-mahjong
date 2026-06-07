/**
 * OpenMelds2D — open meld row for one seat in the 2.5D DOM game table.
 *
 * Each meld (pung / chow / kong) is rendered as a tightly spaced horizontal
 * group of tiles. Kong groups have a bonus 4th tile offset -8px above the
 * other three (matching the `kongOffset` from layout-2d's meldLayout).
 *
 * Groups are spaced by `groupGap` (from meldLayout); tiles within a group
 * by `gap`. The seat zone container carries the CSS rotation so tiles need
 * no per-tile transform.
 *
 * Phase G: newly formed meld groups animate in from opacity-0 with a subtle
 * upward slide via AnimatePresence + motion.div wrappers.
 */

import { AnimatePresence, motion } from 'framer-motion';
import type { Meld, TileType } from '@nanchang/shared';
import { useGameStore } from '../../stores/game.store';
import { MahjongTile2D } from './MahjongTile2D';
import { meldLayout } from './layout-2d';
import type { SeatRole, MeldLayoutSpec } from './layout-2d';

// ── Compact spec (mobile — xs tiles, tighter spacing) ────────────────────────

type CompactMeldSpec = Omit<MeldLayoutSpec, 'tileSize'> & { tileSize: 'xs' };
const COMPACT_MELD_SPEC: CompactMeldSpec = {
  tileSize: 'xs',
  gap: 1,
  groupGap: 3,
  kongOffset: -6,
};

// ── Animation constants ───────────────────────────────────────────────────────

/** New meld group enters: fade in from above. */
const MELD_INITIAL = { opacity: 0, y: -8 } as const;
const MELD_ANIMATE = { opacity: 1, y: 0 } as const;
const MELD_TRANSITION = { duration: 0.25 } as const;

// ── Props ─────────────────────────────────────────────────────────────────────

export interface OpenMelds2DProps {
  seatIdx: 0 | 1 | 2 | 3;
  role: SeatRole;
  /**
   * Compact mode — forces xs tile size and tighter groupGap.
   * Used in MobileGameTable2D where space is constrained.
   * Ignores the tileScale from Table2DScaleContext.
   */
  compact?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OpenMelds2D({ seatIdx, role, compact = false }: OpenMelds2DProps) {
  const snapshot = useGameStore((s) => s.snapshot);

  if (!snapshot) return null;

  const seat = snapshot.seats[seatIdx];
  const melds: Meld[] = seat.openMelds;
  // In compact mode override tile size and spacing regardless of tileScale.
  const spec = compact ? COMPACT_MELD_SPEC : meldLayout(role);

  if (melds.length === 0) return null;

  return (
    <div
      data-testid={`open-melds-${seatIdx}`}
      style={{
        display: 'flex',
        flexWrap: 'nowrap',
        gap: spec.groupGap,
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <AnimatePresence>
        {melds.map((meld, meldIdx) => (
          <motion.div
            key={meldIdx}
            initial={MELD_INITIAL}
            animate={MELD_ANIMATE}
            transition={MELD_TRANSITION}
          >
            <MeldGroup meld={meld} role={role} spec={spec} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ── MeldGroup ─────────────────────────────────────────────────────────────────

interface MeldGroupProps {
  meld: Meld;
  role: SeatRole;
  spec: ReturnType<typeof meldLayout> | CompactMeldSpec;
}

function MeldGroup({ meld, role, spec }: MeldGroupProps) {
  const tiles = meld.tiles as TileType[];
  const isKong = meld.kind === 'kong';

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'nowrap',
        gap: spec.gap,
        alignItems: 'flex-end',
        position: 'relative',
      }}
    >
      {tiles.map((tile, i) => {
        // Kong: 4th tile sits above the group (translateY = kongOffset = -8px)
        const isKongBonus = isKong && i === 3;
        return (
          <div
            key={i}
            style={isKongBonus ? { transform: `translateY(${spec.kongOffset}px)` } : undefined}
          >
            <MahjongTile2D tile={tile} size={spec.tileSize} role={role} interactive={false} />
          </div>
        );
      })}
    </div>
  );
}
