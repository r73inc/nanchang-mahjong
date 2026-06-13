# Open Issues & Improvements

This document tracks all open bugs and improvements. Bugs (BUG-XXX) are code that is broken or behaving incorrectly. Improvements (IMP-XXX) are enhancements to existing features or new additions that do not warrant a full phase in the roadmap.

For phases, planning, and roadmap work see `Plan-and-roadmap.md`. For issues that are known but not actively planned, see `Deferred-issues.md`.

---

## Quick Reference

| ID      | Name                                   | Summary                                                                               |
| ------- | -------------------------------------- | ------------------------------------------------------------------------------------- |
| BUG-045 | Bot dice roll animation not visible    | Bot roll animation and result flash by in under a frame; human roll works correctly   |
| BUG-049 | Hand not visible in settlement (PC)    | On desktop, the player cannot see their own hand during the settlement phase          |
| BUG-050 | Spirit settlement uses old glyph       | Second table in end-of-round detail still renders the `节` glyph, not the spirit tile |
| IMP-028 | Drop "You" labels everywhere           | Highlight already identifies the viewer; redundant "You" tags should be removed       |
| IMP-029 | Settlement tiles in dropdown           | Show a tile glyph per settlement tile each player holds in the expanded breakdown     |
| IMP-030 | Use winner name as detail heading      | Replace generic "Someone Won!" title with the actual winning player's name            |
| IMP-031 | Rank + score breakdown at hand end     | Sort players by points gained (desc) and add a per-player score breakdown dropdown    |
| IMP-032 | Global sound toggle                    | Add an always-available sound on/off toggle next to the language toggle               |
| IMP-033 | Learn page: textures + content audit   | Migrate all tiles to MahjongTile2D and audit content for accuracy                     |
| IMP-034 | Customize page: texture tile preview   | Tile palette preview strip still uses legacy text tiles; migrate to MahjongTile2D     |
| IMP-035 | Replay page: migrate to tile textures  | 4 MahjongTile usages in the replay viewer, step callout, discard and timeline panels  |
| IMP-036 | History & replays are undiscoverable   | History page is not linked from any in-app navigation; players cannot find replays    |
| BUG-051 | Jing tiles transformed in hand reveal  | Wildcards silently replaced by the tile they substituted; must never be transformed   |
| BUG-052 | 精 label misaligns jing tiles (mobile) | Jing label adds height below tile, breaking flex alignment in meld groups on mobile   |

---

## Open Bugs

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

### BUG-049 · Player's own hand not visible during settlement phase — PC/desktop

**Symptom:** On PC (desktop browser), the player cannot see their own hand while the game is in the settlement phase. Reported during playtest.

**Status:** OPEN

**Suspected cause:** The settlement phase (`preGamePhase === 'settlement'`, the bonus-tile payout step shown only under `ruleTopBottomJing`) renders the `SettlementPreview` component as a **full-screen takeover** that occupies the whole viewport and never renders the viewer's concealed hand. This is fine on mobile (small screen, sequential flow) but on a wide PC screen there is ample room to show the hand alongside the settlement table, and players expect it to remain visible.

**Where to look:**

- `apps/web/src/pages/game/game-page.tsx:261` — `if (phase === 'settlement')` branch returns `<SettlementPreview .../>` full-screen with no hand.
- `apps/web/src/components/game/SettlementPreview.tsx` — full-screen settlement layout; does not render the viewer hand.

**Approach:** Either render the viewer's hand within `SettlementPreview` (e.g. a bottom hand rail on wide viewports), or keep the game table mounted underneath and overlay the settlement summary rather than replacing the screen. Confirm whether the same is expected for the pre-game `bonus`/`jing` reveal steps.

---

### BUG-050 · End-of-round detail "second table" still renders the old `节` glyph

**Symptom:** In the end-of-round detail screen (`HandRevealScreen`), the spirit settlement breakdown — the second table on the page — still shows the text glyph `节` (`节×N`) instead of the actual spirit tile texture used elsewhere in the app.

**Status:** OPEN

**Suspected cause:** The spirit settlement rows use a hard-coded `JING_CHAR = '节'` constant rather than rendering the real spirit tile (`handReveal.jingPrimary` / `handReveal.jingSecondary`) via `MahjongTile2D`. Other tables on the same screen already render the correct tile textures.

**Where to look:**

