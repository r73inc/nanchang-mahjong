# Open Issues & Improvements

This document tracks all open bugs and improvements. Bugs (BUG-XXX) are code that is broken or behaving incorrectly. Improvements (IMP-XXX) are enhancements to existing features or new additions that do not warrant a full phase in the roadmap.

For phases, planning, and roadmap work see `Plan-and-roadmap.md`.

---

## Quick Reference

| ID      | Name                                 | Summary                                                                                                                                 |
| ------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| BUG-08  | Viewer discards invisible (3D)       | Viewer's own discard pile not visible on the 3D table                                                                                   |
| BUG-09  | TileWall3D needs redesign (3D)       | TileWall removed due to red Back.svg background; needs neutral replacement                                                              |
| BUG-045 | Bot dice roll animation not visible  | Bot roll animation and result flash by in under a frame; human roll works correctly                                                     |
| BUG-046 | Wildcard / kong rule violations      | Jings can upgrade an open pung to kong (revealed meld wildcard — forbidden); self-discard kong trigger suspected with wildcards in hand |
| IMP-022 | User profile rework                  | Single username, profile picture with circle avatar, random tile default, account-screen upload                                         |
| IMP-023 | Remove spirit char from status bar   | "精" label below tiles in top-left spirit preview pushes tiles off-screen; show just the tile                                           |
| IMP-024 | Gameplay sound effects (audio files) | Dice roll, point transfer, tile discard, round start — each triggers a randomly-picked MP3 from bundled assets                          |

---

## Open Bugs

### BUG-08 · Viewer discard tiles not visible in the center of the table — 3D UI

**Symptom:** The viewer's own discard tiles (pile in center-south zone) do not appear visible in the 3D scene.

**Status:** OPEN — deferred post-Phase-12B

**Suspected cause:** Depth-sorting issue. `MeshBasicMaterial` face stamps use `depthWrite: false` to prevent transparent SVG fragments from z-fighting. When tiles overlap at similar Y heights, Three.js may render some behind felt or other tiles.

**Where to look:**

- `apps/web/src/r3f/components/DiscardPool3D.tsx`
- `apps/web/src/r3f/components/MahjongTile3D.tsx`
- `apps/web/src/r3f/utils/table-layout.ts` — `discardPoses` offset

**Approach:** Try enabling `depthTest: false` on face stamps and/or adding small Y offset per discard row; or sort tiles back-to-front manually.

---

### BUG-09 · TileWall3D removed; needs redesign — 3D UI

**Symptom:** The tile wall (remaining draw tiles as rectangular frame) was removed because `Back.svg` has bright-red `fill:#ff3737` background.

**Status:** OPEN — deferred post-Phase-12B

**Fix needed:** Either replace `Back.svg` background with neutral colour (dark grey `#2a2a2a`) or render wall slots as plain `MeshBasicMaterial` boxes instead of textured.

**Current state:** `TileWall3D` component still exists and is fully functional — just not mounted in `GameCanvas.tsx`.

**Reinstate in:** `apps/web/src/r3f/GameCanvas.tsx` — re-add import and `<TileWall3D wallCount={snapshot.wallCount} ... />`.

---

### BUG-045 · Bot dice roll animation not visible

**Symptom:** When a bot takes a dice roll (deal_1, deal_2, or jing_reveal), the animation and result flash by in under a frame — effectively invisible. Human-triggered dice rolls display correctly (full 3s animation with 1.75s of readable result).

**Status:** OPEN — deferred post-PR #115

**Investigation so far:** The 3500ms bot server delay was expected to give a 500ms gap after the human animation clears (`onAnimationComplete` at t=3.0s), preventing a `setDiceAnimation(null)` race. The race appears to still occur or there is a separate render-cycle issue causing `diceAnimation` to be cleared immediately after being set for bot rolls.

**Where to look:**

- `apps/web/src/hooks/use-game.ts` — `handleGameEvent` dice_roll branch, `onDiceAnimationComplete` callback, `isDiceAnimatingRef` / `snapshotQueueRef` interaction
- `apps/web/src/components/2d/DiceRollOverlay.tsx` — `onAnimationComplete` on `motion.p`; whether the animation is actually mounting/running for bot rolls
- `apps/api/src/game/game.service.ts` — `doBotRollIfNeeded` timing (currently 3500ms)

**Suspected cause:** The `onDiceAnimationComplete` guard (`if (!isDiceAnimatingRef.current) return`) may not be sufficient. A bot roll that arrives while the previous `setDiceAnimation(null)` and snapshot-flush are mid-flight in the React render cycle may result in `diceAnimation` being cleared in the same render batch. Consider replacing the `onAnimationComplete`-driven approach with an explicit `setTimeout` in the `dice_roll` event handler keyed to the animation duration.

---

### BUG-046 · Wildcard / kong rule violations — jings in revealed melds and visual "tile transformation"

