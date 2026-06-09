/**
 * DiscardPool2D — discard history grid for one seat.
 *
 * Tiles flow left-to-right, top-to-bottom in a 6-column grid.
 * The last discarded tile shows a red pulsing outline while pendingDiscard is
 * set (from the moment the tile lands until it is claimed or the next draw
 * begins). The discarding seat is identified via `snapshot.discardedBySeat`.
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

/** New discard enters: fade + scale from 70%. */
const TILE_INITIAL = { opacity: 0, scale: 0.7 };
const TILE_ANIMATE = { opacity: 1, scale: 1 };
const TILE_TRANSITION = { duration: 0.2 };
// NOTE: The last-discard red pulse lives inside MahjongTile2D (isLastDiscard prop),
// not here. Keeping pulse logic in the pool's motion.div caused Framer Motion to
// apply repeat:Infinity to opacity/scale from `initial`, making the tile invisible.

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
  // Granular selectors — only the fields needed to decide which tile pulses.
  const discards = useGameStore((s) => s.snapshot?.seats[seatIdx]?.discards ?? []) as TileType[];
  const viewerSeat = useGameStore((s) => s.snapshot?.viewerSeat ?? null);
  // lastDiscard is driven by game:event {kind:'discard'}, NOT snapshot.pendingDiscard.
  // See game.store.ts for the full explanation of why pendingDiscard races.
  const lastDiscard = useGameStore((s) => s.lastDiscard);
  const { lastDiscardId } = useDiscardContext();

  const spec = discardGrid(role);
  // Use tileRole for shadow direction when set (centre-area pools have no
  // rotation context; shadow should always face screen-down-right = 'bottom').
  const shadowRole = tileRole ?? role;

  if (discards.length === 0) return null;

  // The pulse belongs to this seat if the last discard came from it.
  // Use optional chaining so a null/undefined lastDiscard safely evaluates to false.
  const thisSeatsDiscardIsPending = lastDiscard?.seat === seatIdx;

  // For the viewer's seat: the newest tile gets the layoutId from DiscardContext
  // so Framer Motion can animate the shared-element flight from PlayerHand2D.
  const isViewerSeat = viewerSeat === seatIdx;
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
          // The pulse overlay is rendered inside MahjongTile2D, not on this
          // motion.div — see note above about the repeat:Infinity bleed bug.
          const isPulse = isLast && thisSeatsDiscardIsPending;
          // Assign discard-flight layoutId only to the most recently added tile
          // (last index) of the viewer's own pool.
          const tileLayoutId = isLast && isViewerSeat ? flightLayoutId : undefined;

          return (
            <motion.div
              key={i}
              initial={TILE_INITIAL}
              animate={TILE_ANIMATE}
              transition={TILE_TRANSITION}
              style={{ borderRadius: 4 }}
            >
              <MahjongTile2D
                tile={tile}
                size={spec.tileSize}
                role={shadowRole}
                interactive={false}
                layoutId={tileLayoutId}
                isLastDiscard={isPulse}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
