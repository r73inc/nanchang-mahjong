# 3D Game Table — Bug Log

Bugs and improvements identified during local testing of the `feat/3d-ui` branch
before merging to `main`. All items below are on branch `fix/3d-bugs`.

**Status:** Commit `505626d` fixes MAJOR-01, MAJOR-02, BUG-02, BUG-03, IMP-01, IMP-02.
Remaining: BUG-01 (re-test after BUG-03 fix — may be resolved), BUG-04, BUG-05.

---

## Improvements

### IMP-01 — Camera angle too steep ✅ FIXED (commit 505626d)

**Description:** The default viewing angle is too high. The camera is positioned too far above the table, producing a top-down perspective. It needs to come down closer to the tiles and use a shallower, more natural angle — like sitting around a real table.
**Location:** `apps/web/src/r3f/GameCanvas.tsx`
**Fix applied:** `position: [0, 8, 13]`, `fov: 58` — lower Y, larger Z pullback, wider FOV.

---

### IMP-02 — Tiles too shiny ✅ FIXED (commit 505626d)

**Description:** The ceramic tile body material has too much clearcoat/reflectivity. Under the studio Environment IBL the tiles look like polished lacquer rather than matte melamine.
**Location:** `apps/web/src/r3f/hooks/useTileGeometry.ts`
**Fix applied:** Body: `clearcoat: 0.2`, `clearcoatRoughness: 0.3`, `roughness: 0.45`, `reflectivity: 0.2`. Face stamp switched to `MeshBasicMaterial` (unlit — no clearcoat at all, see BUG-03).

---

## Bugs

### BUG-01 — Tile face images use the dark (Black) palette ⚠️ RE-TEST AFTER BUG-03/02 FIX

**Description:** All tile faces were rendering with the Black/dark SVG textures even though the theme is set to classic/regular. The tile images appear dark-background instead of the white-background Regular tiles.
**Note:** `themeToVariant('classic')` correctly returns `'Regular'`. This bug may have been an artefact of BUG-03 (face stamp blown out by clearcoat → appearing dark) combined with BUG-02 (upside-down → different tile symbol shown). Re-test after the commit-505626d fixes before investigating further.
**Location:** `apps/web/src/r3f/GameCanvas.tsx` — `themeToVariant(tilePalette)`, `apps/web/src/r3f/hooks/useTileTextures.ts`.
**Remaining action:** Play a game and confirm Regular (white background) tiles show. If still dark, check ThemeStore localStorage persistence and the `tilePalette` value at runtime.

---

### BUG-02 — Tile face images are upside down ✅ FIXED (commit 505626d)

**Description:** The SVG texture on the face stamp plane was rendered 180° rotated — tile characters and symbols appeared upside down.
**Root cause:** `tex.flipY = false` in `useTileTextures.ts` was wrong. Three.js `flipY = true` (default) correctly compensates for WebGL's bottom-to-top texture addressing for browser-loaded SVGs. Setting it to `false` caused the image to appear inverted.
**Fix applied:** `tex.flipY = true` in `useTileTextures.ts`.

---

### BUG-03 — Flat tiles (discards / melds) face invisible or blown out ✅ FIXED (commit 505626d)

**Description:** When a tile is placed flat on the table (discarded or played as part of a meld set), the tile face SVG was not visible or appeared completely washed out by the lighting.
**Root cause:** The face stamp used `MeshPhysicalMaterial` with `clearcoat: 0.55`. Under the directional key light, the clearcoat produced specular highlights that overwhelmed the SVG texture, especially for flat tiles whose face pointed toward the light source.
**Fix applied:** Switched face stamp from `MeshPhysicalMaterial` to `MeshBasicMaterial` (unlit — ignores all scene lighting, always renders texture at 100% brightness). Jing tile pulse now animates `color` instead of `emissiveIntensity`.

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

### MAJOR-01 — Win condition not triggering with melds on board + pair in hand ✅ FIXED (commit 505626d)

**Description:** A player with complete meld sets already played to the board (open melds) and a matching pair in hand did not trigger a win. This should be a valid winning hand (4 melds + 1 pair = 14 tiles total).
**Root cause:** There was no mechanism for self-draw (tsumo) win declarations. The gateway had no `game:tsumo` handler and the frontend had no WIN button. After drawing a tile that completes the hand, `startTurn` just showed "Your Turn" with no win option.
**Fix applied:** `game.service.ts` `startTurn()` now checks if the active player's full hand (open meld tiles + concealed hand) = 14 tiles and `isWinningHand` = true. If so, it auto-declares the win (tsumo) immediately — appropriate for a family game where declining a win is never desired.

---

### MAJOR-02 — Player cannot claim a discarded tile to win by completing a pair ✅ FIXED (commit 505626d)

**Description:** When a player had open melds and was waiting for one tile to complete their hand (e.g., a final pair), they were unable to claim a discard for a win — the claim window showed no WIN option.
**Root cause:** `canWin(hand, tile, jingTypes)` in `calls.ts` hard-checked `hand.length !== 13`. Players with open melds have fewer than 13 concealed tiles, so the check always returned false. `computeEligibleClaims` called `canWin` with only the concealed hand, never knowing about the open melds.
**Fix applied:**

- `packages/engine/src/calls.ts`: `canWin` gains optional `openMeldTiles: TileType[] = []` parameter. Builds `fullHand = [...openMeldTiles, ...hand, tile]` and checks `fullHand.length === 14`.
- `apps/api/src/game/claim-resolver.ts`: `computeEligibleClaims` and `computeRobKongEligible` now pass each seat's `openMelds.flatMap(m => m.tiles)` to `canWin`.
- 3 new engine unit tests + 1 claim-resolver integration test.

---

## Investigation Order

**Completed (commit 505626d):**

1. ✅ MAJOR-01 + MAJOR-02 — engine/gateway win detection
2. ✅ BUG-03 — face stamp MeshBasicMaterial
3. ✅ BUG-02 — flipY fix (upside-down faces)
4. ✅ IMP-01 — camera angle
5. ✅ IMP-02 — shininess / clearcoat

**Still to verify / fix:** 6. BUG-01 — re-test after above fixes (may be resolved) 7. BUG-05 — left/right player discard/meld tiles: re-test with BUG-03 fix applied; faces should now be visible via MeshBasicMaterial 8. BUG-04 — side tile elongation: re-test after IMP-01 camera angle change
