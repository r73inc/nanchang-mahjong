# Bug Log — Nanchang Mahjong

Chronological record of bugs discovered and fixed during development. Intended to help future Claude sessions avoid repeating the same mistakes and to build institutional knowledge about this codebase's failure modes.

---

## PR #29 — `chore/local-dev-setup` (2026-06-04)

First full end-to-end local run. All bugs below were discovered by actually starting the services and trying to play a game.

---

### BUG-001 · PowerShell 5.1 ParseException — Unicode characters in script

**Symptom:** `dev-setup.ps1` threw `ParseException at line 59 char:8 Missing closing '}'` immediately on launch.

**Root cause:** PowerShell 5.1 on Windows reads `.ps1` files as Windows-1252 by default unless the file has a BOM. Unicode characters (▶ ✓ ━ —) in Write-Host strings confused PS5.1's brace-depth tracker, making it miscount `{}` pairs and crash the parser before execution started.

**Fix:** Rewrote the entire script using ASCII-only output characters. Replaced `2>&1` redirects with `ForEach-Object` pipelines (PS5.1 wraps native stderr lines in `ErrorRecord` objects when using `2>&1`, setting `$?` to `$false` even on success).

**Learning:** Any script targeting PS5.1 must be ASCII-only unless saved with UTF-8-BOM encoding. The `2>&1` operator on native executables is unreliable in PS5.1 — use `| ForEach-Object { $_ }` or simply omit the redirect and let stderr surface naturally.

---

### BUG-002 · DynamoDB health check always timing out

**Symptom:** `dev-setup.ps1` reported DynamoDB not ready after 40 retries, even though the container was up and healthy.

**Root cause:** The health check used `Invoke-WebRequest http://localhost:8000` — but DynamoDB Local returns HTTP 400 on a plain GET (it only speaks its own binary protocol). PS5.1's `Invoke-WebRequest` throws a terminating error on any non-2xx status, so the catch-block always triggered regardless of whether DynamoDB was actually up.

**Fix:** Replaced the HTTP probe with a raw TCP connection check using `[System.Net.Sockets.TcpClient]`. A successful TCP connect on port 8000 is sufficient to confirm the container is listening.

```powershell
function Wait-Port {
  param([string]$Name, [int]$Port, [int]$MaxRetries = 40, [switch]$Required)
  for ($i = 0; $i -lt $MaxRetries; $i++) {
    $tcp = New-Object System.Net.Sockets.TcpClient
    try { $tcp.Connect('localhost', $Port); $tcp.Close(); <# ready #> return }
    catch { } finally { $tcp.Dispose() }
    Start-Sleep -Seconds 2
  }
}
```

**Learning:** Never use HTTP probes for services that return non-2xx on bare GETs (DynamoDB, Kafka, etc.). Use TCP connect for "is the port open?" checks. Reserve HTTP probes for services that have a proper health endpoint (MinIO `/minio/health/live`, NestJS `/health`).

---

### BUG-003 · `seed-admin` ConditionalCheckFailedException

**Symptom:** Running `pnpm seed:admin` crashed with DynamoDB `ConditionalCheckFailedException`.

**Root cause:** `profileItem` was built with a spread that included `...DK.handleLock(ADMIN_HANDLE)`. `DK.handleLock()` returns `{ PK: 'HANDLE#admin', SK: 'LOCK' }`. The spread overwrote the profile item's own `PK`/`SK` keys, so both the profile `PutCommand` and the handle-lock `PutCommand` targeted the exact same DDB key — the second `Put` then failed its `attribute_not_exists(PK)` condition.

Additionally, the `UsernameExistsException` recovery path tried to look up the Cognito user's sub from DynamoDB, which would also be wrong if the profile write had partially failed.

**Fix:**

1. Removed `...DK.handleLock(ADMIN_HANDLE)` from the `profileItem` spread entirely.
2. Changed the `UsernameExistsException` recovery path to call `AdminGetUserCommand` against Cognito directly (the sub is the authoritative source there).
3. Made the handle-lock `PutCommand` unconditional (no `ConditionExpression`) so re-runs are idempotent.

