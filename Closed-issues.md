# Closed Issues & Improvements

This document details all closed bugs (BUG-XXX) and completed improvements (IMP-XXX) with their root causes, fixes, and key learnings. Organized chronologically by PR/branch.

For phases, planning, and roadmap work see `Plan-and-roadmap.md`.

---

## `fix/last-discard-duplicate-pulse` (2026-06-13)

### BUG-053 · Last-discard red outline highlights multiple tiles when the same tile type appears more than once in a seat's discards

**Root cause:** All three discard pool components (`DiscardPool2D`, `CombinedDiscardPool2D`, `MobileDiscardPool2D`) identified the "last discarded tile" using only `seat + tile type`:

```ts
const isPulse = lastDiscard?.seat === seatIdx && lastDiscard?.tile === tile;
```

During a `discards.map()` / `entries.map()` pass, this matched every occurrence of that tile type in the discard array — not just the most recently added one. When a player discarded the same tile type as a previous discard in their own pile, every earlier matching tile also received the pulse outline.

**Fix (`apps/web/src/components/2d/DiscardPool2D.tsx`, `CombinedDiscardPool2D.tsx`, `MobileDiscardPool2D.tsx`):**

Added a position guard — the last discarded tile is always the final entry in the discard array:

- `DiscardPool2D`: `&& i === discards.length - 1`
- `CombinedDiscardPool2D` / `MobileDiscardPool2D`: `&& posInSeat === seats[seatIdx].discards.length - 1`

The tile-type check is retained as a fast-path guard; the position check ensures only the actual last tile is highlighted regardless of duplicates.

**Tests added:** Two regression tests in `last-discard-pulse.test.tsx` — one for `MobileDiscardPool2D` and one for `CombinedDiscardPool2D` — verify that exactly one pulse appears when the same tile type has been discarded twice.

**Key learnings:**

- Matching by tile type alone is insufficient as a unique tile identifier in a discard pool — the same type can appear multiple times. Always combine type with position (last index) to identify the most recently discarded tile.
- The existing BUG-020 tests only covered unique tile types per seat, so this variant slipped through. Future regression tests for visual state selectors should include duplicate-tile scenarios.

---

## `fix/bug-051-052-jing-meld-display` (2026-06-13)

### BUG-051 · Jing/wildcard tiles silently transformed in the hand reveal meld display

**Root cause:** `tryMelds` and `tryChow` in `packages/engine/src/hand.ts` record every meld's tile positions as the natural target tile, even when a jing wildcard filled that slot. For example, a pung of `2m` where one position was filled by the primary jing tile records `[2m, 2m, 2m]` — the jing's actual type is never stored. `decomposeConcealed` (display-only, not scoring) inherits this; the returned `Decomposition.melds[].tiles` arrays contain only natural tile types.

`HandRevealScreen` used `decomp.melds[i].tiles` directly to render each meld group. Because no tile in the array matched `jingPrimary`/`jingSecondary`, the `isJing()` check returned `false` for every tile, the jing tile's actual identity was completely replaced by the natural tile, and no gold border/glow was applied — both identity and the wildcard indicator were lost.

**Fix (`apps/web/src/pages/game/game-page.tsx`):**

Added a `reconstructMeldTiles(decomp, hand, jingTypes)` helper (placed after `greedyGroupHand`). After calling `decomposeConcealed`, it reconstructs the actual tile identities by pool-matching from the original hand (which still holds real jing tile types). For each meld position with natural target `T`: if `T` is available in the pool, take it (it was actually `T`); otherwise a jing tile must have been used — take the first available jing from the pool. The same logic handles the pair, with `jingPair` from the decomposition indicating whether one slot was a wildcard. The winner decomposition path now calls `reconstructMeldTiles` instead of using `decomp.melds.map(m => m.tiles)` directly.

**Key learnings:**

- The engine's `tryMelds`/`tryChow` record melds as all-natural-tile arrays for algorithmic simplicity. Any display layer that needs to show actual tile identities (including wildcard tiles) must reconstruct them from the original hand, not the decomposition tile arrays.
- A greedy pool-reconstruction algorithm is sufficient for the end-screen hand reveal: which of two `2m` positions is natural vs. jing may be ambiguous, but both wildcard positions are shown correctly and the gold glow highlights the right number of wildcards. Exact physical tile tracking would require engine-level wildcard position storage (deferred until animated replay).
- Once tile types are correctly preserved, `isJing(tile)` returns `true` automatically for jing tiles, and the `MahjongTile2D` gold treatment works with no additional changes.

---

### BUG-052 · 精 label below jing tiles breaks vertical alignment in meld groups on mobile

**Root cause:** `MahjongTile2D` renders the `精` character in a `flex-column` beneath the tile face when `isJing={true}` and `showJingLabel={true}` (the default). This adds extra height to the jing tile's container. Inside the meld rows in `HandRevealScreen` (`<div className="flex gap-0.5">`), this taller jing container misaligned adjacent tiles on mobile where tile sizes are small and the label's pixel height is significant relative to tile height.

**Fix (`apps/web/src/pages/game/game-page.tsx`):**

Passed `showJingLabel={false}` to all `MahjongTile2D` calls inside the hand reveal meld groups (grouped tiles and ungrouped remainder). The gold border + glow from `isJing={true}` clearly identifies wildcards without the label. The fix was made possible by BUG-051 being resolved first — once wildcards display as their actual jing tile type (with gold treatment), the `精` label is redundant.

**Key learnings:**

- `showJingLabel` defaults to `true` for contexts where the label adds useful identity information (e.g. when a tile is shown in isolation). In dense meld groups where the gold glow already identifies wildcards, suppress it with `showJingLabel={false}` to keep tile rows vertically aligned.

---

## `fix/bug-047-imp-027-thirteen-misfits-seven-pairs` (2026-06-13)

### BUG-047 · Thirteen Misfits (十三烂) unwinnable when a Jing tile overlaps the pattern

**Root cause:** `checkThirteenMisfits` in `packages/engine/src/hand.ts` called `separateJing` before checking the hand, then immediately returned `false` if `jingCount > 0`. This meant that if any tile in the player's 14-tile hand happened to be a Jing type (primary or secondary spirit), it was silently stripped from the naturals array before the misfit gap check ran — making the hand undetectable as Thirteen Misfits regardless of how valid the pattern was.

The Nanchang rules (§5.2) say Thirteen Misfits "must be concealed." There is no rule against Jing tiles appearing in the hand at face value. The restriction was an incorrect implementation assumption introduced when the check was first written.

**Fix (`packages/engine/src/hand.ts`):**

- Changed `checkThirteenMisfits` to accept the raw 14-tile hand (`hand: TileType[]`) instead of post-separated `(naturals, jingCount)`.
- Removed the `if (jingCount > 0) return false` guard entirely.
- The check now reads tile face values directly — a Jing tile sitting at a valid misfit position (gap > 2 from its neighbours in the same suit) counts as its natural type.
- Updated `isWinningHand` to pass the raw hand: `checkThirteenMisfits(hand)`.

**Fix (`packages/engine/src/engine.ts`):**

