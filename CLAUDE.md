# Nanchang Mahjong — Claude Context

## 1. Project Overview

Private family Nanchang Mahjong web app. Four human players connect to a private room, play a full session (East or East+South rounds, or bust mode), and accumulate ELO ratings over time. Server-authoritative; engine is the single source of truth for rules. GitHub: `r73inc/nanchang-mahjong`.

**Phases shipped:** 0 (scaffold) → 1 (auth/invites) → 2 (i18n EN+ZH) → 3 (admin) → 4 (profile/friends) → 5 (engine) → 6 (rooms/lobby) → 7 (real-time gameplay) → 8 (ELO/history) → 9 (replay BE+FE) → 10 (Learn/Tutorial) → 11 (Customize). **Phase 12 (Push + a11y) is next.**

---

## 2. Tech Stack & Environment

| Layer    | Stack                                                                                       |
| -------- | ------------------------------------------------------------------------------------------- |
| Monorepo | pnpm workspaces, TypeScript throughout                                                      |
| Engine   | `packages/engine` — pure TS, no deps, Vitest (241 tests)                                    |
| Shared   | `packages/shared` — Zod schemas, socket event types, tile-map                               |
| API      | `apps/api` — NestJS + Fastify, Socket.IO, DynamoDB single-table, Jest (208 tests)           |
| Web      | `apps/web` — React 18, Vite, Zustand, TanStack Query, react-i18next, Vitest+RTL (102 tests) |
| Infra    | AWS App Runner, DynamoDB, CDK in `infra/`                                                   |
| CI       | GitHub Actions: lint + typecheck + test on every PR                                         |

**Key files:** `PLAN.md` (phase roadmap), `PHASE-7-PLAN.md` (Phase 7 detailed brief), `docs/final-nanchang-mahjong-rules.md` (locked rules).

---

## 3. Core Guidelines

- **`main` is protected.** All changes via PR from a branch. Branch naming: `feat/phase-N-slug`, `fix/slug`, `chore/slug`, `engine/slug`.
- **Engine is immutable.** Every `GameEngine` method returns a new instance. Never mutate state directly.
- **Scoring: locked rules only.** Base(1) × Multipliers system. No additive fan. Zero-sum invariant must hold on every hand.
- **Server is authoritative.** `game:snapshot` always replaces client state wholesale. No client-side game logic.
- **Redaction at the edge.** `toClientSnapshot(state, viewer)` hides concealed hands. Spectators and opponents never see `TileType[]`.
- **i18n: no literal strings in JSX.** All visible text goes through `t()`. EN and ZH keys must stay in parity.
- **PR scope discipline.** Engine-only changes → engine branch. Schema/API/FE changes → separate PRs. Never mix.
- **One PR at a time. Always.** Open one PR, push it, then stop and wait. Do not open a second PR, do not start a second branch, do not write any more code until the first PR has been reviewed, any requested changes made, and it is confirmed merged into `main`. Never branch a PR off another unmerged PR — if the first PR changes then the second branch becomes wasted or broken work. The only exception is if the user explicitly asks for a stacked PR approach; even then, ask first before doing it.

---

## 4. Common Commands

**⚠️ NEVER use `cd "absolute\path"; command` compound syntax in PowerShell. It triggers a hardcoded security block that no allowlist can override. Always use pnpm workspace filters instead.**

```powershell
# Tests
pnpm --filter @nanchang/engine run test        # engine (Vitest)
pnpm --filter @nanchang/api run test           # API (Jest)
pnpm --filter @nanchang/web run test           # web (Vitest)

# Typechecks
pnpm --filter @nanchang/engine run typecheck
pnpm --filter @nanchang/api run typecheck
pnpm --filter @nanchang/web run typecheck
pnpm --filter @nanchang/shared run typecheck

# Install / lockfile
pnpm install

# Git (run from project root — no cd needed)
git status
git add <files>
git commit -m @'<message>'@   # PowerShell heredoc for multi-line
git push -u origin <branch>
gh pr create ...
gh pr view <n> --comments
```

---

## 5. Current Progress & Next Steps

### Completed (Phase 7 — Real-Time Gameplay)

- **7.0 Engine extensions:** `addToKong`, rob-kong, dealer rotation + `nextDealer()`, `concede()`, locked-rules scoring (Base × Multipliers), spirit settlement, instant kong payouts. PR #14.
- **7A Backend:** `GameService` turn loop (8s claim windows, rob-kong, AFK overlay every 20s no forced action), multi-hand sessions with spirit settlement, bust/rounds termination, `game:ended` payload for Phase 8 ELO. `GameGateway` with Zod validation + rate limiting. `toClientSnapshot` redaction. Tile-map + game event schemas in shared. PR #16.
- **7B Frontend:** `GamePage` (jing-reveal → compass game table → end screen), `useGame` hook (1.5s reconnect overlay, optimistic discard), `MahjongTile` component (aria-labels, suit colours), `game.store.ts`, 34 i18n keys EN+ZH. PR #17.