**Learning:** Never spread two DDB key-builders into the same object. Each DDB item must have exactly one `PK`/`SK` pair. The last spread wins silently, with no TypeScript error. Pattern to follow: build the profile item with its own keys, then write the handle-lock as a completely separate `PutCommand` with its own `Item` literal.

---

### BUG-004 · API returning 500 — `ECONNREFUSED` on sign-in

**Symptom:** Logging in from the browser returned HTTP 500. API logs showed `ECONNREFUSED` connecting to Cognito on port 9229.

**Root cause:** `ConfigModule.forRoot()` was called without `envFilePath`, so NestJS looked for `.env` in the process CWD. When started via `pnpm --filter @nanchang/api dev`, pnpm sets CWD to `apps/api/` — not the repo root where `.env` lives.

**Fix:** Added `envFilePath: ['.env', '../../.env']` to `ConfigModule.forRoot()`. The array is tried in order; the first file found wins. This works whether the API is started from `apps/api/` directly or from the repo root.

```typescript
ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: ['.env', '../../.env'],
  load: [configuration],
  validationSchema: envSchema,
}),
```

**Learning:** pnpm filter runs always set CWD to the workspace package directory, not the repo root. Never assume `.env` at `process.cwd()`. Always provide a fallback path array that covers both execution contexts.

---

### BUG-005 · CSS `@import` warning — Google Fonts import after Tailwind directives

**Symptom:** Vite printed a warning: `@import rules must precede all other rules (except @charset and @layer)`.

**Root cause:** `apps/web/src/index.css` had the Google Fonts `@import url(...)` line after the `@tailwind base` directive, violating the CSS spec which requires `@import` to come before all other statements.

**Fix:** Moved the Google Fonts `@import` to the very top of `index.css`, before any `@tailwind` directive.

**Learning:** CSS `@import` must be the first thing in a stylesheet (after optional `@charset`). Tailwind's directives count as real CSS statements. Vite's CSS bundler is strict about this even in dev mode.

---

### BUG-006 · API crash — `SyntaxError: Unexpected token 'export'`

**Symptom:** After `nest start --watch` compiled the API, it crashed immediately with `SyntaxError: Unexpected token 'export'` pointing into `packages/engine/src/`.

**Root cause:** `packages/engine/package.json` had `"main": "./src/index.ts"`. When `nest start` compiled the API to CommonJS in `dist/`, the compiled output called `require('@nanchang/engine')` at runtime. Node.js resolved it via `"main"` to `./src/index.ts` and attempted to execute raw TypeScript — which it cannot do. The `export` keyword in the TypeScript source triggered the syntax error.

**Fix:** Two-part:

1. Added `tsconfig.build.json` (CommonJS output target) + `"build"` script to both `packages/engine` and `packages/shared`.
2. Added an `"exports"` field to each package routing the `"require"` condition to `./dist/index.js` (compiled CJS) and the `"import"` condition to `./src/index.ts` (TypeScript source for Vite/ESM).
3. Updated the root `"dev"` script to pre-build packages before starting api and web.

```json
"exports": {
  ".": {
    "types": "./src/index.ts",
    "import": "./src/index.ts",
    "require": "./dist/index.js",
    "default": "./dist/index.js"
  }
}
```

**Learning:** In a pnpm monorepo with a NestJS API consuming workspace packages: `nest start --watch` compiles TypeScript to CommonJS in `dist/`. At runtime Node.js calls `require()` on workspace packages. If `"main"` points to `.ts` source, Node.js tries to execute TypeScript directly and crashes. The `"exports"` field with separate `"import"` and `"require"` conditions is the correct solution. `"main"` can stay pointing to `.ts` for legacy TypeScript `moduleResolution: Node` type checking — it is only consulted as a fallback when `"exports"` is absent.

---

### BUG-007 · Blank white screen — Vite resolved CJS build instead of TypeScript source

**Symptom:** After adding the `"exports"` field (BUG-006 fix), the browser showed a blank white page. Console showed named export errors.

