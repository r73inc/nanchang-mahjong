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

const EASE_IN_OUT = 'easeInOut' as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SHADOW_PULSE: any[] = [
  '0 0 0px rgba(201,169,97,0)',
  '0 0 8px rgba(201,169,97,0.8)',
  '0 0 0px rgba(201,169,97,0)',
];
const ANIMATE_PULSE = { boxShadow: SHADOW_PULSE };
const TRANSITION_PULSE = { duration: 1.2, repeat: Infinity, ease: EASE_IN_OUT };

const TILE_INITIAL = { opacity: 0, scale: 0.7 };
const TILE_ANIMATE = { opacity: 1, scale: 1 };
const TILE_TRANSITION = { duration: 0.2 };

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
  const claimWindow = useGameStore((s) => s.claimWindow);
  const { lastDiscardId } = useDiscardContext();

  if (!snapshot) return null;

  const entries = buildInterleavedDiscards(snapshot.seats);
  if (entries.length === 0) return null;

  const { discardedBySeat, seats } = snapshot;
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
          const isThisTheLastDiscard =
            discardedBySeat === seatIdx && posInSeat === seats[seatIdx].discards.length - 1;
          const isPulse = isThisTheLastDiscard && claimWindow !== null;

          const isViewerLastDiscard =
            seatIdx === viewerSeat && posInSeat === viewerDiscardCount - 1;
          const tileLayoutId =
            isViewerLastDiscard && lastDiscardId !== null ? `hand-${lastDiscardId}` : undefined;

          return (
            <motion.div
              key={`${seatIdx}-${posInSeat}`}
              initial={TILE_INITIAL}
              animate={isPulse ? ANIMATE_PULSE : TILE_ANIMATE}
              transition={isPulse ? TRANSITION_PULSE : TILE_TRANSITION}
              style={{ borderRadius: 3 }}
            >
              <MahjongTile2D
                tile={tile}
                size={TILE_SIZE}
                role={TILE_SHADOW_ROLE}
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
