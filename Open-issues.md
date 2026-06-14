# Open Issues & Improvements

This document tracks all open bugs and improvements. Bugs (BUG-XXX) are code that is broken or behaving incorrectly. Improvements (IMP-XXX) are enhancements to existing features or new additions that do not warrant a full phase in the roadmap.

For phases, planning, and roadmap work see `Plan-and-roadmap.md`. For issues that are known but not actively planned, see `Deferred-issues.md`.

---

## Quick Reference

| ID      | Name                                     | Summary                                                                                     |
| ------- | ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| BUG-045 | Bot dice roll animation not visible      | Bot roll animation and result flash by in under a frame; human roll works correctly         |
| BUG-049 | Hand not visible in settlement (PC)      | On desktop, the player cannot see their own hand during the settlement phase                |
| BUG-050 | Spirit settlement uses old glyph         | Second table in end-of-round detail still renders the `节` glyph, not the spirit tile       |
| BUG-051 | Discard blocked after declining win      | After drawing a winning tile and pressing "keep playing", no tile can be discarded          |
| BUG-052 | Palette preview tiles use active palette | All three Tile Face cards in Customize render tiles using the active palette, not their own |
| IMP-032 | Global sound toggle                      | Add an always-available sound on/off toggle next to the language toggle                     |
| IMP-038 | Auto-sort drawn tile — not working       | Toggle + store shipped; drawn tile still stays at far right in 2D mode for all users        |

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

### BUG-051 · Discard blocked after declining tsumo win

**Symptom:** During a playtest, a player drew a tile that completed a winning hand. The "Declare Win" prompt appeared. The player pressed "Keep Playing" to decline the win. After that, no tile could be discarded — the hand was stuck. The "Declare Win" button remained pressable, but the player could not continue by discarding.

**Status:** OPEN — critical gameplay bug, reported playtest 2026-06-14.

**Suspected cause:** When the client receives the self-draw win offer, it enters a state where the action buttons include "Declare Win" and "Keep Playing". After pressing "Keep Playing", the expected behaviour is to fall back to the normal discard phase (the player holds 14 tiles and must discard one). The likely failure modes are:

1. The server does not send a new `game:snapshot` after the decline, leaving the client in the `tsumo-win-pending` action phase with no discard buttons mounted.
2. The client-side action reducer does not transition back to the `discard` phase on a "keep playing" action, so `ActionBar` never renders the discard UI.
3. The server correctly transitions but the decline socket event is never acknowledged / the phase update is swallowed.

**Where to look:**

- `apps/api/src/game/game.service.ts` — handler for the "decline tsumo" / "keep playing" event; confirm it calls `toClientSnapshot` and emits `game:snapshot` back to the decliner.
- `apps/web/src/hooks/use-game.ts` — `handleDeclineTsumo` (or equivalent) client event emitter; confirm the round-trip snapshot is processed.
- `apps/web/src/pages/game/game-page.tsx` — `ActionBar` / action-phase logic; confirm that phase `'discard'` renders discard buttons after the decline.
- `apps/web/src/stores/game.store.ts` — action phase derivation; confirm declining a tsumo win sets `actionPhase` back to `'discard'`.

---

### BUG-052 · Customize palette cards show tiles using the active palette instead of their own

**Symptom:** In the Customize page, the Tile Face section shows three preview cards (Classic, Sepia, Dark). Each card should display sample tiles rendered in _that card's own_ palette so the player can compare them. Instead, all three cards show tiles rendered in the currently-selected palette — e.g. if Dark is active, all three card previews show dark tiles.

**Status:** OPEN — visual bug, reported playtest 2026-06-14.

**Root cause:** `PaletteCard` renders `MahjongTile2D`, which builds its tile-face gradient from the global CSS custom properties `--tile-face-top` and `--tile-face-bottom`. These are written to `:root` by `applyTheme()` using the _current_ active palette only. All three cards inherit the same global values.

**Fix:** Pass the card's own `TilePalette` id into `PaletteCard` and scope the CSS vars to the preview strip by wrapping it in a `<div>` with inline `style={{ '--tile-face-top': cfg.faceTop, '--tile-face-bottom': cfg.faceBottom }}`. CSS custom properties cascade, so `MahjongTile2D`'s `var(--tile-face-top)` will pick up the scoped override rather than the global root value.

**Where to look:**