**Root cause:** The initial `"exports"` field had `"default": "./dist/index.js"` but no `"import"` condition. Vite is an ESM bundler and checks conditions in order. Without an explicit `"import"` condition, Vite fell through to `"default"` and loaded the CJS `dist/index.js`. CJS files use `module.exports = ...`, which breaks Vite's named-import tree-shaking and caused all named imports from `@nanchang/engine` and `@nanchang/shared` to be `undefined`.

**Fix:** Added `"import": "./src/index.ts"` before `"default"` in the exports map. Vite picks `"import"` first, gets the TypeScript source, and ts-vite transpiles it normally.

**Learning:** When writing `"exports"` for a package consumed by both a Node.js CJS runtime (NestJS) and a Vite ESM bundler, you need both `"require"` (CJS dist) and `"import"` (TS/ESM source) conditions. `"default"` is the last-resort fallback — never use it as the primary resolution path for dual-environment packages.

---

### BUG-008 · S3 `InvalidAccessKeyId` — MinIO credential mismatch

**Symptom:** Uploading replay data to MinIO failed with `InvalidAccessKeyId`. The API logs showed it was connecting to MinIO but auth was rejected.

**Root cause:** `.env.example` had `AWS_ACCESS_KEY_ID=local` and `AWS_SECRET_ACCESS_KEY=local`. The `docker-compose.yml` MinIO service used `MINIO_ROOT_USER=minioadmin` and `MINIO_ROOT_PASSWORD=minioadmin`. The credentials didn't match.

**Fix:** Updated `.env.example` to use `minioadmin`/`minioadmin` to match the docker-compose defaults. Users were instructed to update their local `.env` to match.

**Learning:** MinIO's S3-compatible API authenticates against `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`. The AWS SDK credentials (`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`) must exactly match those values. Document this pairing explicitly in `.env.example` with a comment so future setup doesn't require debugging.

---

### BUG-009 · Host cannot mark ready / start game blocked

**Symptom:** In the lobby, the three non-host players could toggle their ready status, but the host had no ready button and the Start button remained disabled even when all three others were ready.

**Root cause:** Two separate issues:

1. **Frontend:** `allReady` was computed as `filledSeats.every(s => s.ready)`. The host's DDB seat record always has `ready: false` (it's never toggled). So `allReady` was always `false` when the host was seated.
2. **Backend:** `startGame()` checked `occupiedSeats.every(s => s.ready)` with the same bug — rejected the host's start request.

**Fix:** Applied `isHost || ready` in both places. The host is implicitly ready — clicking Start _is_ their readiness signal.

```typescript
// Backend (rooms.service.ts)
if (!occupiedSeats.every((s) => s.isHost || s.ready)) {
  throw new BadRequestException('All players must be ready');
}

// Frontend (room-page.tsx)
const allReady = filledSeats.length === 4 && filledSeats.every((s) => s.isHost || s.ready);
```

**Learning:** The host role requires special-casing in any "all players ready" check. The host never presses Ready — they press Start. Always treat `isHost` as an implicit `ready: true` in any aggregate readiness calculation. Apply this logic symmetrically in both API and frontend.

---

### BUG-010 · Game stuck on Jing reveal screen for all players including host

**Symptom:** After starting a game, all four players (including the host) saw "Waiting for host to reveal Spirit…" indefinitely. Clicking "Reveal Spirit" did nothing visible.

**Root cause:** Three compounding issues:

1. **Silent `game:error` events:** The frontend `useGame` hook subscribed to all `game:*` events except `game:error`. Backend rejections (e.g., `NOT_HOST`) were emitted but silently dropped, giving no feedback.

2. **Wrong "is host" check on frontend:** `game-page.tsx` computed `isHost = viewerSeat === 0`. Seat 0 is the _room host_ (whoever created the room), but the _dealer_ (who performs the jing reveal) is `snapshot.dealerSeat`. For hand 1 both happen to be seat 0, but the check is semantically wrong and would break on subsequent hands.

