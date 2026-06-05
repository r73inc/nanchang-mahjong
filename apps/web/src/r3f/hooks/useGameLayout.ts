/**
 * useGameLayout.ts
 *
 * Zustand transient subscription → stable layout ref for use in useFrame.
 *
 * Why a ref instead of React state?
 * Tile positions change every turn (draw, discard, claim). If we stored the
 * layout in React state, every snapshot update would trigger a full re-render
 * of the scene tree. Instead we keep a mutable ref that is updated directly
 * by a Zustand subscriber — no React re-render, no GC pressure. Components
 * read `layoutRef.current` inside their useFrame callbacks, which run at 60fps
 * independently of the React render cycle.
 *
 * Why subscribeWithSelector?
 * The game store holds many slices (claimWindow, toast, connection, …). With a
 * plain `subscribe`, `computeTableLayout` would re-run whenever ANY slice
 * changed, even ones irrelevant to tile positions. subscribeWithSelector makes
 * the subscription fire ONLY when `snapshot` changes — exactly when layout
 * needs recomputing.
 *
 * The `fireImmediately: true` option runs the callback once synchronously on
 * subscribe, replacing the previous manual `getState()` initializer call.
 *
 * Usage (inside <Canvas>):
 *   const layoutRef = useGameLayout();
 *   useFrame(() => {
 *     const layout = layoutRef.current;
 *     if (!layout) return;
 *     // lerp tile meshes toward layout.viewerHand[i], etc.
 *   });
 */

import { useEffect, useRef } from 'react';
import { useGameStore } from '../../stores/game.store';
import { computeTableLayout, type TableLayout } from '../utils/table-layout';

/**
 * Returns a stable React ref containing the latest computed TableLayout.
 *
 * - Initialised synchronously on subscribe (`fireImmediately: true`).
 * - Updated synchronously (outside the React render cycle) only when the
 *   `snapshot` slice changes — not on toast, claimWindow, or connection updates.
 * - Safe to read from useFrame — zero React re-renders on updates.
 *
 * The ref is `null` until the first snapshot arrives from the server.
 */
export function useGameLayout(): React.MutableRefObject<TableLayout | null> {
  const layoutRef = useRef<TableLayout | null>(null);

  useEffect(() => {
    // Subscribe to the `snapshot` slice only.
    // `fireImmediately: true` fires the callback immediately with the current
    // snapshot value — handles the case where the canvas mounts after the
    // first snapshot has already arrived in the store.
    const unsubscribe = useGameStore.subscribe(
      (state) => state.snapshot,
      (snapshot) => {
        if (snapshot) layoutRef.current = computeTableLayout(snapshot);
      },
      { fireImmediately: true },
    );

    return unsubscribe;
  }, []); // run once on mount; subscription cleans itself up on unmount

  return layoutRef;
}
