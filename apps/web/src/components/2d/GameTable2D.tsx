/**
 * GameTable2D — 2.5D DOM game table compositor.
 *
 * Phase C: FeltSurface2D background + 3×3 CSS Grid skeleton.
 * Phase D–G: tile components and Framer Motion animations fill each zone.
 *
 * CSS Grid template areas (matches SeatRole values from layout-2d.ts):
 *
 *   "top-corner  top         top-corner"
 *   "left        center      right"
 *   "btm-corner  bottom      btm-corner"
 */

import { FeltSurface2D } from './FeltSurface2D';

export function GameTable2D() {
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

      {/* Seat zones — populated in Phase F */}
    </div>
  );
}