- `apps/web/src/pages/game/game-page.tsx:73` — `const JING_CHAR = '节'` (and `MULT_CHAR`).
- `apps/web/src/pages/game/game-page.tsx:543-544` — spirit-count rows rendering `${JING_CHAR}${MULT_CHAR}${counts.primary}` etc.

**Fix needed:** Remove the `节` glyph entirely (it is incorrect). Render the spirit tile itself as `MahjongTile2D` (size `xs`, `isJing`) followed by the `×N` count, matching the tile-texture treatment used in the rest of the reveal screen. Per CLAUDE.md, all tiles must use `MahjongTile2D`. The `JING_CHAR` constant can be retired once it has no remaining usages.

---

### BUG-051 · Jing/wildcard tiles silently transformed in the hand reveal meld display

**Symptom:** In the end-of-round hand reveal screen, when a wildcard (jing) tile completed a meld, that tile is displayed as the natural tile it substituted rather than as its actual identity. For example, if a primary jing tile completed a pung of `2m`, the meld renders three `2m` tiles — the wildcard tile has vanished. Tiles must **never** be transformed in any way in this game. The wildcard must be shown as what it actually is.

**Status:** OPEN

**Root cause — engine:** `tryMelds` in `packages/engine/src/hand.ts` fills wildcard positions by writing the target natural tile into the meld's `tiles` array. Pung wildcards at lines 120–125 and 131–135 produce `[first, first, first]` regardless of how many actual jing tiles were used; chow wildcards in `tryChow` (line 75) produce `[t1, t2, t3]` (the natural sequence). The wildcard tile's type identity is never recorded. `decomposeConcealed` (called from `game-page.tsx:642`) inherits this — the returned `Decomposition.melds[].tiles` arrays contain only natural tile types.

**Root cause — display:** `HandRevealScreen` in `apps/web/src/pages/game/game-page.tsx:641–651` uses `decomp.melds[i].tiles` directly to render each group. The `isJing()` check (line 632–633) tests whether a tile's type matches the jing primary/secondary types; since the substituted tiles are natural types, the check returns `false` and the tiles get no gold treatment either — both the identity and the wildcard indicator are lost.

**Fix required — display level (preferred, no engine change):**

After calling `decomposeConcealed(hand, jingTypes)`, reconstruct each meld's tile array by matching from the **original hand** (which contains the actual jing tile types). Algorithm:

1. Copy `hand` into a mutable pool: `let pool = [...hand]`.
2. For each meld in `decomp.melds`:
   - For each tile position in `meld.tiles` (the substituted/natural version):
     - If that natural tile exists in `pool` AND is not a jing type → take it from `pool`.
     - Otherwise → take a jing tile from `pool` (primary first, then secondary).
   - Collect the resulting tile types as the rendered meld tiles.
3. Apply the same logic to the pair: `[decomp.pair, decomp.pair]` → match from remaining `pool`, replacing one slot with a jing tile when `decomp.jingPair === true`.

This reconstruction is purely a display-layer concern and does not affect game logic, scoring, or the engine.

**Where to change:**

- `apps/web/src/pages/game/game-page.tsx:641–651` — replace the direct `decomp.melds.map(m => ({ tiles: [...m.tiles] }))` with the reconstruction function above.
- Add a helper `reconstructMeldTiles(decomp, hand, jingTypes)` near the `greedyGroupHand` helper (around line 343) so the IIFE stays readable.

**Note:** Once tiles are correctly preserved, `isJing(tile)` will return `true` for jing tiles in the correct positions and the gold border/glow treatment (`MahjongTile2D` `isJing` prop) will work automatically without any additional changes.

---

### BUG-052 · 精 label below jing tiles breaks vertical alignment in meld groups on mobile

**Symptom:** On mobile (narrow viewport), in the end-of-round hand reveal screen, when a meld contains a jing (wildcard) tile, the tiles within the meld group do not line up correctly. The jing tile sits lower or the row height is uneven compared to adjacent natural tiles.

**Status:** OPEN

**Root cause:** `MahjongTile2D` renders the `精` character in a `flex-column` beneath the tile face when `isJing={true}` and `showJingLabel={true}` (the default) — see `apps/web/src/components/2d/MahjongTile2D.tsx:308–321`. This adds extra height to the jing tile's container. Inside the meld row (`<div className="flex gap-0.5">` in `game-page.tsx:682`), this taller container misaligns tiles on mobile where tile sizes are small and the label's pixel height is significant relative to tile height.

