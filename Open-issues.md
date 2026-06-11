# Open Issues & Improvements

This document tracks all open bugs and improvements. Bugs (BUG-XXX) are code that is broken or behaving incorrectly. Improvements (IMP-XXX) are enhancements to existing features or new additions that do not warrant a full phase in the roadmap.

For phases, planning, and roadmap work see `Plan-and-roadmap.md`.

---

## Quick Reference

| ID         | Name                                   | Summary                                                                                                             |
| ---------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| BUG-021    | Hand-reveal meld grouping              | Winner's hand shown as flat tile list; chow/pung/kong groups not rendered                                           |
| BUG-022    | Player rejoin blocks tile play         | Reconnected player cannot play tiles on their turn                                                                  |
| BUG-08     | Viewer discards invisible (3D)         | Viewer's own discard pile not visible on the 3D table                                                               |
| BUG-09     | TileWall3D needs redesign (3D)         | TileWall removed due to red Back.svg background; needs neutral replacement                                          |
| BUG-029    | Copy room code broken on mobile        | Room code copy button has no effect on mobile                                                                       |
| BUG-031 ⚠️ | Host refresh locks config (CRITICAL)   | After browser refresh, host cannot change config or start the game                                                  |
| BUG-032    | Kicked player not redirected           | Kicked player remains on config screen instead of returning to menu                                                 |
| BUG-037    | Settlement/spirit tiles wrong position | No dice roll; tiles flipped from wall front instead of dice-counted stack from the back; indicator wrongly consumed |

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

### BUG-037 · Settlement & spirit tiles derived from the wrong wall position — no dice roll

**Symptom:** The opening settlement tile and the spirit (jing) indicator are taken from the **front** of the live wall (`wall[0]` and `wall[1]`) with no dice roll. In real Nanchang Mahjong the position is determined by a roll of two dice counted backwards from the **back** of the wall in 2-high stacks, and the two tiles are the **top and bottom of the same stack** — not two adjacent tiles in draw order. The current implementation also removes the indicator from play entirely, which is wrong: both tiles stay in the wall.

**Status:** ACTIVE, UNRESOLVED (logged 2026-06-11)

**Correct real-life procedure (target behavior):**

