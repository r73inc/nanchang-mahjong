# Nanchang Mahjong — Claude Context

## 1. Project Overview

Private family Nanchang Mahjong web app. Four human players connect to a private room, play a full session (East or East+South rounds, or bust mode), and accumulate ELO ratings over time. Server-authoritative; engine is the single source of truth for rules. GitHub: `r73inc/nanchang-mahjong`.

**Phases shipped:** 0 (scaffold) → 1 (auth/invites) → 2 (i18n EN+ZH) → 3 (admin) → 4 (profile/friends) → 5 (engine) → 6 (rooms/lobby) → 7 (real-time gameplay: engine extensions, backend gateway, frontend game table). **Phase 8 (ELO/history) is next.**

---

## 2. Tech Stack & Environment

| Layer    | Stack                                                                                      |
| -------- | ------------------------------------------------------------------------------------------ |
| Monorepo | pnpm workspaces, TypeScript throughout                                                     |
| Engine   | `packages/engine` — pure TS, no deps, Vitest (241 tests)                                   |
| Shared   | `packages/shared` — Zod schemas, socket event types, tile-map                              |
| API      | `apps/api` — NestJS + Fastify, Socket.IO, DynamoDB single-table, Jest (193 tests)          |
| Web      | `apps/web` — React 18, Vite, Zustand, TanStack Query, react-i18next, Vitest+RTL (78 tests) |
| Infra    | AWS App Runner, DynamoDB, CDK in `infra/`                                                  |
| CI       | GitHub Actions: lint + typecheck + test on every PR                                        |

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
- **7B Frontend:** `GamePage` (jing-reveal → compass game table → end screen), `useGame` hook (1.5s reconnect overlay, optimistic discard), `MahjongTile` component (aria-labels, suit colours), `game.store.ts`, 34 i18n keys EN+ZH. PR #17 (merged).

### In Progress: Phase 8 — ELO & Game History (PRs open, not yet merged)

- **8A Backend (PR #18):** `EloService` (K=32 pairwise ELO), `StatsService` (gamesPlayed, gamesWon, streak, rating updated after each session), `GET /users/me/games` paginated history endpoint, `game:rematch` socket event + host-only `requestRematch()` that pre-creates a DDB room and emits `game:rematch-ready`. `ratingDeltas` added to `GameEndedPayload`. 10 new tests.
- **8B Frontend (PR #19):** Enriched `GameEndScreen` (placement badge, ELO delta, rank markers, hands-played), `HistoryPage` at `/history` (skeleton/empty/list states, infinite scroll), `useGameHistory` hook, `game:rematch-ready` → auto-navigate to new room, 12 new i18n keys EN+ZH, 5 new tests.

### Next: Phase 9 — Replay

- Decide storage: DDB per-move items vs. one S3 JSON blob per game (PLAN favours S3 at <4KB/game).
- Replay player UI: scrub, play/pause, speed.
- Share link `/replay/<id>` — auth-gated, viewer must be a player or friend.

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
