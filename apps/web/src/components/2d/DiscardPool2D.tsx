/**
 * DiscardPool2D — discard history grid for one seat.
 *
 * Tiles flow left-to-right, top-to-bottom in a 6-column grid.
 * The last discarded tile pulses gold when a claim window is open and this
 * seat is identified as the discarding seat (`snapshot.discardedBySeat`).
 *
 * The seat zone container carries the CSS rotation via containerTransform,
 * so the grid itself is always rendered horizontally — no per-tile rotation.
 */

import { motion } from 'framer-motion';
import type { TileType } from '@nanchang/shared';
import { useGameStore } from '../../stores/game.store';
import { MahjongTile2D } from './MahjongTile2D';
import { discardGrid } from './layout-2d';
import type { SeatRole } from './layout-2d';

// ── Animation constants (module-level to satisfy i18next/no-literal-string) ───

const SHADOW_PULSE = [
  '0 0 0px rgba(201,169,97,0)',
  '0 0 8px rgba(201,169,97,0.8)',
  '0 0 0px rgba(201,169,97,0)',
] as const;

const EASE_IN_OUT = 'easeInOut' as const;

const ANIMATE_PULSE = { boxShadow: SHADOW_PULSE } as const;
const ANIMATE_IDLE = {} as const;
const TRANSITION_PULSE = { duration: 1.2, repeat: Infinity, ease: EASE_IN_OUT } as const;
const TRANSITION_IDLE = {} as const;

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DiscardPool2DProps {
  seatIdx: 0 | 1 | 2 | 3;
  role: SeatRole;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DiscardPool2D({ seatIdx, role }: DiscardPool2DProps) {
  const snapshot = useGameStore((s) => s.snapshot);
  const claimWindow = useGameStore((s) => s.claimWindow);

  if (!snapshot) return null;

  const seat = snapshot.seats[seatIdx];
  const discards: TileType[] = seat.discards;
  const spec = discardGrid(role);

  if (discards.length === 0) return null;

  // Last discard pulses gold when this seat's discard triggered an open claim window
  const isLastDiscard = claimWindow !== null && snapshot.discardedBySeat === seatIdx;

  return (
    <div
      data-testid={`discard-pool-${seatIdx}`}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${spec.cols}, auto)`,
        gap: spec.gap,
        justifyContent: 'center',
      }}
    >
      {discards.map((tile, i) => {
        const isLast = i === discards.length - 1 && isLastDiscard;
        return (
          <motion.div
            key={i}
            animate={isLast ? ANIMATE_PULSE : ANIMATE_IDLE}
            transition={isLast ? TRANSITION_PULSE : TRANSITION_IDLE}
            style={{ borderRadius: 4 }}
          >
            <MahjongTile2D tile={tile} size={spec.tileSize} role={role} interactive={false} />
          </motion.div>
        );
      })}
    </div>
  );
}
