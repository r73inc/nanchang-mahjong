# Open Issues & Improvements

This document tracks all open bugs and improvements. Bugs (BUG-XXX) are code that is broken or behaving incorrectly. Improvements (IMP-XXX) are enhancements to existing features or new additions that do not warrant a full phase in the roadmap.

For phases, planning, and roadmap work see `Plan-and-roadmap.md`.

---

## Open Bugs

### BUG-020 · Last-discard red pulse never visible to end user

**Symptom:** The most recently discarded tile should display a pulsing red outline during the claim window so players can see which tile is "in play." No red pulse is ever visible during live gameplay regardless of the fix applied.

**Status:** ACTIVE, UNRESOLVED (as of 2026-06-09)

**Root cause:** Unknown. Every plausible rendering, data-flow, and animation layer has been addressed without success.

**Fixes attempted (none worked):**

1. Framer Motion bleed isolation — moved pulse into dedicated overlay div
2. Increased contrast — red outline instead of gold shimmer
3. React 18 batching race fix — added `lastDiscard` to Zustand store
4. Exact tile+seat coordinate match — unambiguous value matching
5. zIndex + shadow visibility fix — added z-index and border fallback
6. Key-based remount to force Framer Motion new mount — key remounts based on pulse state

**Suspected remaining causes:**

- `lastDiscard` in the Zustand store may never be getting set (socket event not received or hook not wired)
- `CombinedDiscardPool2D` may not be the component actually rendered
- Exact tile value mismatch between `lastDiscard.tile` and `discards` array
- `Table2DContext`'s `tileScale` causing overlay to render at 0×0

**Next steps:** Add `console.log` to verify data pipeline before continuing with rendering fixes.

---

### BUG-021 · Hand-reveal meld grouping does not work

**Symptom:** On the post-hand reveal screen, the winner's concealed hand should be displayed decomposed into constituent melds (chow/pung/kong groups) and pair with labeled headers. Instead the hand appears as a flat row of individual tiles with no grouping.

**Status:** ACTIVE, UNRESOLVED (as of 2026-06-09)

**Root cause:** Unknown. The decomposition logic was implemented but the visual result is unchanged.

**Fix attempted:**

1. Re-exported `decomposeHand` and `Decomposition` from `@nanchang/shared`
2. In `HandRevealScreen`, winner's concealed hand section replaced with decomposition logic
3. Falls back to flat tile list if conditions not met

**Suspected remaining causes:**

- Winner's hand at reveal time may have fewer than 14 tiles (open melds tracked separately)
- Guard `hand.length === 14` may be too strict
- `decomposeHand` may be returning empty array for valid winning hands
- `handReveal.jingPrimary` / `jingSecondary` may be undefined

**Next steps:** Log `hand.length`, decomposition result, and `jingTypes` to verify the data before continuing with rendering.

---

### BUG-022 · Player rejoin fails — tile play blocked after reconnection

**Symptom:** When a player leaves the game mid-hand (without conceding) and reconnects by pressing the rejoin button, they can reach the game screen, but when they attempt to play a tile on their turn, the game does not continue. The player is stuck and unable to participate further.

**Status:** ACTIVE, UNRESOLVED (as of 2026-06-09)

**Expected behavior:** A player who leaves without conceding should be able to rejoin, and the game should continue normally.

**Suspected cause:** Likely related to:

- Seat/user mapping not being properly restored on reconnect
- Connection state (`connected` flag in `GameSession`) not being re-established
- Pending discard not being cleared or recognized after reconnect
- Server-side game state not recognizing the reconnected player as active

**Where to look:**

- `apps/api/src/game/game.service.ts` — reconnection handler, seat verification
- `apps/api/src/game/game.gateway.ts` — `game:join` handler, player state recovery
- `apps/web/src/stores/game.store.ts` — reconnection store state
- `apps/web/src/hooks/use-game.ts` — reconnection flow

**Next steps:** Add logs to track seat mapping and connection state during disconnect/reconnect cycle. Verify that server's `seatMap` correctly identifies the reconnected player.

---

### BUG-023 · Invalid phase error on game completion — continue button fails

**Symptom:** After a game completes and the final score screen is shown, if the host (or any player) clicks the "Continue" or "Play Again" button to start a new game, an error pops up saying "invalid phase." All players must exit and create a new room to play again.

**Status:** ACTIVE, UNRESOLVED (as of 2026-06-09)

**Expected behavior:** Players should be able to start a new game (rematch) without backing out to create a new room.

**Suspected cause:** Likely related to:

- Game session not being properly cleared or archived when `finished` phase is reached
- Rematch handler not resetting the engine to a playable `jing_reveal` phase
- Stale `snapshot.phase` value in store preventing new game start
- Missing or incorrect phase transition logic in `game.service.ts`

**Where to look:**

- `apps/api/src/game/game.service.ts` — rematch initiation, phase reset, new game creation
- `apps/api/src/game/game.gateway.ts` — rematch socket event handler
- `apps/web/src/pages/game/game-page.tsx` — rematch button handler, phase checks
- `packages/shared/src/game.events.ts` — rematch event schema/validation

**Next steps:** Log the actual `snapshot.phase` value when rematch button is clicked. Verify that rematch handler properly initializes a new `GameSession` with `engine.deal()` → `jing_reveal` phase.

---

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

## Open Improvements

_No open improvements at this time._
