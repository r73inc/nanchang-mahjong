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

import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { Reorder, AnimatePresence } from 'framer-motion';
import type { TileType } from '@nanchang/shared';
import { sortTypes } from '@nanchang/shared';
import { useGameStore } from '../../stores/game.store';
import { useDiscardContext } from './DiscardContext';
import { useI18n } from '../../i18n';
import { useThemeStore } from '../../stores/theme.store';
import { MahjongTile2D } from './MahjongTile2D';

// ── Module-level constants (avoids i18next/no-literal-string on JSX nodes) ────

const HAND_ARIA_LABEL = 'Your hand' as const;
const DRAG_HINT = 'Drag to reorder tiles' as const;
const DISCARD_HINT = 'Tap to discard' as const;
// 'x' as a JSX prop value triggers i18next/no-literal-string — use a constant.
const HORIZONTAL_AXIS = 'x' as const;

// i18n key for the floating discard confirmation button (mobile confirmMode).
const I18N_MOBILE_DISCARD_CONFIRM = 'mobileDiscardConfirm' as const;
// i18n key for the sort-hand button.
const I18N_SORT_HAND = 'gameSortHand' as const;

// ── Draw-tile animation variants (module-level for i18next/no-literal-string) ─

/**
 * Draw animation — new tile slides in from the right (simulates drawing from
 * the wall) and scales up from 80%. Spring physics gives it a physical feel.
 */
const TILE_INITIAL = { opacity: 0, scale: 0.8, x: 24 } as const;
const TILE_ANIMATE = { opacity: 1, scale: 1, x: 0 } as const;
const TILE_TRANSITION = { type: 'spring', stiffness: 320, damping: 24 } as const;

