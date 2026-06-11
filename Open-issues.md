# Open Issues & Improvements

This document tracks all open bugs and improvements. Bugs (BUG-XXX) are code that is broken or behaving incorrectly. Improvements (IMP-XXX) are enhancements to existing features or new additions that do not warrant a full phase in the roadmap.

For phases, planning, and roadmap work see `Plan-and-roadmap.md`.

---

## Quick Reference

| ID         | Name                                 | Summary                                                                    |
| ---------- | ------------------------------------ | -------------------------------------------------------------------------- |
| BUG-021    | Hand-reveal meld grouping            | Winner's hand shown as flat tile list; chow/pung/kong groups not rendered  |
| BUG-022    | Player rejoin blocks tile play       | Reconnected player cannot play tiles on their turn                         |
| BUG-08     | Viewer discards invisible (3D)       | Viewer's own discard pile not visible on the 3D table                      |
| BUG-09     | TileWall3D needs redesign (3D)       | TileWall removed due to red Back.svg background; needs neutral replacement |
| BUG-028    | INVALID_PHASE on game continue       | Non-host gets error continuing after game end; host game hangs             |
| BUG-029    | Copy room code broken on mobile      | Room code copy button has no effect on mobile                              |
| BUG-030    | Bonus points doubled in settlement   | Solo bonus-tile player charged/receives double the correct amount          |
| BUG-031 ⚠️ | Host refresh locks config (CRITICAL) | After browser refresh, host cannot change config or start the game         |
| BUG-032    | Kicked player not redirected         | Kicked player remains on config screen instead of returning to menu        |
| IMP-014    | Language change during game          | No way to switch EN/ZH once a game has started                             |

---

## Open Bugs

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

### BUG-028 · End of game INVALID_PHASE error — host/non-host continue inconsistency

**Symptom:** When a game ends (with two players and two bots tested), the host can click "continue" on the detail "Someone Won!" screen, but the non-host player gets an INVALID_PHASE error. The host's game then hangs waiting for the non-host to acknowledge. In some cases, the host can also get the INVALID_PHASE error. Neither player can proceed to the next game; the game is stuck permanently.

**Status:** ACTIVE, UNRESOLVED (as of 2026-06-09)

**Expected behavior:** All players should be able to proceed to the next game after the detail screen. Phase/state consistency should be enforced server-side, not client-side.

**Suspected cause:** Likely related to:

- `game:advance-hand` socket event sent when phase is not 'reveal' or state is inconsistent between host and non-host
- Game state not being broadcast before the host advances, leaving non-host on a stale snapshot
- Phase state on the server and client diverging during end-of-session flow

**Where to look:**

- `apps/api/src/game/game.service.ts` — `advanceHand()` method, phase validation
- `apps/api/src/game/game.gateway.ts` — `game:advance-hand` handler, permission/phase checks
- `apps/web/src/hooks/use-game.ts` — `advanceHand()` socket emit, pre-conditions

**Next steps:** Add detailed logging for phase state at the moment `game:advance-hand` is emitted vs. received. Compare host and non-host snapshots before the error.

---

### BUG-029 · Copy room code button non-functional on mobile

**Symptom:** On the mobile view (narrow viewport), the "copy room code" button in the game lobby does not work. Tapping it has no effect.

**Status:** ACTIVE, UNRESOLVED (as of 2026-06-09)

**Expected behavior:** The button should copy the room code to the device clipboard and show a brief confirmation message.

**Suspected cause:** Likely related to:

- Mobile-specific event handling (touch vs. click)
- Clipboard API not available or not properly polyfilled on mobile
- Button styling or z-index issues hiding the clickable area
- Media query breakpoint not correctly targeting the mobile button

**Where to look:**

- `apps/web/src/pages/room/room-config-page.tsx` — room code copy button logic
- `apps/web/src/components/room/` — any room-related UI components with copy functionality
- CSS media queries in `index.css` or component-scoped styles

---

