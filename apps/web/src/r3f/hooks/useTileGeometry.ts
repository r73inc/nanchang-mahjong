/**
 * useTileGeometry.ts
 *
 * Loads mjtile.glb and exposes the tile geometry + pre-built materials.
 *
 * ── GLB INSPECTION RESULTS (Phase A) ────────────────────────────────────────
 *
 * File: apps/web/public/models/mjtile.glb
 * Inspected by parsing the GLB JSON chunk directly (no browser required).
 *
 *   Scene nodes : 1
 *   Node name   : "empty_2"   ← use this in useGLTF nodes lookup
 *   Mesh        : unnamed, 1 primitive, mode=4 (TRIANGLES)
 *   Vertex count: 3828
 *
 *   Material slots : 1  (single material — NOT multi-material)
 *   Material props : pbrMetallicRoughness, baseColorFactor ~0.6 gray,
 *                    metallicFactor=0, roughnessFactor=1
 *
 *   Geometry attributes:
 *     POSITION   (VEC3, float32, 3828 entries)
 *     NORMAL     (VEC3, float32, 3828 entries)
 *     *** NO TEXCOORD_0 — UV coordinates are absent ***
 *
 *   Bounding box (model space):
 *     min : (-22,  -6,  0)
 *     max : (  2,  26, 13)
 *     → X span : ~24 units  (tile width)
 *     → Y span : ~32 units  (tile height)
 *     → Z span : ~13 units  (tile thickness — Z+ is the front face)
 *     → Origin is offset: center ≈ (-10, 10, 6.5) in model space
 *
 * ── RENDERING STRATEGY ──────────────────────────────────────────────────────
 *
 * Because the GLB has NO UV coordinates, we cannot directly apply a texture
 * map to the geometry. Instead MahjongTile3D uses a two-mesh composition:
 *
 *   1. Body mesh  — GLB geometry (3828 vertices, beveled tile shape)
 *                   Material: MeshPhysicalMaterial (ivory ceramic, no texture)
 *                   Rendered at TILE_SCALE to fit world-unit layout.
 *
 *   2. Face stamp — PlaneGeometry, sized to fit the front face
 *                   Material: MeshBasicMaterial with SVG texture map
 *                   Positioned at Z = FACE_Z_LOCAL (front face) + tiny epsilon
 *                   to avoid z-fighting.
 *
 * ── SCALE ───────────────────────────────────────────────────────────────────
 *
 * Target tile width in world units: ~0.55u  (fits 13 tiles in ~8u hand width)
 * TILE_SCALE = 0.55 / 24 ≈ 0.0229
 *
 * At TILE_SCALE:
 *   Width  : 24 * 0.0229 = 0.549 ≈ 0.55u
 *   Height : 32 * 0.0229 = 0.733 ≈ 0.73u
 *   Depth  : 13 * 0.0229 = 0.298 ≈ 0.30u
 *
 * ── GEOMETRY CENTERING ──────────────────────────────────────────────────────
 *
 * geometry.center() is called on load to shift the origin to the bounding-box
 * center. After centering:
 *   Face (front) is at local Z = +DEPTH/2 = +0.149u
 *   Back is at local Z = -DEPTH/2 = -0.149u
 *
 * The face stamp PlaneGeometry is positioned at (0, 0, FACE_Z_CENTERED + 0.002)
 * in the tile group's local space.
 *
 * ── FACE STAMP DIMENSIONS ───────────────────────────────────────────────────
 *
 * The stamp covers 82% of the face to leave a visible border/bevel margin:
 *   stampWidth  = 0.55  * 0.82 = 0.451u
 *   stampHeight = 0.73  * 0.82 = 0.599u
 *
 * ── FACE_Z CONSTANT ─────────────────────────────────────────────────────────
 *
 * In centered local space the front face sits at half the scaled depth:
 *   FACE_Z_LOCAL = (13 / 2) * TILE_SCALE = 0.149u
 *
 * The face stamp gets +0.002 z-offset to clear z-fighting:
 *   FACE_STAMP_Z = 0.151u
 */

import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

// ── Constants derived from GLB inspection ────────────────────────────────────

/** GLB node name discovered during Phase A inspection. */
export const GLB_NODE_NAME = 'empty_2';

/** Target tile width in world units. Layout math in table-layout.ts uses this. */
export const TILE_WIDTH = 0.55;

/** Derived from TILE_WIDTH / X-span of GLB bounding box (24 model units). */
export const TILE_SCALE = TILE_WIDTH / 24; // ≈ 0.0229

/** Tile height in world units (Y-span 32 * scale). */
export const TILE_HEIGHT = 32 * TILE_SCALE; // ≈ 0.733

/** Tile depth (thickness) in world units (Z-span 13 * scale). */
export const TILE_DEPTH = 13 * TILE_SCALE; // ≈ 0.298

/** Z position of the front face in tile-group local space (after geometry centering). */
export const FACE_Z_LOCAL = TILE_DEPTH / 2; // ≈ 0.149

/** Z position of the face stamp PlaneGeometry — slightly proud of the tile face. */
export const FACE_STAMP_Z = FACE_Z_LOCAL + 0.002;

/** Width of the face stamp (82% of tile width to show bevel margin). */
export const FACE_STAMP_WIDTH = TILE_WIDTH * 0.82;

/** Height of the face stamp (82% of tile height). */
export const FACE_STAMP_HEIGHT = TILE_HEIGHT * 0.82;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TileGeometryResult {
  /** Centered GLB geometry for the tile body. */
  geometry: THREE.BufferGeometry;
  /** Ceramic ivory MeshPhysicalMaterial — clone before applying per-tile overrides. */
  bodyMaterial: THREE.MeshPhysicalMaterial;
  /** PlaneGeometry for the face stamp — shared, do not dispose. */
  faceStampGeometry: THREE.PlaneGeometry;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Loads mjtile.glb, centers the geometry, and returns stable geometry/material
 * objects for use inside <Canvas>.
 *
 * Must be called within a React Suspense boundary — useGLTF suspends until
 * the file is fetched.
 */
export function useTileGeometry(): TileGeometryResult {
  const { nodes } = useGLTF('/models/mjtile.glb');

  return useMemo(() => {
    const mesh = nodes[GLB_NODE_NAME] as THREE.Mesh;

    // Clone geometry so we can center it without mutating the cached original.
    const geometry = mesh.geometry.clone();
    geometry.center(); // shifts bounding-box center to local origin

    // Ceramic / melamine body material — matte with subtle sheen, ivory.
    // IMP-02: reduced clearcoat (0.2 vs 0.75) and higher roughness (0.45 vs 0.18)
    // so tiles look like matte melamine rather than polished lacquer under IBL.
    const bodyMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#f5efe0'),
      roughness: 0.45,
      metalness: 0.0,
      clearcoat: 0.2,
      clearcoatRoughness: 0.3,
      reflectivity: 0.2,
    });

    // Shared face stamp geometry (PlaneGeometry reused for all tiles).
    const faceStampGeometry = new THREE.PlaneGeometry(FACE_STAMP_WIDTH, FACE_STAMP_HEIGHT);

    return { geometry, bodyMaterial, faceStampGeometry };
  }, [nodes]);
}

// Preload the GLB at module load time so Suspense fires before first render.
useGLTF.preload('/models/mjtile.glb');
