# Open Issues & Improvements

This document tracks all open bugs and improvements. Bugs (BUG-XXX) are code that is broken or behaving incorrectly. Improvements (IMP-XXX) are enhancements to existing features or new additions that do not warrant a full phase in the roadmap.

For phases, planning, and roadmap work see `Plan-and-roadmap.md`.

---

## Quick Reference

| ID         | Name                                                   | Summary                                                                                                                                                                                                                                                                                          |
| ---------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BUG-022    | Player rejoin blocks tile play                         | Reconnected player cannot play tiles on their turn                                                                                                                                                                                                                                               |
| BUG-08     | Viewer discards invisible (3D)                         | Viewer's own discard pile not visible on the 3D table                                                                                                                                                                                                                                            |
| BUG-09     | TileWall3D needs redesign (3D)                         | TileWall removed due to red Back.svg background; needs neutral replacement                                                                                                                                                                                                                       |
| BUG-029    | Copy room code broken on mobile                        | Room code copy button has no effect on mobile                                                                                                                                                                                                                                                    |
| BUG-031 ⚠️ | Host refresh locks config (CRITICAL)                   | After browser refresh, host cannot change config or start the game                                                                                                                                                                                                                               |
| BUG-032    | Kicked player not redirected                           | Kicked player remains on config screen instead of returning to menu                                                                                                                                                                                                                              |
| BUG-037 ⚠️ | Wall model wrong — no dice, no segmented walls (MAJOR) | Engine uses one flat tile pool; real game has 4 per-player walls of 17 two-tile stacks, two dice rolls selecting the deal start, stack-based dealing, and kong draws from the opposite wall end. Settlement/spirit tiles also derived from wrong position. Full engine wall rework — no patching |
| BUG-041    | Spirit tile popup shows too many tiles                 | Spirit tiles still cut off in top-left during gameplay; popup shows current→arrow→next→next-sequence instead of just current+next                                                                                                                                                                |

---

## Open Bugs

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

### BUG-037 · Wall model wrong — no dice rolls, no segmented walls, wrong settlement/spirit position (MAJOR)

**Severity: MAJOR — core engine rework.** This is not a patch. The engine's flat-pool wall model must be replaced with the real physical wall model described below. Do **not** bolt dice/segment bookkeeping onto the existing flat `wall: TileId[]` if that creates tech debt — redo the wall representation, dealing, drawing, and kong-replacement mechanics properly so the future spectator view can animate the real table directly from engine state and events. Good and right beats easy and short-term.

**Symptom (current wrong behavior):**

- The engine shuffles all tiles into **one flat pool** and deals from the front — there are no per-player walls, no 2-high stacks, no dice.
- The opening settlement tile and spirit (jing) indicator are taken from `wall[0]` / `wall[1]` with no dice roll; the indicator is consumed (removed from play) and the settlement tile is moved to the bottom of the whole wall. In the real game both tiles stay in the wall in their (swapped) stack positions.
- Kong replacement draws come from the same linear pool rather than from the correct physical wall end.

**Status:** ACTIVE, UNRESOLVED (logged 2026-06-11; expanded with full real-world wall/deal procedure 2026-06-11)

---

