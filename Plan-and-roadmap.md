# Plan & Roadmap

Consolidated development plan and implementation roadmap for the Nanchang Mahjong project. This document consolidates all phases, implementation plans, and future directions.

---

## Overview

**Project:** Private family Nanchang Mahjong web app. Four human players connect to a private room, play a full session, and accumulate ELO ratings. Server-authoritative; engine is single source of truth.

**Tech Stack:** TypeScript monorepo (pnpm). React 18 + Vite (frontend), NestJS + Fastify (backend), pure-TS engine, DynamoDB (database), AWS App Runner (hosting), Three.js R3F (3D UI).

**Current Status (as of 2026-06-09):**

- Phases 0–11 completed and merged to `main`
- Phase 12A (Push Backend) completed (PR #26)
- 3D UI Migration (feat/3d-ui) completed (PRs #32–40 merged to main on 2026-06-05)
- Phase 12B (Push Frontend + A11y) in progress
- Two 3D bugs deferred post-Phase-12B (BUG-08, BUG-09)

---

## Completed Phases (Merged to Main)

### Phase 0 — Foundation (Merged)

**Goal:** Monorepo scaffold + dev environment + CI shell + design tokens.

**Deliverables:**

- pnpm workspace, TS strict mode, ESLint, Prettier, Husky pre-commit
- `apps/web` Vite + React + Tailwind with design tokens from handoff
- `apps/api` empty NestJS app with healthcheck `GET /health`
- `docker-compose.yml` boots DynamoDB Local, MinIO, cognito-local, MailHog, Redis
- GitHub Actions: lint + typecheck + test on PR
- CDK project skeleton in `infra/aws`

**Tests:** `Foundation·smoke` (API healthcheck 200, web renders empty shell)

---

### Phase 1 — Auth, Invite Keys & User Accounts (Merged)

**Goal:** A person with invite code can sign up, sign in, sign out, reset password, change password, and delete account.

**Deliverables:**

- Cognito User Pool + CDK definition; `cognito-local` in dev
- Invite code data model + service; `POST /invites/redeem`
- Signup/sign-in/forgot-password/change-password/delete-account screens
- Email verification via SES (MailHog in dev)
- JWT auth middleware; `@CurrentUser()` decorator
- Role attribute (user/admin); seed script creates first admin

**Tests (feature-keyed):**

- `Auth·signup-requires-invite`
- `Auth·invite-single-use` (atomic)
- `Auth·invite-expiry` (DDB TTL)
- `Auth·signin-happy-path`
- `Auth·forgot-password`
- `Auth·change-password`
- `Auth·delete-account` (hard-deleted from Cognito, soft-deleted in DDB)
- `Auth·rate-limit` (6th login attempt in minute → 429)

---

### Phase 2 — i18n & Theming Foundations (Merged)

**Goal:** Every string comes from translation file; language toggle works.

**Deliverables:**

- react-i18next setup with `en.json` + `zh.json`
- LangToggle component wired to context + localStorage + `<html lang>`
- Server-side i18n for error responses and emails
- CI key-parity check between locale files
- ESLint rule blocks new literal strings

**Tests (feature-keyed):**

- `i18n·key-parity` (CI)
- `i18n·no-literals` (ESLint)
- `i18n·server-errors` (localized per `Accept-Language`)
- Updated all Phase 1 auth tests to assert via translation keys

---

### Phase 3 — Admin Page (Merged)

**Goal:** Admin can manage invite codes and view users.

**Deliverables:**

- Admin route `/admin` — frontend route guard + backend role guard
- Admin: invite code list, generate new, revoke, count/expiry/note
- Admin: user list (handle, email, role, created, last seen), search, change role, force-disable
- Audit log of admin actions (DDB items `AUDIT#<ts>`)

**Tests (feature-keyed):**

- `Admin·route-guard` (non-admin gets 403, bounced from `/admin`)
- `Admin·generate-invite` (code in DDB and list)
- `Admin·revoke-invite` (revoked code fails redemption)
- `Admin·user-disable` (disabled user's JWT rejected)
- `Admin·audit-log` (every mutation produces audit item)

---

### Phase 4 — Home, Profile, Friends (Merged)

**Goal:** Signed-in users have home screen, account screen, working friends graph.

**Deliverables:**

- Home screen with sample stats card (real data in Phase 8), Play button stubbed
- Account/Profile screen (rank, rating, streak — placeholders until Phase 8)
- Friends screen: search by handle, send/accept/decline request, remove friend
- Customize screen scaffold (themes/tile packs stored on profile; visuals in Phase 11)

**Tests (feature-keyed):**

- `Friends·send-accept` (request lifecycle)
- `Friends·decline` (requests disappear both sides)
- `Friends·remove` (bilateral removal)
- `Friends·search-privacy` (only public fields returned)
- `Profile·update-handle` (uniqueness enforced)

---

### Phase 5 — Game Engine (Merged)

**Goal:** Pure TypeScript Nanchang Mahjong engine with no network or UI.

**Deliverables:**

- `packages/engine` — immutable game engine, fully deterministic, seeded RNG
- Tile set with jokers/wildcards (Jing), winning hand shapes, scoring (fan/番), call eligibility
- Pung/Kong/Chow resolution, dealer rotation, draw conditions
- 248+ unit tests covering all rules
- `docs/final-nanchang-mahjong-rules.md` — locked rules document

**Tests (feature-keyed):**

- `Engine·deal-determinism` (same seed → same hands)
- `Engine·hand-eval-{shape}` (per winning shape)
- `Engine·scoring-{fan}` (per fan/bonus)
- `Engine·call-priority` (Win > Pung/Kong > Chow)
- `Engine·illegal-moves` (discard not-held throws)
- `Engine·draw-conditions` (wall exhaustion)

---

### Phase 6 — Room / Lobby & Matchmaking (Merged)

**Goal:** 4 humans can create/join room and start game.

**Deliverables:**

- `POST /rooms` (private code or public), `POST /rooms/:code/join`, leave, kick
- Real-time room state via Socket.IO (`room:update` events)
- Room screen — seat list, ready toggle, host controls, share code
- Host-left fallback (auto-promote next seated)
- Room TTL: idle 30min → expires

**Tests (feature-keyed):**

- `Room·create-join-leave` (lifecycle)
- `Room·full` (5th joiner rejected)
- `Room·host-leaves` (next seat promoted; everyone sees update)
- `Room·share-code` (unique, case-insensitive)
- `Room·ttl` (idle room purged)

---

### Phase 7 — Real-Time Gameplay (Merged)

**Goal:** Full game playable end-to-end with 4 humans connected.

**Deliverables:**

- Jing reveal screen wired to engine's spirit determination
- Gameplay screen: tile hand, draw, tap-to-select + Discard confirm, side-rail call prompts, 8s auto-discard timer
- Socket events: `draw`, `discard`, `call` (pung/kong/chow), `pass`, `win`, `concede`
- Server authoritative — client optimistic for own discard only
- Reconnection handler: snapshot resend, "Reconnecting…" overlay >1.5s
- AFK detection → auto-discard drawn tile
- Reduced-motion CSS for jing reveal, pulses, shimmers
- Spectator subscription (`?spectate=1`); events filtered to public data only

**Engine Extensions (7.0):**

- `addToKong()` method + `kong_added` event
- Rob-kong path: `declareWin({robKong: true})` scoring
- `dealerSeat` + `roundWind` in GameState; dealer ×2 in scoring; `nextDealer()` helper
- `concede()` method + penalty
- Audit `scoring.ts` vs rules; add missing fan/payouts affecting final scores

**Tests (feature-keyed):**

- `Gameplay·discard-flow` (tap → confirm → tile leaves → others see it)
- `Gameplay·call-priority` (integration over wire)
- `Gameplay·timeout-auto-discard` (deadline → auto-discard drawn)
- `Gameplay·reconnect` (dropped client → correct snapshot)
- `Gameplay·spectator-cannot-see-concealed` (no hand leaks to spectators)
- `Gameplay·rate-limit-events` (spam → `TOO_FAST`)
- Additional: `Gameplay·ws-auth`, `Gameplay·illegal-move-rejected`, `Gameplay·claim-window-expiry`, `Gameplay·concede`

**See also:** `PHASE-7-PLAN.md` for detailed 7A (backend) and 7B (frontend) implementation specs.

---

### Phase 8 — End Game, Stats, History (Merged)

**Goal:** Completed games persist; stats computed and shown.

**Deliverables:**

- EndGameScreen variants (win/lose/draw) wired to real result
- Game record → `GAME#<id>` + per-user history index
- Stats aggregates (rank, rating ELO-ish, streak, win rate) recomputed on game end
- History screen (skeleton/empty/offline states)
- Rematch flow (returns 4 to fresh room)

**Tests (feature-keyed):**

- `History·list` (most-recent first, paginated)
- `History·empty-state` (new user sees empty state)
- `Stats·rating-delta` (known inputs → known rating change)
- `Stats·streak` (wins increment; loss resets)
- `Rematch·preserves-seats` (same 4 players, fresh game)
- Updated Phase 4 profile assertions for real data

---

### Phase 9 — Replay (Merged)

**Goal:** Any past game replayable move-by-move.

**Deliverables:**

- `replayHand()` pure engine function replaying game from event log + seed
- Replay player UI: scrub, play/pause, speed (1×/2×/4×)
- Share link `/replay/<id>` — family-only (auth + game includes viewer or friend)
- Replays stored as JSON on S3 (per-game blob, <4KB)
- `GET /replays/:id` access-gated

**Tests (feature-keyed):**

- `Replay·deterministic` (replay reproduces final scores byte-for-byte)
- `Replay·share-auth` (unauthenticated viewer → login redirect)
- `Replay·permission` (viewer not in game / not friend → 403)
- `Replay·s3-lifecycle` (manual eval — replays >1y archived)

---

### Phase 10 — Learn / Tutorial (Merged)

**Goal:** Learn screen filled with real Nanchang rules content.

**Deliverables:**

- Content authored from `docs/final-nanchang-mahjong-rules.md`, bilingual
- 6-tab rules reference: Overview, Tiles, Spirit, Gameplay, Hands, Scoring
- Interactive examples using engine to demo winning hands
- "New to Mahjong?" nudge on Home deep-links here
- 48 i18n keys EN+ZH

**Tests (feature-keyed):**

- `Learn·all-strings-translated` (snapshot EN/ZH parity)
- `Learn·examples-render` (tile examples mount without error)

---

### Phase 11 — Customize (Themes, Tile Packs, Sound) (Merged)

**Goal:** Customize screen actually changes the table.

**Deliverables:**

- `ThemeStore` (Zustand persist) — `felt` (jade/crimson/slate/navy) + `tilePalette` (classic/sepia/dark) + `soundEnabled`
- CSS custom properties — `applyTheme()` writes `--felt-*` and `--tile-*` vars to `:root`
- `CustomizePage` at `/customize` — felt color swatches, tile palette preview, sound toggle
- `contrastGuard(hex)` — WCAG luminance check; auto-returns light/dark ink color
- `useSound` hook — Web Audio API clack + chime (opt-in, off by default)
- 14 i18n keys EN+ZH

**Tests (feature-keyed):**

- `Customize·persistence` (refresh keeps chosen theme)
- `Customize·contrast-guard` (dark face auto-inverts ink)
- Updated Phase 7 visual snapshot tests for both default and alternate theme

---

### Phase 12A — Push Backend (Merged, PR #26)

**Goal:** Backend infrastructure for push notifications.

**Deliverables:**

- VAPID key pair in config; graceful no-op if keys not set
- `PushModule` (@Global) — `PushService` + `PushController`
- Push subscriptions in DDB (`USER#<sub>/PUSH_SUB`)
- `GameService.startTurn()` fires turn notification when active seat has no live socket
- 8 new tests (220 total API)

---

## In Progress / Pending

### Phase 12B — Push Frontend + A11y (IN PROGRESS)

**Goal:** Service worker, push permissions, and full a11y pass.

**Deliverables:**

- `public/sw.js` service worker — `push`, `notificationclick`, `pushsubscriptionchange` handlers
- `usePushNotifications` hook — SW registration, VAPID key fetch, permission flow, pushManager subscribe/unsubscribe
- Push notification toggle in Home settings section
- `prefers-reduced-motion` global CSS rule in `index.css`
- A11y tests: `A11y·tile-aria` + `A11y·reduced-motion`

**Status:** Planning/early implementation. Phase 12A merged; 12B is next phase.

---

### 3D UI Migration (Completed, Merged PR #39, #40)

**Branch:** `feat/3d-ui` → merged to `main` on 2026-06-05

**Goal:** Replace DOM `GameTable` compass layout with React Three Fiber 3D scene.

**Scope:** Only the game table canvas. All other routes, overlays, backend, and the DOM `MahjongTile` component (used in Learn/Replay/History) untouched.

**Architecture (9 phases A–I, all merged):**

| Phase | Deliverable                                               | PR  |
| ----- | --------------------------------------------------------- | --- |
| A     | Dependencies, asset inspection, `tile-texture-map.ts`     | #32 |
| B     | `useTileGeometry.ts`, `useTileTextures.ts`, layout math   | #33 |
| C     | `table-layout.ts` pure layout math + unit tests           | n/a |
| D     | Full 3D component library (tiles, hands, discards, melds) | #34 |
| E     | `GameCanvas.tsx`, `game-page.tsx` integration             | #35 |
| G     | `subscribeWithSelector` middleware, state binding         | #36 |
| H     | Jing gold outline shell, emissive pulse, Html label       | #37 |
| I     | Raycasting, click interactions, hit-box optimization      | #38 |

**Key Features:**

- R3F 3D scene for game table; all DOM overlays remain unchanged
- Three-layer Jing treatment: color pulse + outline shell + label
- Tile animations via `useFrame` lerp (zero re-renders)
- Pure layout math in `table-layout.ts` (fully testable, no Three.js)
- Raycasting disabled on non-interactive tiles (performance)

**Status:** All tests passing (248 engine / 220 API / 167 web). Two bugs deferred post-merge:

- BUG-08: Viewer discards invisible (depth-sorting in discard grid)
- BUG-09: TileWall3D needs redesign (Back.svg has red background)

**See also:** `2dTo3d.md` for full migration blueprint.

---

## Future / Deferred Phases

### Phase 13 — Production Deploy & Hardening

**Status:** Deferred (after Phase 12B)

**Goal:** Live on `ap-east-1` with real domain.

**Deliverables:**

- CDK deploys S3+CloudFront (frontend), App Runner (API), DynamoDB, Cognito, SES, WAF
- GitHub Actions deploy job on `main` (build → upload S3, invalidate CloudFront, push container ECR, update App Runner)
- Sentry + CloudWatch dashboards
- Backup: DynamoDB point-in-time recovery
- Cost alarm at $50/mo
- Smoke-test playbook (Playwright against prod)

**Tests (feature-keyed):**

- `Deploy·smoke` (Playwright): signup with invite → home → create room → spectate → exit
- `Infra·secrets-rotation` (manual eval)

---

### Phase 14 — Mobile-First Forced Landscape Overhaul

**Status:** Planning only

**Problem:** Current 2.5D game table (CSS Grid) designed for 800×600 desktop; collapses on portrait phones (375×812).

**Solution:** Forced landscape layout — CSS-rotate game table 90° on portrait mobile using `transform: rotate(90deg)`, preserving horizontal tile density.

**Activation:** Only when `window.innerWidth < 600px` AND `window.innerWidth < window.innerHeight`.

**Architecture:**

- `GameTable2D` dispatcher → `DesktopGameTable2D` or `MobileGameTable2D`
- `MobileGameTable2D` — absolute positioning, no CSS Grid
- `useOrientation` hook for orientation detection
- Layout: StatusBar, badges, discard pool, hand, claim drawer

**Branch convention:** `feat/phase-14A`, `feat/phase-14B`, `feat/phase-14C`

**See also:** `PHASE-14-MOBILE-PLAN.md` for architectural overview.

---

### Bot System Implementation

**Status:** Documented architecture; not yet implemented

**Goal:** AI opponents at two difficulty levels (Easy, Normal) without dedicated WebSocket connections.

**Architecture:**

- Logic isolation: `packages/engine/src/bot/bot-engine.ts`
- Backend integration: `apps/api/src/game/game-session.ts` triggers bot moves with 1-3s delay
- Reserved bot IDs: `bot-easy-1`, `bot-normal-2`, etc.

**Difficulty Algorithms:**

- **Easy:** Legal mostly-random moves; avoids throwing winning hand; 30% claim chance for non-wins
- **Normal:** Greedy heuristic; scores hand utility; discards isolated tiles; claims strategically (100% kong/win, 50% pung, conditional chow)

**Implementation Phases:**

1. Phase 1: Shared schema updates (`packages/shared`)
2. Phase 2: Engine bot logic (`packages/engine`)
3. Phase 3: Backend integration (`apps/api`)
4. Phase 4: Frontend UI updates (`apps/web`)

**See also:** `BOT-IMPLEMENTATION-PLAN.md` for full spec.

---

## Cross-Cutting Concerns (All Phases)

### Internationalization (EN + ZH)

- Two locale files: `en.json`, `zh.json`. No hard-coded user-visible strings.
- Language toggle persists to `localStorage` and user profile.
- `<html lang>` updated on toggle.
- Server-side i18n for errors, emails, push notifications.
- ESLint rule blocks literal strings.
- CI key-parity check.

### Auth & Authorization

- Cognito User Pool with email verification.
- Invite-key gate: `POST /invites/redeem` validates code before `AdminCreateUser`.
- Roles: `user` (default) and `admin`.
- Admin route gated on frontend (route guard) and backend (`@Roles('admin')` decorator).

### Rate Limiting

1. **AWS WAF:** Edge IP-based limit (200 req/5min) + managed bot rules.
2. **App-level middleware:** Public endpoints 5/min/IP; authenticated 60/min/user; invite redemption 3/hour/IP.
3. **WebSocket events:** Per-event token bucket (e.g., `discard` 1/sec).
4. Storage: DynamoDB at MVP (cheap, TTL'd); migrate to Redis if concurrency demands.

### Real-Time Architecture

- One Socket.IO server, sticky session via App Runner.
- Authoritative state on server (in memory), persisted to DDB on milestones (deal, call, score, end).
- Reconnection: client re-emits `game:join {gameId}`; server re-sends snapshot.
- Spectator mode: read-only socket subscription; events filtered to public data.

### Accessibility (per Handoff Sheet §08)

- ARIA labels on tiles.
- Focus order.
- Reduced-motion stubs.
- Color-not-only-signal.
- `label`/`htmlFor` on inputs.
- `<html lang>` swap.
- Polite live regions for auto-discard timer.

### Observability

- Structured JSON logs (`pino` in Nest).
- CloudWatch metrics: socket connections, game starts, errors/endpoint.
- Sentry (free tier) for FE + BE error tracking.

---

## Infrastructure & Cost

### Production (AWS ap-east-1, Hong Kong)

| Concern            | Service                             | Notes                                           |
| ------------------ | ----------------------------------- | ----------------------------------------------- |
| Frontend hosting   | S3 + CloudFront                     | Cheapest static; CloudFront HK edge + HTTPS     |
| API + WebSocket    | AWS App Runner (1 small, min=0/1)   | Supports HTTP + WebSocket; autoscales; ~$5–15mo |
| Database           | DynamoDB on-demand                  | NoSQL, pay-per-request; ~free under our load    |
| Replay storage     | S3                                  | Lifecycle policy to Glacier after 1y            |
| Auth               | Cognito User Pool                   | Free tier covers 50 MAU                         |
| Cache / rate-limit | DynamoDB (MVP); ElastiCache (scale) | Skip at <50 users; add Redis if needed          |
| Email              | SES                                 | $0.10 per 1k emails                             |
| Secrets            | Secrets Manager                     | Cognito client secret, IAM roles                |
| Logs/metrics       | CloudWatch                          | Default                                         |
| WAF / DDoS         | AWS WAF on CloudFront + App Runner  | Edge rate-limit + managed rule set              |
| DNS                | Route 53                            | Domain TBD                                      |
| IaC                | AWS CDK (TypeScript)                | Same language as app                            |
| CI/CD              | GitHub Actions                      | Build → test → deploy                           |

**Cost estimate:** $15–30/mo at <50 users (dominated by App Runner idle).

### Dev Environment (Docker on Windows PC)

| AWS service     | Local equivalent | Image                     |
| --------------- | ---------------- | ------------------------- |
| DynamoDB        | DynamoDB Local   | `amazon/dynamodb-local`   |
| S3              | MinIO            | `minio/minio`             |
| Cognito         | cognito-local    | `jagregory/cognito-local` |
| SES             | MailHog          | `mailhog/mailhog`         |
| ElastiCache     | Redis            | `redis:7-alpine`          |
| Secrets Manager | LocalStack       | `localstack/localstack`   |

Single `docker-compose.yml` brings up all. API reads `AWS_ENDPOINT_URL_*` env vars in dev; same code path runs in prod with vars unset.

---

## Data Model (DynamoDB Single-Table)

Single table `nanchang_main` with `PK` / `SK` and three GSIs. Item shapes:

- `USER#<id> / PROFILE` — handle, email, displayName, rank, rating, streak, createdAt, role
- `USER#<id> / STATS#<period>` — aggregates
- `USER#<id> / FRIEND#<friendId>` — friendship edges (bilateral)
- `USER#<id> / GAME#<ts>#<gameId>` — game history index (recent first)
- `ROOM#<id> / META` — host, status, players, settings, createdAt, TTL
- `ROOM#<id> / SEAT#<n>` — seated player
- `GAME#<id> / META` — finished-game record
- `GAME#<id> / MOVE#<n>` — replay moves _(Phase 9 decides: items vs. S3 blob)_
- `INVITE#<code> / META` — issuer, status, redeemedBy, expiresAt, TTL
- `RATE#<scope>#<key> / <windowStart>` — rate-limit counters, TTL'd

Per-tick state lives in process memory (persisted only on milestones).

---

## Definition of Done (Project-Wide)

A phase is done when:

1. Feature acceptance criteria pass in dev (manual + automated).
2. Tests green; previously-listed tests requiring updates are updated and green.
3. EN and ZH display correctly on every new screen (visual + key-parity).
4. A11y items from Handoff Sheet for that screen checked off.
5. Docker dev stack boots cleanly from fresh `pnpm install`.
6. Phase 13 only: prod smoke-test suite passes against deployed URL.

---

## Tech Stack Summary

| Layer    | Stack                                                                                       |
| -------- | ------------------------------------------------------------------------------------------- |
| Monorepo | pnpm workspaces, TypeScript throughout                                                      |
| Engine   | `packages/engine` — pure TS, no deps, Vitest (248 tests)                                    |
| Shared   | `packages/shared` — Zod schemas, socket event types, tile-map                               |
| API      | `apps/api` — NestJS + Fastify, Socket.IO, DynamoDB single-table, Jest (220 tests)           |
| Web      | `apps/web` — React 18, Vite, Zustand, TanStack Query, react-i18next, Vitest+RTL (167 tests) |
| 3D       | `three ^0.165`, `@react-three/fiber ^8.17`, `@react-three/drei ^9.109` — game table only    |
| Infra    | AWS App Runner, DynamoDB, CDK in `infra/`                                                   |
| CI       | GitHub Actions: lint + typecheck + test on every PR                                         |

---

## Key Documents

- **`docs/final-nanchang-mahjong-rules.md`** — Locked Nanchang Mahjong rules (do not move)
- **`BUG-LOG.md`** — Chronological bug history + learnings (moved to `docs/oldDocs`)
- **`3D-BUG-LOG.md`** — 3D UI bugs (moved to `docs/oldDocs`)
- **`PHASE-7-PLAN.md`** — Detailed Phase 7 backend/frontend spec (moved to `docs/oldDocs`)
- **`2dTo3d.md`** — 3D UI migration blueprint A–I (moved to `docs/oldDocs`)
- **`PLAN.md`** — Original high-level project plan (moved to `docs/oldDocs`)
- **`CLAUDE.md`** — Project context and guidelines (in repo root)

---

## Current Branch State (as of 2026-06-09)

**Primary branch:** `main` — all merged work

**In progress:**

- Phase 12B (Push Frontend + A11y) — not yet started/branched
- Two 3D bugs deferred (BUG-08 viewer discards, BUG-09 TileWall redesign)

**Up next (priority order):**

1. Complete Phase 12B (Push Frontend + A11y)
2. Fix BUG-08 (viewer discard visibility) or BUG-09 (wall redesign)
3. Phase 13 (Production Deploy)
4. Phase 14 (Mobile Landscape)
5. Bot system (post-MVP)

---

## One PR at a Time Rule

**CRITICAL:** Always follow the one-PR-at-a-time discipline:

- Open one PR, push it, then STOP
- Wait for review, requested changes, confirmed merge
- Only after confirmed merge to `main`, start next branch
- Never open a second PR or branch off an unmerged PR

This prevents stacked work and wasted effort if the first PR changes.
