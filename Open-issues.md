# Open Issues & Improvements

This document tracks all open bugs and improvements. Bugs (BUG-XXX) are code that is broken or behaving incorrectly. Improvements (IMP-XXX) are enhancements to existing features or new additions that do not warrant a full phase in the roadmap.

For phases, planning, and roadmap work see `Plan-and-roadmap.md`. For issues that are known but not actively planned, see `Deferred-issues.md`.

---

## Quick Reference

| ID      | Name                                  | Summary                                                                                                                                                                          |
| ------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BUG-045 | Bot dice roll animation not visible   | Bot roll animation and result flash by in under a frame; human roll works correctly                                                                                              |
| BUG-049 | Hand not visible in settlement (PC)   | On desktop, the player cannot see their own hand during the settlement phase                                                                                                     |
| BUG-050 | Spirit settlement uses old glyph      | Second table in end-of-round detail still renders the `节` glyph, not the spirit tile                                                                                            |
| IMP-028 | Drop "You" labels everywhere          | Highlight already identifies the viewer; redundant "You" tags should be removed                                                                                                  |
| IMP-029 | Settlement tiles in dropdown          | Show a tile glyph per settlement tile each player holds in the expanded breakdown                                                                                                |
| IMP-030 | Use winner name as detail heading     | Replace generic "Someone Won!" title with the actual winning player's name                                                                                                       |
| IMP-031 | Rank + score breakdown at hand end    | Sort players by points gained (desc) and add a per-player score breakdown dropdown                                                                                               |
| IMP-032 | Global sound toggle                   | Add an always-available sound on/off toggle next to the language toggle                                                                                                          |
| IMP-033 | Learn page: textures + content audit  | Migrate all tiles to MahjongTile2D and audit content for accuracy                                                                                                                |
| IMP-034 | Customize page: texture tile preview  | Tile palette preview strip still uses legacy text tiles; migrate to MahjongTile2D                                                                                                |
| IMP-035 | Replay page: migrate to tile textures | 4 MahjongTile usages in the replay viewer, step callout, discard and timeline panels                                                                                             |
| IMP-036 | History & replays are undiscoverable  | History page is not linked from any in-app navigation; players cannot find replays                                                                                               |
| IMP-037 | Adjustable hand tile size (Customize) | Older players with large OS font settings find hand tiles overflow off screen on mobile; add a tile-size slider/selector in Customize — **HIGH PRIORITY VIP playtester request** |
| IMP-038 | Auto-sort drawn tile into hand        | Drawn tile always appends to the right end of the hand; players want it inserted in its sorted position — **HIGH PRIORITY VIP playtester request**                               |

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

**Notes:** Today the dropdown shows transfer _lines_ (received/paid amounts) with one tile per line. The request is a per-player at-a-glance count of held settlement tiles.

**Implementation constraint — do NOT repeat SVG glyphs.** Rendering one `MahjongTile2D` per copy held (e.g. 7 tiles in a row) will break the mobile flex container and cause horizontal scrolling on narrow viewports. The count must always be displayed as a **"Tile + Count" format**: one `MahjongTile2D` (size `xs`) followed by a `×N` label. For example: `[2m tile] ×4` and `[3m tile] ×2`. This applies regardless of how many copies a player holds. Decide whether this augments the main (collapsed) row or the expanded block.

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

- Header: `[Win type: Tsumo / Discard / Bystander]` — "Discard" only when `liableSeat === this seat`; "Bystander" when ron but this seat did not discard.
  _(requires `liableSeat` added to `HandRevealPayload` — see backend note below)_
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
/**
 * The single seat liable for the full win payment.
 * - Ron: the seat that discarded the winning tile.
 * - Rob-kong: the seat whose promoted kong was robbed (mechanically identical
 *   to a discard — the rob-konger pays all three shares as if they discarded).
 * - Tsumo: undefined (all losers share payment; no single liable seat).
 */
liableSeat?: 0 | 1 | 2 | 3;
/** True when the win was a rob-kong (抢杠). Used for UI labeling only — does
 *  not change payment logic; liableSeat already points to the konger. */
