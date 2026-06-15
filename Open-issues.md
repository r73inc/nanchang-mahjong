# Open Issues & Improvements

This document tracks all open bugs and improvements. Bugs (BUG-XXX) are code that is broken or behaving incorrectly. Improvements (IMP-XXX) are enhancements to existing features or new additions that do not warrant a full phase in the roadmap.

For phases, planning, and roadmap work see `Plan-and-roadmap.md`. For issues that are known but not actively planned, see `Deferred-issues.md`.

---

## Quick Reference

| ID      | Name                                     | Summary                                                                                                               |
| ------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| BUG-045 | Bot dice roll animation not visible      | Bot roll animation and result flash by in under a frame; human roll works correctly                                   |
| BUG-049 | Hand not visible in settlement (PC)      | On desktop, the player cannot see their own hand during the settlement phase                                          |
| BUG-050 | Spirit settlement uses old glyph         | Second table in end-of-round detail still renders the `节` glyph, not the spirit tile                                 |
| BUG-051 | Discard blocked after declining win      | After drawing a winning tile and pressing "keep playing", no tile can be discarded                                    |
| BUG-052 | Palette preview tiles use active palette | All three Tile Face cards in Customize render tiles using the active palette, not their own                           |
| BUG-061 | Mobile hand clipped at bottom            | On mobile, the player's hand is intermittently half cut off at the bottom of the screen for an entire hand            |
| BUG-062 | Fixed-hands session never ends           | A room set to 1-hand fixed-hands mode does not terminate after the hand; "Continue" is shown instead of "End Session" |
| IMP-032 | Global sound toggle                      | Add an always-available sound on/off toggle next to the language toggle                                               |

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

### BUG-061 · Mobile player hand half cut off at bottom of screen (intermittent)

**Symptom:** On mobile devices (tested in a play-with-friends session), the player's own hand tiles were half cut off at the bottom of the screen. The clipping persisted for the entire hand and resolved itself at the start of the next hand. The trigger and device model were not isolated during the playtest.

**Status:** OPEN — reported playtest 2026-06-15.

**Suspected causes:**

1. **`100dvh` layout shift (most likely):** `ForcedLandscapeWrapper` sizes itself using `width: calc(100dvh - ...)` in css-landscape mode. On iOS Safari and some Android browsers, `dvh` (dynamic viewport height) updates lazily as the browser address bar appears or disappears. If the initial `dvh` snapshot is taken while the browser chrome is still visible but then the chrome hides mid-hand, the wrapper's effective CSS height becomes stale. Combined with `overflow: hidden` on the wrapper, the bottom portion of the hand container can be clipped. Because `dvh` does not re-trigger a layout recalculation automatically (unlike `100%` of a parent that resizes), the stale measurement can persist for the entire hand.

2. **ResizeObserver race on first mount:** `PlayerHand2D` uses a `useLayoutEffect` + `ResizeObserver` to set `--mj-hand-height = el.offsetHeight` on `:root`. If `offsetHeight` is `0` on the very first paint (the element is not yet in the painted layout), the CSS variable is written as `0px`. Subsequent mounts on the next hand re-measure correctly. This would misplace overlays above the hand but would not itself clip the tiles.

3. **`env(safe-area-inset-*)` axis remapping:** In css-landscape mode, `ForcedLandscapeWrapper` remaps safe-area insets to the rotated axes (physical top → `--mj-safe-left`, physical bottom → `--mj-safe-right`, physical left → `--mj-safe-bottom`). If the inset values are not yet available (they are `0px` on first paint on some browsers) the hand is positioned correctly, but if a non-zero value later propagates it could shift the hand below the visible area. Unlikely to explain the "persists for one hand" duration, but worth ruling out.

**Where to look:**

- `apps/web/src/components/2d/ForcedLandscapeWrapper.tsx` — `100dvh` calculation and `overflow: hidden`; consider adding a resize listener that updates the height on viewport change events, or switching to `100svh` (smallest viewport height) which doesn't change as chrome shows/hides.
- `apps/web/src/components/2d/PlayerHand2D.tsx:180–197` — `useLayoutEffect` / `ResizeObserver` for `--mj-hand-height`; verify `el.offsetHeight` is non-zero on first mount.
- `apps/web/src/components/2d/MobileGameTable2D.tsx:348–360` — viewer hand container; `bottom: var(--mj-safe-bottom, 0px)`.

**Reproduction note:** Trigger was not isolated. The bug may require a specific browser (iOS Safari is most likely due to its lazy `dvh` update), a device with a large home indicator or address bar, and a particular orientation change sequence at game start.

---

### BUG-062 · Fixed-hands (1-hand) session does not terminate after the single hand

**Symptom:** A play-with-friends room was configured with `terminationType: 'fixed-hands'` and `maxHands: 1` (via the room settings UI — three hard bots filled the other seats). After completing the one hand, the hand-reveal details screen showed only the "Continue Playing Next Hand →" button with no indication the session was over. Pressing it started a second hand rather than ending the session.

**Status:** OPEN — reported playtest 2026-06-15.

**Root cause (suspected):** The room settings schema declares `maxHands` as optional (`z.number().int().min(1).max(4).optional()`). When the host selects the "Fixed Hands" termination type in the room page but never explicitly clicks a `maxHands` count button, the setting remains `undefined` in the database. The room-page UI masks this by displaying `room.settings.maxHands ?? 1` — visually showing "1" — but the underlying stored value is `undefined`.

In `game.service.ts:createGame()` (line ~167):

```ts
targetHands:
  challengeOpts?.numHands ??
  (settings.terminationType === 'fixed-hands' ? settings.maxHands : undefined),
```

When `settings.maxHands` is `undefined`, `targetHands = undefined`.

In `isSessionOver()` (line 1517):

```ts
if (session.targetHands !== undefined) {
  return session.handsPlayed >= session.targetHands;
}
```

Since `targetHands === undefined`, this branch is skipped. None of the `'bust'` or `'rounds'` branches apply to `'fixed-hands'`, so `isSessionOver` always returns `false`. Consequently `isLastHand = false` in the `HandRevealPayload`, causing the client to show "Continue" instead of "End Session" and to start a new hand on advance.

**Fix needed:**

Apply the same `?? 1` default in `createGame()` that the UI already uses for display:

```ts
// Before (broken when maxHands not explicitly set):
(settings.terminationType === 'fixed-hands' ? settings.maxHands : undefined)(
  // After (matches UI default of 1):
  settings.terminationType === 'fixed-hands' ? (settings.maxHands ?? 1) : undefined,
);
```

Alternatively, write `maxHands: 1` as the default to the database when the host selects `fixed-hands` (in `room.schemas.ts` via `.default(1)`) so the stored value is always defined.

**Where to look:**

- `apps/api/src/game/game.service.ts:167` — `targetHands` assignment in `createGame()`; apply `?? 1`.
- `packages/shared/src/room.schemas.ts:34` — `maxHands` field; consider adding `.default(1)` so the Zod schema always coerces `undefined` to `1` when `terminationType === 'fixed-hands'`.
- `apps/api/src/game/game.service.ts:1509–1548` — `isSessionOver()`; no change needed once `targetHands` is set correctly.
- `apps/web/src/pages/room/room-page.tsx:658–684` — host UI; confirm the default selection sends an explicit `maxHands: 1` when `fixed-hands` is chosen, rather than relying on the fallback.

---

## Open Improvements

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
