# Nanchang Mahjong — Implementation Plan

> Source: handoff bundle in `Family Mahjong webap-handoff/family-mahjong-webap/`
> Design lock: see `Handoff Sheet.html` (tokens, motion, a11y, locked decisions)
> Status: planning · not yet implemented

---

## 0. Scope & Ground Rules

### 0.0 Branching & PR workflow
**`main` is protected. No direct pushes.** Every change — feature, fix, doc, infra — lands via pull request from a branch.

**Branch naming** (lowercase, kebab-case):
- `feat/phase-<N>-<slug>` — phase feature work (e.g. `feat/phase-1-auth-invites`)
- `feat/phase-<N>-<slug>-be` / `-fe` — when a phase is split into backend-first then frontend
- `fix/<slug>` — bug fixes
- `chore/<slug>` — tooling, config, deps, docs-only
- `infra/<slug>` — CDK / Docker / CI changes
- `engine/<slug>` — pure-engine changes in `packages/engine`

**PR rules**:
1. Branch off latest `main`. Rebase (not merge) to stay current.
2. PR must be green: lint + typecheck + unit tests + (where applicable) E2E.
3. Every PR updates or adds the feature-keyed tests listed in the relevant phase.
4. Locale parity check (EN/ZH key sets) must pass from Phase 2 onward.
5. Squash-merge into `main` (one commit per PR, clean history).
6. Delete the branch on merge.

**Frontend / backend split**:
Features cut **vertically** (an "auth" feature has both API and UI), so the default is **one feature branch per phase** that touches both `apps/api` and `apps/web`. For the bigger phases listed below, the API surface needs to settle before UI work, so they ship as **two sequenced PRs**:

| Phase | Default split |
|---|---|
| 0 Foundation | one PR (tooling) |
| 1 Auth + invites | **BE-first PR → FE PR** |
| 2 i18n + theming | one PR (mostly FE; minor BE for error i18n) |
| 3 Admin page | **BE-first PR → FE PR** |
| 4 Home / Profile / Friends | **BE-first PR → FE PR** |
| 5 Game engine | one PR (pure `packages/engine`, no UI/API) |
| 6 Room / Lobby | **BE-first PR → FE PR** |
| 7 Real-time gameplay | **BE-first PR → FE PR** (largest phase — may split further) |
| 8 End game / Stats / History | **BE-first PR → FE PR** |
| 9 Replay | **BE-first PR → FE PR** |
| 10 Learn | one PR (mostly FE + content) |
| 11 Customize | one PR (mostly FE) |
| 12 Push + a11y | **BE-first PR → FE PR** |
| 13 Production deploy | infra PR(s) |

"BE-first" means the backend PR ships endpoints + tests with no UI consumer yet (verified via API tests); the FE PR follows immediately and wires the screens. Both PRs reference the same phase.

### 0.1 Product summary
A mobile-first, browser-accessible web app for playing **Nanchang Mahjong (南昌麻将)** — a regional Chinese mahjong variant — with close family and friends. Real-time 4-player matches, replays, friends, stats, tutorial, and customization. Dark/gold theme locked by design.

### 0.2 Hard constraints (from the user)
- **Two environments**: `dev` (this Windows PC, Docker-based) and `prod` (AWS, region **ap-east-1 / Hong Kong**).
- **Local–prod parity**: every external AWS dependency must have a Dockerized local equivalent.
- **Database**: prefer **NoSQL** for cost. Cheapest AWS managed option.
- **Audience**: ≤50 users, ≤5 concurrent games at MVP. Design must allow scaling later.
- **Mobile-first PWA-style browser app** — no native app.
- **Full bilingual support (EN + ZH)** for everything except user-entered text (names, messages, etc.).
- **Invite-key signup**: admins generate keys; new users must redeem one to register.
- **Admin page**: separate route, role-gated.
- **Rate limiting** at the API edge.
- **Nanchang-specific rules**, not generic Mahjong.

### 0.3 Confirmed decisions from clarifications
| Topic | Decision |
|---|---|
| Rules source | I will draft Nanchang Mahjong rules from public sources for user review in Phase 5. |
| Player composition | Humans only at MVP. Architecture must leave a clean seam for bot fill-in post-MVP. Spectator mode is in scope. |
| Auth method | Email + password via **AWS Cognito**. No social/OAuth at MVP. 2FA optional, design-deferred. |
| Scale ceiling | ≤50 users / ≤5 concurrent games. All cost decisions favor "near-zero idle." |