1. Walls are built; tiles are stacked **2 high** (each "group" in the wall is a stack of 2 tiles: top + bottom).
2. Players take turns drawing until everyone has 13 tiles; the dealer (host) then draws one more for 14. _(Already correct — `deal()` gives the dealer 14.)_
3. **Two six-sided dice are rolled** (values 1–6 each, sum 2–12).
4. Count backwards from the **back of the wall** in **groups/stacks**, the dice sum being the count. Example: a roll summing to 7 → the 7th stack from the back, which is 14 tiles from the back in flat-tile terms.
5. The **top tile of that stack** is flipped: this is the **settlement tile**. Its opening payout is distributed (2 pts/copy held, plus the 1 pt/copy next-in-sequence payout — existing `calculateOpeningJingSettlement` math is correct, don't change it).
6. After the payout, the settlement tile is **swapped with the tile directly below it** in the same stack. The bottom tile is revealed: this is the **spirit tile** (the wild card — the indicator from which `jingPrimary`/`jingSecondary` are derived via the existing `jingTypesFromIndicator`).
7. **Both tiles remain in play in their (now swapped) positions in the wall.** Neither is consumed or relocated elsewhere. They will be drawn normally when the draw reaches that part of the wall.

**Current (wrong) behavior — `packages/engine/src/engine.ts` `revealJing()` (≈ lines 355–419):**

- No dice roll exists anywhere in the codebase.
- Settlement tile = `wall[0]` (front of wall / next draw), indicator = `wall[1]`.
- Indicator is **consumed** (removed from the wall entirely).
- Settlement tile is moved to the **bottom of the whole wall** (last-draw position) instead of swapping with its stackmate.
- The two tiles are linear neighbours in draw order rather than a vertical top/bottom stack pair.

**Required changes:**

_Engine (`packages/engine`):_

1. **New `packages/engine/src/dice.ts` — reusable dice module.** Nanchang has several moments where dice are rolled; all of them will eventually be animated on the frontend, so the module must return the **individual die faces, not just the sum**:
   - `rollDice(rand: () => number, count = 2): number[]` — pure helper drawing from a supplied PRNG function (composes with the existing `mulberry32` in `prng.ts`); each die uniform 1–6.
   - Export from `packages/engine/src/index.ts` so shared/api can reuse it for every future dice moment (seating draw, etc.).
2. **Wall stack model.** The wall is a flat `TileId[]`. Define the stack mapping once as a documented convention, e.g. the back of the wall is the **end** of the array, and stack _k_ from the back (1-based) occupies flat indices `[len − 2k]` (top) and `[len − 2k + 1]` (bottom). Add pure helpers (`stackFromBack(wall, k)`) with unit tests so the convention can't drift.
3. **`GameState` additions:** store `diceRoll: [number, number] | null` (the jing-reveal roll) and the resolved flat wall indices of the settlement/spirit tiles, so clients and replay can render the position.
4. **New `GameEvent`:** `{ kind: 'dice_roll'; purpose: 'jing_reveal' | ...; dice: number[] }` appended before `opening_jing_settlement`. This makes the roll **replayable** (`replayHand()` replays events deterministically) and gives the frontend a discrete event to hang the future dice animation on.
5. **Rewrite `revealJing()` (ruleTopBottomJing path):**
   - Roll dice via `rollDice` using a deterministic PRNG derived from the hand seed (e.g. `mulberry32(seed ^ DICE_SALT)`) — must be reproducible from the seed alone, like the shuffle.
   - Resolve the stack: settlement tile = top of stack _sum_ from the back; spirit indicator = bottom of the same stack.
   - Apply the existing opening settlement payout (unchanged math).
   - **Swap the two tiles in place** in the wall array — do not remove either, do not move either to the wall ends.
   - Derive `jingPrimary`/`jingSecondary` from the revealed spirit tile via `jingTypesFromIndicator` as today.
   - Append events: `dice_roll`, `opening_jing_settlement`, `jing_indicator`.
6. **Wall-exhaustion accounting:** today the indicator consumption shrinks the wall by 1; after the fix the wall length is unchanged at reveal. Verify draw-count / `draw_game` thresholds and any `wallCount` assumptions still hold.

_Shared (`packages/shared`):_

7. `SettlementPreviewPayload` — add the dice values and stack position so the preview screen can show/animate the roll. Revisit `nextTile` semantics: the 1 pt payout tile is currently `stepAbove(settlement)` (derived, never removed) — confirm against the locked rules doc whether that stays, since the spirit tile is now the physical stackmate rather than the next wall tile.
8. `ClientGameState` — add `diceRoll` (and optionally the revealed stack position) for rendering.
9. `PublicGameEvent` — add a public `dice_roll` variant (dice faces are public information) for the future animation hook.

_API (`apps/api`):_

10. `game.service.ts` pre-game flow (`advancePreGame` / settlement preview build) — preview must use the dice-resolved tiles, not `wall[0]`/`wall[1]`. Broadcast the `dice_roll` public event.
11. `toClientSnapshot` — pass through the new fields (dice faces and revealed positions are public; no redaction concern).

_Web (`apps/web`):_

12. Minimal for now: settlement preview screen reads the tiles from the payload (no positional assumption). Display the rolled dice values as static text/icons on the settlement preview step — the full dice-roll animation is a future improvement, but the data path (event + payload fields) must land with this fix so the animation can be added without another schema change.

_Tests:_

13. Engine: dice determinism from seed; stack-from-back index math (including sums 2 and 12 at the edges); swap-in-place leaves wall length unchanged and both tiles drawable; zero-sum settlement unchanged; replay reproduces the same roll and reveal.

**Dice reusability note (explicit requirement):** every future dice moment (e.g. seating/deal-position rolls) must go through `rollDice` + a `dice_roll` event with a distinct `purpose`, so the backend simulates them now and the frontend can animate each one later from the same event stream. Do not inline `Math.random`-style rolls anywhere.

**Open questions to resolve during implementation (check `docs/final-nanchang-mahjong-rules.md`):**

- Does the dice count from the back overlap the dead-wall region (`deadWall` = last 4 shuffled tiles)? Decide whether the count is over the live wall only or the full wall including kong-replacement tiles, and what happens if the resolved stack falls inside the dead wall.
- Standard (non-ruleTopBottomJing) mode currently takes the indicator from `deadWall[0]` — confirm whether the dice procedure applies to both modes or only the top-bottom variant.

**Where to look:**

- `packages/engine/src/engine.ts` — `deal()` (≈ line 296), `revealJing()` (≈ lines 355–437)
- `packages/engine/src/prng.ts` — `mulberry32`, pattern for seeded determinism
- `packages/engine/src/jing.ts` — `jingTypesFromIndicator` (unchanged)
- `packages/shared/src/game.events.ts` — `SettlementPreviewPayload`, `PublicGameEvent`, `ClientGameState`
- `apps/api/src/game/game.service.ts` — pre-game advance / settlement preview emission

---

## Open Improvements

---
