/**
 * DiscardPool2D — discard history grid for one seat.
 *
 * Tiles flow left-to-right, top-to-bottom in a 6-column grid.
 * The last discarded tile pulses gold when a claim window is open and this
 * seat is identified as the discarding seat (`snapshot.discardedBySeat`).
 *
 * Phase G additions:
 *  - AnimatePresence wraps the tile list so newly discarded tiles animate in.
 *  - For the viewer's own seat, the most recently added tile gets the
 *    layoutId from DiscardContext ("hand-{id}"), enabling Framer Motion to
 *    animate the shared-element flight from PlayerHand2D to this pool.
 *
 * The seat zone container carries the CSS rotation via containerTransform,
 * so the grid itself is always rendered horizontally — no per-tile rotation.
 */

import { AnimatePresence, motion } from 'framer-motion';
import type { TileType } from '@nanchang/shared';
import { useGameStore } from '../../stores/game.store';
import { useDiscardContext } from './DiscardContext';
import { MahjongTile2D } from './MahjongTile2D';
import { discardGrid } from './layout-2d';
import type { SeatRole } from './layout-2d';

// ── Animation constants (module-level to satisfy i18next/no-literal-string) ───
// Note: Framer Motion's animate prop requires mutable arrays for keyframes —
// `as const` would produce readonly tuples that TypeScript rejects. Plain arrays
// and objects are used intentionally here.

const EASE_IN_OUT = 'easeInOut' as const;

// Claim-window gold pulse on last discard tile
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SHADOW_PULSE: any[] = [
  '0 0 0px rgba(201,169,97,0)',
  '0 0 8px rgba(201,169,97,0.8)',
  '0 0 0px rgba(201,169,97,0)',
];
const ANIMATE_PULSE = { boxShadow: SHADOW_PULSE };
const TRANSITION_PULSE = { duration: 1.2, repeat: Infinity, ease: EASE_IN_OUT };

/** New discard enters: fade + scale from 70%. */
const TILE_INITIAL = { opacity: 0, scale: 0.7 };
const TILE_ANIMATE = { opacity: 1, scale: 1 };
const TILE_TRANSITION = { duration: 0.2 };

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DiscardPool2DProps {
  seatIdx: 0 | 1 | 2 | 3;
  /** Layout role — determines grid column count (via discardGrid). */
  role: SeatRole;
  /**
   * Shadow direction passed to MahjongTile2D. Defaults to `role`.
   * Pass 'bottom' when rendering inside the centre area so the simulated
   * overhead light source points the same direction for every tile regardless
   * of which seat owns the discard (no container rotation in the centre).
   */
  tileRole?: SeatRole;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DiscardPool2D({ seatIdx, role, tileRole }: DiscardPool2DProps) {
  const snapshot = useGameStore((s) => s.snapshot);
  const claimWindow = useGameStore((s) => s.claimWindow);
  const { lastDiscardId } = useDiscardContext();

  if (!snapshot) return null;

  const seat = snapshot.seats[seatIdx];
  const discards: TileType[] = seat.discards;
  const spec = discardGrid(role);
  // Use tileRole for shadow direction when set (centre-area pools have no
  // rotation context; shadow should always face screen-down-right = 'bottom').
  const shadowRole = tileRole ?? role;

  if (discards.length === 0) return null;

  // Last discard pulses gold when this seat's discard triggered an open claim window
  const isLastDiscard = claimWindow !== null && snapshot.discardedBySeat === seatIdx;

  // For the viewer's seat: the newest tile gets the layoutId from DiscardContext
  // so Framer Motion can animate the shared-element flight from PlayerHand2D.
  const isViewerSeat = snapshot.viewerSeat === seatIdx;
  const flightLayoutId =
    isViewerSeat && lastDiscardId !== null ? `hand-${lastDiscardId}` : undefined;

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
      <AnimatePresence>
        {discards.map((tile, i) => {
          const isLast = i === discards.length - 1;
          const isPulse = isLast && isLastDiscard;
          // Assign discard-flight layoutId only to the most recently added tile
          // (last index) of the viewer's own pool.
          const tileLayoutId = isLast && isViewerSeat ? flightLayoutId : undefined;

          return (
            <motion.div
              key={i}
              initial={TILE_INITIAL}
              animate={isPulse ? ANIMATE_PULSE : TILE_ANIMATE}
              transition={isPulse ? TRANSITION_PULSE : TILE_TRANSITION}
              style={{ borderRadius: 4 }}
            >
              <MahjongTile2D
                tile={tile}
                size={spec.tileSize}
                role={shadowRole}
                interactive={false}
                layoutId={tileLayoutId}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
