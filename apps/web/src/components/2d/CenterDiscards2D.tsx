/**
 * CenterDiscards2D — positions the combined discard pool inside the `center`
 * CSS Grid cell so all discarded tiles appear on the felt surface (BUG-2D-03).
 *
 * After BUG-2D-05 this is a thin positioning wrapper: all rendering logic
 * lives in CombinedDiscardPool2D which merges tiles from all four seats into
 * a single round-robin interleaved grid centred on the compass rose.
 *
 * The div is aria-hidden and pointerEvents:none because discard tiles are
 * decorative from an a11y perspective — all game interaction happens through
 * the accessible hand and action buttons.
 */

import { CombinedDiscardPool2D } from './CombinedDiscardPool2D';

export function CenterDiscards2D() {
  return (
    <div
      aria-hidden="true"
      style={{
        gridArea: 'center',
        position: 'relative',
        pointerEvents: 'none',
        // Clip any overflow from an unusually large discard pile cleanly.
        overflow: 'hidden',
        // Render above the felt surface (matches seat zone z-index).
        zIndex: 1,
      }}
    >
      <CombinedDiscardPool2D />
    </div>
  );
}