---

## 1. Proposed Tech Stack

### 1.1 Frontend — recommended
- **Language**: TypeScript
- **Framework**: **React 18 + Vite** (PWA via `vite-plugin-pwa`)
  - The handoff is already React JSX. Vite gives the fastest dev loop and smallest prod bundle.
- **Routing**: `react-router-dom` v6
- **State**:
  - UI/local: **Zustand** (tiny, no boilerplate, fits small app)
  - Server cache/queries: **TanStack Query** (`@tanstack/react-query`)
  - Real-time: socket events feed Zustand store
- **Styling**: **Tailwind CSS** with design tokens transcribed from the handoff (gold, jade, ink, spacing, radii). Tailwind keeps the bundle lean and maps cleanly onto the locked token system.
- **i18n**: **react-i18next** with JSON resource files (`en.json`, `zh.json`). `<Trans>` for interpolation, namespace-per-screen.
- **WebSocket client**: **Socket.IO client** (reconnect logic and rooms out of the box).
- **Forms**: `react-hook-form` + `zod` (shared schema with backend).
- **Testing**: **Vitest** + **React Testing Library** (unit/component), **Playwright** (E2E, mobile viewport).

**Why not alternatives**: Next.js is overkill — we don't need SSR, and a static SPA + S3/CloudFront is cheaper. Vue/Svelte would mean rewriting the design from React JSX.

### 1.2 Backend — recommended
- **Language**: TypeScript (Node.js 20 LTS)
  - Shared types/zod schemas between FE and BE.
  - Best WebSocket ecosystem for our scale.
- **Framework**: **NestJS** (modular, opinionated, plays well with WebSocket gateways and dependency injection — good for admin/auth/game module separation). Fastify adapter under the hood for speed.
- **Real-time**: **Socket.IO server** (matches FE client, has built-in rooms + acks).
- **Auth integration**: `@nestjs/passport` + Cognito JWT verification (`aws-jwt-verify`).
- **Validation**: `zod` + `nestjs-zod`.
- **Testing**: **Jest** (Nest default) + **Supertest** for HTTP, plus a Socket.IO test client for gateway tests.

**Why not Go/Rust**: faster, but adds language and shared-type friction with a 1-person team at <50 users. We can rewrite the game engine in Go later if perf demands it — the engine module will be pure-logic and portable.

### 1.3 Game engine
Pure-TypeScript module, **no I/O, fully deterministic** (seeded RNG). Lives in `packages/engine` of the monorepo so both backend (authoritative) and frontend (optimistic UI, replay) can import it.

### 1.4 Monorepo layout
```
/apps
  /web        ← React + Vite
  /api        ← NestJS
/packages
  /engine     ← pure-TS Nanchang rules
  /shared     ← zod schemas, i18n keys, shared types
/infra
  /docker     ← docker-compose for dev
  /aws        ← CDK or Terraform for prod (CDK recommended — TypeScript)
/docs
```
Package manager: **pnpm** workspaces.

---

## 2. Infrastructure & Cost

### 2.1 Production (AWS ap-east-1, Hong Kong)
| Concern | Service | Why this one |
|---|---|---|
| Frontend hosting | **S3 + CloudFront** | Cheapest static hosting; CloudFront gives HK edge + HTTPS. |
| API + WebSocket | **AWS App Runner** (1 small instance, min=0/1) | Supports HTTP **and** WebSocket, autoscales, ~$5–15/mo at idle. Alternative: ECS Fargate Spot. |
| Database | **DynamoDB on-demand** | NoSQL, pay-per-request, essentially free under our load. Single-table design with GSIs. |
| Replay/blob storage | **S3** | Replay JSON streams (<4KB/game per handoff). Lifecycle policy to Glacier after 1y. |
| Auth | **Cognito User Pool** | Free tier covers 50 MAU. JWT-based; no session table needed. |
| Cache / presence / rate-limit counters | **ElastiCache Serverless Redis** (optional at MVP) | Skip at <50 users — use DynamoDB conditional writes for rate limits and presence. Add Redis when concurrency demands it. |
| Email (password reset, invites, notifications) | **SES** | $0.10 per 1k emails. |
| Secrets | **Secrets Manager** | Cognito client secret, DDB IAM roles, etc. |
| Logs/metrics | **CloudWatch** | Default. |
| WAF / DDoS edge | **AWS WAF** on CloudFront + App Runner | Edge rate-limit rules (managed rule set + custom IP-based). |
| DNS | **Route 53** | Domain TBD. |
| IaC | **AWS CDK** (TypeScript) | Same language as the app. |
| CI/CD | **GitHub Actions** | Build → test → deploy to S3/App Runner. |

