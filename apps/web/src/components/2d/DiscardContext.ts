/**
 * DiscardContext — bridges PlayerHand2D and DiscardPool2D for the
 * shared-element discard-flight animation.
 *
 * When the viewer discards a tile, PlayerHand2D stores the tile's
 * ephemeral local ID here. DiscardPool2D reads it to assign the same
 * `layoutId` ("hand-{id}") to the matching new entry in the discard pool,
 * so Framer Motion can animate the tile from the hand to its resting spot.
 *
 * The context provides a no-op default so components are safe to use
 * outside of GameTable2D (e.g., in isolation tests).
 */

import { createContext, useContext } from 'react';

export interface DiscardContextValue {
  /** Ephemeral ID of the last tile discarded from the viewer's hand, or null. */
  lastDiscardId: string | null;
  /** Called by PlayerHand2D immediately before firing onDiscard. */
  setLastDiscardId: (id: string | null) => void;
}

const DEFAULT: DiscardContextValue = {
  lastDiscardId: null,
  setLastDiscardId: () => {},
};

export const DiscardContext = createContext<DiscardContextValue>(DEFAULT);

/** Reads the nearest DiscardContext. Falls back to no-op default. */
export function useDiscardContext(): DiscardContextValue {
  return useContext(DiscardContext);
}