### Completed (Phase 8 — ELO & Game History)

- **8A Backend (PR #18):** `EloService` (K=32 pairwise ELO), `StatsService` (gamesPlayed, gamesWon, streak, rating updated after each session), `GET /users/me/games` paginated history endpoint, `game:rematch` socket event + host-only `requestRematch()` that pre-creates a DDB room and emits `game:rematch-ready`. `ratingDeltas` added to `GameEndedPayload`. 10 new tests.
- **8B Frontend (PR #19):** Enriched `GameEndScreen` (placement badge, ELO delta, rank markers, hands-played), `HistoryPage` at `/history` (skeleton/empty/list states, infinite scroll), `useGameHistory` hook, `game:rematch-ready` → auto-navigate to new room, 12 new i18n keys EN+ZH, 5 new tests.

### Completed (Phase 9A — Replay Backend)

- **9A Backend (PR #21):** `replayHand()` pure engine function mapping `GameEvent[]` back to sequential engine calls → `GameState[]` timeline. `GameSession.handLog[]` tracks per-hand seed/config. `endSession()` writes `ReplayGamePayload` JSON to S3 (MinIO locally). `GET /replays/:id` — player-or-accepted-friend access check via `FriendsService.areFriends()`. `StorageService` (@Global, auto-creates S3 bucket). `GameEvent` + `GameState` re-exported from `@nanchang/shared`. 9 new tests (4 engine Replay·deterministic + 5 API Replay·permission).

### Completed (Phase 9 — Replay)

- **9A Backend (PR #21):** `replayHand()` pure engine function. `GameSession.handLog[]` per-hand. `endSession()` writes `ReplayGamePayload` to S3. `GET /replays/:id` access-gated. 9 new tests.
- **9B Frontend (PR #23):** `ReplayPage` at `/replay/:id` — scrub bar, play/pause, 1×/2×/4× speed. `buildTimeline()` pre-computes `GameState[]` client-side. History cards → replay. Share sheet. 22 i18n keys EN+ZH, 3 tests.

### Completed (Phase 10 — Learn / Tutorial, PR #24)

- **LearnPage** at `/learn` — 6-tab rules reference: Overview, Tiles, Spirit, Gameplay, Hands, Scoring. `MahjongTile` examples in every section. "New to the game?" nudge on Home. 48 i18n keys EN+ZH, 6 tests.

### Completed (Phase 11 — Customize, PR #25)

- **`ThemeStore`** (Zustand persist) — `felt` (jade/crimson/slate/navy) + `tilePalette` (classic/sepia/dark) + `soundEnabled`. Persisted to `localStorage`.
- **CSS custom properties** — `applyTheme()` writes `--felt-*` and `--tile-*` vars to `:root`; `ScreenShell` and `MahjongTile` read them so the entire app repaints when the theme changes.
- **`CustomizePage`** at `/customize` — felt color swatches, tile palette preview, sound toggle.
- **`contrastGuard(hex)`** — WCAG luminance check; auto-returns light/dark ink color for any tile-face background.
- **`useSound`** hook — Web Audio API clack + chime (opt-in, off by default). 14 i18n keys EN+ZH, 10 tests.

### Next: Phase 12 — Push Notifications & Polish (split)

**12A Backend (this PR):**

- VAPID key pair in config; graceful no-op if keys not set.
- `PushModule` (@Global) — `PushService` (subscribe/unsubscribe/sendToUser/sendTurnNotification) + `PushController` (`GET /push/vapid-public-key`, `POST /push/subscribe`, `DELETE /push/unsubscribe`).
- Push subscriptions stored in DynamoDB as `USER#<sub>/PUSH_SUB`.
- `GameService.startTurn()` fires turn notification when the active seat has no live socket.

**12B Frontend (next PR):**

- Service worker (`sw.ts`) for receiving push events.
- `usePushNotifications` hook — permission flow, subscribe/unsubscribe.
- Permission toggle in Account Settings.
- A11y pass: reduced-motion, focus rings, live regions.
- Performance: lazy-loaded routes.

---

## 6. Command Self-Correction Rule

When I need to run a command in a sub-directory, I must use **one of these patterns** — never `cd "absolute\path"; ...`:

```powershell
# ✅ Correct
pnpm --filter @nanchang/web run typecheck

# ❌ Wrong — triggers hardcoded security block every time
cd "D:\FamilyMahjongApp\apps\web"; npx tsc --noEmit
```

If a pnpm filter script doesn't exist for what I need, I add the script to the relevant `package.json` first, then run it via filter.
