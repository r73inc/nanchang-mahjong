# 3D Game Table — Bug Log

Branch: `fix/3d-bugs` → `feat/3d-ui` (PR #40). All fixes committed; PR ready to merge.

---

## Open Bugs

### BUG-08 — Viewer discard tiles not visible in the center of the table

**Status:** OPEN — deferred to post-merge
**Symptom:** The viewer's own discard tiles (the pile in the center-south zone of the table, closest to the player) do not appear visible in the 3D scene.
**Suspected cause:** Likely a depth-sorting issue. `MeshBasicMaterial` face stamps use `depthWrite: false` to prevent transparent SVG fragments from z-fighting each other in the discard grid. When multiple flat tiles overlap at similar Y heights, Three.js may render some behind the felt surface or behind other tiles depending on draw order. The viewer discard pile at `z = DISCARD_START = 2.6` is close to the felt surface (`Y = FLAT_Y = 0.149`).
**Where to look:**

- `apps/web/src/r3f/components/DiscardPool3D.tsx` — how tiles are rendered and sorted
- `apps/web/src/r3f/components/MahjongTile3D.tsx` — `faceMaterial` depthWrite/transparent settings
- `apps/web/src/r3f/utils/table-layout.ts` — `discardPoses` offset 0 (viewer, ry=π, FLAT_Y)
  **Approach:** Try enabling `depthTest: false` on face stamps and/or adding a small Y offset per discard row to prevent co-planar geometry; or sort tiles back-to-front manually in `DiscardPool3D`.

---

### BUG-09 — TileWall3D removed; needs redesign

**Status:** OPEN — deferred
**Symptom:** The tile wall (showing remaining draw tiles as a rectangular frame) was removed because `Back.svg` has a bright-red `fill:#ff3737` background, making it render as a large red cross.
**Fix needed:** Either replace Back.svg background with a neutral colour (e.g., dark grey `#2a2a2a`) or render the wall slots as plain `MeshBasicMaterial` boxes with a solid colour instead of a texture. The `TileWall3D` component (`apps/web/src/r3f/components/TileWall3D.tsx`) still exists and is fully functional — just not mounted in `GameCanvas.tsx`.
**Reinstate in:** `apps/web/src/r3f/GameCanvas.tsx` — re-add import and `<TileWall3D wallCount={snapshot.wallCount} ... />`.

---

## Closed Bugs (reference)

| ID       | Symptom                                                 | Root cause                                                                               | Fix                                                                                | File                                                                  |
| -------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| MAJOR-01 | Tsumo win not auto-declared when hand completes on draw | No tsumo detection in `startTurn`                                                        | Auto-declare win if full 14-tile hand is winning                                   | `apps/api/src/game/game.service.ts`                                   |
| MAJOR-02 | Can't claim discard to win when open melds on board     | `canWin` checked `hand.length === 13`; open-meld players have fewer                      | Added `openMeldTiles` param to `canWin`; pass open tiles in claim-resolver         | `packages/engine/src/calls.ts`, `apps/api/src/game/claim-resolver.ts` |
| BUG-01   | Tile faces render with black background                 | SVG textures have transparent backgrounds; `MeshBasicMaterial` renders alpha=0 as black  | `transparent: true, depthWrite: false` on face material                            | `apps/web/src/r3f/components/MahjongTile3D.tsx`                       |
| BUG-02   | Tile face images upside down                            | `tex.flipY = false` was wrong; WebGL needs flipY=true for browser SVGs                   | `tex.flipY = true`                                                                 | `apps/web/src/r3f/hooks/useTileTextures.ts`                           |
| BUG-03   | Flat tile faces blown out / invisible                   | `MeshPhysicalMaterial` clearcoat overwhelmed SVG under directional light                 | Switch face stamp to `MeshBasicMaterial` (unlit)                                   | `apps/web/src/r3f/components/MahjongTile3D.tsx`                       |
| BUG-04   | Left/right opponent tiles appear elongated              | Tiles were laid flat (rx=-π/2); from camera above, only thin depth edge visible          | Standing orientation (rx=0, STANDING_Y, ry=π) for right/left hands                 | `apps/web/src/r3f/utils/table-layout.ts`                              |
| BUG-05   | Discards/melds for side players unreadable              | `ry` varied per seat (0, ±π/2); texture V-axis pointed sideways or away from viewer      | All discard/meld configs use `ry: Math.PI`; V-axis always points toward viewer     | `apps/web/src/r3f/utils/table-layout.ts`                              |
| BUG-06   | TileWall3D renders as large red cross                   | `Back.svg` has `fill:#ff3737` background; `MeshBasicMaterial` renders it full brightness | Removed TileWall3D from scene (see BUG-09)                                         | `apps/web/src/r3f/GameCanvas.tsx`                                     |
| BUG-07   | ViewerHandHUD shows Chinese character text tiles        | `<MahjongTile>` is a text/CSS component, not SVG-image-based                             | New `SvgHandTile` component with `<img src={tileTexturePath}>` on ivory background | `apps/web/src/pages/game/game-page.tsx`                               |
| IMP-01   | Camera angle too steep (top-down feel)                  | Camera Y too high, Z too close, FOV too narrow                                           | `position: [0, 8, 13]`, `fov: 58`                                                  | `apps/web/src/r3f/GameCanvas.tsx`                                     |
| IMP-02   | Tiles too shiny / lacquer-like                          | High clearcoat + studio IBL                                                              | Body: reduced clearcoat/roughness; face: MeshBasicMaterial (unlit)                 | `apps/web/src/r3f/hooks/useTileGeometry.ts`                           |

---

## Key Learnings

**SVG transparency in Three.js:** FluffyStuff Regular tile SVGs have no explicit white background rect — only path fills on a transparent canvas. Always use `transparent: true, depthWrite: false` on any `MeshBasicMaterial` that carries these textures or the alpha=0 regions render black.

**Flat tile orientation (`ry=π` rule):** For tiles lying flat (rx=-π/2), the texture V-axis maps to world +Z when ry=π. This makes tile text point toward the camera (+Z = viewer direction) regardless of which player's pile the tile belongs to. Use `ry: Math.PI` for all discard and open-meld poses to get readable tiles from the viewer's seat.

**Side hand orientation:** Right and left opponent hands look better standing upright (rx=0, ry=π) than lying flat. Flat tiles at X=±5 from the camera are seen edge-on — they disappear. Standing tiles with ry=π show the ivory back face (correct for hidden opponent hands) and have full visible height.

**`depthWrite: false` risk:** Disabling depth writing prevents face stamps from z-fighting each other in the discard grid, but creates a render-order dependency. Tiles that share a Y plane may not appear if draw order causes them to be skipped. See BUG-08 for the viewer discard visibility issue this creates.

**Back.svg has a red background:** `public/textures/Tiles/Regular/Back.svg` uses `fill:#ff3737` as its background rectangle. Any mesh using this texture will render bright red. Either use a neutral-colour MeshBasicMaterial for back-face slots, or replace the SVG background colour before reinstating TileWall3D.