### BUG-030 · Settlement bonus points incorrectly doubled

**Symptom:** When one player has bonus-point tiles (e.g., flowers, seasons) and no other players have any, that player's bonus points are doubled in the settlement, and the other players are charged double the amount.

**Status:** ACTIVE, UNRESOLVED (as of 2026-06-09)

**Expected behavior:** Bonus points should be calculated once per player and distributed/charged according to the rules (typically 1 point per tile, split equally among other players or winner takes all depending on the rule variant).

**Suspected cause:** The settlement calculation may be iterating over bonus tiles and applying multipliers twice, or the distribution logic is summing bonus from the same player multiple times.

**Where to look:**

- `packages/engine/src/settlement.ts` — bonus tile settlement logic
- `apps/api/src/game/game.service.ts` — how settlement payloads are built and broadcast

**Next steps:** Add detailed logging for each bonus tile: tile type, player, and amount before and after settlement calculation. Verify the loop structure in settlement.ts.

---

### BUG-031 · Host browser close/refresh makes room config non-interactable (MAJOR)

**Symptom:** If the host is setting up a game and closes the browser tab/app (or the page refreshes), and then returns to the browser or revisits the room, they can no longer change the game configuration or start the game. The config controls are unresponsive and the "Start Game" button does not function.

**Status:** CRITICAL (as of 2026-06-09)

**Expected behavior:** The host should be able to return to an active room and resume control of the game config, with all previous settings preserved.

**Suspected cause:** Likely related to:

- Host authority (hostUserId) not being re-established after reconnection
- Socket connection missing a re-join or re-auth step for the room
- Store state not re-hydrating correctly after page refresh
- Server-side `RoomSession` state not recognizing the reconnected user as host

**Where to look:**

- `apps/api/src/room/room.service.ts` — host validation, reconnection flow
- `apps/api/src/room/room.gateway.ts` — `room:join` handler after refresh
- `apps/web/src/hooks/use-room.ts` — room state persistence and reconnection logic
- `apps/web/src/stores/room.store.ts` — host flag and config state

**Next steps:** Verify that the host flag is correctly restored after page refresh. Check if a fresh page load triggers a new `room:join` that updates host status correctly.

---

### BUG-032 · Kicked player not redirected — remains on config screen

**Symptom:** When the host kicks a player out of the room using the kick button, that player's name is removed from the player list. However, the kicked player is not redirected back to the home menu. Instead, they remain on the room config screen, seeing a stale view of the room with themselves no longer in the player list.

**Status:** ACTIVE, UNRESOLVED (as of 2026-06-09)

**Expected behavior:** When a player is kicked, they should be immediately redirected to the home menu (or a "you were kicked" modal with a redirect button).

**Suspected cause:** The `room:player-kicked` or similar socket event is not being broadcast to the kicked player, or the client is not handling the event with a redirect action.

**Where to look:**

- `apps/api/src/room/room.service.ts` — kick logic, event broadcasting
- `apps/api/src/room/room.gateway.ts` — socket event emission for player kicks
- `apps/web/src/hooks/use-room.ts` — listener for kick events, redirect logic
- React Router or navigation state management in `apps/web/src/pages/`

**Next steps:** Confirm that the kicked player receives a socket event when kicked, and that the handler triggers a router.push to home.

---

## Open Improvements

### IMP-014 · Language change during active game

**Symptom:** Once a game has started, the user cannot change the language between English and Chinese. The language setting is locked.

**Status:** NEW, UNRESOLVED (as of 2026-06-09)

**Expected behavior:** The language picker (or a settings menu during gameplay) should allow switching languages at any time. The UI should re-render with the new language instantly.

**Possible limitation:** The game engine may have limitations around mid-game language changes, or the feature may be intentionally disabled for game stability. Investigate feasibility before committing to implementation.

**Where to look:**

- `apps/web/src/pages/game/game-page.tsx` — settings access during gameplay
- `apps/web/src/components/` — language picker component and i18n hook usage

---

---
