/**
 * CombinedDiscardPool2D — renders ALL four players' discards as a single
 * merged tile grid centred on the felt surface (BUG-2D-05).
 *
 * Tiles are interleaved round-robin across all four seats:
 *   seat0[0], seat1[0], seat2[0], seat3[0], seat0[1], seat1[1], …
 * This approximates chronological play order without requiring the server
 * to expose a global discard sequence (each player discards exactly once
 * per turn cycle, so the round-robin matches actual game flow).
 *
 * Special treatments preserved from the per-seat pools:
 *  - Gold pulse on the last discarded tile when a claim window is open.
 *  - Shared-element layoutId on the viewer's most recently discarded tile
 *    (connects the discard-flight animation from PlayerHand2D).
 */

import { AnimatePresence, motion } from 'framer-motion';
import type { ClientSeatState, TileType } from '@nanchang/shared';
import { useGameStore } from '../../stores/game.store';
import { useDiscardContext } from './DiscardContext';
import { MahjongTile2D } from './MahjongTile2D';
import type { SeatRole } from './layout-2d';

// ── Module-level constants (avoids i18next/no-literal-string on JSX props) ───

/** All centre-area tiles use 'bottom' shadow (no rotation context). */
const TILE_SHADOW_ROLE: SeatRole = 'bottom';

/** Tile size for all discard tiles in the combined pool. */
const TILE_SIZE = 'sm' as const;

// ── Animation constants ───────────────────────────────────────────────────────
// Framer Motion animate requires mutable arrays for keyframes — plain arrays
// and objects are used intentionally (not `as const`).

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

// ── Interleave helper ─────────────────────────────────────────────────────────

interface DiscardEntry {
  tile: TileType;
  seatIdx: 0 | 1 | 2 | 3;
  /** Index of this tile within its seat's discard array. */
  posInSeat: number;
}

/**
 * Builds a round-robin interleaved list of all discards across four seats.
 *
 * Example with seats having [2, 3, 1, 2] discards:
 *   [s0[0], s1[0], s2[0], s3[0], s0[1], s1[1], s3[1], s1[2]]
 */
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

export function CombinedDiscardPool2D() {
  const snapshot = useGameStore((s) => s.snapshot);
  const { lastDiscardId } = useDiscardContext();

  if (!snapshot) return null;

  const entries = buildInterleavedDiscards(snapshot.seats);
  if (entries.length === 0) return null;

  const { discardedBySeat, seats } = snapshot;
  // viewerSeat can be null in the type; default to 0 (same guard as GameTable2D).
  const viewerSeat = (snapshot.viewerSeat ?? 0) as 0 | 1 | 2 | 3;
  const viewerDiscardCount = seats[viewerSeat].discards.length;

  return (
    <div
      data-testid="combined-discard-pool"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'grid',
        // 8 columns balances pool width vs height for typical game lengths.
        // At reference (sm = 36 px × 8 cols + 7 × 2 px gap = 302 px) the pool
        // fits comfortably inside the ~448 px centre cell width.
        gridTemplateColumns: 'repeat(8, auto)',
        gap: 2,
      }}
    >
      <AnimatePresence>
        {entries.map(({ tile, seatIdx, posInSeat }) => {
          // Pulse the tile that was just discarded while pendingDiscard is set
          // (from the moment the tile lands until claimed or next draw begins).
          const isThisTheLastDiscard =
            discardedBySeat === seatIdx && posInSeat === seats[seatIdx].discards.length - 1;
          const isPulse = isThisTheLastDiscard && snapshot.pendingDiscard !== null;

          // Connect the discard-flight shared-element animation from PlayerHand2D.
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
              style={{ borderRadius: 4 }}
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