**Symptom (reported during playtesting with 3 wildcards):** Player discarded an 8-dot tile and was offered a kong option. Upon accepting, the 3 wildcard tiles in the hand were visually "transformed" into 8-dot tiles and played as a kong. Three apparent violations were observed:

1. Tiles appeared to change type (wildcards → 8-dot)
2. Wildcards were used as wildcards in what looked like a revealed meld
3. The kong seemed to involve the player's own discard

**Additional field observations (2026-06-12):** Bug is confirmed reproducible across sessions (not a one-off from server restart). The trigger is consistently: player holds **1 or more wildcard tiles** and **discards themselves** (their own turn discard, not a claim from another player). A self-discard should never open a kong claim window for the discarding player — the `if (seat === discardedBySeat) continue` guard in `claim-resolver.ts` should prevent it. The fact that it triggers anyway when wildcards are in hand suggests the wildcard-related code paths (`concealedKongOptions` or `addToKongOptions`) may be firing outside the normal claim window flow, or the frontend is independently evaluating kong options based on the local snapshot without confirming with the server.

**Status:** OPEN — investigation complete (2026-06-11); additional field evidence collected (2026-06-12); fix needed

**Root cause (after engine investigation):**

- **Violation 1 — tile transformation:** No actual transformation logic exists in the engine (`Meld.tiles` always stores canonical `TileType` values). What the player saw as "transformation" is a side-effect of jing substitution in `concealedKongOptions` / `addToKongOptions`: jings are removed from the hand and the meld is recorded as 4 copies of the canonical tile. The jings "disappear" and the meld shows all-natural tiles — indistinguishable from a transform to the player.

- **Violation 2 — wildcard in revealed meld (CONFIRMED BUG):** `addToKongOptions` in `packages/engine/src/calls.ts` (line 163–167) allows a jing to be used as the 4th tile to upgrade an existing **open pung** to a kong. An open pung is a revealed meld — using a jing as a wildcard here directly violates the rule "wildcards cannot be used as wildcards in revealed melds." When a jing is used via `addToKong`, the engine records the meld as `[tile, tile, tile, tile]` with the canonical type, consuming the jing silently. This is both a rule violation and the source of the "transformation" visual.

- **Violation 3 — kong on own discard:** The claim-resolver correctly prevents the discarder from claiming their own discard (`if (seat === discardedBySeat) continue` in `apps/api/src/game/claim-resolver.ts`). A second guard exists inside `kongFromDiscard` in the engine. This violation almost certainly did NOT occur; the player likely misidentified which seat had discarded, or the session was in a state created by a dev-server restart.

- **Additional inconsistency — `canKongFromDiscard` vs claim-resolver:** `canKongFromDiscard` in `calls.ts` (lines 79–82) allows 3 jings + the natural discard to satisfy an open kong-from-discard claim. The server-side `claim-resolver.ts` uses strict exact-count logic (`hand.filter(t => t === pendingDiscard).length >= 3`) and would never offer this. If the frontend ever independently calls `canKongFromDiscard` to render options (it currently imports it in `game-page.tsx`), players could be shown a kong option that the server would reject.

- **Concealed kongs with jings (grey area):** `concealedKongOptions` allows jing substitution (3 naturals + 1 jing, etc.). A concealed kong is a hidden meld, so the "wildcards only in hidden melds" rule could permit this — requires explicit rule clarification from the house rules document.

**Where to look:**

- `packages/engine/src/calls.ts` — `addToKongOptions` (line 155–169), `canKongFromDiscard` (line 71–85), `concealedKongOptions` (line 91–149)
- `apps/api/src/game/claim-resolver.ts` — open-kong exact-count check vs. `canKongFromDiscard` jing logic
- `apps/web/src/pages/game/game-page.tsx` — imports `concealedKongOptions` and `addToKongOptions`; verify these are not used to independently compute options bypassing the server snapshot

**Fix needed:**

1. `addToKongOptions` must NOT return a jing as a valid add-to-kong tile — only the exact canonical tile is allowed.
2. Audit `canKongFromDiscard` — if open kong from discard always requires 3 exact copies (no jing substitution), align this function with claim-resolver logic and update its tests.
3. Decide and document whether concealed kongs allow jing substitution; update `concealedKongOptions` and its tests accordingly.

---

## Open Improvements

### IMP-022 · User profile rework — single username, profile picture, circle avatar

**Current behaviour:** Each user has both a display name and a separate handle/username. Profile pictures are not supported. In gameplay, opponents are identified only by text name chips.

**Desired behaviour:**

1. **Single username:** Replace the current two-field system (display name + handle) with one username field. This is both the display name and the unique identifier.

2. **Profile picture:** Users can upload a profile picture after logging in, via the account/settings screen — NOT during registration. Profile pictures are displayed as circles throughout the app.

3. **Default avatar:** Users without a profile picture get a randomly assigned mahjong tile face as their avatar (any tile except the blank white dragon tile). The tile assignment should be consistent per user (e.g. seeded by user ID) so the same tile appears across sessions.