**Real-world setup and deal procedure (target behavior, from the family's table practice):**

1. **Wall build.** The full tile set is divided into **4 equal walls, one in front of each player**. Tiles are stacked **2 high**, so each player has **17 stacks of 2 tiles** (17 × 2 × 4 = 136 ✓ matches the Nanchang set). Convention for one wall: from that player's perspective, left-most top tile = flat tile 1, left-most bottom = 2, second stack top = 3, second stack bottom = 4, … 17th stack = tiles 33–34.

2. **Dice roll #1 — wall selection (rolled by the dealer).** Two six-sided dice. The sum counts around the players **counter-clockwise, inclusively, starting with the dealer as 1**. Example: roll of 3 → dealer = 1, player to dealer's right = 2, player across = 3 → the player **across** is selected. The selected player rolls next.

3. **Dice roll #2 — starting stack (rolled by the selected player).** The result is the number of 2-tile stacks counted **from the left side of the selected player's own wall** (left from that player's perspective), counting **inclusively**, each stack = 1. Example: a 6 → the **6th stack** (flat tiles 11 + 12 of that wall) is where taking begins — the dealer takes that 6th stack first.

4. **Taking order.** The **dealer always takes first** (one full stack = 2 tiles), then the player to the dealer's right (counter-clockwise), then the next, and so on — each player takes the next stack along the wall in sequence. Example continued: dealer takes the stack with tiles 11+12; the player to the dealer's right takes the stack with tiles 13+14; etc.

5. **Wall wraparound.** When someone takes the **17th (last) stack** of a wall, taking transitions to the wall of the player **to the right (counter-clockwise)** of the player whose wall was being taken from.

6. **Hand sizes.** Stack-taking rounds continue until **every player has 12 tiles** (3 stacks each). Then **each player takes 1 single tile** (13 each). Then **the dealer alone takes a 14th tile**. Dealer starts the hand with 14, everyone else with 13. _(Final counts match the current `deal()`; the taking pattern and physical source do not.)_

7. **Settlement & spirit tile reveal happens after dealing** (the existing dice-counted stack procedure below), then normal gameplay begins.

8. **Live draw continuation.** Normal gameplay drawing **continues from exactly where the deal taking stopped** — same direction, same wall progression.

9. **Kong replacement draws** come from the **back of the wall**: the tiles in front of the player **to the left of the player whose wall the taking started from** (i.e. the opposite end of the draw ring from the live draw direction).

**Settlement & spirit tile procedure (unchanged requirement from the original log, now expressed in the segmented model):**

- After dealing, **two dice are rolled**; count that many **stacks backwards from the back of the wall** (the kong-replacement end). The **top tile** of the resolved stack is flipped — this is the **settlement tile**; its opening payout is distributed (existing `calculateOpeningJingSettlement` math is correct — 2 pts/copy + 1 pt/copy next-in-sequence — don't change it).
- After the payout, the settlement tile is **swapped with the tile directly below it** in the same stack; the revealed bottom tile is the **spirit tile** (indicator for `jingPrimary`/`jingSecondary` via the existing `jingTypesFromIndicator`).
- **Both tiles remain in the wall in their swapped positions** and are drawn normally when the draw reaches them. Neither is consumed or relocated.

---

**Target engine model (design recommendation — refine during implementation):**

- **Ring-of-stacks representation.** Model the wall as a ring of **68 stacks** (4 segments × 17), each stack `{ top: TileId; bottom: TileId }`, with each segment tagged by owner seat. The deterministic shuffle (existing seeded `mulberry32`) lays tiles into the ring; dice rolls (also seed-derived) resolve the starting stack.
- **Two pointers moving toward each other:** a `drawPtr` advancing in the deal/draw direction and a `kongPtr` at the opposite end (the left-neighbour wall of the deal-start player) retreating for replacement draws. A hand is wall-exhausted when the pointers meet (reconcile with the existing `deadWall` count — see open questions).
- **Within-stack draw order** for normal draws (top then bottom, matching how a physical stack is picked up) must be defined once and tested.
- **Dealing as stack-taking.** Reimplement `deal()` as the real procedure: dealer takes stack at `drawPtr`, then counter-clockwise seat order (engine seat order East→South→West→North already matches counter-clockwise play), 3 stack rounds (12 each), then 4 single tiles (13 each), then the dealer's 14th. Identical resulting hands **per seat** could be preserved or not — replays of old games must still work (see migration note).
- **Everything derives from the seed.** Shuffle, dice roll #1, dice roll #2, and the jing-reveal roll must all be reproducible from the hand seed alone (e.g. `mulberry32(seed ^ SALT_N)` per roll) so `replayHand()` reproduces the entire physical setup with no extra stored state beyond the events.
- **Events for every visual moment.** New `GameEvent` kinds so the future spectator view can animate the whole sequence from the event stream:
  - `{ kind: 'dice_roll'; purpose: 'wall_selection' | 'deal_start' | 'jing_reveal'; roller: SeatWind; dice: number[] }` — individual die faces, never just the sum.
  - Optionally `deal_taken` events (or derivable from state) marking which stack went to which seat, for the deal animation.
- **Dice module:** `packages/engine/src/dice.ts` with `rollDice(rand: () => number, count = 2): number[]` — pure, PRNG-injected, exported from the engine index. **Every future dice moment must go through this + a `dice_roll` event with a distinct `purpose`. No inline `Math.random`-style rolls anywhere.**
- **`GameState` additions:** dice results, deal-start seat + stack index, current `drawPtr`/`kongPtr` (or equivalent), and resolved settlement/spirit stack position — enough that a renderer can draw the physical table at any point in the hand.

**Required changes by package:**

_Engine (`packages/engine`):_ new `dice.ts`; new wall/stack module (ring construction, pointer math, `stackFromBack`-style helpers with unit tests so conventions can't drift); rewrite `deal()` (≈ line 296) as stack-taking; rewrite `revealJing()` (≈ lines 355–437) to dice-resolve the stack, swap in place, never consume; route normal draws and kong-replacement draws through the two pointers; update wall-exhaustion accounting.

_Shared (`packages/shared`):_ `SettlementPreviewPayload` gains dice values + stack position; `ClientGameState` gains dice/wall-position fields (all public — no redaction concern; only tile **identities** in concealed hands are secret, wall positions/counts are public table state); `PublicGameEvent` gains the `dice_roll` variant. Revisit `nextTile` semantics (currently `stepAbove(settlement)`, derived) against the locked rules doc.

_API (`apps/api`):_ `game.service.ts` pre-game flow builds the settlement preview from the dice-resolved tiles; broadcast `dice_roll` public events; `toClientSnapshot` passes the new public fields through.

_Web (`apps/web`):_ minimal for now — settlement preview reads tiles from the payload and shows the rolled dice values as static text/icons. Full dice/deal animations are future work, but the **data path (events + payload fields) must land with this fix** so animation needs no schema change.

_Tests:_ dice determinism from seed; ring/stack index math including wraparound at the 17th stack and at segment boundaries; deal produces 14/13/13/13 with the correct stack-taking sequence from both dice rolls; kong replacement comes from the correct opposite end; swap-in-place leaves wall length unchanged and both tiles drawable; zero-sum settlement unchanged; `replayHand()` reproduces the full setup and all rolls; wall-exhaustion threshold unchanged in tile count.

**Migration / compatibility notes:**

- **Replays:** existing stored replays were generated under the flat-pool model. `replayHand()` replays events against engine calls — verify old replays still resolve (version-gate the wall model by a flag in `handLog` seed/config if needed) rather than silently producing different hands.
- **Bots and claim logic** consume hands and discards, not wall internals — they should be unaffected, but the wall-count fields they may read (`wallCount`) must keep meaning "tiles remaining to draw".

**Research pointers for implementation:**

- Standard mahjong dealing conventions (for cross-checking the mechanics, not the rules): the two-roll "break the wall" procedure is near-universal; the second count traditionally starts from the **right** edge in many variants — **here the family rule is explicit: count from the LEFT of the selected player's wall, inclusive, and the dealer takes the counted stack itself.** Implement the family rule; don't copy a generic variant.
- The math invariant to test first: 4 walls × 17 stacks × 2 tiles = 136 = full Nanchang set (108 suits + 16 winds + 12 dragons). Any wall-model code should assert this at construction.
- `packages/engine/src/prng.ts` (`mulberry32`) is the existing seeded-determinism pattern; follow it for all rolls.
- `packages/engine/src/jing.ts` `jingTypesFromIndicator` is unchanged by all of this.
- `docs/final-nanchang-mahjong-rules.md` is the locked rules authority — reconcile any conflict between this log and that doc before coding, and update the doc if the family confirms these table procedures.

**Open questions to resolve during implementation (ask the user / check the locked rules doc):**

- **Second dice roll:** confirmed two dice (sum 2–12) like the first roll, or a single die? The worked example used "a 6", which is possible either way.
- **Dead wall / kong-replacement tail:** strictly, the stacks **before** the deal-start stack (stacks 1 … N−1 of the deal-start player's wall) sit at the very tail of the draw ring. The user states kong tiles come from the wall of the player **to the left** of the deal-start player. Confirm whether the skipped stacks 1…N−1 are part of the kong tail (drawn before reaching the left-neighbour wall), are dead tiles, or whether the family convention simply approximates "the back". This also determines what "count backwards from the back" means for the settlement/spirit dice count.
- Does the settlement/spirit dice count overlap the kong-replacement region, and what happens if the resolved stack has already been drawn from?
- Standard (non-`ruleTopBottomJing`) mode currently takes the indicator from `deadWall[0]` — confirm whether the dice procedure applies to both modes or only the top-bottom variant.
- Should `wallCount` shown to clients remain a single number, or become per-wall counts for the spectator view? (Per-wall is derivable from pointers — prefer deriving over storing.)

**Where to look:**

- `packages/engine/src/engine.ts` — `deal()` (≈ line 296), `revealJing()` (≈ lines 355–437), draw + kong-replacement paths
- `packages/engine/src/prng.ts` — `mulberry32`, pattern for seeded determinism
- `packages/engine/src/jing.ts` — `jingTypesFromIndicator` (unchanged)
- `packages/shared/src/game.events.ts` — `SettlementPreviewPayload`, `PublicGameEvent`, `ClientGameState`
- `apps/api/src/game/game.service.ts` — pre-game advance / settlement preview emission
- `packages/engine/src/replay.ts` (or equivalent) — `replayHand()` compatibility with the new events

---

### BUG-041 · Spirit tile display clipped and shows too many tiles

**Symptom:** During gameplay, the spirit tile indicator buttons in the top-left status bar are clipped (cut off at the top edge of the viewport). When tapped, the popup shows four items: current spirit tile → arrow → next spirit tile → next-sequence spirit tile. The user expects the popup to show only the current and next spirit tiles (two tiles total).

**Status:** ACTIVE, UNRESOLVED (logged 2026-06-11)

**Root cause (two problems):**

1. **Clipping:** The spirit tile buttons (`MobileJingButton`) were already using the older `xs` size (28×38 px) before the `xxs` addition. The 32 px fixed status bar height is too small for two stacked `xs` tiles. IMP-018 switched the button to `xxs` (20×27 px) and resolved the visual clipping, but the spirit tiles may still be overflowing depending on viewport layout or padding.

2. **Popup content:** The popup currently renders the full spirit tile sequence:
   - Current tile (the active spirit tile for this turn)
   - Arrow icon
   - Next spirit tile (the one that will come into play after the next bonus round)
   - Next-sequence spirit tile (one step further ahead)

   This is visually cluttered. The user wants only the current and next spirit tiles shown.

**Fix:**

- Verify that the `xxs` size (from IMP-018) fully resolves the clipping — if not, further reduce `MobileJingButton` padding or container height.
- Rewrite `MobileJingButton` popup to show only two tiles: current (large) and next (smaller, perhaps with an arrow or "next round" label). Remove the next-sequence tile from the display.

**Where to look:** `apps/web/src/pages/game/game-page.tsx` — `MobileJingButton` component.

---

## Open Improvements

---
