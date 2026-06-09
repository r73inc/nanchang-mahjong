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