3. **Wrong dealer check on backend:** `game.service.ts handleRevealJing()` checked `session.seatMap[0]` (room host's userId) instead of `session.seatMap[session.engine.state.dealerSeat]`. Even when the correct player clicked Reveal, the check compared against the wrong userId and emitted `NOT_HOST`.

**Fix:**

- Added `game:error` handler in `useGame` that `console.warn`s the code and message.
- Changed frontend to `const isDealer = viewerSeat !== null && viewerSeat === snapshot.dealerSeat`.
- Changed backend to `const dealerUserId = session.seatMap[session.engine.state.dealerSeat]`.
- Added a backend `WARN` log on rejection with full context (userId, dealerUserId, seatMap, dealerSeat) for future diagnosis.

**Learning:**

- Always subscribe to `game:error` in the frontend hook from day one. Silent server rejections are the hardest bugs to diagnose.
- "Host" and "dealer" are distinct concepts in Mahjong. The dealer rotates every hand; the room host is fixed. Never conflate seat 0 with either concept. Always derive the dealer from `engine.state.dealerSeat`.
- When debugging multiplayer socket issues, the first thing to add is a backend WARN log with the full relevant state — it turns a 30-minute mystery into a 2-minute read.

---

### BUG-011 · Jest CI failure — `Cannot find module '@nanchang/engine'`

**Symptom:** All 20 API test suites failed in CI with `Cannot find module '@nanchang/engine' from 'src/game/game.service.ts'`. Tests passed locally.

**Root cause:** The `"exports"` field added in BUG-006 routes the `"require"` condition to `./dist/index.js`. Jest uses Node.js's `require` condition. In CI, there is no pre-build step, so `dist/` does not exist. Locally, `pnpm dev` pre-builds the packages before starting the dev servers, so `dist/` is present and tests pass. CI runs `pnpm test` directly without any build step.

**Fix:** Added `moduleNameMapper` to `apps/api/jest.config.ts` to bypass the `"exports"` field entirely for Jest:

```typescript
moduleNameMapper: {
  '^@nanchang/engine$': '<rootDir>/../../packages/engine/src/index.ts',
  '^@nanchang/shared$': '<rootDir>/../../packages/shared/src/index.ts',
},
```

ts-jest transpiles the TypeScript source on the fly, so no pre-built `dist/` is needed.

**Learning:** When adding an `"exports"` field with a `"require"` condition pointing to compiled output, Jest (which uses `require`) will break in any environment that hasn't run a build step. The fix is `moduleNameMapper` in Jest config — not a CI build step — because `moduleNameMapper` is unconditional, explicit, and doesn't add build latency to the test pipeline. Add this mapper at the same time as the `"exports"` field; never add one without the other.

---

## PR #30 — `chore/bug-log` (2026-06-05)

---

### BUG-012 · Chow claim prompt shown to wrong players

**Symptom:** During a live 4-player match, two different players were both prompted to claim a chow off the same discard. Only one player should ever be eligible.

**Root cause:** `computeEligibleClaims` in `apps/api/src/game/claim-resolver.ts` looped over all 4 seats (excluding the discarder) and called `chowOptions()` on each one. If any seat held tiles that formed a valid sequence with the discard, it was offered the chow prompt — regardless of seat position relative to the discarder.

`chowOptions()` in `packages/engine/src/calls.ts` has no positional guard; its docstring says "the player must be immediately after the discarder" but that is documentation of intent, not enforcement. The engine's `chow()` method does enforce `(discardedBySeat + 1) % 4`, but only at claim submission time — after the player has already been shown the (incorrect) prompt.

To compound the confusion, `resolveClaims` had a comment claiming "the engine enforces this via chowOptions" — which was factually wrong.

**Fix:** In `computeEligibleClaims`, pre-compute `nextSeat = ((discardedBySeat + 1) % 4) as Seat4` and gate the `chowOptions` call behind `seat === nextSeat`. Added 3 unit tests covering all discarder positions (0→1, 2→3, wrap-around 3→0) using a `makeClaimsState` fixture helper that constructs specific hands. Corrected the misleading comment in `resolveClaims`.

**Learning:** Pung/Kong eligibility is position-independent (any seat can pung any player's discard). Chow eligibility is position-dependent (only the one immediate downstream seat). These two categories must be handled differently in any claim-window computation. Always test claim eligibility against all 4 possible discarder seats, including the wrap-around case (seat 3 → seat 0). Never rely on a comment saying "X enforces Y" — verify it or add a test that proves it.

---

## PR #30 cont. — gameplay UI bugs & improvements (2026-06-05)

---

### BUG-013 · Dealer badge shown as global label — all players appeared to be the dealer

**Symptom:** The status bar top-left showed "Dealer 東" to every player, making each player think the label referred to them personally.

**Root cause:** The status bar rendered `{t('gameDealer')} {WIND_CHAR[dealerSeat.wind]}` unconditionally for all players. There was no dealer indicator on the specific player's nameplate, so the label floated in a position that read ambiguously as "you are the dealer."

**Fix:** Removed the "Dealer" text from the status bar (round wind indicator alone is sufficient there). Added a `"庄"` badge directly inside the `Nameplate` component, rendered only when `seatIdx === snapshot.dealerSeat`. Added the same badge to the viewer's own bottom info row. Now the dealer badge appears exclusively on the dealer's seat tile in the compass layout.

**Learning:** In a compass-layout game UI, global status bar labels are easily misread as "about the viewer." Role badges (dealer, active turn, etc.) belong on the individual player's nameplate, not in a shared header.

---

### BUG-014 · Action toasts never shown — game:event was subscribed by backend but ignored by frontend

**Symptom:** When a player punged, chowed, or declared kong/win, no notification appeared for any player. The UI was completely silent about successful game actions.

**Root cause:** The backend's `broadcastEvent()` correctly emits `game:event` to the entire game room for every action (pung, chow, kong, win, concede). The frontend `useGame` hook subscribed to `game:claimed-window`, `game:contested`, `game:snapshot`, etc., but had no handler for `game:event`. The `GameToast` type and `toast` store state existed but were only set by `game:contested` (losing claims), and even then the `toast` value was never destructured in `GamePage` or passed to `GameTable` — so nothing was ever displayed.

**Fix:** Three-part:

1. Added `handleGameEvent` in `useGame` that listens to `game:event` and sets a 2500ms toast for pung/chow/kong/win/concede actions.
2. Added `toast` to the `GamePage` destructuring and passed it to `GameTable` as a prop.
3. Added `ActionToast` component — floating center-screen overlay showing "[Wind] Pung!" etc. with the acting seat's wind color, auto-dismissed after 2.5s.

`game:contested` remains as a 600ms flash (its existing behavior was correct, just invisible).

**Learning:** Wiring an event pipeline end-to-end means checking: backend emits → frontend subscribes → store updates → UI reads store. A break at any link silences the whole feature. Always trace the full path from socket emit to rendered pixel when a feature "exists but doesn't work."

---

### BUG-015 · Open melds invisible after pung/chow/kong

**Symptom:** After a player punged tiles, those tiles disappeared from their hand (correct) but were not visible to anyone — neither the player who punged nor their opponents. The open melds existed in the server state but were not rendered.

**Root cause:** `ClientSeatState.openMelds: Meld[]` is populated correctly by `toClientSnapshot()` and included in every `game:snapshot` payload. However, the `GameTable` component rendered only face-down hand tiles (`handCount` × `FaceDownTile`) and discard piles for each opponent position. No component rendered `openMelds` at all.

**Fix:** Added `MeldGroup` (renders one meld's tiles in a row) and `OpenMeldsDisplay` (renders all melds for a seat) components. Wired them into each of the four seat areas:

- **Top (across):** Horizontal row of meld groups between face-down hand and discards.
- **Left/Right (side columns):** Vertical stack of meld groups in their 64px side columns.
- **Viewer (bottom):** Horizontal row above the hand tiles via `OpenMeldsDisplay`.

Each meld is wrapped in a subtle gold-bordered container to distinguish it from discards.

**Learning:** After implementing a game mechanic (pung/chow/kong), always verify the entire data path: engine state → server snapshot → client type → rendering. A mechanic that updates state but has no visual output in the compass layout is effectively invisible. Trace `openMelds` from the engine type all the way to a rendered tile.

---

## Template for future entries

```
### BUG-NNN · Short description

**Symptom:** What the user/developer saw.

**Root cause:** Why it happened technically.

**Fix:** What code changed and how.

**Learning:** What rule or pattern to follow in the future to prevent this class of bug.
```