- `apps/web/src/pages/customize/customize-page.tsx` — `PaletteCard` component (line ~107) and its call site (line ~279).
- `apps/web/src/lib/theme.utils.ts` — `TILE_CONFIGS` (already exported) provides `faceTop`/`faceBottom` per palette.

---

## Open Improvements

### IMP-038 · Auto-sort drawn tile into hand — CRITICAL VIP ASK ⛔

**Request:** When `autoSortDrawnTile` is enabled, the tile drawn at the start of a turn should be inserted into its canonical sorted position rather than appended at the far right. Requested by older VIP playtesters who find visual re-scanning of the full hand tiring.

**Status:** OPEN — ⛔ CRITICAL. Toggle UI and store plumbing shipped in PR #142. The sort does not trigger for end users in 2D mode. Multiple fix attempts in PR #143 (branch `fix/imp038-autosort-regression`) failed to resolve the issue.

**What is in place (working):**

- `autoSortDrawnTile: boolean` in `ThemeStore` (persisted, default `false`).
- Customize page toggle + EN/ZH labels — setting saves and loads correctly.
- `LocalEntry { id, tile, serverIndex, isJustDrawn }` and `mergeLocalOrder()` in `PlayerHand2D.tsx` — the data model is correct.
- Gold dot (`isJustDrawn` flag) marker for the drawn tile — renders correctly when sort fires.
- `prevHandKeyRef` (content-based change detection) and `prevToggleRef` (mid-game toggle re-sort) guards — logic is correct.
- `!isMobile` guard on `ViewerHandHUD` — correctly suppresses the desktop 3D hand overlay on mobile so it cannot intercept touches (3D mode mobile fix).
- `ViewerHandHUD` sort effect with dual-ref pattern — desktop 3D mode sort is in place.

**What is not working:**

The sort effect in `PlayerHand2D.tsx` is not producing a visible reorder when a tile is drawn in 2D mode. The tile stays at the far right of the hand as if `autoSortDrawnTile` were `false`. This affects both mobile 2D and any desktop 2D session.

**Fix attempts in PR #143 (all failed to resolve the end-user symptom):**

1. Switched `setLocalOrder` from direct call to functional setter `(prev) => ...` — no change from user perspective.
2. Added `!isMobile` guard to `ViewerHandHUD` — only relevant for 3D mobile mode, which uses a different code path.
3. Added `prevToggleRef` to guard — fixed a toggle deadlock but not the draw sort.
4. Reverted to `localOrderRef.current` + synchronous `setLocalOrder(nextOrder)` — same end-user result; sort still not visible.

**Suspected remaining causes (not yet investigated):**

- The `useEffect` dependency array `[viewerHand, autoSortDrawnTile]` — verify that `viewerHand` identity actually changes when a new tile is drawn (snapshot arrives). If the array is referentially stable (same object), the effect will not re-run even though content changed. Add a `console.log` inside the effect to confirm it is firing at all.
- `mergeLocalOrder` may be discarding the new entry. Check whether `viewerHand.length > localOrder.length` at the moment the effect fires, and whether the new tile's `id` is being generated and appended correctly.
- Framer Motion `Reorder.Group` animation — the sort may be applying (state is correct) but the animation may be reverting to the original visual order. Temporarily disable the Reorder component (replace with a plain div) to confirm whether the state is correct but Framer Motion is overriding it.
- The `Reorder.Group` `values={localOrder}` prop — if Framer Motion internally debounces or batches layout changes and `onReorder` fires between renders with the old order, the state could be overwritten. Test with `draggable={false}` (i.e. force `onReorder={() => undefined}`) to isolate.
- Confirm `autoSortDrawnTile` is `true` inside the effect when the draw fires — add a log to verify the store value is being read correctly from within the component.

**Where to look:**

- `apps/web/src/components/2d/PlayerHand2D.tsx:231-255` — the sort `useEffect` (currently using `localOrderRef.current` + synchronous setState).
- `apps/web/src/components/2d/PlayerHand2D.tsx` — `mergeLocalOrder()` function — verify it appends new tiles correctly.
- `apps/web/src/stores/game.store.ts` — how `viewerHand` is derived from the snapshot; check object identity on each snapshot update.
- `apps/web/src/hooks/use-game.ts` — `game:snapshot` handler; check whether a new array reference is produced for `viewerHand` on every snapshot.

**PR #143 status:** Safe to merge (all changes are client-side display logic, no game state affected). But IMP-038 remains unresolved. A fresh investigation session is required with browser devtools open to confirm whether the effect fires and whether the state update is applied.

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