**Fix options (pick one):**

1. **Suppress the label in meld context (simplest):** Pass `showJingLabel={false}` to all `MahjongTile2D` calls inside the hand reveal meld groups (lines 684–691 and 702–709 of `game-page.tsx`). The gold border + glow from `isJing={true}` still clearly identifies wildcards. This is the recommended fix — the label is redundant when the tile's own gold treatment makes it obvious.

2. **Absolutely position the label:** In `MahjongTile2D.tsx:308–321`, change the `精` span to `position: absolute; bottom: calc(100% + 2px)` (or below) so it floats outside the tile's flow height and does not contribute to the container's layout dimensions. This fixes alignment globally but risks the label being clipped by ancestor `overflow: hidden` containers.

**Dependency:** Fix BUG-051 first — once wildcards display as actual jing tiles, the gold glow alone is sufficient to identify them. Option 1 (suppress label) is then the right call and BUG-052 is trivially resolved by passing `showJingLabel={false}` in the meld context.

---

## Open Improvements

### IMP-028 · Remove redundant "You" labels from settlement / score / reveal screens

**Request:** Drop the "You" tag shown next to the viewer's own row across the settlement, scoring, and reveal screens. The viewer's row is already visually highlighted (gold background/border), so the explicit "You" label is redundant.

**Status:** OPEN

**Where to look:**

- `apps/web/src/components/game/SettlementPreview.tsx:203-207` — `{t('preGameYou')}` on the viewer row.
- `apps/web/src/pages/game/game-page.tsx:497` and `:591` — `{t('preGameYou')}` in the score summary and per-hand reveal rows.
- i18n key `preGameYou` (`apps/web/src/i18n/en.json`, `zh.json`) — remove usages; retire the key if it becomes unused.

**Notes:** Keep the gold highlight as the sole "this is you" affordance. Sweep for any other `preGameYou` usages before removing the key. Ensure tests that assert on the "You" text are updated.

---

### IMP-029 · Show settlement tiles per player in the expanded breakdown

**Request:** On the settlement screen, when a player row is expanded, show a small mahjong tile glyph for each settlement tile that player holds, so a viewer can tell at a glance which players hold how many of each settlement tile.

**Status:** OPEN

**Where to look:**

- `apps/web/src/components/game/SettlementPreview.tsx` — `buildTransferLines()` (lines 45-104) builds the expanded per-player rows; the expanded block (lines 246-263) already renders one `MahjongTile2D` per transfer line.

**Notes:** Today the dropdown shows transfer _lines_ (received/paid amounts) with one tile per line. The request is a per-player at-a-glance count of held settlement tiles — i.e. render the player's `seatCounts` / `nextTileSeatCounts` as repeated tile glyphs (or a tile + count). Decide whether this augments the main (collapsed) row or the expanded block. Use `MahjongTile2D` (size `xs`).

---

### IMP-030 · Use the winning player's name as the end-of-round detail heading

**Request:** In the end-of-round detail screen, the big heading currently reads a generic result ("Someone Won!") with the actual winner's name in smaller text below. Replace the generic heading with the actual winning player's name as the primary (large) text.

**Status:** OPEN

**Where to look:**

- `apps/web/src/pages/game/game-page.tsx:445-450` — `resultLabel` derives `t('handRevealResultWin')` = "Someone Won!".
- `apps/web/src/pages/game/game-page.tsx:460-465` — `<h1>` renders `resultLabel`; the winner name (`t('handRevealWinner', ...)`) is the smaller `<p>` below.
- i18n keys `handRevealResultWin` ("Someone Won!"), `handRevealWinner` ("{{0}} wins this hand").

**Notes:** For a win, promote the winner's name (and/or a "{name} wins!" string) to the `<h1>`. Preserve the concede/draw cases, which have no single winner. Keep EN/ZH parity.

---

### IMP-031 · Unified sorted hand-result table with full per-player score breakdown

**Request:** Replace the current two-table layout (hand score summary + separate spirit settlement table) with a single unified table. Sort all four players by their total net change this hand (most gained → top). Each row expands to show a full, human-readable breakdown of exactly where every point came from and where every point was paid away to, and why — including which multipliers applied, which players held how many spirit tiles, and what kongs contributed.

