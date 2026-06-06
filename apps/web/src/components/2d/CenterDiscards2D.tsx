/**
 * CenterDiscards2D — renders all four seats' discard pools inside the
 * `centre` CSS Grid cell so discarded tiles appear on the felt surface
 * rather than inside the seat zone strips (BUG-2D-03).
 *
 * Each pool is absolutely positioned near the edge of the centre cell that
 * corresponds to its seat:
 *
 *   top    → near the top edge,  centred horizontally
 *   right  → near the right edge, centred vertically
 *   bottom → near the bottom edge, centred horizontally
 *   left   → near the left edge,  centred vertically
 *
 * Because the pools are rendered inside an un-rotated container (unlike the
 * old seat zone containers which carried a CSS rotateZ), all tiles receive
 * `tileRole="bottom"` so their box-shadow direction matches the global light
 * source (screen-down-right) without any inverse-rotation compensation.
 *
 * Open melds remain in their respective seat zone strips.
 */

import type React from 'react';
import { DiscardPool2D } from './DiscardPool2D';
import type { SeatRole } from './layout-2d';

// ── Module-level constants (avoids i18next/no-literal-string on JSX props) ───

/**
 * Shadow role for every tile rendered in the centre area.
 * All four pools are inside an un-rotated container, so the target
 * screen-space shadow (+2 px, +6 px) is achieved by the 'bottom' offset
 * without any inverse-rotation compensation.
 */
const TILE_SHADOW_ROLE: SeatRole = 'bottom';

// ── Role → seat-index offset mapping ─────────────────────────────────────────

// offset = (seatIdx − viewerSeat + 4) % 4
// bottom → offset 0  → seatIdx = (viewerSeat + 0) % 4
// right  → offset 1  → seatIdx = (viewerSeat + 1) % 4
// top    → offset 2  → seatIdx = (viewerSeat + 2) % 4
// left   → offset 3  → seatIdx = (viewerSeat + 3) % 4

interface RoleEntry {
  role: SeatRole;
  offset: 0 | 1 | 2 | 3;
}

const ROLE_ENTRIES: readonly RoleEntry[] = [
  { role: 'top', offset: 2 },
  { role: 'right', offset: 1 },
  { role: 'bottom', offset: 0 },
  { role: 'left', offset: 3 },
];

// ── Absolute-position spec per role ──────────────────────────────────────────

const POOL_POSITIONS: Record<SeatRole, React.CSSProperties> = {
  top: {
    position: 'absolute',
    top: 4,
    left: '50%',
    transform: 'translateX(-50%)',
  },
  right: {
    position: 'absolute',
    right: 4,
    top: '50%',
    transform: 'translateY(-50%)',
  },
  bottom: {
    position: 'absolute',
    bottom: 4,
    left: '50%',
    transform: 'translateX(-50%)',
  },
  left: {
    position: 'absolute',
    left: 4,
    top: '50%',
    transform: 'translateY(-50%)',
  },
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface CenterDiscards2DProps {
  viewerSeat: 0 | 1 | 2 | 3;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CenterDiscards2D({ viewerSeat }: CenterDiscards2DProps) {
  return (
    <div
      aria-hidden="true"
      style={{
        gridArea: 'center',
        position: 'relative',
        // Discard pools are purely decorative from an a11y perspective;
        // all game interaction happens via the accessible hand and action buttons.
        pointerEvents: 'none',
        // Prevent a very deep discard pile from bleeding into adjacent areas.
        overflow: 'hidden',
        // Render above the felt surface (z-index: 1 matches seat zones).
        zIndex: 1,
      }}
    >
      {ROLE_ENTRIES.map(({ role, offset }) => {
        const seatIdx = ((viewerSeat + offset) % 4) as 0 | 1 | 2 | 3;
        return (
          <div key={role} style={POOL_POSITIONS[role]}>
            <DiscardPool2D seatIdx={seatIdx} role={role} tileRole={TILE_SHADOW_ROLE} />
          </div>
        );
      })}
    </div>
  );
}
