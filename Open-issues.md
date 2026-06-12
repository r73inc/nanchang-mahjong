# Open Issues & Improvements

This document tracks all open bugs and improvements. Bugs (BUG-XXX) are code that is broken or behaving incorrectly. Improvements (IMP-XXX) are enhancements to existing features or new additions that do not warrant a full phase in the roadmap.

For phases, planning, and roadmap work see `Plan-and-roadmap.md`.

---

## Quick Reference

| ID      | Name                                  | Summary                                                                                                       |
| ------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| BUG-08  | Viewer discards invisible (3D)        | Viewer's own discard pile not visible on the 3D table                                                         |
| BUG-09  | TileWall3D needs redesign (3D)        | TileWall removed due to red Back.svg background; needs neutral replacement                                    |
| BUG-042 | Opponent info blocks drift with melds | Left/right/top player name-tags shift toward centre as melds are revealed; viewer score unreadable            |
| BUG-045 | Bot dice roll animation not visible   | Bot roll animation and result flash by in under a frame; human roll works correctly                           |
| BUG-046 | Wildcard / kong rule violations       | Jings can upgrade an open pung to kong (revealed meld wildcard — forbidden); visual "transformation" artefact |
| IMP-020 | Declare-win UX redesign               | Win popup blocks hand view; no persistent button after rejection; no win-reason label; claim labels generic   |
| IMP-021 | Claim window minimize to inspect pile | No way to temporarily hide pung/kong/chow popup to see the discard pile before deciding                       |
| IMP-022 | User profile rework                   | Single username, profile picture with circle avatar, random tile default, account-screen upload               |

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

### BUG-042 · Opponent info blocks drift toward centre as melds are revealed; active player score unreadable

**Symptom (two related layout problems):**

1. **Drifting info blocks:** The left and right opponent player name-tags / score blocks are positioned inside the same layout container as their open melds. As each opponent reveals more melds, the info block shifts progressively toward the centre of the board instead of staying anchored to the screen edge. The top (opposite) opponent's info block has the same issue.

2. **Viewer score unreadable:** The active (bottom) player's score is displayed in the seat area at the bottom of the screen where it is obscured or too small to read comfortably. It should be moved to the top status banner where there is more space and better contrast.

**Status:** ACTIVE, UNRESOLVED (logged 2026-06-11)

**Expected behaviour:**

- Left opponent's info block remains anchored to the left edge of the screen regardless of how many melds are revealed.
- Right opponent's info block remains anchored to the right edge of the screen.
- Top opponent's info block remains anchored to its fixed position.
- Open melds grow inward from the edge as usual; only the info block is stationary.
- Active player's score is displayed in the top banner (already contains round/wind/wall-count info) rather than in the bottom seat area.

**Suspected cause:** The opponent seat containers use a flex or flow layout where the info block and the meld tiles are siblings. When more meld tiles are rendered, the flex alignment (probably `justify-content: center` or similar) re-centres the group, dragging the info block with it. The fix is to take the info block out of the meld flow — either by using `position: absolute` pinned to the screen edge, or by splitting it into a separate always-visible overlay layer.

**Where to look:**

- `apps/web/src/pages/game/game-page.tsx` — side/top opponent seat layout, SeatHUD positioning, top status banner (for viewer score addition)
- Any `OpponentSeat`, `SeatHUD`, or `SideOpponent` components in `apps/web/src/`
- `apps/web/src/r3f/` — if the 3D SeatHUD corners are affected as well

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

**Status:** OPEN — investigation complete (2026-06-11); fix needed

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

### IMP-020 · Declare-win UX redesign

**Current behaviour:** When the player's hand is eligible to win (self-draw, or from a pung/kong claim), a popup appears that blocks the entire hand view. If the player dismisses it, there is no persistent way to declare the win later without re-triggering the same blocking overlay. The popup does not state what action triggered the win opportunity (e.g. "You drew a winning tile" vs. "Win by claiming this pung"). Claim-type win buttons show generic labels rather than specifying the meld type.

**Desired behaviour:**

1. **Non-blocking overlay:** The declare-win prompt should not hide the player's hand. Use the same side-rail / bottom-banner interface already used for pung/kong/chow claims — the hand tiles remain visible so the player can confirm they actually want to declare.

2. **Persistent win button:** If the player rejects the initial win prompt, a persistent "Declare Win" button should appear on the right side of the screen (similar to the existing Sort button) for as long as the hand remains in a winning state. Clicking it re-opens the confirm dialog. The button disappears once the hand is no longer winning (e.g. after a discard changes the state).

3. **Win-reason label:** The initial prompt should display what triggered the opportunity: self-draw, from a discard, from a kong, from robbing a kong, etc.

4. **Specific claim-win labels:** When the win is via a claim, the confirm button should say "Win by Chow", "Win by Pung", or "Win by Kong" rather than a generic "Declare Win".

**Where to look:**

- `apps/web/src/pages/game/game-page.tsx` — win confirmation UI, `SideRail` claim overlay, action toast
- `apps/web/src/hooks/use-game.ts` — `claimWindow` state, pending win actions
- `packages/shared/src/` — `ClaimAction` types, snapshot fields related to win eligibility

---

### IMP-021 · Claim window minimize — inspect discard pile before deciding

**Current behaviour:** When the pung / kong / chow claim window appears, it covers part of the screen and there is no way to temporarily hide it to see the full discard pile before deciding whether to claim. Players must decide blind.

**Desired behaviour:**

- A "minimise" button (e.g. a small arrow or eye icon) on the claim popup collapses it to a slim bar or floating chip that says "Claim pending — tap to expand".
- While minimised the player can scroll / inspect the discard pile.
- Tapping the chip re-expands the full claim window.
- The claim timer continues ticking while minimised.
- The player must act (claim or pass) before the timer expires; they cannot use any other game actions (discard, kong, etc.) while a claim window is open and minimised.

**Where to look:**

- `apps/web/src/pages/game/game-page.tsx` — `SideRail` component and claim-window overlay
- `apps/web/src/hooks/use-game.ts` — `claimWindow` state and deadline tracking

---

### IMP-022 · User profile rework — single username, profile picture, circle avatar

**Current behaviour:** Each user has both a display name and a separate handle/username. Profile pictures are not supported. In gameplay, opponents are identified only by text name chips.

**Desired behaviour:**

1. **Single username:** Replace the current two-field system (display name + handle) with one username field. This is both the display name and the unique identifier.

2. **Profile picture:** Users can upload a profile picture after logging in, via the account/settings screen — NOT during registration. Profile pictures are displayed as circles throughout the app.

3. **Default avatar:** Users without a profile picture get a randomly assigned mahjong tile face as their avatar (any tile except the blank white dragon tile). The tile assignment should be consistent per user (e.g. seeded by user ID) so the same tile appears across sessions.

4. **Image size limit:** Profile pictures should be reduced client-side to a maximum of 1024 × 1024 pixels before uploading to keep storage costs low.

5. **In-game avatar display:**
   - Left opponent: small circle avatar displayed above their info box (on the left edge).
   - Right opponent: small circle avatar displayed above their info box (on the right edge).
   - Top opponent: small circle avatar displayed to the left of their info box.
   - Active player (viewer): small circle avatar displayed in the top banner next to the logged-in player's name.

**Where to look:**

- `apps/web/src/pages/` — profile/account page, registration flow
- `apps/api/src/users/` — user schema, profile update endpoint
- `apps/web/src/pages/game/game-page.tsx` — opponent seat info boxes, top banner
- `packages/shared/src/` — `UserProfile` or equivalent type