**Status:** OPEN

**This is a high-value feature.** The scoring model is non-obvious to new players; a clear breakdown turns every hand into a teaching moment and builds confidence in the game's integrity.

---

**Unified table design (collapsed row)**

Each player gets one row showing:

- Wind character + name (with winner badge if applicable)
- Single signed total: `handNetDeltas[i]` (= win payment + kong payout + spirit settlement combined)
- A chevron if the row has any breakdown content

Sort rows descending by `handNetDeltas[i]`. The viewer's own row keeps its gold highlight. No separate spirit table — it is folded into the expanded breakdown per row.

---

**Expanded breakdown — three sections per player**

**Section 1 — Win payment** (only when `result === 'win'`; skip for draw/concede)

_For the winner:_

- Header: `Won by [Tsumo / Ron]` — with hand type badge if not standard (e.g. "Seven Pairs", "All Triplets", "Thirteen Misfits", "Seven Star Thirteen Misfits")
- Multiplier chain — one chip per item in `winPayment.items`:
  `Base 1 × [Seven Pairs ×2] × [Dealer ×2] → Total ×4`
  Each chip shows the EN name and the ZH name below it.
  German/True German flat bonus shown separately: `+5 flat per loser`
- Payment received line per loser:
  `[PlayerB]: +8` (tsumo: multiplier × 2 + flat; ron-discarder: multiplier × 2 + flat; ron-bystander: multiplier × 1 + flat)
- Total received: `+[winnerTotal]`

_For a loser:_

- Header: `[Win type: Tsumo / Discard / Bystander]` — "Discard" only when `discarderSeat === this seat`; "Bystander" when ron but this seat did not discard.
  _(requires `discarderSeat` added to `HandRevealPayload` — see backend note below)_
- Win formula as a single line: `[WinnerName]: paid [amount]` with the reason:
  `Self-draw: ×4 (multiplier ×2 × dealer-loser ×2)` or `Discarded: ×8 (…)` or `Bystander: ×4 (…)`
- Concede case: `Conceded — paid [amount] (flat settlement)`

**Section 2 — Spirit settlement** (shown for every seat; omit section entirely only when all four `spiritDeltas` are 0)

- For each other player that has non-zero effective spirit score, show one line:
  `[PlayerA]: [±amount]` with the cause:
  `Primary ×N (×2 each) + Secondary ×N (×1 each) → effective [E] → paid/received [amount]`
  Special cases noted inline: `Explosive (raw≥5: raw×(raw−3))` and `Indomitable (only holder, ×2)`.
- Net spirit total for this seat: `Spirit net: [±spiritDelta]`

_These amounts are fully frontend-derivable from `spiritCounts[i]` (already in the payload) using the same formula as `calculateSpiritSettlement` in `packages/engine/src/scoring.ts:290-323`. No backend change needed for spirit attribution._

**Section 3 — Kongs** (only when `kongDelta[i] !== 0`)

- `Kong payouts: [±amount]`
- Explanation: `Declared [N] concealed kong(s) (+2 each) / open kong(s) (+1 each)` or `Paid [N] kongs to [PlayerX]`
- _Kong delta is frontend-derivable: `handNetDeltas[i] − (winPayment?.scoreDelta[i] ?? 0) − spiritDeltas[i]`._
- The per-kong direction (who declared, which type) is not granularly available in the payload — show the net with an explanation of the sign. A future payload enhancement could break this down per kong event.

---

**Backend additions required (shared + API, scope to a separate PR)**

One new field needed on `HandRevealPayload` in `packages/shared/src/game.events.ts`:

```ts
/** Seat that discarded the winning tile (ron only; undefined for tsumo/rob-kong). */
discarderSeat?: 0 | 1 | 2 | 3;
/** True when the win was a rob-kong (抢杠). */
isRobKong?: boolean;
/** The seat whose kong was robbed (present when isRobKong is true). */
kongSeat?: 0 | 1 | 2 | 3;
```

In `apps/api/src/game/game.service.ts`, where `HandRevealPayload` is constructed, populate these from the `ScoringContext` already computed at win time. The engine already tracks `discarderSeat`, `isRobKong`, and `kongSeat` in `ScoringContext` — this is a plumbing change only, no engine logic needed.

---

**Frontend implementation notes**

