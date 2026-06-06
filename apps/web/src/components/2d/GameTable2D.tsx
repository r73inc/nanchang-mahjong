/**
 * GameTable2D — 2.5D DOM game table compositor.
 *
 * Phase C: FeltSurface2D background + 3×3 CSS Grid skeleton.
 * Phase E: PlayerHand2D mounted in the 'bottom' grid area.
 * Phase F: Opponent hands, discard pools, open melds, seat labels fill remaining zones.
 *
 * CSS Grid template areas (matches SeatRole values from layout-2d.ts):
 *
 *   "top-corner  top         top-corner"
 *   "left        center      right"
 *   "btm-corner  bottom      btm-corner"
 */

import type { TileType } from '@nanchang/shared';
import { FeltSurface2D } from './FeltSurface2D';
import { PlayerHand2D } from './PlayerHand2D';

export interface GameTable2DProps {
  /** Wired from game-page.tsx's useGame().discard — called when the viewer discards. */
  onDiscard: (tile: TileType) => void;
}

export function GameTable2D({ onDiscard }: GameTable2DProps) {
  return (
    <div
      className="w-full h-full relative overflow-hidden"
      data-testid="game-table-2d"
      style={{
        display: 'grid',
        gridTemplateColumns: '22% 56% 22%',
        gridTemplateRows: '22% 56% 22%',
        gridTemplateAreas: `
          "top-corner top    top-corner"
          "left       center right"
          "btm-corner bottom btm-corner"
        `,
      }}
    >
      {/* Felt background spans the entire grid */}
      <div style={{ gridColumn: '1 / -1', gridRow: '1 / -1', position: 'relative' }}>
        <FeltSurface2D />
      </div>

      {/* ── Bottom zone — viewer's own hand ─────────────────────────────────── */}
      <div
        style={{
          gridArea: 'bottom',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingBottom: 4,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <PlayerHand2D onDiscard={onDiscard} />
      </div>

      {/* Remaining seat zones — populated in Phase F */}
    </div>
  );
}
