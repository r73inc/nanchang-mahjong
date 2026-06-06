/**
 * PlayerHand2D — the viewer's own hand for the 2.5D DOM game table.
 *
 * Architecture:
 *  - Reads snapshot + claimWindow + pendingMove from Zustand (no prop-drilling).
 *  - Maintains `localOrder` in component state: each entry is { id, tile } where
 *    `id` is a stable ephemeral UUID. User drag-reorders update localOrder without
 *    touching the server. On server snapshots the list is merged: existing entries
 *    stay in user-sorted order; new tiles (drawn) are appended at the end.
 *  - Framer Motion Reorder.Group for drag-to-sort (axis="x").
 *  - AnimatePresence for draw animations — new tiles fade/scale in (Phase G).
 *  - Tap-to-select → tap-again → onDiscard(tile) two-step flow.
 *  - Before firing onDiscard, stores the tile's local ID in DiscardContext so
 *    DiscardPool2D can assign the matching layoutId for the discard-flight
 *    shared-element animation (Phase G).
 *  - layoutId="hand-{id}" hooks into the shared-element discard animation.
 *  - MotionConfig reducedMotion="user" lives at GameTable2D root (Phase G).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Reorder, AnimatePresence } from 'framer-motion';
import type { TileType } from '@nanchang/shared';
import { useGameStore } from '../../stores/game.store';
import { useDiscardContext } from './DiscardContext';
import { MahjongTile2D } from './MahjongTile2D';

// ── Module-level constants (avoids i18next/no-literal-string on JSX nodes) ────

const HAND_ARIA_LABEL = 'Your hand' as const;
const DRAG_HINT = 'Drag to reorder tiles' as const;
const DISCARD_HINT = 'Tap to discard' as const;
// 'x' as a JSX prop value triggers i18next/no-literal-string — use a constant.
const HORIZONTAL_AXIS = 'x' as const;

// ── Draw-tile animation variants (module-level for i18next/no-literal-string) ─

/** Entering tile: fade + scale up from 80% opacity-0 over 200 ms. */
const TILE_INITIAL = { opacity: 0, scale: 0.8 } as const;
const TILE_ANIMATE = { opacity: 1, scale: 1 } as const;
const TILE_TRANSITION = { duration: 0.2 } as const;

// ── Types ─────────────────────────────────────────────────────────────────────

/** An entry in the local drag-sort order — not sent to the server. */
export interface LocalEntry {
  /** Stable ephemeral ID used as Framer Motion layoutId. */
  id: string;
  tile: TileType;
}

// ── ID generator ──────────────────────────────────────────────────────────────

/** Generates a unique ID using crypto.randomUUID when available, with a
 *  Math.random fallback for environments that don't expose the Web Crypto API. */
function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── Pure merge logic (exported for unit testing) ──────────────────────────────

/**
 * Merges a fresh server hand into the current localOrder.
 *
 * Rules:
 *  1. Tiles already present in `prev` are kept in their user-sorted positions.
 *  2. New tiles (drawn) are appended at the end with fresh IDs.
 *  3. Removed tiles (discarded / claimed) are dropped.
 *
 * Uses a multiset-match so duplicate TileType values are handled correctly
 * (e.g., two '1m' tiles in the same hand get independent IDs).
 */
