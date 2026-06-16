# Open Issues & Improvements

This document tracks all open bugs and improvements. Bugs (BUG-XXX) are code that is broken or behaving incorrectly. Improvements (IMP-XXX) are enhancements to existing features or new additions that do not warrant a full phase in the roadmap.

For phases, planning, and roadmap work see `Plan-and-roadmap.md`. For issues that are known but not actively planned, see `Deferred-issues.md`.

---

## Quick Reference

| ID      | Name                                                      | Summary                                                                                                                                                     |
| ------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BUG-045 | Bot dice roll animation not visible                       | Bot roll animation and result flash by in under a frame; human roll works correctly                                                                         |
| BUG-049 | Hand not visible in settlement (PC)                       | On desktop, the player cannot see their own hand during the settlement phase                                                                                |
| BUG-050 | Spirit settlement uses old glyph                          | Second table in end-of-round detail still renders the `节` glyph, not the spirit tile                                                                       |
| BUG-051 | Discard blocked after declining win                       | After drawing a winning tile and pressing "keep playing", no tile can be discarded                                                                          |
| BUG-052 | Palette preview tiles use active palette                  | All three Tile Face cards in Customize render tiles using the active palette, not their own                                                                 |
| BUG-053 | Hand-type win labels may show untranslated in ZH          | "All Triplets" and other special hand-type labels reported untranslated on the hand-reveal screen                                                           |
| BUG-054 | Spirit tile screen shows raw tile codes                   | Pre-game Spirit reveal description interpolates raw engine tile codes instead of translated tile names                                                      |
| BUG-055 | Cannot declare a kong dealt in the opening hand           | A concealed kong formed entirely from the original 13/14 dealt tiles (no draw involved) cannot be revealed                                                  |
| BUG-056 | Session end conditions unreliable outside Point Challenge | Bust and Fixed Rounds termination modes are suspected to not reliably end the match; only Point Challenge (fixed-hands) has been confirmed to end correctly |
| IMP-032 | Global sound toggle                                       | Add an always-available sound on/off toggle next to the language toggle                                                                                     |
| IMP-033 | "Waiting…0 not ready" wording                             | Room lobby's not-ready count message reads awkwardly and is not descriptive                                                                                 |
| IMP-034 | Info button placement too close to options                | "End Condition" and "Claim Window" info buttons sit too close to the first choice button                                                                    |
| IMP-035 | Friend search clear "X" not visible                       | The native browser search-input clear icon is low-contrast and hard to see                                                                                  |
| IMP-036 | Bot names not localized                                   | MilkyBot / MelonBot / FifthBot show their English names in both EN and ZH locales                                                                           |

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

### BUG-053 · Hand-type win labels may show untranslated in ZH

**Symptom:** Reported during playtest: "All Triplets" (and possibly other special hand-type labels — Seven Pairs, Thirteen Misfits, Seven Star Thirteen) appeared in English on the hand-reveal/winning screen while the rest of the UI was in Chinese.

**Status:** OPEN — needs live re-verification; code on this branch already looks correct (see below).

**Investigation so far:** `apps/web/src/pages/game/game-page.tsx:509-517` derives `handTypeLabel` via `t('handTypeSevenPairs')`, `t('handTypeAllTriplets')`, `t('handTypeThirteenMisfits')`, `t('handTypeSevenStarThirteen')`, and both `apps/web/src/i18n/en.json:380-383` and `apps/web/src/i18n/zh.json:380-383` already contain single, correctly-translated entries for all four keys (e.g. `handTypeAllTriplets` → `"大七对"`). No duplicate/overriding keys were found. This is the only place in the web app that renders `handType` (`game-page.tsx:597`, `692`).

**Suspected cause:** Either (a) the reported behaviour was observed against a production build that predates these translations (production on `main` may lag behind `pre-prod`/this branch — see Phase 13 deployment notes), or (b) there is a runtime i18n fallback issue (e.g. language code mismatch) that this static read-through can't detect.

**Where to look:**

- Confirm which build/environment the playtester was using (prod vs. local dev vs. this branch) before assuming the bug is still present.
- `apps/web/src/i18n/index.tsx` — language detection / fallback logic, in case `t()` falls back to English for these specific keys only under some condition.
- If reproducible on this branch, re-check for a second render path (e.g. push notification text, history list) that might construct the label from `handType` without going through `t()`.