- `detectHandType` — the no-standard-decomposition branch previously used a raw pair-count heuristic (`pairCombos >= 7`) to distinguish Seven Pairs from Thirteen Misfits, which silently mis-classified Seven Pairs hands where a Jing wildcard completed the 7th pair (the raw count doesn't show ≥2 for a jing-completed pair). Replaced with `checkSevenPairs(naturals, jingCount)` using the proper jing-aware logic.
- Added a Seven Pairs check in the _has-decompositions_ path: a concealed hand whose consecutive pairs can also form standard chows was being classified as `'standard'` (×1) instead of `'seven_pairs'` (×2). The new code prefers `seven_pairs` when the full hand qualifies.
- `isGerman` — Thirteen Misfits never uses Jing tiles as wildcards (every tile sits at face value). Changed `isGerman = winJings === 0` to `true` for `thirteen_misfits` / `seven_star_thirteen` hand types so players holding Jing tiles at face value in their misfit hand correctly qualify for German.

**Key learnings:**

- `separateJing` must NOT be called before `checkThirteenMisfits`. Thirteen Misfits is a face-value pattern check, not a wildcard decomposition.
- `detectHandType` must use the exported `checkSevenPairs` (with jing handling) for Seven Pairs classification, not a raw tile-count heuristic.
- A Seven Pairs hand can produce valid standard chow decompositions (e.g. two pairs of consecutive tiles become a double chow). `detectHandType` must always prefer `seven_pairs` over `standard` when the hand qualifies and is fully concealed.
- `isGerman` should reflect "zero wildcards used," not "zero Jing tiles held." Thirteen Misfits uses zero wildcards by definition, so German applies even when the player holds Jing tiles.

---

### IMP-027 · Thirteen Misfits eligibility hint on Learn page

**Fix (`apps/web/src/pages/learn/learn-page.tsx`):** Added a gold-tinted callout under the Thirteen Misfits card in the Hands tab explaining that Spirit tiles count at face value and do not disqualify the hand.

**Fix (`apps/web/src/i18n/en.json` + `zh.json`):**

- Updated `learnHandsThirteenDesc` to clarify: each suit's tiles must be spaced > 2 apart, all 7 honor types must appear exactly once, and it is self-draw only.
- Updated `learnHandsSevenPairsDesc` to say "7 distinct pairs" (making the uniqueness constraint explicit).
- Added `learnHandsThirteenTip` (EN + ZH) for the new callout about Spirit tiles.

**Key learnings:**

- Eligibility hints belong directly on the hand's card in the Learn page — players read it while confused, not in advance.
- "Spirit tiles count at face value" is the single most important clarification for Thirteen Misfits: without it players assume any Jing in their hand voids the win.

---

## `fix/bug-048-landscape-overlay-rotation` (2026-06-13)

### BUG-048 · Side-seat text and overlays render in portrait orientation on mobile landscape (css-landscape mode)

**Root cause:** `ForcedLandscapeWrapper` was only wrapping `GameTable2D` (the canvas) inside `MobileLandscapeGate`. CSS `position: fixed` overlays (status bar, `SideRail` minimized chip, `MobileJingButton` overlay, `GameHistoryPanel` bottom sheet) and `position: absolute` overlays (ActionToast, TsumoBar, ClaimWindow, etc.) in `GameTable` were rendered OUTSIDE the rotated wrapper. In `css-landscape` mode (iOS Safari and devices where the Fullscreen API is rejected), the game canvas rotated 90° CW but all overlay text remained in physical portrait coordinates — players saw the status bar, score strip, and game action text sideways while the board itself appeared landscape.

CSS `transform` on an element creates a new containing block for descendant `position: fixed` elements. Moving `ForcedLandscapeWrapper` to wrap the entire `GameTable` return exploits this property: all `fixed inset-0` overlays (history panel, jing overlay, etc.) are now fixed to the landscape canvas rather than the viewport.

**Fix:**

1. **`ForcedLandscapeWrapper.tsx`** — changed the inactive passthrough case from `className="w-full h-full"` to `className="w-full h-dvh"` so `mj-game-surface` (now `h-full`) retains full viewport height in non-css-landscape modes.

2. **`MobileLandscapeGate.tsx`** — removed the `css-landscape` → `ForcedLandscapeWrapper` branch. The gate now passes children through for all non-`needs-gesture` modes; the landscape rotation is handled at the `GameTable` level.

3. **`game-page.tsx`** (`GameTable` inner component) — imported `ForcedLandscapeWrapper` and wrapped the entire `mj-game-surface` div in it (`active={landscapeMode === 'css-landscape'}`). Changed `h-dvh` → `h-full` on `mj-game-surface`.

**Key learnings:**

- An element with a `transform` property becomes a new containing block for all `position: fixed` descendants — even through arbitrary levels of DOM nesting. This means wrapping the entire game surface (not just the canvas) in the landscape `rotate(90deg)` wrapper automatically fixes every overlay that uses `fixed inset-0` or `fixed top/right` positioning.
- `ForcedLandscapeWrapper` must be the containing block for ALL game UI or none of it — partial wrapping (canvas only) creates a split-coordinate system where the canvas and overlays live on different axes.
- The passthrough case of `ForcedLandscapeWrapper` must provide an explicit height (`h-dvh`) so inner elements using `h-full` have a valid reference — a pure `h-full` passthrough collapses if the parent chain lacks explicit height.

---

## `feat/imp-025-centered-modals` (2026-06-12)

### IMP-025 · Standardise in-game popups to centered modal style

**Fix:** Converted all three bottom-sheet confirmation dialogs (`ConcedeSheet`, `JingDiscardConfirmSheet`, `KongActionSheet`) from bottom-anchored sheets (`flex items-end justify-center`, `rounded-t-xl`, `w-full max-w-viewport`) to centered modals (`flex items-center justify-center`, `rounded-xl`, `w-full max-w-sm mx-4`). All content and button layouts unchanged. Also fixed the minimized claim-window chip: it previously anchored to the bottom of the screen and overlapped the active player's revealed melds; it now floats in the upper-right corner (`absolute top-3 right-3`) as a compact pill, leaving the player's hand, melds, and the centre discard pile fully visible.

**Key learnings:**

- A bottom-sheet that the player minimizes to "see their hand" is counterproductive if the minimized state still sits at the bottom edge above the hand strip — move minimized states out of the player's direct line of sight (upper corner).
- The three confirmation dialogs previously used `pb-8` extra bottom padding (safe-area compensation) which is no longer needed once the sheet becomes a centered modal.

---

## `fix/bug-046-wildcard-kong-violations` (2026-06-12)

### BUG-046 · Wildcard / kong rule violations — jings in revealed melds and visual "tile transformation"

**Root cause:** Rules §3.2 states Jings may replace tiles in Chow, Pung, or Pair — but explicitly **not** in a Kong. Three functions in `packages/engine/src/calls.ts` incorrectly allowed jing substitution in kongs:

1. **`addToKongOptions`** — returned a jing tile as a valid 4th tile to upgrade an open pung to kong. An open pung is a revealed meld, making this a direct wildcard-in-revealed-meld violation. The jing was silently consumed and the meld recorded as 4 naturals — visually "transforming" the jing into the pung tile.

2. **`canKongFromDiscard`** — allowed 2 naturals + 1 jing (or 3 jings + 1 natural discard) to satisfy an open kong-from-discard. The server-side `claim-resolver.ts` already used strict exact-count logic (`hand.filter(t => t === pendingDiscard).length >= 3`) but the engine predicate was inconsistent.

3. **`concealedKongOptions`** — offered concealed kong options for 3 naturals + 1 jing, 2 naturals + 2 jings, and 1 natural + 3 jings. Rules §3.2 applies to all kongs (concealed and open alike).

**Fix (`packages/engine/src/calls.ts` and `engine.ts`):**

1. `addToKongOptions` — removed the jing fallback branch; only returns `[openPungTile]` when the exact natural tile is in hand.

2. `canKongFromDiscard` — replaced jing-counting logic with a simple `hand.filter(t => t === discarded).length >= 3`. Spirit Kong (discarded tile is itself a jing type) is handled correctly: the filter counts exact copies of the jing tile without special-casing.

3. `concealedKongOptions` — removed the "3 naturals + 1 jing", "2 naturals + 2 jings", and "1 natural + 3 jings" branches. Only 4 exact naturals or Spirit Kong (4 actual copies of a jing tile type) remain valid.

4. `engine.ts` `kongFromDiscard` and `kongConcealed` — removed the now-unreachable jing-removal branches; simplified to `removeFromHandN(hand, tile, 3/4)`.

**Violation 3 (self-discard kong) — not a real bug:** The claim-resolver's `if (seat === discardedBySeat) continue` guard and the engine's own `if (seatIdx === this.state.discardedBySeat) throw` guard correctly prevent this. The playtesting observation was a misidentification of which seat had discarded.

**Key learnings:**

- Rules §3.2 is unambiguous — "A Jing can replace any tile in a Chow, Pung, or Pair (except when used in a Kong)" applies to **all** kongs (open, concealed, add-to-kong). The only jings valid in a kong are the 4 copies of the same jing tile forming a Spirit Kong (杠精) — those are the konged tiles themselves, not substitutes.
- When a predicate function and a server-side resolver implement the same rule, they must use identical logic. `canKongFromDiscard` and `claim-resolver.ts` were divergent — always keep them in sync.
- A jing silently consumed by the engine (removed from hand, recorded as the natural tile in the meld) is visually indistinguishable from "tile transformation" to the player — this is the primary source of the reported symptom.

---

## `feat/imp-024-sound-effects` (2026-06-12)

### IMP-024 · Gameplay sound effects using audio files

**Fix:**

1. **Moved audio files** from `tempSoundsDir/` (repo root) to `apps/web/public/sounds/` maintaining sub-directory structure (`diceRoll/`, `pointTransfer/`, `shuffle/`, `tilePlace/`). Vite serves them as static assets at `/sounds/…`. `tempSoundsDir/` deleted.

2. **`use-sound.ts` rewritten:** Replaced the synthesised `playClack` (unused) with four MP3-based functions: `playTilePlace()` (6-file pool), `playDiceRoll()` (3-file pool), `playPointTransfer()` (4-file pool), `playShuffle()` (1-file pool). Each picks a random file and plays it via `new Audio(url).play()`. `playChime()` (synthesised, for win popup) is retained. All functions guard on `soundEnabled` from `ThemeStore`.

3. **`use-game.ts`:** Added `useSound()` call; used a mutable `soundRef` so event handlers inside the stable `useEffect` always call the current callback without adding sound to the effect's dependency array. `playDiceRoll()` fires on every `dice_roll` event; `playShuffle()` fires additionally when `event.purpose === 'deal_1'` (first roll of each new hand).

4. **`game-page.tsx`:** Added `useSound()` call; `discardWithSound` wraps `discard` to play `playTilePlace()` before emitting the socket event. Two `useEffect`s fire `playPointTransfer()`: one on `handReveal` changes (post-hand settlement and tsumo payouts) and one when `toast.kind === 'opening_settlement'` (spirit tile settlement).

**Key learnings:**

- `new Audio(url).play()` returns a Promise; always `.catch(() => {})` the result to silence browser autoplay-policy rejections silently.
- Sound callbacks from a React hook (`useSound`) should be kept in a mutable `soundRef` when consumed inside a long-lived `useEffect` so the closure always calls the latest callback without adding the hook's returns to the effect's dependency array (which would re-register all socket listeners on every `soundEnabled` toggle).
- `playShuffle` triggers on `wall_selection` purpose dice roll — this is the first event of every new hand and naturally represents the "round start / shuffle" moment in the game flow. (Note: `pendingRoll.purpose` uses `deal_1`/`deal_2` naming, but the broadcast `PublicGameEvent` `dice_roll.purpose` uses `wall_selection`/`deal_start`/`jing_reveal`.)

---

## `feat/imp-022-profile-rework` (2026-06-12)

### IMP-022 · User profile rework — single username, profile picture, circle avatar

**Root cause / motivation:** The app had two parallel name fields — `displayName` (free text) and `handle` (unique slug) — causing confusion and unnecessary complexity in the UI, API, and JWT payload. Profile pictures were entirely absent, so in-game opponents were identified only by text.

**Fix (full stack):**

1. **Single username (`displayName` removed):** Deleted `displayName` from `SignupDto`, `UpdateProfileDto`, all DDB writes, JWT payload (`jwt.strategy.ts`, `ws-auth.adapter.ts`), `RoomSeatItem`, `FriendWithProfile`, and the frontend auth store and all UI components. `handle` is now the sole display name everywhere.

2. **Avatar upload endpoint:** Added `PUT /users/me/avatar` in `UsersController` accepting `{ imageData: string (base64), contentType: string }`. `UsersService.uploadAvatar()` decodes base64, calls `StorageService.putObject()` storing the file at `avatars/<userId>.(jpg|png)`, saves `avatarKey` to the DDB user profile, then returns a fresh pre-signed URL.

3. **Pre-signed URL helper:** Added `StorageService.getAvatarUrl(key)` — returns a pre-signed 3600 s GET URL (with `forcePathStyle` for MinIO compatibility).

4. **Avatar threaded into game snapshots:** `GameSession` gained `seatAvatarUrls: readonly [string|null, string|null, string|null, string|null]`. `GameService.createGame()` does async DDB + S3 lookups for each human seat and populates it. `toClientSnapshot()` forwards the URL into each `ClientSeatState.avatarUrl`.

5. **Profile page rewrite:** `ProfilePage` now has an `AvatarCircle` component — clickable button that opens a hidden file input, shows the live avatar image or the handle initial as fallback, and displays a spinner while uploading. Edit form reduced to the single `handle` field.

6. **Client-side canvas resize:** `resizeImageToCanvas()` in `use-profile.ts` center-crops the selected file to a square then scales to 1024 × 1024 using the Canvas API, returning a data-URI. Base64 portion is extracted before posting.

7. **In-game avatar circles:** `OpponentBadge2D` (mobile table) shows a 20 px circular `<img>` above the wind-dot row when `seat.avatarUrl` is set. The `Nameplate` chip in `game-page.tsx` (desktop SeatHUD) replaces the 8 px wind dot with a 16 px circular avatar image when `seat.avatarUrl` is present.

8. **i18n:** Added `profileUploadPhoto` / `profilePhotoUpdated` keys in EN and ZH.

**Note:** The "random mahjong tile default avatar" from the original spec was deferred — the fallback is the handle initial rendered in CSS, which is simpler and sufficient for the family use case.

**Key learnings:**

- `forbidNonWhitelisted: true` on NestJS `ValidationPipe` means any field not declared in the DTO returns 400 — all test fixtures sending removed fields must be updated simultaneously with the DTO change.
- Fastify is incompatible with `multer` without `@fastify/multipart`. Base64-in-JSON is a simpler alternative for small files (avatars ≤ 1 MB) that avoids the multipart adapter entirely.
- Adding a parameter to `toClientSnapshot()` shifts positional parameters in all call sites — existing tests must be updated to add `undefined` in the new slot if they relied on later positional defaults.
- Pre-signed S3 GET URLs generated in `createGame()` expire in 3600 s. For long-running game sessions or replay pages a refresh mechanism will be needed eventually.

---

## `feat/imp-023-spirit-label` (2026-06-12)

### IMP-023 · Remove spirit tile character from status bar previews

**Root cause:** `MahjongTile2D` unconditionally renders a `精` character below the tile whenever `isJing={true}`. In the compact status bar the label takes up vertical space that pushes the tile out of the bar's bounds. The label is useful in larger contexts (the tap-to-enlarge overlays) but is surplus information in the tiny `xxs`/`xs` chips.

**Fix:** Added an optional `showJingLabel` prop (default `true`) to `MahjongTile2D`. Changed the label render from `{isJing && ...}` to `{isJing && showJingLabel && ...}`. Passed `showJingLabel={false}` to the three status bar tile instances:

- `JingTileChip` — the `xs` chip button in the desktop status bar
- `MobileJingButton` — the two `xxs` chip buttons in the mobile status bar

The enlarged overlay tiles in both components keep the default (`showJingLabel={true}`) so the label remains visible when the player taps to inspect the spirit tile.

**Key learning:** When a component has a display element that is useful at large sizes but disruptive at small ones, a boolean prop is cleaner than forking the component or adding size-conditional CSS — it lets the caller decide per usage site.

---

## `fix/bug-042-opponent-info-drift` (2026-06-12)

### BUG-042 · Opponent info blocks drift toward centre as melds are revealed; active player score unreadable

**Root cause:**

`DesktopGameTable2D` used a rotated flex column (`rotateZ(90deg)` / `rotateZ(-90deg)`) for each opponent seat zone. `SeatLabel2D` was a flex sibling of `OpenMelds2D` + `OpponentHand2D` inside the rotated container. Due to the CSS rotation geometry, the "bottom" of the pre-rotation flex column (where `justifyContent: space-between` places the last item) maps to a position outside the visible table area for the left and right seats. The label was either invisible or shifted relative to the meld tiles as game state changed.

For the viewer's score: the only desktop score display was a `Nameplate` in `SeatHUD` at `bottom-28` (112 px from the bottom), which sits at the bottom edge of the canvas area and is small, low-contrast, and partially obscured by the hand tiles.

**Fix:**

1. **`DesktopGameTable2D.tsx`** — Removed `SeatLabel2D` from inside the rotated seat containers and removed the `justifyContent: space-between` that was trying (incorrectly) to position it at the outer edge. Opponent meld tiles now fill the container with `justifyContent: center`. The `SeatHUD` overlay in `game-page.tsx` (which was already rendering `Nameplate` chips at `absolute left-2 top-1/2`, `absolute right-2 top-1/2`, `absolute top-14 left-1/2`) takes sole responsibility for opponent info blocks — those are independently positioned DOM overlays completely outside the meld flow.

2. **`game-page.tsx` (SeatHUD)** — Removed the viewer `Nameplate` from the `SeatHUD` (it was at `absolute bottom-28 left-1/2`, the now-defunct "seat area" display). Three opponent nameplates remain at screen-edge positions.

3. **`game-page.tsx` (status bar)** — Added a compact `name: score` chip for the viewer (desktop only) in the top status bar's centre section alongside the wall count. Gold colour (`#c9a961`), monospace tabular nums, consistent with the rest of the status bar.

4. **`Nameplate` component** — Added bot chip display (matching `SeatLabel2D`) so bot opponents are correctly identified in both 2D and 3D modes via the SeatHUD overlay.

**Key learnings:**

- CSS `rotateZ` transforms the visual rendering but NOT the layout space. `justify-content: space-between` inside a rotated flex container distributes items in pre-rotation coordinates; after rotation the "bottom" item can map to a position outside the visible viewport. Info blocks that need to stay anchored to screen edges must be `position: absolute` DOM overlays that live outside the rotated meld zone.
- The existing `SeatHUD` component already provided correctly anchored opponent nameplates for 3D mode; removing `SeatLabel2D` from the rotated containers let it serve both modes without duplication.

---

## `feat/imp-020-021-win-claim-ux` (2026-06-11)

### IMP-020 · Declare-win UX redesign

**What changed:**

1. **Non-blocking tsumo prompt:** `TsumoSheet` (full-screen `inset-0` overlay) was replaced by a compact `TsumoBar` component that pins to the bottom of the screen exactly like `SideRail`. In 3D desktop mode the 3D canvas and hand tiles remain fully visible; on mobile it appears above the hand strip at `bottom: var(--mj-hand-height, 90px)`.

2. **Persistent win button:** Clicking "Keep Playing" no longer calls `setCanTsumo(false)` immediately. Instead, `GameTable` sets a local `tsumoSuppressed` state. The tsumo bar hides and a gold "Declare Win" pill appears above the hand HUD on the right side. Clicking it clears `tsumoSuppressed` and reopens the bar. The `canTsumo` store flag is only cleared when the player actually discards (existing logic in `use-game.ts`).

3. **Win-reason label:** The `TsumoBar` shows a "Self-draw" badge next to the title (i18n key `tsumoWinReason`).

4. **Specific claim-win labels:** `SideRail` infers the win button label from co-present actions: if `pung` is also in the action list → "Win by Pung"; `chow` → "Win by Chow"; `kong` → "Win by Kong"; otherwise plain "Win".

**Files changed:** `apps/web/src/pages/game/game-page.tsx`, `apps/web/src/i18n/en.json`, `apps/web/src/i18n/zh.json`

**Tests added:** `IMP-020·tsumo-nonblocking`, `IMP-020·tsumo-persistent`

---

### IMP-021 · Claim window minimize — inspect discard pile before deciding

**What changed:** `SideRail` gained a `minimized` boolean state. When minimized the full action rail collapses to a single-row chip showing the pending discard tile thumbnail, countdown, and a chevron-up. Tapping the chip calls `setMinimized(false)` to restore the full rail. The countdown timer continues to tick in both states (computed live from `claimWindow.deadline`). The minimize button (chevron-down) appears in the claim window header.

**Files changed:** `apps/web/src/pages/game/game-page.tsx`, `apps/web/src/i18n/en.json`, `apps/web/src/i18n/zh.json`

**Tests added:** `IMP-021·claim-minimize`, `IMP-021·win-by-pung-label`

---

## `fix/bug-043-044-dice-animation-spirit-sequence` (2026-06-11)

### BUG-043 · Dice roll animation not visible when bot follows a human roll

**Symptom:** When a human player rolls deal_1, the on-screen dice flash briefly then the game jumps straight to the next screen. The deal_2 animation (when the next roller is a bot) was essentially invisible.

**Root cause:** `doBotRollIfNeeded()` was synchronous — it called `handleRollDiceInternal()` immediately after the previous roll broadcast. Both `game:event` (dice_roll) messages arrived at the client within the same network tick. The deal_2 dice event replaced the deal_1 `diceAnimation` state before the 1.2s Framer Motion animation could complete, effectively killing the first animation. The `isDiceAnimatingRef` guard queued snapshots correctly, but the animation itself was overwritten.

**Fix:** Added a 2000ms `setTimeout` in `doBotRollIfNeeded()` before calling `handleRollDiceInternal()`. Guards check that `session.pendingRoll` hasn't changed and the session is still active before rolling. This gives the preceding animation (~1.5s total: 1.2s spin + 0.3s result fade) time to complete and the "Waiting for X to roll..." state to render before the bot fires.

**Key learnings:**

- Bot roll timing affects human UX even when the bot is only performing deal_2 (not the active human's roll). Any `doBotRollIfNeeded` call immediately after a `broadcastEvent` will race with the client animation.
- Always delay bot auto-actions that follow broadcast events so client animations can complete.

---

### BUG-044 · Opening spirit flip shows settlement before dice roll (wrong sequence)

**Symptom:** With `ruleTopBottomJing` enabled, clicking past the hand-reveal screen shows "Reveal Bonus Tile" which previews the settlement tile and per-player payouts. The dealer then clicks again to trigger the dice roll. The correct sequence is: roll first, then settlement happens and spirit is revealed as a result.

**Root cause:** `handleAdvancePreGame` for `preGamePhase === 'hands'` with `ruleTopBottomJing` computed the settlement tile deterministically from the seed (before any roll), broadcast a `game:settlement-preview` event, and set `preGamePhase = 'settlement'`. This created an extra UX step where settlement info was revealed before the dice were rolled, which is the wrong game logic order.

**Fix:**

- Removed the `'settlement'` preGamePhase from the normal flow. `handleAdvancePreGame` now silently computes and stores the settlement preview in `session.lastSettlementPreview` but immediately calls `setJingRevealPendingRoll()` for both standard and `ruleTopBottomJing` rules.
- Added `game:settlement-preview` broadcast in `handleRollDiceInternal()` AFTER the jing_reveal roll completes — so clients receive the settlement data as part of the `'jing'` phase, alongside the revealed spirit tiles.
- Updated the reconnect handler to re-emit `game:settlement-preview` for `'jing'` phase (in addition to `'settlement'` for legacy sessions).
- Frontend: unified the 'hands' phase button to always say "Reveal Spirit Tiles →"; removed the 'settlement' phase block from `PreGameFlow`; added a compact settlement summary (settlement tile + per-player deltas) inside the 'jing' phase screen.

**Key learnings:**

- Deterministic pre-computation is an implementation detail — it should never drive UI ordering. Settlement data can be computed in advance but must only be shown to players after the dice roll it depends on.
- Removing a UI phase is safe as long as the data it displayed is surfaced in the adjacent phase instead.

---

## `fix/remaining-bugs-022-029-032-041` (2026-06-11)

### BUG-022 · Player rejoin fails — tile play blocked after socket reconnection

**Symptom:** After a WebSocket disconnect and reconnect while the game page was mounted, the player could not play tiles — either the game showed a stale `GameErrorScreen` or the UI appeared stuck.

**Root cause:** `handleConnect` in `use-game.ts` restored the live connection and re-emitted `game:join`, but it did NOT clear `gameError` or `pendingMove` from the Zustand store. If a transient `game:error` event (e.g. `NOT_YOUR_TURN` from a race before the disconnect, or `TOO_FAST` from the rate limiter) had been stored before the disconnect, it persisted through reconnect and kept `GameErrorScreen` visible. Similarly, a `pendingMove: true` set by a discard that was never confirmed (because the socket dropped mid-flight) could block subsequent tile interactions.

**Fix:** In `handleConnect` in `apps/web/src/hooks/use-game.ts`, added `setGameError(null)` and `setPendingMove(false)` before re-emitting `game:join`. The incoming `game:snapshot` then replaces all game state cleanly, and the player can interact normally.

**Key learnings:**

- **Socket reconnect ≠ component remount.** `reset()` runs on unmount and clears all Zustand state, but socket reconnect fires `handleConnect` while the component is still mounted — store state from before the disconnect survives unless explicitly cleared.
- **Clear error state on reconnect.** Any `game:error` received before a disconnect should be treated as transient; the server re-confirms state via `game:snapshot` after `game:join`, making any prior error irrelevant.

---

### BUG-029 · Copy room code button non-functional on mobile

**Symptom:** Tapping the "Copy" button in the room waiting page had no effect on mobile browsers (especially iOS Safari).

**Root cause:** `handleCopy` used `navigator.clipboard.writeText()` exclusively, with no feedback on success or failure. iOS Safari requires the Clipboard API call to happen within a user gesture AND the page must be served over HTTPS. In some contexts (e.g. local dev, WebView, insecure origin) the call silently fails. Additionally, no visual confirmation was shown, so the user had no way to know if the copy succeeded.

**Fix:** Added `document.execCommand('copy')` textarea fallback in `apps/web/src/pages/room/room-page.tsx`. On success (either method), a `copied` state variable is set for 2 seconds, turning the button green and changing its label to "Copied!". Added i18n keys `copied` / `已复制！` to `en.json` / `zh.json`.

**Key learnings:**

- **Clipboard API can fail silently on mobile.** Always use a `execCommand('copy')` textarea fallback and give the user visual confirmation so they know the copy was attempted.

---

### BUG-032 · Kicked player not redirected — remains on config screen

**Symptom:** When the host kicked a player, the kicked player saw their name disappear from the seat list but stayed on the room config screen with a stale view.

**Root cause:** The `kickSeat` REST endpoint (`DELETE /rooms/:id/seats/:n`) called `broadcastRoomUpdate` which emits `room:update` to everyone in the socket.io room. The kicked player's `useRoomSubscription` handled `room:update` by replacing the room state — their seat was now empty, but no navigation was triggered. There was no dedicated socket event for the kicked player.

**Fix (three-part):**

1. **`apps/api/src/rooms/rooms.service.ts`** — `kickSeat` now returns `{ room: RoomState; kickedUserId: string }` instead of plain `RoomState`, capturing the kicked user's ID before the seat is deleted.
2. **`apps/api/src/rooms/rooms.gateway.ts`** — added `emitToUser(userId, event, payload)` which iterates `server.sockets.sockets` to find all connected sockets owned by the given userId and emits the event directly to each. Called from the controller as `gateway.emitToUser(kickedUserId, 'room:kicked', {})`.
3. **Frontend** — `useRoomSubscription` in `apps/web/src/hooks/use-room.ts` gained an optional `onKicked` callback; it now listens for `room:kicked`. `RoomPage` passes `handleKicked` which calls `clearRoom()` then navigates to `/home`.

Added 1 new gateway test (`Kick·redirect`) and updated the service test to assert `kickedUserId` in the return value.

**Key learnings:**

- **`room:update` broadcast alone is insufficient for destructive events.** A kicked player receives the updated room (minus their seat), but the client has no way to know it was _them_ who was removed without a dedicated per-player event.
- **Iterating `server.sockets.sockets` is the correct pattern for targeted userId-addressed emission** when there is no dedicated socket room for individual users.

---

### BUG-041 · Spirit tile popup shows indicator+arrow instead of current+next only

**Symptom:** Tapping the spirit tile button during gameplay opened a popup showing four elements: the jing indicator tile → arrow → jingPrimary → jingSecondary. The user expected to see only the two active spirit tiles (current and next).

**Root cause:** The `MobileJingButton` popup in `apps/web/src/pages/game/game-page.tsx` was rendering `snapshot.jingIndicator` (the physical tile used to determine the spirit) plus an arrow, followed by `jingPrimary` and `jingSecondary`. This exposed an internal game concept (the indicator tile) that players do not need to see; they only care about which tiles are wild.

**Fix:** Removed `jingIndicator` and the arrow from the popup. The popup now shows `jingPrimary` and `jingSecondary` side by side, each with a label ("Current" / "Next"). Added i18n keys `gameSpiritCurrent` / `gameSpiritNext` (EN/ZH). No backend changes.

**Key learnings:**

- **Don't expose implementation details in the UI.** The indicator tile is a mechanical detail for determining which tile is the spirit. Players only need to know which tiles are wild (primary and secondary).

---

## `fix/bug-031-host-refresh-locks-config` (2026-06-11)

### BUG-031 · Host browser close/refresh makes room config non-interactable (MAJOR)

**Symptom:** If the host refreshed or briefly closed the browser while on the waiting-room config page, they could no longer change settings or click Start Game after returning. The room config controls were all rendered as read-only labels, and the Start button was absent.

**Root cause:** `RoomsGateway.handleDisconnect` called `roomsService.leaveRoom` synchronously on every WebSocket disconnection — including the transient disconnect caused by a browser refresh. `leaveRoom` deletes the host's seat from DynamoDB and transfers `hostUserId` to the next seated player. When the page reloaded and fetched the room state via `GET /rooms/:code`, the host was no longer in any seat and `room.hostUserId` pointed to someone else. `isHost = myUserId === room.hostUserId` evaluated to `false`, hiding every host-only UI element.

**Fix:** Added a 15-second grace period in `handleDisconnect`. Instead of calling `leaveRoom` immediately, the gateway schedules a `setTimeout`. In `handleSubscribe`, when the same user resubscribes to the same room before the timer fires (the browser-refresh case), the timer is cancelled via `clearTimeout`. The seat and `hostUserId` in DynamoDB are never touched, so after the page reloads and fetches the room state, the host sees themselves as host with full controls.

- `apps/api/src/rooms/rooms.gateway.ts` — `pendingLeaves` Map, deferred `handleDisconnect`, cancel in `handleSubscribe`.
- `apps/api/src/rooms/rooms.gateway.spec.ts` — 4 new tests: no immediate leave, leave after 15 s, cancel on resubscribe, no-op when no roomId.

**Key learnings:**

- **WebSocket disconnect ≠ intentional leave.** Browser refresh, mobile backgrounding, and short network blips all look like disconnects. Firing destructive DDB mutations immediately on any disconnect is too aggressive for a waiting-room scenario.
- **Grace periods solve refresh flicker cheaply.** A 15 s delay covers all realistic reload/reconnect times while still cleaning up seats that are genuinely abandoned.
- **The explicit REST leave (`DELETE /rooms/:id/leave`) is unaffected** — clicking the Leave button still removes the seat immediately. The grace period only applies to the involuntary socket disconnect path.

---

## `fix/wall-model-rework` (2026-06-11)

### BUG-037 · Wall model wrong — no dice rolls, no segmented walls, wrong settlement/spirit position (MAJOR)

**Symptom:** The engine shuffled all 136 tiles into one flat pool and dealt from the front — no per-player walls, no 2-high stacks, no dice. The settlement tile and jing indicator were taken from `wall[0]`/`wall[1]`, the indicator was consumed, and the settlement tile was relocated to the bottom of the pool. Kong replacements came from a separate 4-tile `deadWall`. None of this matched the physical table, making a future spectator view impossible to animate from engine state.

**Fix (full engine rework — no patching):** Replaced the flat-pool model with the physical **ring-of-stacks** wall:

- **`packages/engine/src/dice.ts` (new):** `rollDice(rand, count)` — pure, PRNG-injected. Every dice moment derives an independent stream from `mulberry32(seed ^ DICE_SALT.<purpose>)` and emits a `dice_roll` GameEvent with individual die faces (`purpose: 'wall_selection' | 'deal_start' | 'jing_reveal'`, `roller`, `dice`).
- **`packages/engine/src/wall.ts` (new):** `WallState` — 4 walls × 17 stacks × 2 tiles = 136 modeled as a ring. `drawOrder[136]` is fixed at build (top-then-bottom per stack, walking forward from the dice-resolved start stack); `drawPtr` advances for normal draws, `kongDraws` counts back draws (kong replacement = the current **last** tile of the wall, index `135 − kongDraws`). Exhaustion when the pointers meet (no reserved dead wall — every tile is drawable, 83 live tiles after the deal).
- **`deal()` rewritten as the real procedure:** roll #1 (dealer) counts seats CCW inclusively to select a wall; roll #2 (selected player) counts stacks inclusively from the left of that wall; the dealer takes the counted stack first, then CCW one stack per seat per round for 6 rounds (12 each), then one single tile each (13), then the dealer's 14th. Live drawing continues exactly where the deal stopped.
- **`revealJing()` rewritten:** dealer rolls the jing dice (per rules doc §3.1); the sum counts stacks backwards from the back of the wall, inclusive. Top-bottom mode: top tile = settlement (2 pts/copy + 1 pt/copy `stepAbove`, math unchanged), swap with the tile below, bottom = jing indicator — **both stay in the wall in their swapped positions and are drawn normally**. Standard mode: top tile = indicator, no swap, nothing consumed. New pure `previewJingReveal(state)` lets the service build the settlement preview before the reveal with guaranteed agreement.
- **`GameState.wall`** is now `WallState | null` (`deadWall` removed; `draw` event field renamed `fromDeadWall` → `fromBack`).
- **Shared:** `ClientGameState.wall: ClientWallState | null` (all dice values + positions public; `drawOrder` tile identities never leave the server), `deadWallCount` removed, `PublicGameEvent` gained `dice_roll`, `SettlementPreviewPayload` gained `dice` + `stackGlobal`.
- **API:** `toClientSnapshot` redacts `WallState` → `ClientWallState`; settlement preview built via `previewJingReveal`; jing `dice_roll` broadcast to clients.
- **Web:** settlement preview shows the rolled dice; `replayHand` now receives `config` (see below); test mocks updated.

**Two latent bugs fixed in the same rework:**

1. **`getNewEvents` dropped all hand-2+ events from the replay log.** It sliced `engine.events` by the cross-hand `moveLog.length`, but `engine.events` resets per hand. Fixed by offsetting with the current hand's `eventStartIdx`.
2. **`replayHand` ignored rule variants.** `ReplayHandConfig` had no `config`, so top-bottom-jing games replayed down the standard branch (wrong indicator, no settlement). `config` is now part of `ReplayHandConfig` and `buildTimeline` passes `settings.ruleTopBottomJing`.

**Documented conventions (decided during implementation, tested in `wall.test.ts`):**

- Roll #2 uses **two dice** (matching roll #1 and the locked rules doc's jing roll; the family example "a 6" is compatible).
- The skipped stacks before the deal-start stack form the **tail of the draw ring** — kong replacements consume them first, then the left-neighbour's wall, which matches the family's "kong from the wall left of the deal start" description.
- Kong replacement = the current **last tile of the wall in draw order** (bottom of the back-most stack first).
- The dice procedure applies to **both** jing modes (standard and top-bottom).
- No reserved dead wall: the hand is drawn only when every tile has been taken. (Old model reserved 3–4 tiles; per the family procedure nothing is held back.)

**Tests:** 331 engine (22 new in `wall.test.ts`: ring math, wraparound, dice determinism from seed, stack-taking deal sequence per the worked family example, front/back draws never overlap, swap-in-place, zero-sum settlement), 222 API, 352 web — all passing.

**Key learnings:**

- **Model the physical table, not the abstraction.** A flat array was "equivalent" for game logic but made dice, positions, and animations impossible to derive. The ring + two pointers is barely more code and every future feature (spectator view, deal animation) reads straight from state.
- **Derive everything from the seed.** Dice use salted PRNG streams (`seed ^ 'WALL'/'DEAL'/'JING'`), so replays reproduce the entire physical setup with zero extra stored state.
- **`engine.events` resets per hand but session logs span hands** — any "what's new" comparison between them must be offset by the hand's start index. Symmetric-looking lengths from hand 1 hid this for months.
- **Replay needs the full game config, not just the seed.** Any rule flag that changes an engine transition must travel with the replay payload.

---

## `feat/dice-roll-animation` (2026-06-11)

### IMP-019 · Manual dice-roll UI with 2D animation

**Summary:** Three dice rolls that previously resolved instantly on the server now pause and wait for the designated player to press a "Roll Dice" button. A 2D Framer Motion die animation shows the exact faces, and the updated `ClientGameState` snapshot is buffered until the animation completes.

**Scope of changes:**

- **Shared (`packages/shared/src/game.events.ts`):** `ClientGameState` gains `preGamePhase: 'dealing'` (new value) and `pendingRoll: { purpose, roller } | null`. New `RollDicePayloadSchema` (empty C→S schema).
- **API session (`apps/api/src/game/game-session.ts`):** `preGamePhase` default changed from `'hands'` to `'dealing'`; new `pendingRoll` field (includes server-only `seed`).
- **API snapshot (`apps/api/src/game/snapshot.ts`):** Passes `pendingRoll` (without seed) to `ClientGameState`.
- **API service (`apps/api/src/game/game.service.ts`):** `createGame` and `startNextHand` no longer call `.deal()` — they set `pendingRoll = { purpose: 'deal_1', roller: dealerSeat }` and `preGamePhase = 'dealing'`. New `handleRollDice`, `handleRollDiceInternal`, and `doBotRollIfNeeded` methods. `handleAdvancePreGame` no longer calls `doRevealJing` directly; sets `pendingRoll` for `jing_reveal` and bots auto-chain. `setJingRevealPendingRoll` extracted as a helper.
- **API gateway (`apps/api/src/game/game.gateway.ts`):** `game:roll-dice` handler added with 2/s throttle.
- **Web store (`apps/web/src/stores/game.store.ts`):** `diceAnimation` state + `setDiceAnimation` action.
- **Web hook (`apps/web/src/hooks/use-game.ts`):** `snapshotQueueRef` + `isDiceAnimatingRef` buffer snapshots during animation. `handleSnapshot` queues while animating; `handleGameEvent` intercepts `dice_roll` events; new `rollDice` action and `onDiceAnimationComplete` callback.
- **Web component (`apps/web/src/components/2d/DiceRollOverlay.tsx`):** Full-screen overlay. Shows animated Framer Motion dice (spin → settle on final value), "Roll Dice" gold button for the active roller, "Waiting for X to roll…" for others. Calls `onAnimationComplete` after the result text animates in.
- **Web page (`apps/web/src/pages/game/game-page.tsx`):** `DiceRollOverlay` rendered at z-[60] whenever `pendingRoll !== null || diceAnimation !== null`. `PreGameFlow` handles `'dealing'` phase with a simple loading screen (hidden behind the overlay).
- **i18n:** 8 new keys in `en.json` and `zh.json` (`diceRollTitle`, `diceRollDealing`, `diceRollDeal1`, `diceRollDeal2`, `diceRollJing`, `diceRollButton`, `diceRollWaiting`, `diceRollResult`).

**Tests:** 331 engine (unchanged), 228 API (+6: gateway `handleRollDice`, snapshot `pendingRoll`), 360 web (+8: `DiceRollOverlay` interactive/waiting/purpose/animation states) — all passing.

**Key learnings:**

- **Stage reveals via service-layer PRNG re-computation, not engine splitting.** The engine's `deal()` computes all 3 dice atomically; we pre-compute each roll using the same `mulberry32(seed ^ DICE_SALT.<purpose>)` formula and broadcast staged events. When `engine.deal()` is finally called, its internal computation produces identical dice because the PRNG is deterministic from the seed.
- **Queue snapshots during animation, don't block.** The server sends `game:event` + `game:snapshot` in the same Node.js tick. The client must buffer snapshots while `isDiceAnimatingRef.current === true` and flush after `onAnimationComplete` — otherwise the wall/hand state updates instantly, racing the dice animation.
- **Bot chaining: synchronous recursion is safe here.** `doBotRollIfNeeded` calls `handleRollDiceInternal` which calls `doBotRollIfNeeded` again — at most 3 levels deep (deal_1 → deal_2 → jing_reveal), all synchronous, no stack overflow risk.
- **`preGamePhase: 'dealing'` is needed to gate the frontend.** Without it, `PreGameFlow` has no phase to render before `deal()` is called (the engine's `phase` is `'dealing'` but that's the engine-internal phase, not the pre-game UI phase). The new value keeps the UI logic consistent with the other pre-game phases.

---

## `fix/mobile-ux-hand-reveal-polish` (2026-06-11)

### BUG-039 · Unmatched tiles unsorted in hand-reveal screen

**Symptom:** In the end-of-hand reveal screen the "unmatched" tile section appeared in non-standard (lexicographic) order — e.g. a man tile, then two dots, then a bamboo — instead of standard suit/rank order.

**Root cause:** `greedyGroupHand` initialised `bag` with `[...tiles].sort()` (JS default string sort). Tile IDs like `'1m'`, `'2p'`, `'east'` sort alphabetically, not in mahjong order. The returned `ungrouped` array was also an un-sorted slice of `bag`.

**Fix:** Replaced `[...tiles].sort()` with `sortTypes([...tiles])` for the initial bag, and wrapped the `ungrouped` return value in `sortTypes([...bag])`. `sortTypes` is imported from `@nanchang/shared` (re-exported from engine).

**Files changed:** `apps/web/src/pages/game/game-page.tsx` — `greedyGroupHand`.

**Key learning:** Always use `sortTypes` (not `Array.sort`) for mahjong tile collections — it applies the canonical man → pin → sou → winds → dragons ordering.

---

### BUG-040 · Wind / dragon chow sequences not grouped in hand-reveal

**Symptom:** When a concealed hand contained a valid Nanchang honor chow (e.g. East + South + West, or Zhong + Fa + Bai), those tiles appeared in the unmatched section instead of being labelled CHOW.

**Root cause:** The chow-detection pass in `greedyGroupHand` only matched suit tiles via `/^(\d)([mps])$/`. Honor tile IDs (`east`, `south`, etc.) do not match this regex, so the pass silently skipped them. Per rules §4.3, three non-repeating wind tiles or the three dragon tiles form a valid chow.

**Fix:** Added an honor-chow pass (using `WIND_CHOWS` + `DRAGON_CHOW` from `@nanchang/engine`) between the pung pass and the suit-chow pass. Also exported `WIND_CHOWS` and `DRAGON_CHOW` from `@nanchang/shared`.

**Files changed:** `apps/web/src/pages/game/game-page.tsx` — `greedyGroupHand`; `packages/shared/src/index.ts` — added re-exports.

**Key learning:** Honor chow support is a Nanchang-specific rule. Any hand-grouping utility must explicitly handle `WIND_CHOWS` and `DRAGON_CHOW` — the generic suit-regex pass will never reach honor tiles.

---

### IMP-018 · Spirit tiles cut off on mobile status bar

**Symptom:** The two spirit tiles shown in the top-left of the mobile status bar were clipped at the top of the viewport. The `xs` size (28×38 px) overflowed the 32 px fixed bar height.

**Fix:** Added an `xxs` size entry (`{ w: 20, h: 27, shadow: 2 }`) to `TILE_DIMS` in `MahjongTile2D.tsx`, and switched `MobileJingButton` to use `size="xxs"`. All existing size names remain unchanged.

**Files changed:** `apps/web/src/components/2d/MahjongTile2D.tsx`; `apps/web/src/pages/game/game-page.tsx` — `MobileJingButton`.

---

### IMP-019 · Mobile history panel → full-screen overlay

**Symptom:** On mobile the game-history panel opened as a bottom sheet with no backdrop. Closing it required tapping the icon again; it did not support tap-outside-to-close.

**Fix:** Replaced the mobile branch of `GameHistoryPanel` with a `position: fixed; inset: 0` overlay (matching `MobileJingButton` style). The dark backdrop occupies the full viewport and calls `onToggle` on click; the content panel stops propagation so tapping the list doesn't close it.

**Files changed:** `apps/web/src/pages/game/game-page.tsx` — `GameHistoryPanel`.

---

### IMP-020 · Settlement received rows consolidated

**Symptom:** In the pre-round settlement breakdown, a player holding N spirit tile copies saw one "Received X from [player]" row per other player (up to 3 rows per tile type). The desired UX was a single "Received [total]" row.

**Fix:** Rewrote `buildTransferLines` so received rows are consolidated: one row per tile type, `amount = count × rate × otherCount`. Paid rows remain per-player. Made `otherSeatName` optional in `TransferLine` since consolidated received rows have no specific payer.

**Files changed:** `apps/web/src/components/game/SettlementPreview.tsx`.

---

### IMP-021 · Sort-hand button during player's turn

**Symptom:** After manually dragging tiles into a custom order there was no way to quickly restore standard suit/rank order.

**Fix:** Added a "Sort" button (absolute-positioned above-left of the tile row, rendered last in DOM for correct tab order) in both `PlayerHand2D` (2D/mobile) and `ViewerHandHUD` (3D). In `PlayerHand2D` the button calls `handleSortHand` which re-sorts `localOrder` via `sortTypes` while preserving entry IDs (so Framer Motion re-uses layoutIds). In `ViewerHandHUD` it rebuilds `displayOrder`. Button is hidden when a tile is selected (to avoid overlap with the discard confirm button) and when not the player's turn. Added `"gameSortHand": "Sort"` / `"整理"` i18n keys.

**Files changed:** `apps/web/src/components/2d/PlayerHand2D.tsx`; `apps/web/src/pages/game/game-page.tsx` — `ViewerHandHUD`; `apps/web/src/i18n/en.json`; `apps/web/src/i18n/zh.json`.

**Key learning:** Place absolutely-positioned buttons _after_ the tile list in DOM order. `getAllByRole('button')` traverses DOM order, and tests that grab `buttons[0]` expecting the first tile will break if a visually-above button appears first in the DOM.

---

## `fix/bug-021-hand-reveal-grouping` (2026-06-11)

### BUG-021 · Hand-reveal screen concealed tiles not grouped into winning melds

**Symptom:** On the post-hand reveal screen, all concealed tiles (row 2) appeared as a flat unsorted row with no visual grouping. The winning structure (chow/pung/pair groups) was not shown. Loser hands were similarly flat with no recognisable group patterns.

**Root cause (two problems):**

1. **`decomposeHand` requires exactly 14 tiles** (`if (naturals.length + jingCount !== 14) return []`). A winner with open melds has a concealed portion smaller than 14 tiles (11 for 1 open meld, 8 for 2, 5 for 3, 2 for 4), so the decomposition always returned empty and the code fell through to the flat fallback.

2. **Losers' hands were never attempted for grouping** — there was no logic to greedily find recognisable patterns (pungs/chows/pairs) in non-winning hands.

**Fix:**

- Added `decomposeConcealed(hand, jingTypes)` to `packages/engine/src/hand.ts`: accepts any hand of size `3k+2` (2, 5, 8, 11, 14) and decomposes it into the correct number of melds + pair. Shares the inner `decomposeCore` function with `decomposeHand` to avoid duplication.
- Exported `decomposeConcealed` from the engine and re-exported through shared.
- Added `greedyGroupHand` utility in game-page.tsx: greedily finds pungs → chows → pairs in any tile set, returning labeled groups and a remainder. Used for losers and as a winner fallback (seven pairs, thirteen misfits).
- Updated `HandRevealScreen` to use `decomposeConcealed` for all winner concealed hands regardless of open-meld count. Losers' hands use `greedyGroupHand`. Ungrouped remainder tiles appear after a visual separator with no label.

**Files changed:**

- `packages/engine/src/hand.ts` — refactored to `decomposeCore` + `decomposeHand` + new `decomposeConcealed`
- `packages/engine/src/index.ts` — export `decomposeConcealed`
- `packages/shared/src/index.ts` — re-export `decomposeConcealed`
- `apps/web/src/pages/game/game-page.tsx` — `greedyGroupHand` utility + rewritten concealed hand rendering in `HandRevealScreen`
- `packages/engine/src/__tests__/hand.test.ts` — 7 new `decomposeConcealed` tests

**Key learning:** `decomposeHand` has an intentional 14-tile guard because it was designed as a win validator. Any display context that needs to decompose a partial hand (one with open melds) must use `decomposeConcealed`. The two functions share the same core logic — the only difference is the size validation.

---

## `fix/bug-038-win-after-kong` (2026-06-11)

### BUG-038 · Win button absent after declaring a kong

**Symptom:** After performing any kong (concealed, open from discard, or add-to-kong) and drawing the replacement tile, the player was never offered a win option — neither the tsumo button nor a RON offer on opponents' discards. The bug affected all three kong types and both win paths (tsumo and ron).

**Root cause:** `isWinningHand` in `packages/engine/src/hand.ts` has a hard `if (hand.length !== 14) return false` guard. After a kong, the full hand (open melds flattened + concealed tiles) is 14+k tiles where k = number of kongs (each kong is 4 tiles; a pung is 3). With 1 kong the flattened hand is 15 tiles — `isWinningHand` returned false, so:

- `game.service.ts` `startTurn()` never emitted `game:can-tsumo` → no win button shown
- `game.service.ts` `handleBotTurn()` never triggered bot auto-tsumo
- `claim-resolver.ts` `computeEligibleClaims()` never added the player to the RON offer set
- `claim-resolver.ts` `computeRobKongEligible()` same
- `engine.ts` `win()` would have thrown "Hand is not a winning hand" if the player forced a tsumo

**Fix:** Normalize each open kong (4 tiles) → pung (3 tiles) in the flattened tile list before calling `isWinningHand`. This restores the 14-tile invariant without changing any win logic. Scoring is unaffected — scoring always uses `openMelds` directly and correctly distinguishes kongs from pungs for payment calculation.

**Files changed:**

- `packages/engine/src/engine.ts` — `win()` reconstructed `winningHand` now normalizes kongs
- `apps/api/src/game/game.service.ts` — `startTurn()` and `handleBotTurn()` tsumo checks normalized
- `apps/api/src/game/claim-resolver.ts` — `computeEligibleClaims()` and `computeRobKongEligible()` normalized
- `packages/engine/src/__tests__/engine.test.ts` — 2 BUG-038 regression tests added

**Key learning:** Any function that receives a flattened `openMelds.flatMap(m => [...m.tiles])` list must account for the fact that kongs produce 4 tiles instead of 3. The safe pattern is `openMelds.flatMap(m => m.kind === 'kong' ? [m.tiles[0], m.tiles[0], m.tiles[0]] : [...m.tiles])`. The 14-tile hard guard in `isWinningHand` is intentional (Seven Pairs and Thirteen Misfits are 14-tile-only hands) — the fix is in the callers, not the function itself.

---

## PR #29 · `chore/local-dev-setup` (2026-06-04)

First full end-to-end local run. All bugs below discovered during initial testing.

### BUG-001 · PowerShell 5.1 ParseException — Unicode characters in script

**Symptom:** `dev-setup.ps1` threw `ParseException at line 59 char:8 Missing closing '}'` immediately on launch.

**Root cause:** PowerShell 5.1 reads `.ps1` files as Windows-1252 by default unless BOM present. Unicode characters (▶ ✓ ━ —) in Write-Host strings confused PS5.1's brace-depth tracker.

**Fix:** Rewrote script using ASCII-only characters. Replaced `2>&1` redirects with `ForEach-Object` pipelines (PS5.1 wraps native stderr in `ErrorRecord` objects when using `2>&1`, causing false failures).

**Learning:** Any PS5.1 script must be ASCII-only unless saved with UTF-8-BOM. The `2>&1` operator on native executables is unreliable in PS5.1 — use `| ForEach-Object { $_ }` instead or omit redirect.

---

### BUG-002 · DynamoDB health check always timing out

**Symptom:** `dev-setup.ps1` reported DynamoDB not ready after 40 retries, even though container was up and healthy.

**Root cause:** Health check used `Invoke-WebRequest http://localhost:8000` — DynamoDB Local returns HTTP 400 on plain GET. PS5.1's `Invoke-WebRequest` throws terminating error on any non-2xx, so catch-block always triggered.

**Fix:** Replaced HTTP probe with raw TCP connection check using `[System.Net.Sockets.TcpClient]`. Successful TCP connect on port 8000 confirms readiness.

**Learning:** Never use HTTP probes for services returning non-2xx on bare GETs (DynamoDB, Kafka, etc.). Use TCP connect for "is the port open?" checks. Reserve HTTP probes for services with proper health endpoints.

---

### BUG-003 · `seed-admin` ConditionalCheckFailedException

**Symptom:** Running `pnpm seed:admin` crashed with DynamoDB `ConditionalCheckFailedException`.

**Root cause:** `profileItem` spread included `...DK.handleLock(ADMIN_HANDLE)`, overwriting the item's own `PK`/`SK` keys. Both profile and handle-lock `Put` targeted the same DDB key — second `Put` failed its `attribute_not_exists(PK)` condition.

**Fix:**

1. Removed `...DK.handleLock(ADMIN_HANDLE)` from profile item spread
2. Changed `UsernameExistsException` recovery to call `AdminGetUserCommand` against Cognito directly (authoritative source)
3. Made handle-lock `PutCommand` unconditional (re-runs are idempotent)

**Learning:** Never spread two DDB key-builders into same object. Each item must have exactly one `PK`/`SK` pair. Last spread wins silently with no TypeScript error. Always build profile with own keys, then write handle-lock as separate `PutCommand`.

---

### BUG-004 · API returning 500 — ECONNREFUSED on sign-in

**Symptom:** Logging in from browser returned HTTP 500. API logs showed `ECONNREFUSED` connecting to Cognito on port 9229.

**Root cause:** `ConfigModule.forRoot()` lacked `envFilePath`, so NestJS looked for `.env` in process CWD. When started via `pnpm --filter @nanchang/api dev`, pnpm sets CWD to `apps/api/`, not repo root where `.env` lives.

**Fix:** Added `envFilePath: ['.env', '../../.env']` to `ConfigModule.forRoot()`. Array is tried in order; first found wins. Works from any execution context.

**Learning:** pnpm filter runs always set CWD to workspace package directory, not repo root. Never assume `.env` at `process.cwd()`. Always provide fallback path array.

---

### BUG-005 · CSS `@import` warning — Import after Tailwind directives

**Symptom:** Vite printed warning: `@import rules must precede all other rules`.

**Root cause:** `apps/web/src/index.css` had Google Fonts `@import` after `@tailwind base`, violating CSS spec requiring `@import` before all other statements.

**Fix:** Moved Google Fonts `@import` to very top of `index.css`, before any `@tailwind` directive.

**Learning:** CSS `@import` must be first (after optional `@charset`). Tailwind directives count as real CSS statements. Vite's CSS bundler is strict about order even in dev mode.

---

### BUG-006 · API crash — SyntaxError: Unexpected token 'export'

**Symptom:** After `nest start --watch` compiled API, it crashed with `SyntaxError: Unexpected token 'export'` pointing into `packages/engine/src/`.

**Root cause:** `packages/engine/package.json` had `"main": "./src/index.ts"`. When NestJS compiled API to CommonJS, runtime called `require('@nanchang/engine')`, Node resolved via `"main"` to raw TypeScript, which Node cannot execute.

**Fix:** Two-part:

1. Added `tsconfig.build.json` (CommonJS target) + `"build"` script to engine and shared packages
2. Added `"exports"` field with `"require"` → `./dist/index.js` (compiled CJS) and `"import"` → `./src/index.ts` (TypeScript source for Vite)

**Learning:** In pnpm monorepo with NestJS consuming workspace packages: NestJS compiles to CommonJS. At runtime Node calls `require()`. If `"main"` points to `.ts` source, Node tries executing TypeScript and crashes. Use `"exports"` field with separate `"import"` and `"require"` conditions. `"main"` is only fallback when `"exports"` absent.

---

### BUG-007 · Blank white screen — Vite resolved CJS build instead of TypeScript source

**Symptom:** After BUG-006 fix, browser showed blank white page. Console showed named export errors.

**Root cause:** Initial `"exports"` field had `"default": "./dist/index.js"` but no `"import"` condition. Vite is ESM bundler; without explicit `"import"`, it fell through to `"default"` and loaded CJS `dist/index.js`. CJS `module.exports` breaks Vite's named-import tree-shaking, leaving all imports `undefined`.

**Fix:** Added `"import": "./src/index.ts"` before `"default"` in exports map. Vite now picks `"import"` first, gets TypeScript source, and transpiles normally.

**Learning:** When writing `"exports"` for package consumed by both Node.js CJS runtime and Vite ESM bundler, need both `"require"` (CJS dist) and `"import"` (TS/ESM source) conditions. `"default"` is last-resort fallback — never use as primary resolution path.

---

### BUG-008 · S3 InvalidAccessKeyId — MinIO credential mismatch

**Symptom:** Uploading replay data to MinIO failed with `InvalidAccessKeyId`.

**Root cause:** `.env.example` had `AWS_ACCESS_KEY_ID=local` and `AWS_SECRET_ACCESS_KEY=local`. Docker-compose MinIO used `MINIO_ROOT_USER=minioadmin` and `MINIO_ROOT_PASSWORD=minioadmin`. Credentials didn't match.

**Fix:** Updated `.env.example` to `minioadmin`/`minioadmin` to match docker-compose defaults.

**Learning:** MinIO's S3-compatible API authenticates against `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`. AWS SDK credentials must exactly match. Document this pairing explicitly in `.env.example` so future setup doesn't require debugging.

---

### BUG-009 · Host cannot mark ready / start game blocked

**Symptom:** In lobby, three non-host players could toggle ready, but host had no button and Start remained disabled even when all others ready.

**Root cause:** Two issues:

1. **Frontend:** `allReady` computed as `filledSeats.every(s => s.ready)`. Host's DDB seat never has `ready: true` (never toggled).
2. **Backend:** `startGame()` checked same condition and rejected host's start request.

**Fix:** Applied `isHost || ready` in both places. Host is implicitly ready — clicking Start _is_ their readiness signal.

**Learning:** Host role requires special-casing in "all players ready" checks. Host never presses Ready — they press Start. Treat `isHost` as implicit `ready: true` in aggregate readiness calculations. Apply symmetrically in API and frontend.

---

### BUG-010 · Game stuck on Jing reveal screen for all players

**Symptom:** After starting game, all four players saw "Waiting for host to reveal Spirit…" indefinitely.

**Root cause:** Three issues:

1. **Silent `game:error` events:** Frontend subscribed to all `game:*` except `game:error`. Backend rejections silently dropped.
2. **Wrong "is host" check on frontend:** Computed `isHost = viewerSeat === 0`. Seat 0 is room host, but dealer is `snapshot.dealerSeat`. Wrong for subsequent hands.
3. **Wrong dealer check on backend:** `handleRevealJing()` checked `session.seatMap[0]` instead of `session.seatMap[session.engine.state.dealerSeat]`.

**Fix:**

- Added `game:error` handler in `useGame` that `console.warn`s
- Changed frontend to `isDealer = viewerSeat !== null && viewerSeat === snapshot.dealerSeat`
- Changed backend to use correct `dealerUserId = session.seatMap[session.engine.state.dealerSeat]`
- Added backend WARN log with full context

**Learning:**

- Always subscribe to `game:error` from day one. Silent server rejections are hardest to diagnose.
- "Host" and "dealer" are distinct. Dealer rotates; host is fixed. Never conflate seat 0 with either. Derive dealer from `engine.state.dealerSeat`.
- When debugging multiplayer socket issues, add full-context WARN log on rejection — turns 30-minute mystery into 2-minute read.

---

### BUG-011 · Jest CI failure — Cannot find module '@nanchang/engine'

**Symptom:** All 20 API test suites failed in CI with module not found error. Tests passed locally.

**Root cause:** `"exports"` field routes `"require"` to `./dist/index.js`. Jest uses Node.js `require` condition. In CI, no pre-build step, so `dist/` doesn't exist. Locally, `pnpm dev` pre-builds packages before starting servers.

**Fix:** Added `moduleNameMapper` to `apps/api/jest.config.ts` to bypass `"exports"` field for Jest:

```typescript
moduleNameMapper: {
  '^@nanchang/engine$': '<rootDir>/../../packages/engine/src/index.ts',
  '^@nanchang/shared$': '<rootDir>/../../packages/shared/src/index.ts',
}
```

ts-jest transpiles TypeScript on the fly; no pre-built `dist/` needed.

**Learning:** When adding `"exports"` with `"require"` condition pointing to compiled output, Jest breaks in environments without build step. Fix is `moduleNameMapper` in Jest config — unconditional, explicit, no build latency. Add this mapper at same time as `"exports"` field; never add one without the other.

---

## PR #30 · `chore/bug-log` (2026-06-05)

### BUG-012 · Chow claim prompt shown to wrong players

**Symptom:** During live 4-player match, two different players both prompted to claim chow off same discard.

**Root cause:** `computeEligibleClaims` looped over all 4 seats and called `chowOptions()` on each. Chow eligibility is position-dependent (only next seat CCW), but `chowOptions()` has no positional guard.

**Fix:** Pre-computed `nextSeat = ((discardedBySeat + 1) % 4)` and gated `chowOptions` call behind `seat === nextSeat`. Added 3 unit tests for all discarder positions including wrap-around.

**Learning:** Pung/Kong eligibility is position-independent. Chow eligibility is position-dependent (only immediate downstream seat). Handle differently in claim-window computation. Always test claim eligibility against all 4 possible discarder seats, including wrap-around (seat 3 → seat 0).

---

## PR #30 cont. · Gameplay UI bugs & improvements (2026-06-05)

### BUG-013 · Dealer badge shown as global label — all players appeared to be the dealer

**Symptom:** Status bar top-left showed "Dealer 東" to every player, ambiguously reading as "you are the dealer."

**Root cause:** Status bar rendered label unconditionally for all players with no player-specific indicator.

**Fix:** Removed "Dealer" text from status bar (round wind alone is sufficient). Added `"庄"` badge to `Nameplate` component, rendered only when `seatIdx === snapshot.dealerSeat`. Added same badge to viewer's own bottom info row.

**Learning:** In compass-layout game UI, global status bar labels easily misread as "about the viewer." Role badges belong on individual player's nameplate, not shared header.

---

### BUG-014 · Action toasts never shown — game:event was not displayed

**Symptom:** When players punged/chowed/declared kong/won, no notification appeared for any player.

**Root cause:** Backend correctly emits `game:event` to room. Frontend subscribed but had no handler. `GameToast` type existed but was never rendered.

**Fix:** Three-part:

1. Added `handleGameEvent` in `useGame` listening to `game:event`, sets 2500ms toast
2. Added `toast` to `GamePage` destructuring, passed to `GameTable`
3. Added `ActionToast` component — floating center-screen overlay auto-dismissed after 2.5s

**Learning:** Wiring end-to-end event pipeline means checking: backend emits → frontend subscribes → store updates → UI reads. Break at any link silences feature. Always trace full path from socket emit to rendered pixel.

---

### BUG-015 · Open melds invisible after pung/chow/kong

**Symptom:** After player punged, tiles disappeared from hand (correct) but weren't visible anywhere — neither to player nor opponents.

**Root cause:** `ClientSeatState.openMelds` correctly populated by `toClientSnapshot()`. However, `GameTable` rendered only face-down hand tiles and discards. No component rendered `openMelds`.

**Fix:** Added `MeldGroup` (one meld's tiles in row) and `OpenMeldsDisplay` (all melds for seat). Wired into four seat areas:

- Top: Horizontal row between face-down hand and discards
- Left/Right: Vertical stacks in side columns
- Viewer: Horizontal row above hand tiles

Each meld wrapped in subtle gold-bordered container.

**Learning:** After implementing game mechanic (pung/chow/kong), verify entire data path: engine state → server snapshot → client type → rendering. Mechanic with no visual output in compass layout is effectively invisible.

---

### BUG-016 · DynamoDB Local `-inMemory` flag wipes all data on restart

**Symptom:** Every Docker stop (or PC shutdown) deleted all user accounts, game history, and invite codes. First sign-in after restart throws `ResourceNotFoundException`.

**Root cause:** `docker-compose.yml` started DynamoDB Local with `-inMemory` flag. Stores everything in RAM only — nothing on disk. Container stop = permanent data loss.

**Fix (PR #54):** Removed `-inMemory`; replaced with `-dbPath /home/dynamodblocal/data`. Added `dynamodb-data` named volume. After fix, `setup:local` + `seed:admin` + `seed:users` only needed once. Restarts preserve data.

**Learning:** `-inMemory` is convenient for CI (fast, clean slate) but catastrophic for local dev database. Use `-dbPath` with mounted volume for local dev where persistent state matters. Keep `-inMemory` only for CI/test pipeline.

---

## Branch `feat/hand-reveal-flow` · Live family testing (2026-06-08)

Bugs discovered during family testing of the hand-reveal-flow feature.

### BUG-017 · Settlement 1pt tile used wall[1] instead of next-in-sequence

**Symptom:** The "1 pt each" indicator tile shown beside settlement tile was whatever at `wall[1]` (jing indicator), not the tile one step above settlement tile in sequence.

**Root cause:** Engine's `revealJing()` and service's `handleAdvancePreGame()` both set 1pt tile to `typeOf(state.wall[1])`. But 1pt bonus tile is always the tile ONE STEP ABOVE settlement tile (like jing secondary is derived from indicator). `wall[1]` is only consumed to determine jing wildcards — never scored at 1pt.

**Fix:** In `engine.ts`, replaced settlement call with `calculateOpeningJingSettlement(stepAbove(settlementTile), seats, 1)`. In `game.service.ts`, replaced `nextTile = typeOf(state.wall[1])` with `nextTile = stepAbove(typeOf(state.wall[0]))`. `wall[1]` remains unchanged.

**Learning:** In ruleTopBottomJing flow there are three distinct tiles: `wall[0]` (settlement, 2pt), derived "next-in-sequence" (1pt — never removed), and `wall[1]` (jing indicator only, zero scoring). Don't conflate jing indicator with 1pt bonus tile.

---

### BUG-018 · Wildcards offered freely in pung/chow claim windows

**Symptom:** Players offered pung/chow calls using jing (wildcard) tiles. Per Nanchang rules, wildcards only allowed in open melds to win; otherwise must stay concealed.

**Root cause:** `computeEligibleClaims()` called `canPung` and `chowOptions` without filtering jing-dependent melds. Engine functions report general eligibility (including jing assistance), but family rules prohibit jing in open melds except to win.

**Fix:** Added `separateJing` to determine natural copies of discarded tile. Pung only offered with ≥2 naturals. Chow sequences filtered to remove jing-requiring ones. `canWin` path unchanged — jing works freely for win declarations.

**Learning:** Engine functions are general-purpose, rule-agnostic. Family-specific restrictions must be applied as post-filter in claim-resolver, not inside engine. Always check family rules at claim-resolver boundary.

---

### BUG-019 · Open meld tiles stored as substituted type instead of wildcard type

**Symptom:** When player formed pung/chow using jing to substitute, meld stored as all copies of discarded tile (e.g., `[3p, 3p, 3p]`) even when one was actually `3m` acting as jing.

**Root cause:** `engine.ts pung()` stored melds using discarded tile type for all positions, discarding jing identity.

**Fix (deferred — superseded by BUG-018 fix):** After BUG-018, jing-assisted pung/chow no longer offered in regular play, so no storage fix needed.

**Learning:** Meld tiles arrays must store PHYSICAL tile type in hand, not logical tile type wildcard stands in for. Wildcards should remain identifiable in all downstream data (display, settlement, replay).

---

### IMP-001 · Spirit tile screen showed redundant indicator tile

**Observation:** Jing step displayed three tiles: Indicator → Primary Spirit → Secondary Spirit. Indicator already visible on Settlement step; only care about primary and secondary spirits.

**Fix:** Removed indicator tile and arrow from jing step. Now shows only Primary Spirit and Secondary Spirit (clean two-tile layout matching Settlement step).

---

### IMP-002 · Hand reveal screen did not show open melds

**Observation:** Post-hand reveal screen showed concealed hands but not open melds (pungs, chows, kongs). Impossible to see full hand picture, especially for winner.

**Fix:** Added `openMelds: [Meld[], Meld[], Meld[], Meld[]]` to `HandRevealPayload`. Service populates from `state.seats[i].openMelds`. Screen now renders open melds as labeled tile groups above each player's concealed hand.

---

## 3D UI Migration · PRs #32–40 (merged 2026-06-05)

All 3D-specific bugs found and fixed during local testing. See `3D-BUG-LOG.md` for detailed closed items.

### 3D Closed Bugs Summary

| ID      | Symptom                                          | Root cause                                        | Fix                                                  |
| ------- | ------------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------- |
| BUG-01  | Tile faces render with black background          | Transparent SVG + MeshBasicMaterial alpha=0       | `transparent: true, depthWrite: false`               |
| BUG-02  | Tile face images upside down                     | `flipY = false` was wrong for browser SVGs        | `flipY = true`                                       |
| BUG-03  | Flat tile faces blown out / invisible            | Clearcoat overwhelmed SVG under directional light | Switch face to `MeshBasicMaterial` (unlit)           |
| BUG-04  | Left/right opponent tiles appear elongated       | Tiles laid flat; edge-on from camera              | Standing orientation (rx=0, ry=π)                    |
| BUG-05  | Discards/melds for side players unreadable       | `ry` varied per seat; texture V-axis sideways     | All discard/meld configs use `ry: Math.PI`           |
| BUG-06  | TileWall3D renders as large red cross            | `Back.svg` has `fill:#ff3737` background          | Removed TileWall3D (see BUG-09 in open issues)       |
| BUG-07  | ViewerHandHUD shows text tiles instead of images | `<MahjongTile>` is text/CSS component             | New `SvgHandTile` with `<img src={tileTexturePath}>` |
| IMP-003 | Camera angle too steep (top-down feel)           | Camera Y too high, Z too close, FOV too narrow    | `position: [0, 8, 13]`, `fov: 58`                    |
| IMP-004 | Tiles too shiny / lacquer-like                   | High clearcoat + studio IBL                       | Reduced clearcoat/roughness; face is unlit           |

---

## PR #83 · `feat/improvements-005-007` (2026-06-09)

### IMP-005 · Settlement phase — consolidate scoring table with per-player breakdown

**Previous state:** Settlement phase displayed two separate tables (one for the 2pt tile, one for the 1pt tile), which was visually cluttered and hard to parse at a glance.

**Fix:** Extracted settlement display into a new `SettlementPreview` component (`apps/web/src/components/game/SettlementPreview.tsx`). Replaced the two-table layout with a single consolidated table showing each player's total settlement delta. Each player row has an expandable dropdown (chevron) that reveals a line-item breakdown of tile contributions, using `MahjongTile2D` tile textures instead of text labels. Player names and wind indicators are shown throughout.

**Learning:** When displaying zero-sum multi-item scores, always lead with the total and make the breakdown opt-in. Accordion/expand patterns prevent visual clutter on small screens while keeping detail accessible.

---

### IMP-006 · End game — animated winner announcement and two-step result flow

**Previous state:** End game immediately showed the score table without any celebratory moment — felt abrupt, especially on mobile.

**Fix:** Created `GameWinnerPopup` component (`apps/web/src/components/game/GameWinnerPopup.tsx`) that renders as a full-screen overlay when the game ends. Plays the existing winning chime from `useSound` on mount. Auto-dismisses after 3 seconds (or on tap). `GameEndScreen` now shows the popup first; only after it closes does the score table appear. Keyframe animations (`winner-pop`, `winner-fade-in`) defined in `tailwind.config.ts` alongside all other project keyframes — no inline `<style>` blocks.

**Learning:** Celebratory moments should be a distinct step, not bolted onto the results screen. Defining animations in `tailwind.config.ts` keeps component code clean and consistent with project conventions.

---

### IMP-007 · Auth — password visibility toggle

**Previous state:** Password fields had no way for users to verify what they had typed before submitting. Autofill placeholder text ("temp") was no longer present in code at fix time.

**Fix:** Enhanced the shared `FormField` component (`apps/web/src/components/ui/form-field.tsx`) with a password visibility toggle. When `type="password"`, an eye icon button appears inside the field. Clicking it swaps the input type between `password` and `text`. Tooltip text (`passwordShowTooltip` / `passwordHideTooltip`) is i18n-translated in EN + ZH. The toggle applies universally to all password fields (sign-in, sign-up, change-password) since they all use `FormField`.

**Learning:** Add visibility toggles at the shared component layer (`FormField`) rather than per-page to ensure all password inputs get the improvement automatically.

---

## PR #85 · `fix/bug-024-winning-tile-missing` (2026-06-09)

### BUG-024 · Winning player's hand missing the winning tile in hand reveal

**Symptom:** In the end-game hand-reveal screen, the winning player's concealed hand was shown with only 13 tiles — the tile they actually won with (the Ron discard or Rob-Kong tile) was absent.

**Root cause:** `declareWin()` in `packages/engine/src/engine.ts` assembled the full 14-tile `winningHand` as a local variable for validation and scoring, but never wrote the winning tile back into the returned `GameState`. The final `state.seats[winnerSeat].hand` only contained the tiles that were already in hand before the win:

- **Tsumo wins**: correct — the drawn tile was added to `hand` in `_drawFor()` before `declareWin()` was called.
- **Ron wins**: broken — the winning tile was `pendingDiscard`, which is never in `hand`.
- **Rob-Kong wins**: broken — the winning tile was the tile being konged, which is never in the winner's `hand`.

`handleHandEnd()` in `game.service.ts` built `HandRevealPayload.hands` directly from `state.seats.map((s) => s.hand)`, so the missing tile flowed straight through to the client.

**Fix:** In `declareWin()`, after assembling `winningHand` for validation, compute `winnerFinalHand` as `sortTypes([...winnerSeat.hand, ...(isRon ? [pendingDiscard] : []), ...(isRobKong && robTile ? [robTile] : [])])` and set it as `hand` on the winner's seat in the returned state. The finished state now always has the complete 14-tile concealed hand for the winner. No changes needed in the service or frontend.

**Key learning:** Engine state after `declareWin()` was the authoritative source for the hand-reveal payload. The winning tile must be written into `state.seats[winnerSeat].hand` so every consumer (service, replay, tests) automatically gets the complete picture without special-casing.

---

## PR #86 · `feat/imp-008-012` (2026-06-09)

### IMP-008 · Account settings page — move change password and delete account

**Previous state:** "Change Password" and "Delete Account" were listed as separate buttons directly on the home page, cluttering the main navigation with destructive/security actions.

**Fix:** Created a dedicated `/account` page (`apps/web/src/pages/account/account-page.tsx`) that consolidates Profile, Change Password, and Delete Account links in one place. The home page now shows a single "Account" link. Back navigation in `change-password-page.tsx` and `delete-account-page.tsx` was updated to return to `/account` instead of `/home`. Route added to `App.tsx`.

**Learning:** Destructive actions belong in a dedicated settings hierarchy, not scattered across the main navigation. Centralizing them keeps the home page focused on gameplay.

---

### IMP-009 · Mobile discard pile overlap — reduce first-row tile count by 2

**Previous state:** On mobile landscape, the discard pool container extended to the full area between the left/right opponent badges, allowing the first row of tiles to crowd the badge edges and cause visual overlap.

**Fix:** Added `DISCARD_EXTRA_PAD = 30` constant in `MobileGameTable2D.tsx` and applied it as additional horizontal inset on the discard pool container (`left/right: calc(BADGE_W + DISCARD_EXTRA_PAD + safe-area)`). This narrows the pool by 60 px total — exactly 2 xs-tile widths (28 px + 2 px gap = 30 px each side), preventing the overlap.

**Learning:** When tiles use `flex-wrap` with `justifyContent: 'center'`, the first row fills the full container width. Adding explicit inset beyond the badge boundary gives a safe visual buffer.

---

### IMP-010 · Last-played tile indicator — corner box on mobile

**Previous state:** During a claim window there was no persistent visual indicator of which tile was in play beyond the brief SideRail overlay.

**Fix:** Added a last-discard corner indicator in `MobileGameTable2D.tsx` — an xs `MahjongTile2D` with a small "LAST" label, positioned in the top-left corner of the felt area just below the status bar. Derived from `snapshot.discardedBySeat` + the tail of that seat's discard array, so it persists between turns and during claim windows.

**Learning:** Deriving last-discard from `snapshot.discardedBySeat` + `seats[x].discards.at(-1)` is more reliable than `snapshot.pendingDiscard`, which clears after a claim window closes.

---

### IMP-011 · Spirit tiles visibility on mobile — tile images instead of 节 character

**Previous state:** On mobile, the `MobileJingButton` in the status bar showed only the Chinese character `节` — players had to tap it to see which actual tiles were spirit tiles.

**Fix:** Updated `MobileJingButton` in `game-page.tsx` to render xs-sized `MahjongTile2D` components (with `isJing=true` gold treatment) instead of the text glyph. Both primary and secondary spirit tiles are shown inline. Tapping still opens the full-screen overlay. The button's style was simplified to a bare wrapper (`background: none, border: none`) since the tiles carry their own visual treatment.

**Learning:** Always prefer showing the actual tile images over text glyphs when `MahjongTile2D` is available — the SVG textures are more recognizable at a glance than a character.

---

### IMP-012 · Improve account security — account page organization

**Previous state:** Account management actions (change password, delete account, profile) were scattered across different entry points.

**Fix:** Resolved together with IMP-008. All user-account actions now live on the `/account` page: Profile Settings, Change Password, and Delete Account. The home page entry point is a single "Account" link.

**Learning:** Consolidating account actions in one place reduces cognitive load and makes the destructive "Delete Account" action appropriately separated from the main game lobby.

---

## PR #87 · `fix/bug-023-rematch-invalid-phase` (2026-06-09)

### BUG-023 · Invalid phase error on game completion — continue button fails

**Symptom:** After the final hand of a session, the host sees the `HandRevealScreen` with an "End Session" button. After clicking it, an INVALID_PHASE error would appear (`GameErrorScreen`) instead of the session end screen. All players had to exit and create a new room.

**Root cause:** `endSession` emits `game:ended` but never broadcasts a snapshot or clears `session.lastHandReveal`. On the client, `handleEnded` only called `setEnded(payload)` — it never called `setHandReveal(null)`. The `HandRevealScreen` persisted because `{handReveal && <HandRevealScreen>}` was evaluated first in the render tree, blocking `WinAnnouncementOverlay` and `GameEndScreen` from ever appearing. The user still saw the "End Session" button and clicked it a second time. By then `pendingHandEnd` was already `null` on the server → `INVALID_PHASE` error → `GameErrorScreen`.

**Fix:** In `apps/web/src/hooks/use-game.ts`, updated `handleEnded` to call `setHandReveal(null)` before `setEnded(payload)`. This clears the hand-reveal screen the moment the session ends, allowing `WinAnnouncementOverlay` and then `GameEndScreen` to render without requiring any server-side changes.

**Key learning:** When a server event terminates a multi-step flow (`game:ended` ending the `HandRevealScreen` → `GameEndScreen` sequence), the event handler must clear ALL intermediate UI state that the server no longer tracks. `endSession` deliberately skips `broadcastSnapshots` (the session is over), so the client must clean up after itself on `game:ended`.

---

## PR #89 · `fix/bug-020-last-discard-pulse` (2026-06-09)

### BUG-020 · Last-discard red pulse never visible to end user

**Symptom:** The most recently discarded tile should display a pulsing red outline so players can see which tile is "in play." No red pulse was ever visible during live gameplay, despite six successive fixes.

**Root cause:** All six fixes were applied to `CombinedDiscardPool2D` — the **desktop** discard pool. Live gameplay happens on phones, and `game-page.tsx` routes any touch device with a dimension < 600px to `MobileGameTable2D` → `MobileDiscardPool2D`, which never received any of the fixes. The mobile pool was broken three ways:

1. **Wrong gate:** pulse required `claimWindow !== null`, but the server only sends `game:claim-window` to seats with an eligible claim — the discarder and non-claiming viewers never qualify, so the pulse condition was almost never true.
2. **Framer Motion repeat:Infinity bleed:** when the pulse condition _was_ true at tile mount, `initial={opacity:0, scale:0.7}` combined with `animate={boxShadow keyframes only}` meant opacity never animated to 1 — the tile itself stayed **invisible** for the whole claim window (the exact failure mode already documented in `CombinedDiscardPool2D`'s comments).
3. **Stale styling:** still used the original gold shimmer instead of the red outline.

This matched suspected cause #2 in the original report: "`CombinedDiscardPool2D` may not be the component actually rendered." It wasn't — on every phone.

**Fix:** Ported the working mechanism from `CombinedDiscardPool2D` to `MobileDiscardPool2D`: pulse driven by the store's `lastDiscard` (set by `game:event {kind:'discard'}`), exact seat+tile match, `isLastDiscard` prop on `MahjongTile2D` (isolated overlay with red border fallback), and the pulse-state-in-key remount. Added `data-testid="last-discard-pulse"` to the overlay and a new `last-discard-pulse.test.tsx` suite that uses the **real** Zustand store (every prior test mocked it) covering both mobile and desktop pools plus the store's `lastDiscard` lifecycle.

**Key learnings:**

1. **When a fix "has no effect" repeatedly, verify the component under repair is the one actually rendered on the affected device class.** Desktop/mobile component forks mean a fix can be correct yet land in dead code for the reporting user. Check the dispatch logic (`GameTable2D`, `isMobile`) first.
2. **Mocked-store tests can't catch wiring bugs.** All discard-pool tests mocked `useGameStore`, so no test ever exercised the real `lastDiscard` selector path. Keep at least one integration test on the real store for state-driven visual features.
3. **Forked components drift.** `MobileDiscardPool2D` was copied from `CombinedDiscardPool2D` and silently kept the pre-fix pulse implementation through six rounds of fixes. When fixing a bug in a component that has a device-specific sibling, grep for the sibling and apply the fix to both (or extract the shared logic).

---

## PR #90 · `fix/bug-025-end-flow-order` (2026-06-09)

### BUG-025 · Game end screens out of order — winner announcement last instead of first

**Symptom:** Two related problems. (1) A hand ended with no pause or announcement of who won — the UI jumped straight to the detail screen. (2) At session end the screens ran in the wrong order: detail screen (`HandRevealScreen`) → "View Results" gate (`WinAnnouncementOverlay`) → "X player won" popup (`GameWinnerPopup`, buried inside `GameEndScreen`) → final scores. The winner announcement — the screen that should open the sequence — appeared last.

**Root cause:** The winner announcement existed only as the _first frame of the final screen_ (`GameEndScreen` rendered `GameWinnerPopup` before its own results), and a second redundant announcement (`WinAnnouncementOverlay`) gated it. Nothing fired at the moment `game:hand-reveal` arrived, which is when the announcement belongs.

**Fix (all client-side, `apps/web`):**

1. **Announcement first:** when `game:hand-reveal` arrives, a full-screen `GameWinnerPopup` (now a generic title/subtitle announcement component, ~2.8s, tap to skip) shows before any other screen. Mid-session hands announce the hand result (win/draw/concede); the last hand announces the session winner (snapshot scores + the reveal's `spiritDeltas` = the server's cumulative scores) with the hand result as subtitle.
2. **Auto-advance on the last hand:** the host client emits `game:advance-hand` as soon as the last hand's reveal arrives — the old "View Final Scores" click added nothing, and ending immediately lets `game:ended` (placement/ELO) arrive during the announcement. If the emit is lost, `HandRevealScreen` still renders afterwards with the manual button as a fallback.
3. **Results second, details last:** `WinAnnouncementOverlay` and the popup inside `GameEndScreen` are gone; after the announcement the results screen shows directly, with a new "View Hand Details" button that opens `HandRevealScreen` in a new `review` mode (back button) as the final screen. The reveal payload is preserved in a new `finalHandReveal` store slice when `game:ended` clears `handReveal`.
4. **Latent bug fixed:** nothing ever cleared `handReveal` when the _next hand_ started (only `game:ended` cleared it — BUG-023's fix covered just the session-end path). A stale `HandRevealScreen` would have blocked the next hand's pre-game flow. `setSnapshot` now drops `handReveal` whenever a snapshot arrives with a non-null `preGamePhase`.
5. `GameEndScreen` now prefers `ended.finalScores` over snapshot seat scores — snapshot scores exclude the final hand's spirit settlement because `endSession` never broadcasts a snapshot.

**Key learnings:**

1. **Announce at the trigger, not inside the destination.** A "moment of ceremony" (winner popup) must key off the _event_ that creates it (`game:hand-reveal`), not be embedded as the first render state of a later screen — otherwise any gating screen in between pushes it to the end of the sequence.
2. **Remove a manual step when reordering makes it meaningless.** Once results precede the detail screen, the host's "View Final Scores" click gated nothing; auto-emitting on the trigger event (with the old screen kept as a fallback path) is safer than leaving a button whose second click produces INVALID_PHASE.
3. **When one event of a pair clears shared state, audit the other paths.** BUG-023 cleared `handReveal` on `game:ended` but the `startNextHand` path had the identical staleness bug, masked only because test sessions ended after one hand.

---

## Inline Fix · `chore/add-bugs-and-improvements` (2026-06-10)

### BUG-034 · Spirit tile character incorrect — using 节 instead of 精

**Symptom:** The spirit tiles (jing tiles) in the game UI displayed the wrong Chinese character: 节 (jié, "section/node") instead of 精 (jīng, "essence/spirit").

**Root cause:** Hardcoded character in `JING_CHAR` constant in `MahjongTile2D.tsx`.

**Fix:** Changed `const JING_CHAR = '节'` to `const JING_CHAR = '精'` in `apps/web/src/components/2d/MahjongTile2D.tsx`. Updated corresponding test in `MahjongTile2D.test.tsx` to expect the correct character.

**Key learning:** Hardcoded non-English characters should be validated for semantic correctness with domain experts, not just tested for presence. A character that renders without errors can still be wrong.

---

## PR · `fix/bug-026-033-imp-017`

### BUG-026 · Settlement text — "Received/Paid" clarity

**Root cause:** Both `SettlementPreview.tsx` (pre-game bonus tile settlement) and the spirit settlement section in `HandRevealScreen` displayed deltas as bare `+X` / `-X` numbers with no semantic label. Players unfamiliar with accounting-style sign conventions couldn't immediately tell if the number was earned or owed.

**Fix:** Replaced the bare `+X` / `−X` display with `t('settlementReceived', n)` ("Received X") for positive deltas and `t('settlementPaid', n)` ("Paid X") for negative, plus a neutral dash `t('settlementEven')` for zero. Added i18n keys `settlementReceived`, `settlementPaid`, `settlementEven` to both `en.json` and `zh.json`.

**Key learning:** Use semantic labels ("received"/"paid") instead of sign-only arithmetic display in settlement UI — casual players don't share the intuition that `+` = earned and `−` = owed.

---

### BUG-033 · Meld labels English-only in ZH UI

**Root cause:** `MELD_KIND_LABEL` was a module-level constant (`{ pung: 'PUNG', chow: 'CHOW', kong: 'KONG' }`) and `PAIR_LABEL = 'PAIR'` — both hardcoded strings defined outside any component, so they never went through the `t()` translation hook and were always displayed in English regardless of UI language.

**Fix:** Deleted the module-level constants. Inside `HandRevealScreen`, defined `MELD_KIND_LABEL` and `PAIR_LABEL` as local variables using `t('gamePung')` / `t('gameChow')` / `t('gameKong')` (reusing existing keys) and the new `t('handPair')` key. Added `"handPair": "Pair"` (EN) / `"handPair": "对子"` (ZH) to the i18n files.

**Key learning:** Module-level string constants bypass i18n. Any display string must be computed inside a component where `useI18n()` is in scope. The no-literal-string rule guards JSX text nodes but not object literals outside components.

---

### IMP-017 · Yellow felt color added

**Fix:** Added `'yellow'` to the `FeltTheme` union type in `theme.store.ts`. Added dark amber config (`top: '#2e1f00'`, `bottom: '#130d00'`) to `FELT_CONFIGS` in `theme.utils.ts`. Added i18n keys `"customizeFeltYellow": "Yellow"` (EN) / `"customizeFeltYellow": "金黄"` (ZH). Added the yellow option to `FELT_OPTIONS` in `customize-page.tsx` and updated the felt swatch grid from `grid-cols-4` to `grid-cols-5`. Updated the customize page test to expect five felt options.

---

## PR · `feat/imp-013-015-016`

### IMP-013 · Hand detail screen now shows player names

**Fix:** In `HandRevealScreen` (`game-page.tsx`), added `snapshot.seats[i].seatName` as a `<span>` beside the wind character in each hand section header. Players now see e.g. "東 Alice" in the all-hands review.

---

### IMP-015 · Configurable claim window timeout

**Fix:** Added `claimWindowSecs: z.number().int().min(0).max(60).default(8)` to `RoomSettingsSchema` in `packages/shared/src/room.schemas.ts`. 0 = unlimited (no timer fired; window closes only when all eligible seats respond). Updated `openClaimWindowAfterDiscard` in `apps/api/src/game/game.service.ts` to read `session.settings.claimWindowSecs` instead of a hardcoded constant. Added a 5-option row (5s / 8s / 15s / 30s / ∞) to the room config screen (`room-page.tsx`), wired through `updateSettings`. Added `claimWindowSecs` to the `RoomSettingsDto`, rooms controller and service `updateSettings` method. Rob-kong window remains a fixed 5s.

**Key learning:** `claimWindowSecs = 0` as the infinite sentinel keeps the type as `number` and avoids a nullable union. The server-side branch `isInfinite = windowSecs === 0` skips the `setTimeout` entirely; the window resolves when `claimWindowComplete` fires (all eligible seats responded).

---

### IMP-016 · Kong from existing pung + concealed kong during draw turn

**Fix:** Added a `KongActionSheet` bottom sheet that intercepts discard attempts during the player's turn (`isMyTurn`). When the player taps to discard a tile, `handleDiscardOrKong` checks:

1. **Concealed kong:** `concealedKongOptions(hand, jingTypes)` — if the tile type is in the result, offer "Declare Concealed Kong?".
2. **Add-to-kong:** for each open pung, `addToKongOptions(hand, pungTile, jingTypes)` — if the tile to remove matches the selected tile, offer "Extend Kong?".

If options exist, the `KongActionSheet` (z-40, matches existing sheet style) shows two buttons — "Kong" and "Discard". "Kong" fires `onKongConcealed(tile)` or `onKongAdd(pungTile)` from `useGame`. "Discard" falls through to the existing jing-confirmation / plain-discard flow. `concealedKongOptions` and `addToKongOptions` were re-exported from `@nanchang/shared` so the web layer can use them without a direct engine dependency. The engine's `addToKong` and `kongConcealed` calls were already wired on the backend; this PR adds the UI entry point.

**Key learning:** The engine's `addToKongOptions(hand, pungTile, jingTypes)` returns the tile to _remove_ from hand (which may be a jing, not the pung tile type itself). Match the _returned_ tile against the selected tile, not the pung tile type. `concealedKongOptions` and `addToKongOptions` both accept `TileType[]` for jingTypes, not `Set<string>` — convert with `Array.from(jingTypes)` at the call site.

---

## PR · `fix/bug-027-bust-end-condition`

### BUG-027 · Bust-mode end condition fires mid-round and wrong starting score

**Root cause (end condition):** `GameService.isSessionOver()` checked `cumulativeScores.some(s => s < 0)` after every hand. This could terminate a bust-mode session immediately when a player went negative due to spirit settlement mid-round, even though they could recover by winning subsequent hands in the same round.

**Root cause (starting score):** Bust mode sessions were using `settings.startingScore` (defaulting to 0) instead of the required starting score of 20. No UI existed to set `startingScore`, so it was always 0.

**Fix:**

1. `apps/api/src/game/game.service.ts` — `isSessionOver()`: added `nextDealerInfo.roundComplete &&` guard to the bust check. The elimination check now only runs when a full four-hand rotation has completed.
2. `apps/api/src/game/game.service.ts` — game start: `initialScore = settings.terminationType === 'bust' ? 20 : settings.startingScore`. Bust mode always begins at 20 regardless of the room's `startingScore` field.
3. `apps/api/src/game/game-session-over.spec.ts` — 8 new unit tests covering bust mid-round/round-end cases and rounds east/east+south cases.

**Key learning:** In this rules system a "round" = one full rotation of the dealer position (all four seats being dealer once). The `nextDealerInfo.roundComplete` flag from `nextDealer()` is the correct gate for any end-of-round check. Do not use per-hand score checks for round-level termination conditions.

---

### BUG-028 · End of game INVALID_PHASE error — host/non-host continue inconsistency

**Root cause (INVALID_PHASE):** `handleAdvanceHand` returned `INVALID_PHASE` when `session.pendingHandEnd` was null. This could be hit legitimately when: (a) the dealer's auto-advance already fired and cleared `pendingHandEnd`, but `game:ended` was briefly delayed and the player clicked the manual fallback Continue button; or (b) the dealer is a bot seat and the server allows any human to advance — two humans clicking in quick succession would have the second one hit the null check.

**Root cause (bot-dealer freeze):** When the current hand's dealer seat is occupied by a bot, `isDealer = viewerSeat === snapshot.dealerSeat` is false for all human players. Both `HandRevealScreen` and `PreGameFlow` received `isHost={false}`, showing WaitingDots to everyone. The auto-advance effect also checked `vs === snapshot.dealerSeat` before firing, so it never triggered. Result: the game was permanently frozen whenever the dealer rotated to a bot seat.

**Fix:**

1. `apps/api/src/game/game.service.ts` — `handleAdvanceHand()`: changed `return this.emitError(socket, 'INVALID_PHASE')` to a silent `return` when `!pending`. The caller will shortly receive `game:ended` or the next hand's `game:snapshot`; emitting an error served no purpose and caused visible UX problems.
2. `apps/web/src/pages/game/game-page.tsx` — Added `canAdvanceHand` computed value: `isDealer || (dealerIsBot && viewerSeat === firstHumanSeat)`. When the dealer is a bot, the first non-bot seat index acts as the advance proxy — matching the server's "any human may advance when dealer is bot" permission.
3. `HandRevealScreen` and `PreGameFlow` now receive `isHost={canAdvanceHand}` so the Continue button appears for the correct player even with a bot dealer.
4. Auto-advance effect updated with the same bot-dealer logic: fires for the first human seat when `isLastHand=true` and the dealer is a bot.

**Key learning:** "Dealer" and "room host" are distinct concepts (see Key Learning #2). When bot seats can hold the dealer role, advance-hand permissions need to fall back to a designated human rather than silently showing WaitingDots to everyone. `pendingHandEnd === null` in `handleAdvanceHand` is always a race/duplicate — never a client bug worth surfacing as an error.

---

### IMP-014 · Language change during active game

**Root cause:** `LangToggle` was only rendered inside `ScreenShell`, which is not used by `GamePage` (the game has its own full-screen layout with a status bar). There was no path for a player to switch language once gameplay started.

**Fix:** Added `LangToggle` to the right-side controls in `GamePage`'s status bar (the `absolute top-0` bar that also shows round wind, wall count, history, and concede). A single import change (`LangToggle` added alongside `useI18n`) and one JSX addition. The underlying `changeLanguage` from react-i18next re-renders all `t()` calls globally and instantly — no engine involvement needed, purely a UI concern.

**Key learning:** Language switching is stateless in react-i18next — calling `instance.changeLanguage()` triggers a re-render of every component using `useTranslation()`. There are no mid-game stability concerns; the engine and server are language-agnostic. The only blocker was surface area: the game page never mounted the toggle.

---

### IMP-018 · Per-seat bot assignment in room config

**Root cause:** Bots were configured only at room-creation time via a lobby-page stepper (count 0–3, uniform difficulty). There was no REST endpoint, no service method, and no UI to add a bot to a specific seat after the room existed.

**Fix:**

1. `apps/api/src/rooms/dto/add-bot.dto.ts` — new `AddBotDto` with `difficulty: 'easy' | 'normal'`.
2. `apps/api/src/rooms/rooms.service.ts` — `addBotToSeat(roomId, seatIdx, difficulty, requestingUserId)`: validates host + empty seat, writes bot item via DynamoDB transact with `attribute_not_exists(PK)` guard.
3. `apps/api/src/rooms/rooms.controller.ts` — `POST /rooms/:roomId/seats/:seatIdx/bot`: host-only, broadcasts `room:update` after success.
4. `apps/web/src/hooks/use-room.ts` — removed `BotConfig` param from `createRoom`; added `addBotToSeat(roomId, seatIdx, difficulty)` action.
5. `apps/web/src/pages/lobby/lobby-page.tsx` — removed bot count stepper and difficulty toggle; `handleCreate` now calls `createRoom()` with no args.
6. `apps/web/src/pages/room/room-page.tsx` — empty seats (host-only) show an "Add Bot" button that expands to Easy Bot / Normal Bot pill buttons. Cancellable with ✕. Existing kick button removes bots (already supported by `kickSeat`).
7. i18n: added `roomAddBot` key (EN: "Add Bot", ZH: "添加机器人").

**Key learning:** Bot userId convention `bot-<difficulty>-<seatIdx>` is the only identifier used by the game engine — no schema migration needed. The DynamoDB `ConditionExpression: 'attribute_not_exists(PK)'` prevents a race where two clients both try to add a bot to the same seat.

---

### BUG-035 · Tile textures show broken-image placeholder during active game

**Symptom:** Some tiles in the player's hand, open bot melds, and the discard pool showed the browser's native broken-image (mountain/landscape) icon instead of their SVG textures. The specific tiles affected were inconsistent across sessions.

**Root cause:** When the Vite dev server restarts or hot-reloads, in-flight HTTP requests for static SVG texture files may return transient 404 responses. The browser caches these 404s. Because React does not update `<img>` `src` attributes unless the prop value changes — and the prop value (`/textures/Tiles/Regular/Man5.svg`) stays the same — the browser never retries the request. The result is a permanently broken image for the rest of that session, even after the server is healthy.

A secondary risk is any future runtime path where an invalid tile type is passed to `tileTexturePath` (e.g., an incorrect cast, a future engine type mismatch). `TILE_TO_FLUFFY[unknownType]` returns `undefined`, producing a path of `/textures/Tiles/Regular/undefined.svg` — a guaranteed 404.

**Fix:**

1. `apps/web/src/components/2d/MahjongTile2D.tsx` — Added `retryCount` state and `handleImgError` callback to the component.
   - `retryCount = 0`: normal load from `baseSrc`.
   - `retryCount = 1`: first error → retry with `baseSrc?r=1` (cache-busting query string bypasses the browser's cached 404; if the dev server is now healthy the tile loads correctly).
   - `retryCount = 2`: retry also failed → `imgSrc = null` → `<img>` is not rendered. The tile body (ivory background + gold border) remains visible as a plain blank-face tile — no broken-image icon.
   - A `useEffect` resets `retryCount` to 0 whenever `baseSrc` changes so a newly-drawn tile always gets a fresh load attempt.
2. `apps/web/src/r3f/utils/tile-texture-map.ts` — `tileTexturePath` now casts the lookup to `Record<string, string | undefined>` before reading, enabling a runtime-safe null check. If the name is `undefined` (unknown tile type), logs `console.warn` and returns `Blank.svg` as a fallback instead of producing an `undefined.svg` path.

**Key learning:** React's diffing algorithm does not remount `<img>` elements when only the browser-side load state changes — only when the `src` prop changes in the VDOM. To recover from a browser-cached 404, you must supply a new `src` value (e.g., by appending a cache-busting query string). An `onError` handler that updates React state is the correct mechanism; direct DOM mutation via `e.currentTarget.src = ...` gets overwritten on the next React render.

---

### IMP-019 · Manual tsumo — winning must be a conscious player action

**Request:** When a player draws a tile that completes their hand, the game previously auto-declared a self-draw win (tsumo) immediately with no player input. Players should instead be offered a choice: declare the win or continue playing (e.g., to chase a higher-scoring hand).

**Fix:**

1. `packages/shared/src/game.events.ts` — Added `CanTsumoPayload { seat }` interface for the new `game:can-tsumo` socket event.
2. `apps/api/src/game/game.service.ts` — Removed the auto-tsumo block from `startTurn()`. Replaced with a `game:can-tsumo` private emit to the active player's socket when their 14-tile hand is a winning hand. Added `handleTsumo(socket, userId, gameId)` method which validates seat/phase and calls `applyWinClaim(..., 'tsumo', ...)`. Moved bot auto-tsumo into `handleBotTurn()` (bots still auto-win — they have no UI to interact with).
3. `apps/api/src/game/game.gateway.ts` — Added `game:tsumo` to the throttle map (limit 2/s) and a `@SubscribeMessage('game:tsumo')` handler that delegates to `gameService.handleTsumo`.
4. `apps/web/src/stores/game.store.ts` — Added `canTsumo: boolean` state and `setCanTsumo` action. Cleared in `setSnapshot` (turn moved on) and on discard.
5. `apps/web/src/hooks/use-game.ts` — Added `handleCanTsumo` listener for `game:can-tsumo` (sets `canTsumo = true` for the viewer's seat only). Added `declareTsumo` action (emits `game:tsumo`, clears `canTsumo`). `discard` action now also clears `canTsumo` (player chose to keep playing). Exports `canTsumo` and `declareTsumo`.
6. `apps/web/src/pages/game/game-page.tsx` — Added `TsumoSheet` component (same bottom-sheet pattern as `KongActionSheet`): gold title "You can win!", subtitle, "Declare Win" primary button and "Keep Playing" dismiss button. Wired into `GameTable` via `canTsumo` + `onDeclareTsumo` + `onDismissTsumo` props. Tiles are non-interactive while the sheet is visible (`ViewerHandHUD` and `AccessibleHand` gated on `!canTsumo`).
7. `apps/web/src/components/2d/PlayerHand2D.tsx` — Added `canTsumo` store read; added to `interactive` guard so 2D tiles are also non-interactive while the tsumo offer is showing.
8. i18n: 4 new keys in EN+ZH (`tsumoTitle`, `tsumoSubtitle`, `tsumoDeclare`, `tsumoContinue`).

**Key learning:** Server-emitted private events (targeted to one socket) are the right pattern for turn-private information like "you can declare a win". The event is not broadcast — other players do not learn that the active player has a winning hand until they actually declare it.

---

## PR · `fix/bug-036-spirit-double-settlement` (2026-06-11)

### BUG-036 · End-of-hand spirit settlement double-counted on won hands

**Symptom:** After any hand that ended in a win, players holding spirit (jing) tiles received — and others paid — exactly double the correct spirit settlement amount. Draw and concede hands settled correctly. The error compounded across the session because each hand's `startingScores` seeded from the inflated cumulative totals, and `isSessionOver()` read those same inflated figures so bust-mode termination could trigger at the wrong time.

**Root cause:** Two layers both applied the spirit settlement on the win path:

1. `packages/engine/src/engine.ts` `win()` computed `calculateSpiritSettlement(...)` and baked it into `seats[i].score` alongside the win payment.
2. `apps/api/src/game/game.service.ts` `handleHandEnd()` called `calculateSpiritSettlement(state.seats, ...)` again on those same finished-state seats (hands/openMelds unchanged → identical deltas) and added the result a second time: `cumulativeScores[i] = state.seats[i].score + spiritDeltas[i]`.

Draw and concede paths were correct because the engine never touched scores there — `handleHandEnd`'s single application was the only one.

**Fix:** Removed `calculateSpiritSettlement` from the engine's `win()` entirely. The engine now applies only the win payment (`paymentResult.scoreDelta`). The service's `handleHandEnd()` remains the single, uniform place that applies spirit settlement for all three hand-end types (win / draw / concede). The `calculateSpiritSettlement` import was also removed from `engine.ts` since it is no longer called there.

**Files changed:**

- `packages/engine/src/engine.ts` — removed spirit delta from `win()` score application; removed `calculateSpiritSettlement` import
- `packages/engine/src/__tests__/engine.test.ts` — added `Engine·BUG-036-regression` describe block: injects state with a winning hand that holds spirit tiles, confirms post-win seat score equals starting + win payment only, and confirms `calculateSpiritSettlement` on the finished state returns a non-zero delta (proving spirit would have changed the score if the engine had applied it)

**Key learning:** When two layers each hold partial responsibility for a calculation, the invariant is fragile. For settlements that must apply once regardless of how the hand ended, own the logic in exactly one place (here: the service layer). The engine's `win()` should only apply the win payment — it has no business knowing about the service-side cumulative score model.

---

### BUG-030 · Settlement bonus points incorrectly doubled (closed as duplicate of BUG-036)

**Symptom:** When one player held spirit (jing) tiles and no other player had any (the Indomitable Spirit case), the bonus was reported as double the correct amount and the other players were charged double. The symptom was most visible with the Indomitable Spirit rule (sole spirit holder, intentionally ×2), where that ×2 was applied by the formula and then the entire settlement was doubled again.

**Root cause:** Same as BUG-036 — the spirit settlement was computed and applied twice on the win path (once in the engine, once in the service). For normal multi-player spirit cases this produces an incorrect but less-obvious doubled figure. For the Indomitable Spirit case (only one player has spirits) the effective score is `raw × 2` (Indomitable) × 2 (double-count) = 4× the correct value, which made it immediately visible. BUG-030 was filed with "flowers/seasons" framing but the app uses spirit tiles (jing) for all end-of-hand bonus settlement — same code path.

**Fix:** Closed by the BUG-036 fix. No additional changes needed.

**Key learning:** The most extreme edge case (Indomitable Spirit — sole holder) surfaces the bug most clearly because the intentional ×2 amplifies the accidental ×2 into a visually obvious ×4. Always test the "only one player qualifies" edge case for any settlement rule that includes a multiplier for that condition.

---

## Key Learnings Across All Fixes

1. **Data flow verification:** Always trace socket emit → subscription → store update → render when debugging end-to-end features.
2. **Host vs Dealer:** Distinct concepts. Host is fixed; dealer rotates. Never conflate.
3. **Silent error handling:** Always subscribe to error events (e.g., `game:error`) from day one to avoid mysterious silent failures.
4. **Monorepo package resolution:** Dual-environment packages need both `"import"` and `"require"` in `"exports"`. Jest needs `moduleNameMapper`.
5. **Environment configuration:** Always provide fallback env paths for all execution contexts (direct runs vs. pnpm filter).
6. **Geometry and orientation:** In 3D, texture V-axis orientation matters. Flat tiles need consistent `ry=π` so text points toward viewer.
7. **Material transparency:** SVG textures with transparent backgrounds need `transparent: true, depthWrite: false` to render correctly.
8. **Database persistence:** Use volumes for persistent dev databases; reserve in-memory for CI only.
9. **Engine vs. resolver:** Engine functions are general-purpose. Family-specific rule restrictions apply at the boundary layer (claim-resolver).
10. **Testing edge cases:** Position-dependent mechanics need tests for all seat positions, including wrap-around.
11. **Character localization:** Hardcoded characters in code must be validated for semantic correctness — they won't auto-translate and visual correctness alone doesn't guarantee the character is the right choice semantically.
12. **Image retry on 404:** React does not re-request an `<img>` whose `src` prop hasn't changed, even if the browser cached a transient 404. The only way to force a retry is to change the `src` value (e.g., append a cache-busting query string). Use `onError` state to drive this; avoid direct DOM mutation (`e.currentTarget.src = ...`) which React will overwrite on the next render.