- `apps/web/src/pages/game/game-page.tsx:473-515` — replace the current score summary with the new unified sorted table.
- `apps/web/src/pages/game/game-page.tsx:517-565` — remove the separate spirit settlement section; fold it into the per-row breakdown.
- Add a `buildHandBreakdown(seat, handReveal, snapshot)` helper function near the other helpers (around line 343) to keep the IIFE clean. This function returns the three sections above as structured data, not JSX, so it is testable.
- Mirror the expand/collapse UX from `SettlementPreview` (`apps/web/src/components/game/SettlementPreview.tsx:120-124`) — one `useState<number | null>` for the expanded seat.
- Spirit effective-score calculation should be extracted into a shared helper or duplicated from `packages/engine/src/scoring.ts:295-313` — do NOT import the scoring function directly from the engine into the frontend; re-derive it in a small frontend utility or add it to `@nanchang/shared` exports.
- **i18n:** All multiplier item names already have `name` (EN) and `nameZh` (ZH) in `MultiplierItem`. All new breakdown labels need EN + ZH keys added to `apps/web/src/i18n/en.json` and `zh.json`.
- Keep the existing `MahjongTile2D` tile rendering for spirit tiles in the expanded section.
- **PR scope:** Sort-only change is FE-only and can ship independently. The full breakdown is a larger PR touching shared types, API, and FE — keep it as one PR per scope discipline, not split across three.

---

### IMP-032 · Always-available global sound toggle next to the language toggle

**Request:** Add a sound on/off toggle next to the language (translations) toggle so sound can be turned on or off at all times, from anywhere in the app.

**Status:** OPEN

**Where to look:**

- `apps/web/src/i18n/index.tsx:77` — `LangToggle` component (the translations toggle).
- `apps/web/src/components/ui/screen-shell.tsx:51` — `<LangToggle />` rendered in the shared header; also inline at `apps/web/src/pages/auth/auth-page.tsx:176` and `apps/web/src/pages/game/game-page.tsx:2700`.
- `apps/web/src/stores/theme.store.ts` — `soundEnabled` state (currently toggled on Home and Customize pages).
- `apps/web/src/hooks/use-sound.ts` — sound playback gate.

