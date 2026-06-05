# 3D Game Table — Bug Log

Bugs and improvements identified during local testing of the `feat/3d-ui` branch
before merging to `main`. All items below are on branch `fix/3d-bugs`.

---

## Improvements

### IMP-01 — Camera angle too steep

**Description:** The default viewing angle is too high. The camera is positioned too far above the table, producing a top-down perspective. It needs to come down closer to the tiles and use a shallower, more natural angle — like sitting around a real table.
**Location:** `apps/web/src/r3f/GameCanvas.tsx` — `<Canvas camera={{ position: [0, 14, 10], fov: 48 }}>`
**Fix approach:** Lower Y (height) and reduce Z (pullback), increase FOV slightly. Target something like `position: [0, 8, 14]`, `fov: 55` — to be tuned visually.

---

### IMP-02 — Tiles too shiny

**Description:** The ceramic tile body material has too much clearcoat/reflectivity. Under the studio Environment IBL the tiles look like polished lacquer rather than matte melamine.
**Location:** `apps/web/src/r3f/hooks/useTileGeometry.ts` — `MeshPhysicalMaterial` body material (`clearcoat: 0.75`, `reflectivity: 0.5`). Also `MahjongTile3D.tsx` face stamp material (`clearcoat: 0.55`).
**Fix approach:** Reduce `clearcoat` to ~0.2, `clearcoatRoughness` to ~0.3, `roughness` to ~0.5 on body. Reduce or remove clearcoat on face stamp entirely.

---

## Bugs

### BUG-01 — Tile face images use the dark (Black) palette

**Description:** All tile faces are rendering with the Black/dark SVG textures even though the theme is set to classic/regular. The tile images appear dark-background instead of the white-background Regular tiles.
**Location:** `apps/web/src/r3f/GameCanvas.tsx` — `themeToVariant(tilePalette)` maps `'classic'` and `'sepia'` → `'Regular'` and `'dark'` → `'Black'`. Also `apps/web/src/r3f/hooks/useTileTextures.ts` — texture loading.
**Fix approach:** Verify `themeToVariant` returns `'Regular'` for the default palette. Confirm the SVG paths resolve to `/textures/Tiles/Regular/` not `/textures/Tiles/Black/`. Override to force `'Regular'` palette until dark mode tile switching is properly wired.

---

### BUG-02 — Tile face images are upside down

**Description:** The SVG texture on the face stamp plane is rendered 180° rotated — tile characters and symbols appear upside down.
**Location:** `apps/web/src/r3f/components/MahjongTile3D.tsx` — face stamp `PlaneGeometry` at `FACE_STAMP_Z`. Also `apps/web/src/r3f/hooks/useTileTextures.ts` — `tex.flipY = false`.
**Fix approach:** The `flipY = false` setting prevents the default Three.js Y-flip, but depending on how the PlaneGeometry faces the camera relative to the GLB orientation, an additional 180° rotation on the face stamp mesh (`rz: Math.PI`) or re-enabling `flipY: true` may be needed. Investigate orientation of the GLB body to determine correct fix.

---

### BUG-03 — Flat tiles (discards / melds) face invisible or blown out

**Description:** When a tile is placed flat on the table (discarded or played as part of a meld set), the tile face SVG is not visible or appears completely washed out by the lighting. The faces must always be readable regardless of flat vs. standing orientation.
**Location:** `apps/web/src/r3f/components/MahjongTile3D.tsx` — face stamp mesh at `FACE_STAMP_Z`. `apps/web/src/r3f/GameCanvas.tsx` — lighting setup (directional light intensity 1.4, point light 0.35, ambient 0.45).
**Fix approach:** The face stamp uses `MeshPhysicalMaterial` which is affected by scene lighting. When the tile is flat (`rx = -π/2` rotated to face upward), the existing lights may not illuminate it correctly, or clearcoat reflections overpower the texture. Options: (a) switch face stamp to `MeshBasicMaterial` (unlit — always fully visible regardless of light direction), or (b) add a dedicated top-down fill light to ensure flat tiles are readable. `MeshBasicMaterial` is strongly preferred — tile faces should always be 100% legible.

---

### BUG-04 — Left and right opponent tiles appear elongated

**Description:** From the viewer's perspective, the tiles belonging to the players on the left and right sides of the table appear stretched/elongated in one axis. This is likely a perspective distortion caused by the tile dimensions being correct for the viewer-facing tiles but appearing incorrect when the same geometry is rotated 90° around Y for the side positions.
**Location:** `apps/web/src/r3f/utils/table-layout.ts` — `opponentHandPoses()` for `'right'` and `'left'` compass positions. Tile scale constants in `useTileGeometry.ts` (`TILE_WIDTH`, `TILE_HEIGHT`, `TILE_DEPTH`).
**Fix approach:** Verify that `TILE_WIDTH × TILE_HEIGHT × TILE_DEPTH` dimensions are correct for the GLB geometry after centering. When tiles are rotated 90° on Y, width and depth swap in screen space — check whether the scale or the physical dimensions are causing the visual distortion. May also just be perspective at current camera angle (see IMP-01).