---

### BUG-054 · Spirit tile reveal screen shows raw tile codes instead of translated names

**Symptom:** On the pre-game Spirit (Jing) reveal screen, the description text under the heading shows the spirit tiles' raw internal identifiers (e.g. `5s`, `zhong`) rather than a human-readable, translated tile name (e.g. "5 Bamboo" / "5條").

**Status:** OPEN

**Root cause:** `apps/web/src/pages/game/game-page.tsx:301` calls `t('gameSpiritDesc', primary ?? '', secondary ?? '')`, passing the raw `TileType` engine string directly as the interpolated value. `gameSpiritDesc` in both `en.json:299` and `zh.json:299` is just a template (`"{{0}} and {{1}} are tonight's wildcards"` / `"{{0}} 和 {{1}} 是本局精牌"`) — it has no way to translate the tile code itself, so the raw code (e.g. `5s`) is shown verbatim regardless of locale.

**Fix needed:** Pass `tileAriaLabel(primary, lang)` / `tileAriaLabel(secondary, lang)` (from `packages/shared/src/tile-map.ts:124`, which already has full EN/ZH name tables) into the `t('gameSpiritDesc', ...)` call instead of the raw `TileType` strings, using the current i18n language.

**Where to look:**

- `apps/web/src/pages/game/game-page.tsx:287-303` — the `phase === 'jing'` reveal screen.
- `packages/shared/src/tile-map.ts:61-96` — `ARIA_LABELS` table and `tileAriaLabel()` already provide the correct EN/ZH text.
- Check `MobileJingButton` (`game-page.tsx:2825` onward) and any other place that surfaces spirit tile names as plain text for the same issue.

---

### BUG-055 · Cannot declare a kong dealt entirely in the opening hand

**Symptom:** If a player is dealt all 4 copies of a tile type in their original hand (13 tiles for non-dealers, 14 for the dealer) — i.e. the kong is already complete before they have drawn anything new this hand — they are unable to reveal/declare the concealed kong.

**Status:** OPEN — critical gameplay bug, reported by user.

**Investigation so far:** The engine itself (`packages/engine/src/calls.ts:98` `concealedKongOptions()`, and `packages/engine/src/engine.ts:1013` `kongConcealed()`) does not appear to special-case "kong already complete in the dealt hand" — `concealedKongOptions` only checks raw tile counts (≥4 naturals, or 4 jing copies for Spirit Kong) and is covered by unit tests including a hand shorter than 14 tiles (`packages/engine/src/__tests__/calls.test.ts:271`). `kongConcealed()` only requires `phase === 'playing'` and `seatIdx === currentSeat`, both of which are true for the dealer immediately after `revealJing()` (the dealer already holds 14 tiles dealt by `deal()`, see `engine.ts:399-400`).

The most likely failure point is the **frontend trigger path**: `apps/web/src/pages/game/game-page.tsx:3364` `handleDiscardOrKong()` only evaluates kong options at the moment the player selects a tile and attempts to discard it — there is no proactive "you have a kong available" prompt shown independent of a discard attempt. If a player's very first action this hand is expected to just be "select and discard", this should still trigger the kong-options sheet (`setKongActionPending`, line 3390) for the dealt kong tile — but this needs to be confirmed against the actual UI flow for both the dealer's first turn (no preceding `draw` event) and a non-dealer's first turn.

**Where to look:**

- `apps/web/src/pages/game/game-page.tsx:3360-3396` — `handleDiscardOrKong`, the only client-side entry point for concealed-kong detection; confirm `isMyTurn` (`game-page.tsx:3321`) and `viewerHand` are populated correctly on the very first turn of a hand, before any `draw` event has been received by this client.
- `apps/api/src/game/game.service.ts:1644` — `handleKongConcealed()` socket handler; confirm it isn't implicitly gated on a prior `draw` action having occurred this turn.
- Confirm whether bots ever attempt to declare a concealed kong at all — no bot-side kong logic was found in `apps/api/src` during this investigation, which may be a related/separate gap.
- **Fix scope per request:** also audit all other kong paths (open kong via discard claim, add-to-kong, rob-kong, instant kong payouts) for similar edge cases once the opening-hand case is understood, to ensure no other kong logic errors exist.