/**
 * Discard exit animation — tile flies upward toward the board centre and fades
 * out. Gives the visual impression of the tile leaving the hand and landing on
 * the table. The transition is embedded so it overrides only the exit keyframe.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TILE_EXIT: any = {
  opacity: 0,
  y: -60,
  scale: 0.75,
  transition: { duration: 0.22, ease: 'easeIn' },
};

// ── Types ─────────────────────────────────────────────────────────────────────

/** An entry in the local drag-sort order — not sent to the server. */
export interface LocalEntry {
  /** Stable ephemeral ID used as Framer Motion layoutId. */
  id: string;
  tile: TileType;
  /**
   * The index of this tile in the server hand array at the time the entry was
   * last synced. Stored permanently so the sort step never needs to re-derive
   * it via a fragile multiset match — discard handlers read entry.tile directly
   * (the server deducts by type), but having serverIndex available makes the
   * binding explicit and safe.
   */
  serverIndex: number;
  /** True when this tile was drawn in the most recent server update. Used to
   *  visually identify the drawn tile after auto-sort reorders it away from the
   *  right end of the hand. Cleared on the next hand change. */
  isJustDrawn?: boolean;
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
 *  1. Tiles already present in `prev` are kept in their user-sorted positions,
 *     with their serverIndex updated to reflect the new server hand layout.
 *  2. New tiles (drawn) are appended at the end with fresh IDs and the correct
 *     serverIndex from the incoming hand.
 *  3. Removed tiles (discarded / claimed) are dropped.
 *
 * Server indices are assigned ONCE here via a per-tile dequeue — no secondary
 * multiset match is ever needed in the sort step or elsewhere.
 */
export function mergeLocalOrder(prev: LocalEntry[], serverHand: TileType[]): LocalEntry[] {
  // Build a FIFO queue of server indices for each tile type
  const queues = new Map<TileType, number[]>();
  serverHand.forEach((tile, idx) => {
    if (!queues.has(tile)) queues.set(tile, []);
    queues.get(tile)!.push(idx);
  });

  // Walk prev in user order; keep entries whose tile type still exists in the
  // server hand, assigning the next available server index for that type.
  const kept: LocalEntry[] = [];
  const usedServerIndices = new Set<number>();
  for (const entry of prev) {
    const q = queues.get(entry.tile);
    if (q?.length) {
      const serverIndex = q.shift()!;
      kept.push({ ...entry, serverIndex });
      usedServerIndices.add(serverIndex);
    }
    // No queue entry left → tile was removed (discarded/claimed); drop it.
  }

  // Append new entries for server tiles not yet assigned to a kept entry.
  const appended: LocalEntry[] = [];
  serverHand.forEach((tile, serverIndex) => {
    if (!usedServerIndices.has(serverIndex)) {
      appended.push({ id: genId(), tile, serverIndex });
    }
  });

  return [...kept, ...appended];
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface PlayerHand2DProps {
  /** Wired to useGame().discard in GameTable2D → game-page.tsx */
  onDiscard: (tile: TileType) => void;
  /**
   * Mobile confirm-button mode.
   *
   * When true (MobileGameTable2D):
   *  - Drag reorders tiles freely even during opponent turns.
   *  - A single tap selects/deselects a tile (no double-tap discard).
   *  - A floating gold "Discard" button appears above the selected tile and
   *    is the only way to trigger onDiscard — preventing accidental discards
   *    while sorting.
   *
   * When false (DesktopGameTable2D, default):
   *  - Drag reorders on the player's turn.
   *  - First tap selects; second tap on the same tile discards.
   */
  confirmMode?: boolean;
}

export function PlayerHand2D({ onDiscard, confirmMode = false }: PlayerHand2DProps) {
  const { t } = useI18n();
  const snapshot = useGameStore((s) => s.snapshot);
  const claimWindow = useGameStore((s) => s.claimWindow);
  const pendingMove = useGameStore((s) => s.pendingMove);
  const canTsumo = useGameStore((s) => s.canTsumo);
  const { autoSortDrawnTile } = useThemeStore();

  // ── Hand-height CSS variable ──────────────────────────────────────────────
  // Observes the container height and sets --mj-hand-height on :root so that
  // overlays (SideRail) can position themselves above the hand on mobile.
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      document.documentElement.style.setProperty('--mj-hand-height', `${el.offsetHeight}px`);
    };

    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);

    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--mj-hand-height');
    };
  }, []);

  // ── Discard-flight context (Phase G) ──────────────────────────────────────
  const { setLastDiscardId } = useDiscardContext();

  // Derive viewer's hand from snapshot
  const viewerSeat = (snapshot?.viewerSeat ?? 0) as 0 | 1 | 2 | 3;
  const viewerHand: TileType[] =
    (snapshot?.seats[viewerSeat]?.hand as TileType[] | null | undefined) ?? [];
  const jingPrimary = snapshot?.jingPrimary ?? null;
  const jingSecondary = snapshot?.jingSecondary ?? null;
  const isMyTurn =
    snapshot !== null && snapshot.currentSeat === viewerSeat && snapshot.phase === 'playing';
  const needsDiscard = snapshot?.pendingDiscard !== null && snapshot?.pendingDiscard !== undefined;

  // ── Local drag-sort state ─────────────────────────────────────────────────

  const [localOrder, setLocalOrder] = useState<LocalEntry[]>(() =>
    viewerHand.map((tile, serverIndex) => ({ id: genId(), tile, serverIndex })),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Ref kept in sync every render so the sync effect can read current localOrder
  // without adding it to its dependency array (avoids stale-closure bugs and
  // prevents re-triggering on every drag reorder).
  const localOrderRef = useRef<LocalEntry[]>(localOrder);
  localOrderRef.current = localOrder;

  // Track the last hand key to detect server-driven hand changes
  const prevHandKeyRef = useRef<string>(viewerHand.join(','));

  useEffect(() => {
    const key = viewerHand.join(',');
    if (key === prevHandKeyRef.current) return;
    prevHandKeyRef.current = key;

    // Read current order via ref (avoids adding localOrder to deps which would
    // re-trigger on every drag reorder).
    const prev = localOrderRef.current;
    const merged = mergeLocalOrder(prev, viewerHand);

    let nextOrder: LocalEntry[];
    if (!autoSortDrawnTile) {
      // Clear any stale isJustDrawn flags from a previous auto-sort session.
      nextOrder = merged.map((e) => (e.isJustDrawn ? { ...e, isJustDrawn: false } : e));
    } else {
      // Tag newly appended entries (those whose stable UUID wasn't in the previous
      // order) as isJustDrawn so the gold dot follows the drawn tile.
      const prevIds = new Set(prev.map((e) => e.id));
      const tagged = merged.map((e) => ({ ...e, isJustDrawn: !prevIds.has(e.id) }));

      // Sort entry objects directly — serverIndex is already embedded on each entry,
      // so no secondary multiset match is needed.
      nextOrder = [...tagged].sort((a, b) => {
        if (a.tile === b.tile) return 0; // same type: preserve relative order (stable sort)
        const [first] = sortTypes([a.tile, b.tile]);
        return first === a.tile ? -1 : 1;
      });
    }

    // Explicitly set the computed state rather than using the functional form, so
    // Framer Motion's Reorder.Group sees a fully resolved values array in the same
    // commit and its drag physics stay in sync.
    setLocalOrder(nextOrder);
    setSelectedId(null);
  }, [viewerHand, autoSortDrawnTile]);

  // ── Interaction ───────────────────────────────────────────────────────────

  const interactive = isMyTurn && !claimWindow && !pendingMove && !canTsumo;

  /**
   * Drag-reorder eligibility.
   *
   * confirmMode (mobile): allow reordering at any time — even during opponent
   * turns — except during an active claim window or a pending server move.
   *
   * Standard mode (desktop): reorder only when interactive (player's own turn).
   */
  const draggable = confirmMode ? !claimWindow && !pendingMove : interactive;

  // ── Sort hand ─────────────────────────────────────────────────────────────
  const handleSortHand = useCallback(() => {
    setLocalOrder((prev) =>
      [...prev].sort((a, b) => {
        if (a.tile === b.tile) return 0;
        const [first] = sortTypes([a.tile, b.tile]);
        return first === a.tile ? -1 : 1;
      }),
    );
    setSelectedId(null);
  }, []);

  // ── Floating discard confirmation (confirmMode only) ─────────────────────
  const handleConfirmDiscard = useCallback(() => {
    if (selectedId === null) return;
    const entry = localOrder.find((e) => e.id === selectedId);
    if (!entry) return;
    // Jing tiles go through a separate confirmation sheet before the actual
    // discard fires. Don't remove optimistically — let the server snapshot
    // (or a cancel) settle the hand instead.
    const isJingTile = entry.tile === jingPrimary || entry.tile === jingSecondary;
    if (!isJingTile) {
      setLastDiscardId(entry.id);
      setLocalOrder((prev) => prev.filter((e) => e.id !== entry.id));
    }
    setSelectedId(null);
    onDiscard(entry.tile);
  }, [selectedId, localOrder, onDiscard, setLastDiscardId, jingPrimary, jingSecondary]);

  const handleTileSelect = useCallback(
    (entry: LocalEntry) => {
      if (confirmMode) {
        // Mobile: single tap toggles selection; the floating button discards.
        // Dragging a tile changes order — it does not trigger selection.
        setSelectedId((prev) => (prev === entry.id ? null : entry.id));
      } else {
        // Desktop: second tap on the already-selected tile → discard.
        // Store the tile's local ID in context before removing it from localOrder,
        // so DiscardPool2D can use the matching layoutId for the discard flight.
        if (selectedId === entry.id) {
          // Same guard as handleConfirmDiscard: jing tiles go through the
          // confirm sheet, so don't optimistically remove from localOrder.
          const isJingTile = entry.tile === jingPrimary || entry.tile === jingSecondary;
          if (!isJingTile) {
            setLastDiscardId(entry.id);
            setLocalOrder((prev) => prev.filter((e) => e.id !== entry.id));
          }
          setSelectedId(null);
          onDiscard(entry.tile);
        } else {
          // First tap → select
          setSelectedId(entry.id);
        }
      }
    },
    [confirmMode, selectedId, onDiscard, setLastDiscardId, jingPrimary, jingSecondary],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  if (!snapshot || viewerHand.length === 0) return null;

  return (
    <div
      ref={containerRef}
      data-testid="player-hand-2d"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '8px 4px',
      }}
    >
      {/* ── Floating discard confirmation button (confirmMode / mobile only) ─ */}
      {/* Appears above the tile row when a tile is selected on the player's    */}
      {/* turn. Drag-to-sort never triggers a discard — only this button does.  */}
      {confirmMode && selectedId !== null && interactive && (
        <div
          style={{
            position: 'absolute',
            top: -46,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'auto',
            zIndex: 20,
          }}
        >
          <button
            data-testid="mobile-discard-confirm-btn"
            onClick={handleConfirmDiscard}
            style={{
              padding: '8px 28px',
              borderRadius: 14,
              background: 'linear-gradient(180deg, #c9a961 0%, #a88a45 100%)',
              boxShadow: '0 4px 14px rgba(201,169,97,0.45)',
              border: 'none',
              color: '#1a1108',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              WebkitTouchCallout: 'none' as React.CSSProperties['WebkitTouchCallout'],
              userSelect: 'none',
            }}
          >
            {t(I18N_MOBILE_DISCARD_CONFIRM)}
          </button>
        </div>
      )}
      <Reorder.Group
        as="div"
        axis={HORIZONTAL_AXIS}
        values={localOrder}
        onReorder={draggable ? setLocalOrder : () => undefined}
        aria-label={HAND_ARIA_LABEL}
        aria-describedby="hand-drag-hint"
        style={{
          display: 'flex',
          flexWrap: 'nowrap',
          gap: 4,
          listStyle: 'none',
          padding: 0,
          margin: 0,
          // Flex-shrink safety (PR 14B): allows the tile row to shrink below
          // its intrinsic width on small devices (e.g. iPhone SE 375 px).
          // min-width: 0 is mandatory — without it flex items cannot shrink
          // below their content size, causing overflow on narrow viewports.
          flexShrink: 1,
          minWidth: 0,
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
              exit={TILE_EXIT}
              transition={TILE_TRANSITION}
              whileDragging={{ y: -12, zIndex: 10, scale: 1.05 }}
              style={{
                listStyle: 'none',
                touchAction: 'none',
                // Allow each tile to shrink proportionally below its natural size.
                // Pairs with the Reorder.Group flexShrink/minWidth above.
                flexShrink: 1,
                minWidth: 0,
                position: 'relative',
              }}
            >
              <MahjongTile2D
                tile={entry.tile}
                size="lg"
                role="bottom"
                selected={selectedId === entry.id}
                isJing={entry.tile === jingPrimary || entry.tile === jingSecondary}
                interactive={interactive}
                layoutId={`hand-${entry.id}`}
                onSelect={() => handleTileSelect(entry)}
              />
              {/* Gold dot marks the tile drawn this turn after auto-sort moves it
                  away from the right end. Only shown when auto-sort is enabled. */}
              {entry.isJustDrawn && autoSortDrawnTile && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: 5,
                    right: 5,
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#c9a961',
                    pointerEvents: 'none',
                    zIndex: 2,
                  }}
                />
              )}
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

      {/*
       * sr-only drag hint — always rendered so that the Reorder.Group's
       * aria-describedby="hand-drag-hint" always resolves to a valid element.
       * The text is only meaningful when the hand is draggable but the span
       * must exist unconditionally to satisfy the aria-describedby contract.
       */}
      <span id="hand-drag-hint" className="sr-only">
        {DRAG_HINT}
      </span>

      {/* ── Sort button — rendered last in DOM so tile buttons come first for a11y/tests ─ */}
      {interactive && selectedId === null && (
        <div
          style={{
            position: 'absolute',
            top: -36,
            left: 8,
            pointerEvents: 'auto',
            zIndex: 19,
          }}
        >
          <button
            data-testid="sort-hand-btn"
            onClick={handleSortHand}
            style={{
              padding: '5px 12px',
              borderRadius: 10,
              border: '1px solid rgba(201,169,97,0.35)',
              background: 'rgba(201,169,97,0.08)',
              color: '#c9a961',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              WebkitTouchCallout: 'none' as React.CSSProperties['WebkitTouchCallout'],
              userSelect: 'none',
            }}
          >
            {t(I18N_SORT_HAND)}
          </button>
        </div>
      )}
    </div>
  );
}