---

### BUG-05 — Left and right opponent tiles rendered face-down; should be face-up

**Description:** The tiles for the players to the viewer's left and right are rendered face-down (back texture). They should be face-up, same as the player across. Only the tile types should be hidden (they are opponents), but the tile backs facing the viewer looks wrong — in a real game you can see the faces of tiles to your sides from certain angles, but more importantly the discard/meld tiles for side players must be face-up.
**Note:** This may specifically apply to discard pile and open meld tiles for side players, not necessarily the hand tiles in-hand. Needs clarification during fix — hand tiles face-down is correct, discard/meld tiles for all players should always be face-up.
**Location:** `apps/web/src/r3f/components/OpponentHand3D.tsx`, `apps/web/src/r3f/utils/table-layout.ts` — rotation values for `'right'` and `'left'` positions. `apps/web/src/r3f/components/DiscardPool3D.tsx`, `apps/web/src/r3f/components/OpenMelds3D.tsx`.
**Fix approach:** Review `ry` rotation for side opponent tiles in `opponentHandPoses()`. A tile facing the correct direction for `'across'` uses `ry: Math.PI` (flipped). For `'right'` and `'left'` the equivalent should keep the face pointing table-center-ward. Also confirm `DiscardPool3D` and `OpenMelds3D` are passing the correct `tileType` (not `null`) for opponent discards and melds.

---

## Major Bugs (Engine / Game Logic)

### MAJOR-01 — Win condition not triggering with melds on board + pair in hand

**Description:** A player with 4 complete meld sets already played to the board (open melds) and a matching pair of 2 tiles in hand did not trigger a win. This should be a valid winning hand (4 melds + 1 pair = 14 tiles total).
**Hypothesis:** The win checker in the engine may not be recognising open melds on the board when evaluating whether the hand is complete. Alternatively, the pair remaining in hand may not be counted as the required pair (eye/jantai) when all 4 sets are already open.
**Location:** `packages/engine/src/` — win detection logic, likely `game-engine.ts` or a dedicated `win-checker.ts` / `hand-evaluator.ts`. Check how `openMelds` from the game state are included in the win check.
**Fix approach:** Read the engine win-check code carefully. Verify it sums: `openMelds.length × 3 (or 4 for kongs) + hand tiles`. The hand tiles (after all sets are open) should just be the pair. If the engine only evaluates the tiles in `hand` without adding open melds to the count, it will never find a complete hand once sets are moved off.
**Locked rules ref:** `docs/final-nanchang-mahjong-rules.md` — confirm the 4-meld + pair structure is valid under Nanchang rules.

---

### MAJOR-02 — Player cannot claim a discarded tile to win by completing a pair

**Description:** When a player was waiting for a single tile to complete a pair and win (i.e., holding one tile of a pair and the matching tile was discarded by another player), the player was unable to claim that tile for the win. The claim window either did not show a win option, or the win was rejected.
**Hypothesis:** The engine's `getClaimActions()` or equivalent may not recognise claiming a tile to complete a pair (眼/jantai) as a valid win action. It may only allow claiming sets (pung/kong/chow) not the final pair.
**Location:** `packages/engine/src/` — claim action generation. Also `apps/api/src/game/` — `GameGateway` / `GameService` claim handling.
**Fix approach:** In Nanchang rules, winning by claiming a tile to complete the pair is absolutely valid. The claim-window logic must include `win` as an available action when the player's hand + claimed tile would form a complete winning hand. Check the tile-claim win evaluation path separately from the self-draw win path.
**Related:** MAJOR-01 — if the win checker itself is broken, fixing claim-pair-win requires fixing the underlying win check first.

---

## Investigation Order (for next session)

1. **MAJOR-01 + MAJOR-02** first — engine correctness is highest priority. All visual bugs are irrelevant if the game cannot be won.
2. **BUG-03** (face stamp material) — switch to `MeshBasicMaterial`; this is a one-line change with high impact.
3. **BUG-01** (wrong palette) — confirm texture path resolution.
4. **BUG-02** (upside-down faces) — fix after BUG-01 so correct textures are visible while debugging orientation.
5. **BUG-05** (side tiles face direction) — fix layout rotations.
6. **BUG-04** (elongation) — likely partly resolved by IMP-01 camera fix.
7. **IMP-01** (camera angle) — tune after geometry/face bugs are resolved so the angle is judged on correct visuals.
8. **IMP-02** (shininess) — last; purely aesthetic.
