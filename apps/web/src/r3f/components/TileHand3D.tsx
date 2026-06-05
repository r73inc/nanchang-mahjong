/**
 * TileHand3D.tsx
 *
 * The viewer's own interactive hand — 13 or 14 face-up tiles in a row.
 *
 * Interaction: tap once to select (tile lifts), tap again to discard.
 * When `isMyTurn` is false, tiles are rendered but not interactive.
 * All socket emits are delegated to the onSelect / onDiscard callbacks
 * (same functions as the current DOM hand — no game logic here).
 */

import type { TileType } from '@nanchang/shared';
import type { TileTextureMap } from '../hooks/useTileTextures';
import type { TilePose } from '../utils/table-layout';
import { MahjongTile3D } from './MahjongTile3D';
import * as THREE from 'three';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TileHand3DProps {
  tiles: TileType[];
  poses: TilePose[];
  faceMap: TileTextureMap;
  backTexture: THREE.Texture;
  /** Set of TileType strings that are currently Jing (wildcard). */
  jingTypes: Set<string>;
  selectedTileIdx: number | null;
  /** Fires when the viewer first taps a tile (select-mode). */
  onSelect: (idx: number) => void;
  /** Fires when the viewer taps an already-selected tile (confirm discard). */
  onDiscard: (tile: TileType) => void;
  isMyTurn: boolean;
}

// ── Fallback pose ─────────────────────────────────────────────────────────────

const HIDDEN: TilePose = { x: 0, y: -10, z: 0, rx: 0, ry: 0, rz: 0 };

// ── Component ─────────────────────────────────────────────────────────────────

export function TileHand3D({
  tiles,
  poses,
  faceMap,
  backTexture,
  jingTypes,
  selectedTileIdx,
  onSelect,
  onDiscard,
  isMyTurn,
}: TileHand3DProps) {
  const drawnIdx = tiles.length - 1; // last tile in hand is the most recently drawn

  const handleClick = (idx: number) => {
    if (!isMyTurn) return;
    if (selectedTileIdx === idx) {
      // Second tap on same tile → confirm discard
      onDiscard(tiles[idx]);
    } else {
      // First tap → select
      onSelect(idx);
    }
  };

  return (
    <>
      {tiles.map((tile, idx) => (
        <MahjongTile3D
          key={`viewer-hand-${idx}`}
          tileType={tile}
          faceMap={faceMap}
          backTexture={backTexture}
          pose={poses[idx] ?? HIDDEN}
          isJing={jingTypes.has(tile)}
          isSelected={selectedTileIdx === idx}
          isDrawn={idx === drawnIdx && tiles.length > 1}
          interactive={isMyTurn}
          onClick={() => handleClick(idx)}
        />
      ))}
    </>
  );
}
