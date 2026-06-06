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
 */

import type { Meld, TileType } from '@nanchang/shared';
import { useGameStore } from '../../stores/game.store';
import { MahjongTile2D } from './MahjongTile2D';
import { meldLayout } from './layout-2d';
import type { SeatRole } from './layout-2d';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface OpenMelds2DProps {
  seatIdx: 0 | 1 | 2 | 3;
  role: SeatRole;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OpenMelds2D({ seatIdx, role }: OpenMelds2DProps) {
  const snapshot = useGameStore((s) => s.snapshot);

  if (!snapshot) return null;

  const seat = snapshot.seats[seatIdx];
  const melds: Meld[] = seat.openMelds;
  const spec = meldLayout(role);

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
      {melds.map((meld, meldIdx) => (
        <MeldGroup key={meldIdx} meld={meld} role={role} spec={spec} />
      ))}
    </div>
  );
}

// ── MeldGroup ─────────────────────────────────────────────────────────────────

interface MeldGroupProps {
  meld: Meld;
  role: SeatRole;
  spec: ReturnType<typeof meldLayout>;
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
