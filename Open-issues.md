# Open Issues & Improvements

This document tracks all open bugs and improvements. Bugs (BUG-XXX) are code that is broken or behaving incorrectly. Improvements (IMP-XXX) are enhancements to existing features or new additions that do not warrant a full phase in the roadmap.

For phases, planning, and roadmap work see `Plan-and-roadmap.md`.

---

## Quick Reference

| ID      | Name                                                            | Summary                                                                                      |
| ------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| BUG-08  | Viewer discards invisible (3D)                                  | Viewer's own discard pile not visible on the 3D table                                        |
| BUG-09  | TileWall3D needs redesign (3D)                                  | TileWall removed due to red Back.svg background; needs neutral replacement                   |
| BUG-045 | Bot dice roll animation not visible                             | Bot roll animation and result flash by in under a frame; human roll works correctly          |
| BUG-047 | Thirteen Misfits (十三烂) unwinnable when jing overlaps pattern | Engine rejects any 13-misfits hand containing a jing tile; needs rules verification          |
| IMP-026 | Side-seat tiles & text rotated / hard to read                   | Left/right/top seats' tiles, names and score text are CSS-rotated; testers want them upright |
| IMP-027 | Thirteen Misfits eligibility hint                               | Surface the concealed / self-draw / no-jing requirements in-game to reduce confusion         |

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

### BUG-047 · Thirteen Misfits (十三烂) cannot be won when a jing tile overlaps the pattern — needs rules verification

**Reported by:** Playtest #1 (2026-06-13), two separate testers. One tester held what they believed was a valid Thirteen Misfits hand with 1 & 2 Bamboo set as the spirit (jing) tiles and could not declare a win over many rounds. The tester self-resolved by reading the in-app rules screen and concluded "it was just me who didn't win" — but the engine behaviour below means the hand may have been genuinely unwinnable for a non-obvious reason, so this needs a developer decision.

**Symptom:** A hand that looks like a valid Thirteen Misfits (same-suit numbers spaced > 2 apart + unique honors) is never offered as a win / cannot be declared.

**Status:** OPEN — needs rules clarification, then verification

**Most likely cause (engine):** `checkThirteenMisfits` in `packages/engine/src/hand.ts:226` rejects the hand if **any** jing is present:

```ts
if (jingCount > 0) return false; // wildcards cannot be used in Thirteen Misfits
```

The tester chose **1 & 2 Bamboo as the jing**. The canonical Thirteen Misfits bamboo run is 1/4/7條 — so the moment the tester holds a 1條, that tile is counted as a jing wildcard (`separateJing`), `jingCount` becomes > 0, and the hand is disqualified. With 1/2條 as jing, drawing into a "clean" 13-misfits shape is effectively impossible.

**Open rules question (resolve first):** `docs/final-nanchang-mahjong-rules.md` §5.2 only states Thirteen Misfits "must be concealed" — it does **not** explicitly say jing tiles are disallowed. The in-app rules screen (ZH) says 必须全程自摸 (must be entirely self-drawn). Neither source clearly justifies the engine's "zero jing" rule. Decide whether:

1. A jing tile sitting in a valid misfit position should count as a natural for 13-misfits purposes (relax the engine check), or
2. The "no jing at all" rule is correct and the UI must explain it (see IMP-027).

**Where to look:**

- `packages/engine/src/hand.ts` — `checkThirteenMisfits` (jing rejection), `separateJing` usage
- `packages/engine/src/engine.ts:700` — `isWinningHand(winningHand, this.jingTypes)` win gate
- `packages/engine/src/__tests__/hand.test.ts` — add a case: 13-misfits shape where one tile type is also the jing
- `docs/final-nanchang-mahjong-rules.md` §5.2 — authoritative rule text

**Secondary note:** `isWinningHand` does not appear to enforce the "must be self-drawn" requirement for Thirteen Misfits (a ron would pass the tile-composition check). The implicit concealment guarantee comes from open-meld tiles being folded into `winningHand` (a chow/pung can never satisfy the gap-> 2 / unique-honor constraints). Confirm whether self-draw must be enforced explicitly for this hand type.