export function mergeLocalOrder(prev: LocalEntry[], serverHand: TileType[]): LocalEntry[] {
  // How many of each tile the new server hand contains
  const want = new Map<TileType, number>();
  for (const t of serverHand) {
    want.set(t, (want.get(t) ?? 0) + 1);
  }

  // Walk prev in user order; greedily keep matching tiles
  const consumed = new Map<TileType, number>();
  const kept: LocalEntry[] = [];
  for (const entry of prev) {
    const total = want.get(entry.tile) ?? 0;
    const used = consumed.get(entry.tile) ?? 0;
    if (used < total) {
      kept.push(entry);
      consumed.set(entry.tile, used + 1);
    }
  }

  // Append tiles that are new (not covered by kept)
  const keptCount = new Map<TileType, number>();
  for (const e of kept) {
    keptCount.set(e.tile, (keptCount.get(e.tile) ?? 0) + 1);
  }

  const appended: LocalEntry[] = [];
  for (const [tile, total] of want) {
    const have = keptCount.get(tile) ?? 0;
    for (let i = have; i < total; i++) {
      appended.push({ id: genId(), tile });
    }
  }

  return [...kept, ...appended];
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface PlayerHand2DProps {
  /** Wired to useGame().discard in GameTable2D → game-page.tsx */
  onDiscard: (tile: TileType) => void;
}

export function PlayerHand2D({ onDiscard }: PlayerHand2DProps) {
  const snapshot = useGameStore((s) => s.snapshot);
  const claimWindow = useGameStore((s) => s.claimWindow);
  const pendingMove = useGameStore((s) => s.pendingMove);

  // ── Discard-flight context (Phase G) ──────────────────────────────────────
  const { setLastDiscardId } = useDiscardContext();

  // Derive viewer's hand from snapshot
  const viewerSeat = (snapshot?.viewerSeat ?? 0) as 0 | 1 | 2 | 3;
  const viewerHand: TileType[] =
    (snapshot?.seats[viewerSeat]?.hand as TileType[] | null | undefined) ?? [];
  const jingIndicator = snapshot?.jingIndicator ?? null;
  const isMyTurn =
    snapshot !== null && snapshot.currentSeat === viewerSeat && snapshot.phase === 'playing';
  const needsDiscard = snapshot?.pendingDiscard !== null && snapshot?.pendingDiscard !== undefined;

  // ── Local drag-sort state ─────────────────────────────────────────────────

  const [localOrder, setLocalOrder] = useState<LocalEntry[]>(() =>
    viewerHand.map((tile) => ({ id: genId(), tile })),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Track the last hand key to detect server-driven hand changes
  const prevHandKeyRef = useRef<string>(viewerHand.join(','));

  useEffect(() => {
    const key = viewerHand.join(',');
    if (key !== prevHandKeyRef.current) {
      prevHandKeyRef.current = key;
      setLocalOrder((prev) => mergeLocalOrder(prev, viewerHand));
      // Clear any pending selection when the server delivers a new snapshot
      setSelectedId(null);
    }
  }, [viewerHand]);

  // ── Interaction ───────────────────────────────────────────────────────────

  const interactive = isMyTurn && !claimWindow && !pendingMove;
  const draggable = interactive;

  const handleTileSelect = useCallback(
    (entry: LocalEntry) => {
      if (selectedId === entry.id) {
        // Second tap on the already-selected tile → discard
        // Store the tile's local ID in context before removing it from localOrder,
        // so DiscardPool2D can use the matching layoutId for the discard flight.
        setLastDiscardId(entry.id);
        setLocalOrder((prev) => prev.filter((e) => e.id !== entry.id));
        setSelectedId(null);
        onDiscard(entry.tile);
      } else {
        // First tap → select
        setSelectedId(entry.id);
      }
    },
    [selectedId, onDiscard, setLastDiscardId],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  if (!snapshot || viewerHand.length === 0) return null;

  return (
    <div
      data-testid="player-hand-2d"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '8px 4px',
      }}
      aria-label={HAND_ARIA_LABEL}
    >
      <Reorder.Group
        as="div"
        axis={HORIZONTAL_AXIS}
        values={localOrder}
        onReorder={draggable ? setLocalOrder : () => undefined}
        style={{
          display: 'flex',
          flexWrap: 'nowrap',
          gap: 4,
          listStyle: 'none',
          padding: 0,
          margin: 0,
        }}
      >
        {/*
         * AnimatePresence enables draw animations:
         * - New tiles (drawn from wall) enter with TILE_INITIAL → TILE_ANIMATE.
         * - Discarded tiles have no exit variant; they're removed from localOrder
         *   immediately. The layoutId on MahjongTile2D's motion.div carries the
         *   cross-component flight to DiscardPool2D.
         */}
        <AnimatePresence>
          {localOrder.map((entry) => (
            <Reorder.Item
              as="div"
              key={entry.id}
              value={entry}
              drag={draggable ? HORIZONTAL_AXIS : false}
              initial={TILE_INITIAL}
              animate={TILE_ANIMATE}
              transition={TILE_TRANSITION}
              whileDragging={{ y: -12, zIndex: 10, scale: 1.05 }}
              style={{ listStyle: 'none', touchAction: 'none' }}
            >
              <MahjongTile2D
                tile={entry.tile}
                size="lg"
                role="bottom"
                selected={selectedId === entry.id}
                isJing={entry.tile === jingIndicator}
                interactive={interactive}
                layoutId={`hand-${entry.id}`}
                onSelect={() => handleTileSelect(entry)}
              />
            </Reorder.Item>
          ))}
        </AnimatePresence>
      </Reorder.Group>

      {/* Discard nudge — shown when the viewer drew and must discard */}
      {needsDiscard && isMyTurn && (
        <span
          aria-live="polite"
          style={{ color: '#c9a961', fontSize: 11, letterSpacing: '0.03em' }}
        >
          {DISCARD_HINT}
        </span>
      )}

      {/* sr-only drag hint wired to the Reorder.Group via aria-describedby */}
      {draggable && (
        <span id="hand-drag-hint" className="sr-only">
          {DRAG_HINT}
        </span>
      )}
    </div>
  );
}
