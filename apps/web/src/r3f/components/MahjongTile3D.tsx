/**
 * MahjongTile3D.tsx
 *
 * Atomic 3D tile component — renders one tile as a two-mesh composition:
 *
 *   1. Body mesh  — the GLB geometry (beveled tile shape) with ceramic
 *                   MeshPhysicalMaterial (ivory, no texture).
 *   2. Face stamp — a PlaneGeometry child at FACE_STAMP_Z with the SVG
 *                   texture as its map. When tileType is null (face-down),
 *                   the back texture is used instead.
 *
 * Animations:
 *   - Position and rotation lerp toward the `pose` target at ~12 units/s.
 *   - Selected (viewer choosing a discard): tile lifts by 0.35u on Y.
 *   - Jing (spirit/wildcard): emissive gold pulse + floating "节" label.
 *
 * Pointer events:
 *   - An invisible boxGeometry hit-box handles onClick / hover so clicks
 *     register on the tile sides and face equally.
 *   - Only mounted when `interactive = true`.
 */

import { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { TileType } from '@nanchang/shared';
import {
  useTileGeometry,
  TILE_SCALE,
  TILE_WIDTH,
  TILE_HEIGHT,
  TILE_DEPTH,
  FACE_STAMP_Z,
} from '../hooks/useTileGeometry';
import type { TileTextureMap } from '../hooks/useTileTextures';
import type { TilePose } from '../utils/table-layout';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MahjongTile3DProps {
  /** The tile face to show. null = face-down (back texture rendered). */
  tileType: TileType | null;
  /** Face-texture lookup. May be an empty Map when tileType is null. */
  faceMap: TileTextureMap;
  /** Back texture — shown for face-down tiles and as fallback. */
  backTexture: THREE.Texture;
  /** World-space target position and Euler rotation. */
  pose: TilePose;
  /** Spirit/wildcard tile — emissive gold pulse + "节" label. */
  isJing?: boolean;
  /** Viewer's selected-for-discard tile — lifts upward. */
  isSelected?: boolean;
  /** Most recently drawn tile — subtle brightness hint. */
  isDrawn?: boolean;
  /** Enables pointer events (cursor change + onClick). */
  interactive?: boolean;
  onClick?: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ORIGIN_POSE: TilePose = { x: 0, y: -10, z: 0, rx: 0, ry: 0, rz: 0 };

/** Chinese character for the Jing (節) spirit/wildcard indicator label. */
const JING_CHAR = '节';

// ── Component ─────────────────────────────────────────────────────────────────

export function MahjongTile3D({
  tileType,
  faceMap,
  backTexture,
  pose,
  isJing = false,
  isSelected = false,
  isDrawn = false,
  interactive = false,
  onClick,
}: MahjongTile3DProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const faceMatRef = useRef<THREE.MeshPhysicalMaterial | null>(null);

  // ── Geometry + shared body material ────────────────────────────────────────
  const { geometry, bodyMaterial, faceStampGeometry } = useTileGeometry();

  // ── Per-tile face material ──────────────────────────────────────────────────
  // Recreated only when tileType, isJing, or isDrawn changes.
  const faceMaterial = useMemo(() => {
    const texture = tileType ? (faceMap.get(tileType) ?? backTexture) : backTexture;
    return new THREE.MeshPhysicalMaterial({
      map: texture,
      roughness: 0.22,
      metalness: 0.0,
      clearcoat: 0.55,
      clearcoatRoughness: 0.1,
      // Jing tiles glow gold; drawn tile gets a mild tint; normal = no emissive.
      emissive: new THREE.Color(isJing ? 0xc9a961 : isDrawn ? 0xf5e6c0 : 0x000000),
      emissiveIntensity: isJing ? 0.3 : isDrawn ? 0.1 : 0.0,
    });
  }, [tileType, faceMap, backTexture, isJing, isDrawn]);

  // Keep ref in sync for useFrame jing pulse
  useEffect(() => {
    faceMatRef.current = faceMaterial;
  }, [faceMaterial]);

  // Dispose old material on change / unmount to free GPU memory
  useEffect(() => {
    return () => {
      faceMaterial.dispose();
    };
  }, [faceMaterial]);

  // ── Pose target refs (avoids stale closure in useFrame) ─────────────────────
  const targetRef = useRef<TilePose>(pose ?? ORIGIN_POSE);
  const isSelectedRef = useRef(isSelected);

  useEffect(() => {
    targetRef.current = pose ?? ORIGIN_POSE;
  }, [pose]);

  useEffect(() => {
    isSelectedRef.current = isSelected;
  }, [isSelected]);

  // ── Snap to initial pose on mount (no lerp from origin) ─────────────────────
  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    const p = pose ?? ORIGIN_POSE;
    g.position.set(p.x, p.y, p.z);
    g.rotation.set(p.rx, p.ry, p.rz);
  }, []);

  // ── Frame-level animation ────────────────────────────────────────────────────
  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;

    const t = targetRef.current;
    // ~12 units/s lerp — fast enough to feel responsive, slow enough to see movement
    const s = Math.min(1, delta * 12);

    const targetY = t.y + (isSelectedRef.current ? 0.35 : 0);

    g.position.x += (t.x - g.position.x) * s;
    g.position.y += (targetY - g.position.y) * s;
    g.position.z += (t.z - g.position.z) * s;

    // Simple Euler lerp — valid for the discrete rotations we use
    // (0, ±π/2, π, −π/2). Avoids quaternion allocation per frame.
    g.rotation.x += (t.rx - g.rotation.x) * s;
    g.rotation.y += (t.ry - g.rotation.y) * s;
    g.rotation.z += (t.rz - g.rotation.z) * s;

    // Jing emissive pulse (2 Hz sine wave, 0.07–0.43 range)
    if (isJing && faceMatRef.current) {
      faceMatRef.current.emissiveIntensity = 0.25 + 0.18 * Math.sin(Date.now() * 0.003);
    }
  });

  // ── Hover cursor ─────────────────────────────────────────────────────────────
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    if (!interactive) return;
    document.body.style.cursor = hovered ? 'pointer' : '';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hovered, interactive]);

  // ── Pointer handlers ──────────────────────────────────────────────────────────
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onClick?.();
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <group ref={groupRef}>
      {/* 1. Body: GLB geometry at TILE_SCALE, ceramic material */}
      <mesh
        geometry={geometry}
        material={bodyMaterial}
        scale={[TILE_SCALE, TILE_SCALE, TILE_SCALE]}
        castShadow
        receiveShadow
      />

      {/* 2. Face stamp: PlaneGeometry proud of the front face, SVG texture */}
      <mesh geometry={faceStampGeometry} material={faceMaterial} position={[0, 0, FACE_STAMP_Z]} />

      {/* 3. Invisible hit-box for pointer events (only when interactive) */}
      {interactive && (
        <mesh
          onClick={handleClick}
          onPointerEnter={(e) => {
            e.stopPropagation();
            setHovered(true);
          }}
          onPointerLeave={(e) => {
            e.stopPropagation();
            setHovered(false);
          }}
        >
          <boxGeometry args={[TILE_WIDTH, TILE_HEIGHT, TILE_DEPTH]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      {/* 4. Jing spirit label — floats above tile, DOM-rendered via Html */}
      {isJing && (
        <Html
          position={[0, TILE_HEIGHT / 2 + 0.12, FACE_STAMP_Z]}
          center
          style={{ pointerEvents: 'none' }}
        >
          <span
            style={{
              display: 'block',
              fontSize: '11px',
              fontWeight: 'bold',
              fontFamily: 'serif',
              color: '#c9a961',
              textShadow: '0 0 6px rgba(201,169,97,0.9), 0 0 12px rgba(201,169,97,0.5)',
              userSelect: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {JING_CHAR}
          </span>
        </Html>
      )}
    </group>
  );
}