**Notes:** Build a small `SoundToggle` that reads/writes `soundEnabled` from the theme store and place it adjacent to `LangToggle` wherever that renders (ideally the shared `ScreenShell` header, so it's available globally). Keep the existing Home/Customize toggles in sync via the same store. Add an `aria-label` mirroring `LangToggle`'s accessibility treatment.

---

### IMP-033 · Learn page: migrate to tile textures and audit content for accuracy

**Request:** The Learn Nanchang Mahjong page needs two things: (1) all tile examples must be migrated from the deprecated text-glyph component to `MahjongTile2D`, and (2) the content itself should be reviewed and updated to be accurate for the current ruleset.

**Status:** OPEN

**Where to look:**

- `apps/web/src/pages/learn/learn-page.tsx:13` — imports `MahjongTile` from `../../components/mahjong-tile` (deprecated).
- `apps/web/src/pages/learn/learn-page.tsx:129, 149, 251, 261, 294, 322` — 8 `<MahjongTile>` usages across the Tiles, Spirit, Gameplay, and Hands tabs; each must become `<MahjongTile2D>`.
- `docs/final-nanchang-mahjong-rules.md` — authoritative rules reference; use this to audit and correct any stale or inaccurate content on the Learn page.

**Notes:** Per CLAUDE.md, this is a migration that was deferred until the page was touched for a new feature — that moment is now. After migrating tiles, cross-check every rule description, example hand, and scoring explanation against `docs/final-nanchang-mahjong-rules.md`. Update EN + ZH i18n keys for any corrected text. Retire the `MahjongTile` import once no usages remain in this file. Ensure the existing Learn tests still pass, and add/update tests for any changed content.

---

### IMP-034 · Customize page: migrate tile palette preview to tile textures

**Request:** The tile palette preview strip on the Customize page shows example tiles using the legacy text-glyph component. It should use `MahjongTile2D` (SVG textures) so the preview actually reflects what players will see during play.

**Status:** OPEN

**Where to look:**

- `apps/web/src/pages/customize/customize-page.tsx:12` — imports `MahjongTile` from `../../components/mahjong-tile` (deprecated).
- `apps/web/src/pages/customize/customize-page.tsx:217` — `<MahjongTile key={tile} tile={tile} size="sm" />` inside the "Live tile preview" block (line 208); this is the only usage.

**Notes:** A one-line import swap and component name change is all that is needed for the tile. Verify the `size="sm"` prop mapping is correct for `MahjongTile2D`. Per CLAUDE.md, any time one of the legacy pages is touched for a new feature or refactor this migration is mandatory — the text-based tile is deprecated and should be removed from this file entirely.

---

### IMP-035 · Replay page: migrate all tile rendering to tile textures

**Request:** The replay page still uses the deprecated text-glyph `MahjongTile` component in four places across the replay viewer. All must be migrated to `MahjongTile2D` (SVG textures).

**Status:** OPEN

**Where to look — all usages in `apps/web/src/pages/replay/replay-page.tsx`:**

- Line 19 — `import { MahjongTile } from '../../components/mahjong-tile'` (swap to `MahjongTile2D`).
- Line 253 — hand viewer tile strip: `<MahjongTile tile={tile} size="sm" />` (winning tile highlighted with a gold box-shadow wrapper; preserve that wrapper, only swap the component).
- Line 305 — current step callout: `<MahjongTile tile={step.event.tile as TileType} size="xs" />` (rendered inside the action event panel when a tile is associated with the current step).
- Line 390 — discard pile panel: `<MahjongTile key={n} tile={tile} size="xs" />` (last 10 discards per seat).
- Line 469 — timeline event list: `<MahjongTile tile={s.event.tile as TileType} size="xs" />` (tile shown alongside each event in the scrub timeline).

**Additional cleanup (same PR):**

- `apps/web/src/pages/game/game-page.tsx:25` — dead import `import { MahjongTile } from '../../components/mahjong-tile'`; the component is never rendered in this file. Remove it.
- `apps/web/src/pages/game/game-page.test.tsx:18` — imports `MahjongTile` for a standalone `describe('MahjongTile', ...)` block (lines 655-707) that tests the legacy component's aria and click behaviour. These tests belong in `apps/web/src/components/mahjong-tile.test.tsx` (which already exists) or can be migrated to test `MahjongTile2D` equivalents. Remove the import and the describe block from `game-page.test.tsx`; ensure coverage is not lost.

**Notes:** Once IMP-033, IMP-034, and IMP-035 are all complete, `MahjongTile` from `components/mahjong-tile.tsx` will have zero production callers and can be deleted along with `mahjong-tile.test.tsx`. Confirm with a project-wide grep for `mahjong-tile` before deleting.

---

### IMP-036 · History and replays are completely undiscoverable

**Request:** Players have no way to find their game history or replays from within the app. The History page (`/history`) is a registered route and the Replay page (`/replay/:id`) works, but neither is reachable from any in-app navigation link. The only way to access them today is to type the URL directly in the browser address bar.

**Status:** OPEN

**Root cause:** The Home page `NAV_ITEMS` array (`apps/web/src/pages/home/home-stub-page.tsx:13-18`) lists four shortcuts — Profile, Friends, Learn, Customize — but History is absent. There is no link to `/history` anywhere else in the app (confirmed by project-wide grep). The `HistoryPage` navigates to `/replay/:id` correctly once reached, but the page itself is a dead end.

**Fix needed — two entry points:**

1. **Home page nav grid** — add a History shortcut to `NAV_ITEMS` in `apps/web/src/pages/home/home-stub-page.tsx:13`. Use an appropriate icon (e.g. `📜`) and the existing i18n key `historyTitle` (or add `historyLink` to match the pattern of `profileLink`, `friendsLink` etc.). This is the primary entry point.

2. **Game end screen** — after a session ends, the `GameEndScreen` component (`apps/web/src/pages/game/game-page.tsx`, search for `GameEndScreen`) shows results and a rematch button. Add a secondary "View Replay" link/button that navigates to `/replay/${gameId}` so players can jump straight to the replay of the session they just finished without having to go via History. The `gameId` is available from the game store at that point.

**i18n:** `historyTitle` already exists (`apps/web/src/i18n/en.json`). A new `historyLink` key (short label for the nav grid) may be needed in both EN and ZH if `historyTitle` is too long for the 4-column grid chip. Check against `profileLink`, `friendsLink` etc. for the expected label length.

---