---

### BUG-056 · Session end conditions unreliable outside Point Challenge mode

**Symptom:** User does not trust that a match correctly ends when the configured number of hands/rounds is reached, or — in Bust mode — when a player's score goes negative. Only Point Challenge (fixed-hands) mode has been observed to end correctly in practice; Bust mode and Fixed Rounds mode are suspected to not end reliably.

**Status:** OPEN — critical, needs dedicated QA pass across all termination types.

**Investigation so far:** The pure decision function `GameService.isSessionOver()` (`apps/api/src/game/game.service.ts:1901-1940`) has unit test coverage for all three termination types (`apps/api/src/game/game-session-over.spec.ts`) and looks correct in isolation:

- **Bust:** only triggers when `nextDealerInfo.roundComplete` is true AND a cumulative score is negative (deliberately ignores mid-round negative dips from spirit settlement).
- **Rounds:** checks `engine.state.roundWind` (the round that just finished) against the configured `rounds` option, gated on `roundComplete`.
- **Point Challenge:** `targetHands` overrides both of the above and is the only path confirmed working by the user.

The `roundComplete` flag itself comes from `nextDealer()` (`packages/engine/src/engine.ts:86-114`): it only becomes `true` when the dealer rotation completes a full cycle back to seat 0, and the dealer **retains** their seat (no rotation, `roundComplete` always `false`) whenever they win or the hand is a draw. This means a round can run far longer than 4 hands if the dealer keeps winning — which is correct per the rules, but worth confirming the user isn't interpreting this as "the round/match isn't ending" when it is in fact still mid-round by the rules.

**Suspected cause(s) to rule out:**

1. `nextDealer()`'s "dealer retains → `roundComplete: false`" behavior extending rounds indefinitely in ways that look like a hang to a player who expects the round to end after exactly 4 hands.
2. A discrepancy between the unit-tested pure `isSessionOver()` logic and the actual call site (`game.service.ts:1747-1752`) — e.g. is `nextDealerInfo` always computed from the correct pre- or post-hand `dealerSeat`/`roundWind`?
3. Whether `endSession()` (`game.service.ts:1975`) and the `game:ended` broadcast reliably fire once `isLastHand` is true, for both Bust and Rounds termination types specifically (the advance handler at `game.service.ts:935-959` is termination-type-agnostic, so this is less likely but unconfirmed).

**Where to look:**

- `apps/api/src/game/game.service.ts:1901-1940` (`isSessionOver`), `:1747-1752` (call site), `:935-959` (advance/end trigger).
- `packages/engine/src/engine.ts:86-114` (`nextDealer`).
- `apps/api/src/game/game-session-over.spec.ts` — existing unit coverage; add integration-level tests that play out full Bust and Fixed Rounds sessions end-to-end (not just the pure decision function) to confirm the match actually terminates and `game:ended` is emitted.

---

## Open Improvements

### IMP-033 · "Waiting…0 not ready" wording on the create-room/lobby page

**Request:** On the room page, when fewer than 4 players have joined/readied, the host's start-button label reads "Waiting… 0 not ready" — this wording is confusing/unclear, especially when the count is 0 (which actually means "waiting for seats to fill", not "0 players are not ready").

**Status:** OPEN

**Where to look:**

- `apps/web/src/pages/room/room-page.tsx:883` — `` `${t('waiting')} ${filledSeats.filter(...).length} ${t('notReady').toLowerCase()}` `` builds this string from three separate i18n keys (`waiting`, `notReady`) rather than one descriptive sentence.
- `apps/web/src/pages/room/room-page.test.tsx:119-126` — existing test asserts on the current "Waiting… N not ready" button text; will need updating alongside any wording change.

**Notes:** Consider distinct messaging for "seats not yet filled" vs. "players seated but not marked ready", and add a single composed i18n key (with `{{count}}` interpolation) for both EN and ZH rather than concatenating fragments.

---

### IMP-034 · Info button placement too close to the first option (End Condition / Claim Window rows)

**Request:** The small circular info (`?`) buttons next to "End Condition" and "Claim Window" labels sit too close to the first choice button in the option group on the same row, making them easy to misclick.

**Status:** OPEN

