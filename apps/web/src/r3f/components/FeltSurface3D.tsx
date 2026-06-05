/**
 * FeltSurface3D.tsx
 *
 * The horizontal table surface — a large matte plane at Y=0 that
 * receives shadows and reflects the ThemeStore felt color.
 *
 * Sized at 24×24 world units to extend past all tile zones with room to spare.
 * MeshStandardMaterial with high roughness approximates woven felt fabric.
 */

interface FeltSurface3DProps {
  /** CSS hex colour from ThemeStore FELT_CONFIGS (e.g. '#0d3b2e' for jade). */
  color: string;
}

export function FeltSurface3D({ color }: FeltSurface3DProps) {
  return (
    // PlaneGeometry is in XY by default (normal +Z) — rotate -90° around X
    // to lay it flat with normal pointing +Y (upward).
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]} receiveShadow>
      <planeGeometry args={[24, 24]} />
      <meshStandardMaterial color={color} roughness={0.92} metalness={0.0} />
    </mesh>
  );
}
