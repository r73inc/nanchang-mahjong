/**
 * GameTable2D — 2.5D DOM game table (stub for Phase B).
 *
 * Phase C will add FeltSurface2D and the seat-zone layout grid.
 * Phase D–G will progressively fill in tile components and animations.
 */

export function GameTable2D() {
  return (
    <div
      className="w-full h-full"
      style={{ background: 'var(--felt-bg, #0d3b2e)' }}
      data-testid="game-table-2d"
    />
  );
}