**Rough cost estimate at <50 users**: $15–30/month all-in, dominated by App Runner idle. CloudFront/S3/DynamoDB/Cognito/SES will all sit in or near free tier.

### 2.2 Dev environment (Docker on this PC)
Single `docker-compose.yml` brings up every AWS dependency as a local equivalent:

| AWS service | Local equivalent | Image |
|---|---|---|
| DynamoDB | DynamoDB Local | `amazon/dynamodb-local` |
| S3 | MinIO | `minio/minio` |
| Cognito | `cognito-local` | `jagregory/cognito-local` |
| SES | MailHog (SMTP catcher + web UI) | `mailhog/mailhog` |
| ElastiCache (Redis) | Redis | `redis:7-alpine` |
| Secrets Manager | LocalStack (community) | `localstack/localstack` (just `secretsmanager`) |

The API container reads `AWS_ENDPOINT_URL_*` env vars in dev so the AWS SDK auto-routes to the local services. **The same code path runs in prod with the env vars unset.**

### 2.3 Data model sketch (DynamoDB single-table)
Single table `nanchang_main` with `PK` / `SK` and three GSIs (room-by-code, friendships-inverse, invites-by-status). Item shapes:

- `USER#<id>` / `PROFILE` — handle, email, displayName, rank, rating, streak, createdAt, role
- `USER#<id>` / `STATS#<period>` — aggregates
- `USER#<id>` / `FRIEND#<friendId>` — friendship edges (both directions written)
- `USER#<id>` / `GAME#<ts>#<gameId>` — game history index (recent first)
- `ROOM#<id>` / `META` — host, status, players, settings, createdAt with **TTL**
- `ROOM#<id>` / `SEAT#<n>` — seated player
- `GAME#<id>` / `META` — finished-game record
- `GAME#<id>` / `MOVE#<n>` — replay moves *(or store as one S3 object — decide in Phase 9)*
- `INVITE#<code>` / `META` — issuer, status, redeemedBy, expiresAt with **TTL**
- `RATE#<scope>#<key>` / `<windowStart>` — rate-limit counters (DDB TTL'd)

We never put real-time per-tick state in DynamoDB — that lives in process memory on the App Runner instance, persisted only on game milestones (deal, score, end).

---

## 3. Cross-Cutting Concerns

### 3.1 Internationalization (EN + ZH)
- Two locale files: `en.json`, `zh.json`. Strictly **no hard-coded user-visible strings**.
- Language toggle persists to `localStorage` and to user profile (so it follows them across devices).
- `<html lang>` updated on toggle (a11y note from handoff).
- **Server-side too**: error messages, email subjects/bodies, push notification copy all translated. Server respects `Accept-Language` header and the user's profile preference.
- A lint rule (`eslint-plugin-i18next` `no-literal-string`) bans inline JSX strings in any component file.
- A CI check fails the build if `en.json` and `zh.json` have mismatched keys.

### 3.2 Auth & authorization
- Cognito User Pool with email verification required.
- **Invite-key gate**: signup endpoint validates `inviteCode` before calling Cognito `AdminCreateUser`. Code is marked redeemed atomically (DDB conditional write).
- **Roles**: `user` (default) and `admin`. Stored in a Cognito custom attribute `custom:role` AND in the user profile item (for fast lookups). JWT carries the role claim.
- Admin route gated on both frontend (route guard) and backend (`@Roles('admin')` decorator).

### 3.3 Rate limiting
Layered:
1. **AWS WAF** on the edge: blanket IP-based limit (e.g. 200 req/5min) + AWS managed bot rule set.
2. **App-level middleware** (`@nestjs/throttler`):
   - Public endpoints (login, signup, forgot-pw): 5/min/IP.
   - Authenticated endpoints: 60/min/user.
   - Invite redemption: 3/hour/IP.
3. **WebSocket events**: per-event token bucket per socket (e.g. `discard` 1/sec, `chat` 5/10s).
4. Counters stored in DynamoDB at MVP (cheap, TTL'd). Migrate to Redis if/when concurrency makes DDB the hot path.

### 3.4 Real-time architecture
- One Socket.IO server, sticky session via App Runner's per-connection routing (we run only 1 instance at this scale, so stickiness is moot — but the design will not assume single-instance).
- Authoritative state on the **server**, in memory, per active game. Persisted to DDB on every event of consequence (deal, call, score, end).
- Reconnection: client re-emits `resume` with `gameId`+JWT; server re-sends the current state snapshot.
- Spectator mode = read-only socket subscription to a game's room namespace.

### 3.5 Accessibility (carry from Handoff Sheet §08)
Tracked as acceptance criteria on every screen-level feature: ARIA labels on tiles, focus order, reduced-motion stubs, color-not-the-only-signal, label/htmlFor on every input, `<html lang>` swap, polite live region for the auto-discard timer.

### 3.6 Observability
- Structured JSON logs (`pino` in Nest).
- CloudWatch metrics: socket connections, game starts, errors per endpoint.
- Sentry (free tier) for FE + BE error tracking.

---

## 4. Phased Plan with Checkpoints

Each phase ends with a **demo-able state** plus **tests for the features introduced**. Tests are organized **by feature**, not phase — when a later phase changes a feature, the test note explicitly calls out updates required to prior tests.

### Phase 0 — Foundation (no user-facing features)
**Goal**: monorepo scaffold + dev environment + CI shell + design tokens.
- pnpm workspace, TS strict mode, ESLint, Prettier, Husky pre-commit.
- `apps/web` Vite + React + Tailwind with **all design tokens from the Handoff Sheet** translated to `tailwind.config.ts`.
- `apps/api` empty NestJS app with healthcheck `GET /health`.
- `docker-compose.yml` boots DynamoDB Local, MinIO, cognito-local, MailHog, Redis. README "first-run" steps.
- GitHub Actions: lint + typecheck + test on PR. (No deploy job yet.)
- CDK project skeleton in `infra/aws` (no resources deployed yet).

**Checkpoint**: `pnpm dev` brings up FE + BE + docker stack, healthcheck returns OK in both envs.

**Tests**:
- *Foundation·smoke*: API healthcheck returns 200; web app renders an empty shell.

---

### Phase 1 — Auth, Invite Keys & User Accounts
**Goal**: a person with an invite code can sign up, sign in, sign out, reset password, change password, and delete their account. No game yet.

Features:
- 1.1 Cognito User Pool + CDK definition. Dev uses `cognito-local`.
- 1.2 Invite code data model + service (`POST /invites/redeem` validates and locks atomically).
- 1.3 Signup screen wired to Cognito (`AuthScreen` from design).
- 1.4 Sign-in / Forgot password / Change password / Delete account screens.
- 1.5 Email verification flow via SES (MailHog in dev).
- 1.6 JWT auth middleware on API; `@CurrentUser()` decorator.
- 1.7 Role attribute on user; seed script creates the first admin user.

**Checkpoint**: I can manually `POST` an invite code via a seed script, create an account, sign in, and the JWT carries my role.

**Tests** (feature-keyed):
- *Auth·signup-requires-invite*: signup without a valid code is rejected.
- *Auth·invite-single-use*: a code redeemed once cannot be redeemed again (atomic).
- *Auth·invite-expiry*: expired codes are rejected (DDB TTL + app check).
- *Auth·signin-happy-path*: valid credentials return a JWT.
- *Auth·forgot-password*: reset code emailed, password updates.
- *Auth·change-password*: re-auth required, password updates.
- *Auth·delete-account*: account hard-deleted from Cognito + soft-deleted in DDB (anonymized).
- *Auth·rate-limit*: 6th login attempt in a minute returns 429.

---

### Phase 2 — i18n & Theming Foundations
**Goal**: every string on every existing screen comes from a translation file; language toggle works.
- react-i18next setup with `en.json` + `zh.json`.
- LangToggle component (per design) wired to context + localStorage + `<html lang>`.
- Server-side i18n for error responses and emails.
- CI key-parity check between locale files.
- Lint rule blocks new literal strings.

**Checkpoint**: toggle between EN and ZH on any auth screen flips every label, button, and error message.

**Tests**:
- *i18n·key-parity*: locale files have identical key sets (CI).
- *i18n·no-literals*: ESLint passes with zero literal-string violations.
- *i18n·server-errors*: API returns localized error message per `Accept-Language`.
- *Auth·*: **update** all prior auth tests to assert against translation keys, not raw strings.

---

### Phase 3 — Admin Page
**Goal**: an admin can manage invite codes and view users.
- 3.1 Admin route `/admin` — frontend route guard + backend role guard.
- 3.2 Admin: invite code list, generate new code (count, expiry, optional note), revoke code.
- 3.3 Admin: user list (handle, email, role, created, last seen), search, change role, force-disable.
- 3.4 Audit log of admin actions (DDB items `AUDIT#<ts>`).

**Checkpoint**: admin creates 4 invite codes; 4 family members sign up using them.

**Tests**:
- *Admin·route-guard*: non-admin gets 403 on every admin endpoint and is bounced from `/admin` on the client.
- *Admin·generate-invite*: code appears in DDB and in the list.
- *Admin·revoke-invite*: revoked code fails redemption.
- *Admin·user-disable*: disabled user's existing JWT is rejected.
- *Admin·audit-log*: every admin mutation produces an audit item.

---

### Phase 4 — Home, Profile, Friends
**Goal**: signed-in users have a home screen, account screen, and a working friends graph.
- 4.1 Home screen with sample stats card (real data in Phase 8), Play button stubbed.
- 4.2 Account/Profile screen (rank, rating, streak — placeholders until Phase 8).
- 4.3 Friends screen: search by handle, send/accept/decline request, remove friend.
- 4.4 Customize screen scaffold (themes/tile packs stored on profile; visuals in Phase 11).

**Checkpoint**: two real accounts can befriend each other and see each other in their friends list.

**Tests**:
- *Friends·send-accept*: request lifecycle moves correctly.
- *Friends·decline*: declined requests disappear from both sides.
- *Friends·remove*: bilateral removal.
- *Friends·search-privacy*: only public profile fields returned.
- *Profile·update-handle*: uniqueness enforced.

---

### Phase 5 — Game Engine (offline, pure logic)
**Goal**: a TypeScript module that fully models Nanchang Mahjong with no network or UI. Drives backend authority and frontend optimistic updates / replay.

Includes:
- 5.1 **Rules document** (`docs/rules-nanchang.md`) drafted from public sources, reviewed by user before code lock-in. Covers: tile set (does Nanchang use jokers/wildcards? Jing reveal exists per design — `wildcard.jsx` confirms), winning hand shapes, scoring (fan/番), Pung/Kong/Chow eligibility, dealer rotation, draw conditions.
- 5.2 Deterministic shuffle (seeded PRNG so games are reproducible for replays + tests).
- 5.3 Hand evaluator: is this a winning hand? what's the score?
- 5.4 Call resolution: priority Win > Pung/Kong > Chow (per handoff §10).
- 5.5 Move log emitter (replay-friendly stream of typed events).

**Checkpoint**: 200+ engine unit tests pass, including a "play this canned game from a seed and assert the final score" test.

**Tests**:
- *Engine·deal-determinism*: same seed → same hands.
- *Engine·hand-eval-{winning-shape}*: one test per recognized winning shape from the rules doc.
- *Engine·scoring-{fan}*: one test per fan/bonus.
- *Engine·call-priority*: simultaneous claims resolve correctly.
- *Engine·illegal-moves*: discarding a tile you don't hold throws.
- *Engine·draw-conditions*: wall-exhaustion draw fires.

---

### Phase 6 — Room / Lobby & Matchmaking
**Goal**: 4 humans can create or join a room and start a game.
- 6.1 `POST /rooms` (private code or public), `POST /rooms/:code/join`, leave, kick.
- 6.2 Real-time room state via Socket.IO (`room:update` events).
- 6.3 Room screen — seat list, ready toggle, host controls, share code.
- 6.4 Host-left fallback (auto-promote next-seated, per design state).
- 6.5 Room TTL: idle 30min → expires.

**Checkpoint**: 4 browser tabs join a room, all toggle ready, host hits Start, transition to Jing-reveal screen.

**Tests**:
- *Room·create-join-leave*: lifecycle.
- *Room·full*: 5th joiner rejected.
- *Room·host-leaves*: next seat promoted; everyone sees update.
- *Room·share-code*: code is unique, case-insensitive on lookup.
- *Room·ttl*: idle room is purged.

---

### Phase 7 — Real-Time Gameplay
**Goal**: a full game can be played end to end with all four humans connected.
- 7.1 Jing reveal screen (`wildcard.jsx`) wired to engine's wildcard determination.
- 7.2 Gameplay screen: tile hand, draw, tap-to-select + Discard confirm (locked decision), side-rail call prompts (locked decision), 8s auto-discard timer.
- 7.3 Socket events: `draw`, `discard`, `call`, `pass`, `win`, `concede`.
- 7.4 Server is authoritative — client UI is optimistic but server snapshot wins.
- 7.5 Reconnection handler: snapshot resend, "Reconnecting…" overlay if disconnect >1.5s.
- 7.6 AFK detection → auto-discard the drawn tile (per handoff §10 default).
- 7.7 Reduced-motion CSS for Jing reveal, pulses, shimmers.
- 7.8 Spectator subscription (`?spectate=1` on the socket join; events filtered to public-only data — no opponents' concealed tiles).

**Checkpoint**: a real game from deal to win works across 4 tabs, with one tab disconnecting and reconnecting mid-game.

**Tests**:
- *Gameplay·discard-flow*: tap → confirm → tile leaves hand → others see it.
- *Gameplay·call-priority*: integration test of Phase 5's engine over the wire.
- *Gameplay·timeout-auto-discard*: drawn tile is auto-discarded at 0s.
- *Gameplay·reconnect*: dropped client receives correct snapshot.
- *Gameplay·spectator-cannot-see-concealed*: spectator socket payload omits hands.
- *Gameplay·rate-limit-events*: spamming `discard` returns "too fast".
- *Engine·*: **update** existing engine tests if rules adjust during integration.

---

### Phase 8 — End Game, Stats, History
**Goal**: completed games persist; stats are computed and shown on Home/Profile.
- 8.1 EndGameScreen variants (win/lose/draw) wired to real result.
- 8.2 Game record written to `GAME#<id>` + per-user history index.
- 8.3 Stats aggregates (rank, rating ELO-ish, streak, win rate) recomputed on game end.
- 8.4 History screen with skeleton/empty/offline states (per handoff §09).
- 8.5 Rematch flow (returns the 4 to a fresh room).

**Checkpoint**: after a game, my profile shows updated rank/rating; my History lists the game.

**Tests**:
- *History·list*: most-recent first, paginated.
- *History·empty-state*: new user sees the design's empty state.
- *Stats·rating-delta*: known inputs → known rating change.
- *Stats·streak*: consecutive wins increment; a loss resets.
- *Rematch·preserves-seats*: same 4 players, fresh game.
- *Profile·*: **update** Phase 4 placeholder assertions to expect real data.

---

### Phase 9 — Replay
**Goal**: any past game can be replayed move-by-move.
- 9.1 Decide storage: small per-move items in DDB **vs.** one JSON blob in S3 per game. Per handoff §10 (<4KB/game), **S3 wins** for cost and simplicity. Replays stored at `s3://.../replays/<gameId>.json`.
- 9.2 Replay player UI (`replay.jsx`): scrub, play/pause, speed.
- 9.3 Share link `/replay/<id>` — **family-only**: requires auth + game must include the viewer or their friend (defaulting to private; the design's "share" copies a link, but viewing still requires auth).
- 9.4 Replay engine re-derives state from the move log + seed.

**Checkpoint**: open History, tap a game, scrub through every move.

**Tests**:
- *Replay·deterministic*: replay reproduces final scores byte-for-byte.
- *Replay·share-auth*: unauthenticated viewer is redirected to login.
- *Replay·permission*: viewer not in the game / not a friend gets 403.
- *Replay·s3-lifecycle*: replay older than 1y is archived (manual eval, no test).

---

### Phase 10 — Learn / Tutorial
**Goal**: the Learn screen from the design is filled with real Nanchang rules content.
- 10.1 Content authored from `docs/rules-nanchang.md` (Phase 5 doc), bilingual.
- 10.2 Interactive examples reuse the engine to demo winning hands.
- 10.3 "New to Mahjong?" nudge on Home (per design) deep-links here.

**Checkpoint**: a non-player can read Learn and understand the variant's basics in both languages.

**Tests**:
- *Learn·all-strings-translated*: snapshot of EN/ZH parity for Learn content.
- *Learn·examples-render*: interactive tile examples mount without error.

---

### Phase 11 — Customize (Themes, Tile Packs, Sound Packs)
**Goal**: the Customize screen actually changes the table.
- 11.1 Theme tokens (felt color, tile face palette) on user profile.
- 11.2 Tile pack assets bundled (Phase 0 had design tokens; this loads alternate SVG sets).
- 11.3 Sound pack (clack on discard, win chime) — opt-in, defaults off.
- 11.4 Tile-glyph contrast guard from handoff §08 (auto-invert ink on dark face).

**Checkpoint**: I can switch felt + tile face and see it on the Gameplay screen.

**Tests**:
- *Customize·persistence*: refresh keeps the chosen theme.
- *Customize·contrast-guard*: dark face with dark ink auto-inverts (unit test on the theme module).
- *Gameplay·*: **update** Phase 7 visual snapshot tests to cover both default and one alternate theme.

---

### Phase 12 — Push Notifications & Polish
**Goal**: optional push for turn-ready / friend-invited / rematch-ready.
- 12.1 Web Push (VAPID) — service worker registration.
- 12.2 Server: `@nestjs/web-push` queue.
- 12.3 Permission prompt only after the user opts in via Account settings.
- 12.4 Final a11y pass: reduced motion, screen-reader tile labels, focus rings, polite live regions (per handoff §08 TODOs).
- 12.5 Performance pass: bundle splitting, image preloading on Room→Game transition.

**Checkpoint**: closing the tab and getting `pung`'d at the table still surfaces a notification.

**Tests**:
- *Push·subscription*: token stored on profile.
- *Push·unsubscribe*: token removed; no further deliveries.
- *A11y·tile-aria*: every rendered tile has a canonical `aria-label`.
- *A11y·reduced-motion*: media-query forces static states.

---

### Phase 13 — Production Deploy & Hardening
**Goal**: live on `ap-east-1` with a real domain.
- 13.1 CDK deploys S3+CloudFront, App Runner, DynamoDB, Cognito, SES, WAF.
- 13.2 GitHub Actions: deploy job on `main` (build → upload to S3, invalidate CloudFront, push container to ECR, update App Runner).
- 13.3 Sentry + CloudWatch dashboards.
- 13.4 Backup: DynamoDB point-in-time recovery on.
- 13.5 Cost alarm at $50/mo (way above expected, but catches runaways).
- 13.6 Smoke-test playbook (Playwright suite ran against prod after every deploy).

**Checkpoint**: family members on real phones over 4G play a real game without me running anything locally.

**Tests**:
- *Deploy·smoke* (Playwright against prod URL): signup with invite → home → create room → spectate → exit.
- *Infra·secrets-rotation* (manual eval).

---

## 5. Risks & Open Items
| # | Risk | Mitigation |
|---|---|---|
| R1 | Nanchang rules vary regionally; my Phase 5 draft may not match user's family rules. | Phase 5 ships rules doc **before** engine lock; user reviews and corrects. |
| R2 | App Runner cold starts on min=0 hurt UX. | Run min=1 (~$5/mo extra) once we have real users. |
| R3 | Single-instance WebSocket has no failover. | Acceptable at <50 users. Phase 13 deploys with health-check rolling restarts. Multi-instance + sticky sessions is a documented "future" item. |
| R4 | DDB single-table design hard to evolve. | Strict access-pattern doc maintained in `docs/data-model.md` from Phase 1. |
| R5 | i18n drift (devs add strings without translating). | Lint + CI key-parity check from Phase 2. |
| R6 | Reconnection edge cases mid-call. | Phase 7 dedicates explicit tests; spec the snapshot resume protocol in `docs/realtime-protocol.md`. |

## 6. Future / Post-MVP (not scheduled)
- **Bot fill-in** (`Engine.botPlayer` interface left as a seam in Phase 5).
- **Landscape / tablet** game layout (handoff §10 explicitly defers).
- **Tournaments / seasons**.
- **Social OAuth** (Google).
- **2FA / TOTP** (auth screens already designed for it; library + UI work only).
- **Voice/text chat in-game** (rate-limit and moderation cost).

---

## 7. Definition of Done (project-wide)
A phase is done when:
1. Its feature acceptance criteria pass in dev (manual + automated).
2. Its tests are green; previously-listed tests requiring updates are updated and green.
3. EN and ZH both display correctly on every new screen (visual + key-parity).
4. A11y items from the Handoff Sheet for that screen are checked off.
5. The Docker dev stack still boots cleanly from a fresh `pnpm install`.
6. Phase 13 only: prod smoke-test suite passes against the deployed URL.
