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
 * - Initialised synchronously from the current Zustand snapshot on mount.
 * - Updated synchronously (outside the React render cycle) whenever the
 *   server pushes a new snapshot via setSnapshot().
 * - Safe to read from useFrame — zero React re-renders on updates.
 *
 * The ref is `null` until the first snapshot arrives from the server.
 */
export function useGameLayout(): React.MutableRefObject<TableLayout | null> {
  const layoutRef = useRef<TableLayout | null>(null);

  useEffect(() => {
    // Initialise immediately from whatever snapshot is already in the store
    // (handles the case where the canvas mounts after the first snapshot).
    const initialSnapshot = useGameStore.getState().snapshot;
    if (initialSnapshot) {
      layoutRef.current = computeTableLayout(initialSnapshot);
    }

    // Subscribe to all future state changes.
    // Zustand's subscribe runs synchronously when setState is called —
    // the ref is updated before the next useFrame fires.
    const unsubscribe = useGameStore.subscribe((state) => {
      if (state.snapshot) {
        layoutRef.current = computeTableLayout(state.snapshot);
      }
    });

    return unsubscribe;
  }, []); // run once on mount; Zustand subscription cleans itself up on unmount

  return layoutRef;
}
