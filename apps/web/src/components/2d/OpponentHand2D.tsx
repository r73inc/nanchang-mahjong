/**
 * OpponentHand2D — face-down hand row for one opponent seat.
 *
 * Renders `handCount` back-face xs tiles in a horizontal row.
 * The seat zone container already carries the CSS rotation (via containerTransform
 * from layout-2d.ts), so individual tiles need no per-tile rotation.
 *
 * AFK state: a semi-transparent overlay dims the hand.
 */

import { useGameStore } from '../../stores/game.store';
import { MahjongTile2D } from './MahjongTile2D';
import type { SeatRole } from './layout-2d';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface OpponentHand2DProps {
  seatIdx: 0 | 1 | 2 | 3;
  role: SeatRole;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OpponentHand2D({ seatIdx, role }: OpponentHand2DProps) {
  const snapshot = useGameStore((s) => s.snapshot);

  if (!snapshot) return null;

  const seat = snapshot.seats[seatIdx];
  const count = Math.max(0, seat.handCount);

  if (count === 0) return null;

  return (
    <div
      data-testid={`opponent-hand-${seatIdx}`}
      style={{
        position: 'relative',
        display: 'flex',
        flexWrap: 'nowrap',
        gap: 2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <MahjongTile2D key={i} tile="back" size="xs" role={role} interactive={false} />
      ))}

      {/* AFK overlay */}
      {seat.afk && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            borderRadius: 4,
          }}
        />
      )}
    </div>
  );
}
