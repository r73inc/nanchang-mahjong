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

### BUG-024 · Winning player's hand missing the winning tile

**Symptom:** In the end game summary hand reveal, the winning player's concealed hand does not contain the tile they acquired to win. The hand is missing the drawn, pungged, chowed, or konged tile that completed their winning hand.

**Status:** ACTIVE, UNRESOLVED (as of 2026-06-09)

**Expected behavior:** The winner's hand display should include all 14 tiles, including the winning tile.

**Suspected cause:** The winning tile is consumed somewhere before the hand reveal payload is constructed:

- `engine.declareWin()` may be removing the tile from hand before final state is captured
- `toClientSnapshot()` or hand redaction logic may be filtering the winning tile
- `HandRevealPayload` construction doesn't include the winning tile from the draw/claim

**Where to look:**

- `packages/engine/src/game-engine.ts` — `declareWin()` method, final hand state
- `apps/api/src/game/game.service.ts` — `handleHandEnd()`, hand reveal payload construction
- `apps/api/src/game/snapshot.ts` — hand redaction logic
- `apps/web/src/pages/game/game-page.tsx` — `HandRevealScreen` rendering logic

**Next steps:** Log the full hand state from `engine.state.seats[winnerSeat].hand` at the moment `declareWin()` is called. Verify that the winning tile is still present in the engine's final state before constructing `HandRevealPayload`.

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

### IMP-005 · Settlement phase — consolidate scoring table with per-player breakdown

**Status:** Planned

**Current issue:** The settlement tile phase displays two separate tables showing +/- points for the 2× and 1× point tiles. This is visually cluttered.

**Desired improvement:**

1. Consolidate into a single table displaying each player's total settlement points (+ or -)
2. Add a dropdown arrow next to each player's name
3. When expanded, show line-item details:
   - "Paid 2 points to Player 1 [tile image]"
   - "Paid 1 point to Player 2 [tile image]"
   - "Received 2 points from Player 3 [tile image]"
4. Use actual tile textures (via `MahjongTile2D`) instead of text labels
5. Use actual player names from the game session

**Where to look:**

- `apps/web/src/pages/game/game-page.tsx` — settlement/pre-game flow
- May require extending `PreGamePayload` from backend to include settlement transaction details

---

### IMP-006 · End game — animated winner announcement and two-step result flow

**Status:** Planned

**Current issue:** The end game screen is too abrupt, especially on mobile. Players immediately see the final score without visual fanfare.

**Desired improvement:**

1. **Winner pop-up animation:** When the game ends, display an animated pop-up saying "X Player Wins!" (center-screen, temporary)
2. **Mobile landscape persistence:** Mobile players should remain in full-screen landscape mode during end game (don't snap back to portrait)
3. **Two-step end flow:**
   - Step 1: Show winner pop-up animation (2-3 seconds)
   - Step 2: Add "See Final Results" button that transitions to the current end game score screen
4. **Visual polish:** Animate the pop-up with scale/fade-in; play a winning chime sound

**Where to look:**

- `apps/web/src/pages/game/game-page.tsx` — `GameEndScreen`, `JingRevealScreen`
- `apps/web/src/r3f/GameCanvas.tsx` — 3D table landscape lock
- `useSound` hook (Phase 11) — winning chime already available

---

### IMP-007 · Auth — remove autofill placeholder and add password visibility toggle

**Status:** Planned

**Current issue:** Username and password fields autofill with "temp" placeholder text. Users cannot easily verify what they typed without a password visibility toggle.

**Desired improvement:**

1. **Remove autofill:** Delete "temp" default text from username and password input fields
2. **Password visibility toggle:** Add an eye icon button next to the password field to toggle between hidden (•••) and visible text

**Where to look:**

- `apps/web/src/pages/auth/` — signup and login screen components