4. **Image size limit:** Profile pictures should be reduced client-side to a maximum of 1024 × 1024 pixels before uploading to keep storage costs low.

5. **Storage:** Profile pictures are stored in S3 (MinIO locally, same bucket/pattern as replay files). The DDB user record stores only the S3 object key or a pre-signed URL; the API generates a fresh pre-signed GET URL when serving user profile data. Reuse the existing `StorageService` (`@Global`) introduced in Phase 9A.

6. **In-game avatar display:**
   - Left opponent: small circle avatar displayed above their info box (on the left edge).
   - Right opponent: small circle avatar displayed above their info box (on the right edge).
   - Top opponent: small circle avatar displayed to the left of their info box.
   - Active player (viewer): small circle avatar displayed in the top banner next to the logged-in player's name.

**Where to look:**

- `apps/web/src/pages/` — profile/account page, registration flow
- `apps/api/src/users/` — user schema, profile update endpoint
- `apps/api/src/storage/storage.service.ts` — existing `StorageService`; add a `putProfilePicture(userId, buffer)` method and bucket/key convention (e.g. `avatars/<userId>.jpg`)
- `apps/web/src/pages/game/game-page.tsx` — opponent seat info boxes, top banner
- `packages/shared/src/` — `UserProfile` or equivalent type

---

### IMP-023 · Remove spirit tile character from status bar previews

**Current behaviour:** In the top-left area of the gameplay status bar, spirit tile previews (`JingTileChip` on desktop, `MobileJingButton` on mobile) render `MahjongTile2D` with `isJing={true}`. This causes `MahjongTile2D` to render the `精` character below each tile (via the `isJing` label branch). In the compact status bar, this character takes up vertical space that pushes the tiles off screen.

**Desired behaviour:** The spirit tile previews in the status bar should show only the tile graphic. The gold glow and gold border from `isJing` are fine to keep (they visually identify the tiles as spirit tiles), but the `精` label below the tile must be suppressed for these small status bar previews. The label can remain visible in the full overlay views (e.g. the tap-to-enlarge overlay in `MobileJingButton`).

**Where to look:**

- `apps/web/src/components/2d/MahjongTile2D.tsx` — `JING_CHAR` label rendered at lines 305-318 when `isJing={true}`. Add an optional `showJingLabel?: boolean` prop (default `true`) that suppresses the `精` span when `false`.
- `apps/web/src/pages/game/game-page.tsx` — `JingTileChip` (desktop, ~line 2156) and `MobileJingButton` button area (~line 2061-2092): pass `showJingLabel={false}` to the status bar tile chips. The tap-to-enlarge overlays can keep `showJingLabel={true}`.

---

### IMP-024 · Gameplay sound effects using audio files

**Current behaviour:** The `use-sound.ts` hook synthesises two effects via the Web Audio API: a synthetic clack (`playClack`) and a two-note chime (`playChime`). There are no sounds for dice rolls, point transfers, or round starts.

**Desired behaviour:** Replace the synthesised sounds with randomly-picked MP3 files for four gameplay events:

| Event                 | Sound pool                        | When to trigger                                                        |
| --------------------- | --------------------------------- | ---------------------------------------------------------------------- |
| Tile discarded        | `sounds/tilePlace/` (6 files)     | Viewer discards a tile (the discard action fires)                      |
| Dice roll             | `sounds/diceRoll/` (3 files)      | Any `dice_roll` game event received in `use-game.ts`                   |
| Point transfer        | `sounds/pointTransfer/` (4 files) | Any score change — hand settlement, spirit settlement, tsumo payout    |
| Round start / shuffle | `sounds/shuffle/` (1 file)        | Each new hand begins (`new_hand` event or equivalent in `use-game.ts`) |

Each trigger must pick a file at random from its pool. All sounds must respect the global `soundEnabled` flag in `ThemeStore`.

**Audio file location:** Files are currently in `tempSoundsDir/` at the repo root. When implementing this improvement, move them to `apps/web/public/sounds/` (maintaining the sub-directory structure: `diceRoll/`, `pointTransfer/`, `shuffle/`, `tilePlace/`) so Vite serves them statically. The `tempSoundsDir/` directory should be deleted from the repo root after the move.

**Where to look:**

- `apps/web/src/hooks/use-sound.ts` — add `playTilePlace()`, `playDiceRoll()`, `playPointTransfer()`, `playShuffle()` using `new Audio(url).play()` with a random file picker. Keep `playClack` and `playChime` or replace as appropriate.
- `apps/web/src/hooks/use-game.ts` — wire `playDiceRoll()` into the `dice_roll` event handler and `playShuffle()` into the `new_hand` / deal event handler.
- `apps/web/src/pages/game/game-page.tsx` — wire `playTilePlace()` into the discard handler and `playPointTransfer()` into settlement / tsumo display logic.
- `tempSoundsDir/` (repo root) — source files to move to `apps/web/public/sounds/` at implementation time.