**Investigation so far:** Both rows use `flex justify-between items-center` to split the row into a left label+`InfoButton` span (`gap-1` = 4px between label and button) and a right-hand `flex gap-1.5` button group (`apps/web/src/pages/room/room-page.tsx:541-603` for End Condition, `:694-759` for Claim Window). Because `justify-between` only guarantees spacing between the two flex children as a whole, there's no enforced minimum gap between the `InfoButton` and the first option button — on narrower viewports the available "between" space shrinks and the two visually crowd together.

**Where to look:**

- `apps/web/src/pages/room/room-page.tsx:45-65` — `InfoButton` component (14×14px circular button).
- `apps/web/src/pages/room/room-page.tsx:546-549` (End Condition label+info), `:699-702` (Claim Window label+info).

**Notes:** Same `InfoButton` pattern is used on other rows (View Mode, Rounds, Opening Spirit Flip) — check whether they have the same crowding issue or whether End Condition/Claim Window are unique due to longer label text or more option buttons.

---

### IMP-035 · Friend search clear "X" not visible

**Request:** In the Friends search bar, the small "X" used to clear the search text is hard to see.

**Status:** OPEN

**Root cause:** `apps/web/src/pages/friends/friends-page.tsx:202-209` uses a native `<input type="search">` with no custom clear button — the "X" the user sees is the browser's own default search-clear affordance, which is small and low-contrast against the app's dark theme and isn't styled by the app at all.

**Fix needed:** Replace the native search-clear icon with a custom, app-styled clear button (absolutely positioned inside the input, similar to how the `Spinner` is already positioned at `friends-page.tsx:210-214`), shown only when `searchInput` is non-empty, that calls `handleSearch('')`.

**Where to look:**

- `apps/web/src/pages/friends/friends-page.tsx:201-215` — search input + existing spinner overlay pattern to follow.

---

### IMP-036 · Bot display names not localized

**Request:** Bot names (MilkyBot, MelonBot, FifthBot) should show a translated/localized name in Chinese rather than the English name in both locales. Use: MilkyBot = 葫芦机器人, MelonBot = 西瓜机器人, FifthBot = 第五机器人.

**Status:** OPEN

**Where to look:**

- `packages/shared/src/bot-profiles.ts:14-16` — `name: 'MilkyBot'`, `'MelonBot'`, `'FifthBot'` are currently hard-coded plain strings used directly as the display name (not i18n keys).
- `apps/api/src/game/game-session.ts:98` and `apps/api/src/rooms/rooms.service.ts:97` — bot display name is set server-side as `seatNames[i]` and sent to all clients as plain text, not a translation key — so the server would need to either send a bot-id/locale-aware name, or the client would need to map known bot names to i18n keys for display.
- `apps/web/src/i18n/en.json` / `zh.json` — no existing `botName*` keys; will need new entries.

**Notes:** Since bot names are baked into the session as plain display strings server-side (visible to all 4 seats regardless of each viewer's locale), this likely needs either (a) the client mapping bot IDs (`milkybot`/`melonbot`/`fifthbot`) to localized names at render time instead of trusting the server-sent `seatNames` string for bot seats, or (b) the server resending per-viewer-localized names — (a) is simpler and avoids per-viewer snapshot divergence.

---

**Request:** Add a sound on/off toggle next to the language (translations) toggle so sound can be turned on or off at all times, from anywhere in the app.

**Status:** OPEN

**Where to look:**

- `apps/web/src/i18n/index.tsx:77` — `LangToggle` component (the translations toggle).
- `apps/web/src/components/ui/screen-shell.tsx:51` — `<LangToggle />` rendered in the shared header; also inline at `apps/web/src/pages/auth/auth-page.tsx:176` and `apps/web/src/pages/game/game-page.tsx:2700`.
- `apps/web/src/stores/theme.store.ts` — `soundEnabled` state (currently toggled on Home and Customize pages).
- `apps/web/src/hooks/use-sound.ts` — sound playback gate.

**Notes:** Build a small `SoundToggle` that reads/writes `soundEnabled` from the theme store and place it adjacent to `LangToggle` wherever that renders (ideally the shared `ScreenShell` header, so it's available globally). Keep the existing Home/Customize toggles in sync via the same store. Add an `aria-label` mirroring `LangToggle`'s accessibility treatment.

---
