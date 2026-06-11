# Closed Issues & Improvements

This document details all closed bugs (BUG-XXX) and completed improvements (IMP-XXX) with their root causes, fixes, and key learnings. Organized chronologically by PR/branch.

For phases, planning, and roadmap work see `Plan-and-roadmap.md`.

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
