/**
 * MobileDiscardPool2D — combined discard pool for the mobile game table.
 *
 * Uses the same round-robin interleave logic as CombinedDiscardPool2D but
 * with a flex-wrap container instead of a CSS grid, so tiles wrap naturally
 * within the available centre area rather than overflowing.
 *
 * Container is bounded by its parent absolutely-positioned div in
 * MobileGameTable2D. Tiles use `'xs'` size (28 × 38 px) so more can fit.
 *
 * `overscrollBehavior: 'contain'` allows the pool to scroll internally in
 * late-game (many discards) without propagating overscroll to the body,
 * complementing the global `overscrollBehavior: 'none'` set in PR 14A.
 *
 * Last-discard pulse (BUG-020): driven by the store's `lastDiscard` field
 * (set by game:event {kind:'discard'}), identical to CombinedDiscardPool2D.
 * The previous implementation gated the pulse on `claimWindow !== null`,
 * but the server only sends game:claim-window to seats with an eligible
 * claim — so the discarder and non-claiming viewers never saw it. It also
 * animated boxShadow keyframes on the same motion.div that owned the
 * opacity/scale entry animation, which left the tile stuck at opacity 0
 * (the repeat:Infinity bleed documented in CombinedDiscardPool2D).
 */

import { AnimatePresence, motion } from 'framer-motion';
import type { ClientSeatState, TileType } from '@nanchang/shared';
import { useGameStore } from '../../stores/game.store';
import { useDiscardContext } from './DiscardContext';
import { MahjongTile2D } from './MahjongTile2D';
import type { SeatRole } from './layout-2d';

// ── Module-level constants ────────────────────────────────────────────────────

const TILE_SHADOW_ROLE: SeatRole = 'bottom';
const TILE_SIZE = 'xs' as const;

// ── Animation constants ───────────────────────────────────────────────────────

const TILE_INITIAL = { opacity: 0, scale: 0.7 };
const TILE_ANIMATE = { opacity: 1, scale: 1 };
const TILE_TRANSITION = { duration: 0.2 };
// NOTE: The last-discard red pulse lives inside MahjongTile2D (isLastDiscard
// prop), not here — see CombinedDiscardPool2D for why the pulse must be
// isolated from the entry animation's opacity/scale keyframes.

// ── Interleave helper (same logic as CombinedDiscardPool2D) ──────────────────

interface DiscardEntry {
  tile: TileType;
  seatIdx: 0 | 1 | 2 | 3;
  posInSeat: number;
}

function buildInterleavedDiscards(seats: readonly ClientSeatState[]): DiscardEntry[] {
  const result: DiscardEntry[] = [];
  const maxLen = seats.reduce((m, s) => Math.max(m, s.discards.length), 0);
  for (let round = 0; round < maxLen; round++) {
    for (let si = 0; si < 4; si++) {
      if (round < seats[si].discards.length) {
        result.push({
          tile: seats[si].discards[round] as TileType,
          seatIdx: si as 0 | 1 | 2 | 3,
          posInSeat: round,
        });
      }
    }
  }
  return result;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MobileDiscardPool2D() {
  const snapshot = useGameStore((s) => s.snapshot);
  // lastDiscard is driven by game:event {kind:'discard'}, NOT snapshot.pendingDiscard.
  // See game.store.ts for the full explanation of why pendingDiscard races.
  const lastDiscard = useGameStore((s) => s.lastDiscard);
  const { lastDiscardId } = useDiscardContext();

  if (!snapshot) return null;

  const entries = buildInterleavedDiscards(snapshot.seats);
  if (entries.length === 0) return null;

  const { seats } = snapshot;
  const viewerSeat = (snapshot.viewerSeat ?? 0) as 0 | 1 | 2 | 3;
  const viewerDiscardCount = seats[viewerSeat].discards.length;

  return (
    <div
      data-testid="mobile-discard-pool"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 2,
        alignContent: 'flex-start',
        justifyContent: 'center',
        maxWidth: '100%',
        maxHeight: '100%',
        overflowY: 'auto',
        // Hide scrollbar but allow scrolling on late-game overflow
        scrollbarWidth: 'none',
        // Allow internal scroll without propagating to body overscroll
        overscrollBehavior: 'contain',
      }}
    >
      <AnimatePresence>
        {entries.map(({ tile, seatIdx, posInSeat }) => {
          // Seat + position uniquely identifies the last discard — no tile-type
          // comparison needed (fixed BUG-053: type-only match lit up duplicates).
          const isPulse =
            lastDiscard?.seat === seatIdx && posInSeat === seats[seatIdx].discards.length - 1;

          const isViewerLastDiscard =
            seatIdx === viewerSeat && posInSeat === viewerDiscardCount - 1;
          const tileLayoutId =
            isViewerLastDiscard && lastDiscardId !== null ? `hand-${lastDiscardId}` : undefined;

          // isPulse in the key forces a remount when the pulse state flips, so
          // Framer Motion gets a genuine new mount for the overlay animation.
          // A pulse-triggered remount starts fully visible (TILE_ANIMATE) so the
          // already-rendered tile doesn't flash; brand-new discards fade+scale in.
          return (
            <motion.div
              key={`${seatIdx}-${posInSeat}-${isPulse ? 'pulsing' : 'idle'}`}
              initial={isPulse ? TILE_ANIMATE : TILE_INITIAL}
              animate={TILE_ANIMATE}
              transition={TILE_TRANSITION}
              style={{ borderRadius: 3 }}
            >
              <MahjongTile2D
                tile={tile}
                size={TILE_SIZE}
                role={TILE_SHADOW_ROLE}
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