isRobKong?: boolean;
```

Using a single `liableSeat` rather than separate `discarderSeat` / `kongSeat` fields keeps the frontend simple: the breakdown UI only needs to check `liableSeat === thisSeat` to know whether this player is the primary payer. There is no defensive branching required to handle the rob-kong case separately. `isRobKong` is retained solely so the UI can label the win type as "Rob Kong" instead of "Discard."

In `apps/api/src/game/game.service.ts`, where `HandRevealPayload` is constructed, derive `liableSeat` from the `ScoringContext` already computed at win time: `liableSeat = ctx.isRobKong ? ctx.kongSeat : ctx.discarderSeat`. This is a plumbing change only — no engine logic needed.

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

### IMP-037 · Adjustable hand tile size in Customize page ⚠️ HIGH PRIORITY — VIP playtester request

**Request (verbatim, translated):** "If the mahjong tiles could be made smaller, it would be more convenient for us to play. Our eyesight is blurry from age and we normally set the phone text large. Yesterday when we were playing mahjong the tiles didn't fit; we had to turn the phone font size down to make them fit."

**Context:** An older playtester has the system-level OS font size increased (common accessibility setting on iOS/Android). This causes the hand tiles to overflow the viewport on mobile — they either get clipped or the player is forced to shrink their OS font, which degrades their general phone usability. The ask is for an in-app tile size control so the player can reduce tile size independently of their OS font without losing their accessibility settings everywhere else.

**Status:** OPEN — HIGH PRIORITY

**Proposed solution:** Add a tile size selector to the Customize page with at least four levels: Small / Default / Large / X-Large. Store the chosen size in the `ThemeStore` (persisted to `localStorage`) and apply it as a CSS custom property (`--tile-scale` or a concrete `--tile-size-px` set) so all hand tile renderers pick it up automatically without prop drilling. The control should primarily affect the player's own hand in the game (the biggest pain point), but applying it globally to all `MahjongTile2D` instances (melds, discard pool) is acceptable as a first pass.

**Where to look:**

- `apps/web/src/stores/theme.store.ts` — add `tileSize: 'sm' | 'md' | 'lg' | 'xl'` (default `'md'`) alongside the existing `felt` and `tilePalette` fields. Add it to the `applyTheme()` call if theme vars are written there, or write a separate `applyTileSize()` helper.
- `apps/web/src/pages/customize/customize-page.tsx` — add a size-selector row, modelled on the felt colour swatches. Four labelled options with a visual preview of how tile size changes. EN + ZH labels required.
- `apps/web/src/components/2d/MahjongTile2D.tsx` — the `size` prop currently accepts `'xs' | 'sm' | 'md' | 'lg'`; confirm what pixel widths those map to and how a global CSS var could scale them (e.g. wrapping with a `transform: scale(var(--tile-scale))` or adjusting the passed `size` prop based on the store value).
- `apps/web/src/pages/game/game-page.tsx` — wherever the viewer's hand tile row is rendered; this is the highest-impact location and should be the primary test surface.
- `apps/web/src/i18n/en.json` + `zh.json` — add keys for the size-selector labels (e.g. `customizeTileSize`, `customizeTileSizeSm`, `customizeTileSizeMd`, `customizeTileSizeLg`, `customizeTileSizeXl`).

**Implementation notes:**

- A CSS `transform: scale()` approach lets the tile DOM size stay fixed (avoiding layout reflow in flex containers) at the cost of potential clipping at container edges — test carefully on narrow viewports.
- Alternatively, the store value could directly map to a wider range of `size` prop values passed down the component tree; simpler but requires touching every call site.
- The selector should appear in the Customize page only (not the Home settings section, which is already getting a sound toggle via IMP-032). The persisted value takes effect immediately on every page via the CSS var.
- For Phase 12B, confirm this doesn't conflict with the `prefers-reduced-motion` work already planned.

---

### IMP-038 · Auto-sort drawn tile into its correct position in the hand ⚠️ HIGH PRIORITY — VIP playtester request

**Request (verbatim, translated):** "I have a suggestion: when you draw a tile it should go into its category/group, so it's easier to see your hand and play. Yesterday when playing mahjong the drawn tile could only be placed off to the side, and it was very tiring to look through all the tiles to find matches."

**Context:** In physical mahjong (and the current app) the tile you just drew always sits at the far right of your hand, separate from your sorted tiles. This makes sense in physical play (it's the tile you're deciding whether to discard) but on a small mobile screen it is disorienting — the player has to mentally re-scan their whole hand to assess the new tile's fit. Older players with any visual fatigue find this especially taxing. The request is for the drawn tile to be inserted at the correct sorted position automatically.

**Status:** OPEN — HIGH PRIORITY

**Proposed solution:** When rendering the viewer's hand tiles, instead of appending the drawn tile at the right end (index N), compute its correct sorted position and render it inline. Sorting should match the existing tile-ordering convention used elsewhere in the engine (`packages/engine/src/utils.ts` or wherever the canonical sort is defined) — suit order (bamboo → circles → characters → honours) then rank ascending within suit. This is a **display-only, client-side change** — the server never needs to know about the visual sort order, and the "last drawn tile" identity (needed for discard, for highlighting, for accessibility) must still be trackable even after being visually reordered.

**Where to look:**

- `apps/web/src/pages/game/game-page.tsx` — look for where the viewer's hand array is assembled before being passed to the hand renderer. The `drawnTile` (or equivalent last-drawn tracking) is likely kept separate from `concealedTiles`; the fix is to merge and sort them into one array before rendering, keeping a reference to which tile is the drawn one so it can still be highlighted.
- `apps/web/src/components/3d/TileHand3D.tsx` — the 3D hand renderer; how it receives and lays out hand tiles. The drawn tile may already be passed as a separate prop (`drawnTile`?) that gets appended — change the layout logic so it is inserted at its sorted index instead.
- `apps/web/src/hooks/use-game.ts` — where `tile_drawn` socket events are handled; confirm what state is updated and how the drawn tile is made available to the hand renderer.
- `apps/web/src/stores/game.store.ts` — confirm whether `drawnTile` is stored separately or merged into the hand array. If it is stored separately, the sort merge can be done in a selector/computed value derived in `use-game.ts` rather than in the component.
- `packages/engine/src/utils.ts` (or equivalent) — find the canonical `compareTiles` / `sortHand` function so the client-side display sort matches the engine's tile ordering exactly.

**Implementation notes:**

- The "drawn tile" highlight (the visual indicator showing which tile you just drew) must still work after the tile is re-positioned. Track the drawn tile by its identity (tile type value), not by array index, since the index will change after sorting.
- If two tiles of the same type exist in the hand (e.g. you draw a second 2-bamboo), insert the new one adjacent to the existing one — prefer inserting at the rightmost position among same-type tiles so the "just drawn" one is visually distinguishable.
- Ensure the accessibility hand (`AccessibleHand` sr-only buttons) also reflects the sorted order, so keyboard/screen-reader users benefit equally.
- The discard action must continue to send the correct tile identity to the server regardless of visual order — confirm that the tile's `TileType` value is passed, not its visual index.
- No backend changes required for this feature.

---
