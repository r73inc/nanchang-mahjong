# Open Issues & Improvements

This document tracks all open bugs and improvements. Bugs (BUG-XXX) are code that is broken or behaving incorrectly. Improvements (IMP-XXX) are enhancements to existing features or new additions that do not warrant a full phase in the roadmap.

For phases, planning, and roadmap work see `Plan-and-roadmap.md`.

---

## Quick Reference

| ID      | Name                                  | Summary                                                                                            |
| ------- | ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| BUG-08  | Viewer discards invisible (3D)        | Viewer's own discard pile not visible on the 3D table                                              |
| BUG-09  | TileWall3D needs redesign (3D)        | TileWall removed due to red Back.svg background; needs neutral replacement                         |
| BUG-042 | Opponent info blocks drift with melds | Left/right/top player name-tags shift toward centre as melds are revealed; viewer score unreadable |
| BUG-045 | Bot dice roll animation not visible   | Bot roll animation and result flash by in under a frame; human roll works correctly                |

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

## Open Improvements