---

## Open Improvements

### IMP-026 · Side-seat tiles, names and score text are rotated — hard to read

**Reported by:** Playtest #1 (2026-06-13), the most-emphasised UI feedback ("I have to tilt my neck to see it"; "if the side text could be adjusted to look the same as when looking at your own tiles, it would be perfect"). Overall sentiment was extremely positive (100/100) — this is the single concrete UI ask.

**Symptom:** For the left, right and top seats, the tiles, player names, bot/dealer badges and the spirit-score text (e.g. "ww: 16分") are rotated 90°/180° following the physical table orientation, so the characters read sideways/upside-down. Testers want all on-screen text and tiles oriented upright toward the viewer, the same as their own hand.

**Status:** OPEN — UX improvement

**Mechanism:** Seat zones are CSS-rotated as whole containers via `CONTAINER_TRANSFORMS` in `apps/web/src/components/2d/layout-2d.ts:81-83` (`right: rotateZ(-90deg)`, `top: rotateZ(180deg)`, `left: rotateZ(90deg)`). The rotation is applied to the entire zone, so both tiles and any text inside rotate with it. On portrait phones the whole board is additionally rotated 90° by `ForcedLandscapeWrapper`, compounding the effect.

**Where to look:**

- `apps/web/src/components/2d/layout-2d.ts` — `CONTAINER_TRANSFORMS`, `seatConfig()`
- `apps/web/src/components/2d/GameTable2D.tsx` / `DesktopGameTable2D.tsx` / `MobileGameTable2D.tsx` — where `containerTransform` is applied to each seat zone
- `apps/web/src/components/2d/SeatLabel2D.tsx`, `OpponentBadge2D.tsx`, `MobilePlayerBadge2D.tsx` — nameplate/score text (note: BUG-042 already moved seat labels out of the rotated zone into a `SeatHUD` overlay; confirm the playtest build predates that and that names/scores are now upright)
- `apps/web/src/components/2d/DiscardPool2D.tsx`, `MahjongTile2D.tsx` — discard tiles inherit the zone rotation

**Approach options (pick after a design decision):**

- Counter-rotate text-bearing elements inside each rotated zone so glyphs stay upright while tile _positions_ keep the table feel, or
- Render side-seat discards/tiles upright (no per-seat rotation), accepting a less "physical table" look in exchange for readability — which is what the testers explicitly asked for.

**Trade-off:** Rotation gives a realistic around-the-table feel; the testers prioritise readability. Recommend defaulting to upright text at minimum; consider upright tiles too.

---

### IMP-027 · Thirteen Misfits eligibility hint in rules / gameplay

**Reported by:** Playtest #1 (2026-06-13) — a tester spent several rounds unable to win a Thirteen Misfits hand and was unsure whether the app even supported it (it does). They eventually resolved their confusion by reading the in-app rules, which is a good signal that the rules screen is discoverable — but a targeted hint would have saved the frustration.

**Symptom:** Thirteen Misfits is a complex, easy-to-misjudge hand. Players don't realise it must be fully concealed (no chow/pung/kong), the same-suit gap must be > 2, and — pending the BUG-047 decision — that jing tiles may not count toward it.

**Status:** OPEN — instructional improvement (depends on BUG-047 outcome for the jing wording)

**Suggested change:** Add a short tip/callout on the Learn page's Hands/Hu (胡牌) section and/or a one-line note near the Thirteen Misfits example reminding players of the eligibility constraints (concealed, gap > 2, unique honors, and the jing rule once confirmed). Keep EN/ZH key parity. Reference the existing Learn page tile examples.

**Where to look:**

- `apps/web/src/pages/learn/` — Hands / Hu (胡牌) tab content
- `apps/web/src/i18n/en.json` + `zh.json` — add paired keys
- `docs/final-nanchang-mahjong-rules.md` §5.2 — source wording

---
