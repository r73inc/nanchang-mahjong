# Nanchang Mahjong — Claude Context

## 1. Project Overview

Private family Nanchang Mahjong web app. Four human players connect to a private room, play a full session (East or East+South rounds, or bust mode), and accumulate ELO ratings over time. Server-authoritative; engine is the single source of truth for rules. GitHub: `r73inc/nanchang-mahjong`.

**Phases shipped:** 0 (scaffold) → 1 (auth/invites) → 2 (i18n EN+ZH) → 3 (admin) → 4 (profile/friends) → 5 (engine) → 6 (rooms/lobby) → 7 (real-time gameplay) → 8 (ELO/history) → 9 (replay BE+FE) → 10 (Learn/Tutorial) → 11 (Customize) → 12A (Push Backend) → 3D UI (PRs #32–40, merged). **Phase 12B (Push Frontend + A11y) is next. Two 3D bugs remain open (BUG-08 viewer discards invisible, BUG-09 TileWall redesign) — tracked in `3D-BUG-LOG.md`, deferred post-12B.**

---

## 2. Tech Stack & Environment

| Layer    | Stack                                                                                       |
| -------- | ------------------------------------------------------------------------------------------- |
| Monorepo | pnpm workspaces, TypeScript throughout                                                      |
| Engine   | `packages/engine` — pure TS, no deps, Vitest (248 tests)                                    |
| Shared   | `packages/shared` — Zod schemas, socket event types, tile-map                               |
| API      | `apps/api` — NestJS + Fastify, Socket.IO, DynamoDB single-table, Jest (220 tests)           |
| Web      | `apps/web` — React 18, Vite, Zustand, TanStack Query, react-i18next, Vitest+RTL (165 tests) |
| 3D       | `three ^0.165`, `@react-three/fiber ^8.17`, `@react-three/drei ^9.109` — game table only    |
| Infra    | AWS App Runner, DynamoDB, CDK in `infra/`                                                   |
| CI       | GitHub Actions: lint + typecheck + test on every PR                                         |

**Key files:**

- **Current reference docs (project root):** `Open-issues.md` (all open bugs and improvements), `Closed-issues.md` (all fixed bugs with learnings), `Plan-and-roadmap.md` (complete development plan and roadmap)
- **Locked rules:** `docs/final-nanchang-mahjong-rules.md` (never move — authoritative rules document)
- **Legacy docs (archived in `docs/oldDocs/`):** `BUG-LOG.md`, `PHASE-7-PLAN.md`, `2dTo3d.md`, `3D-BUG-LOG.md`, `PLAN.md`, and others

---

## 3. Core Guidelines

### Branching & PR Workflow

- **All work branches off `main`.** Unless explicitly told otherwise, create all branches from `main`, not off other feature branches. Do not create nested branches.
- **Complete work and raise a PR.** Complete the work in a single branch, ensure all tests pass and type checking is clean, then raise a PR for review.
- **One PR at a time, always.** Open one PR and stop. Do not open a second PR, do not start a second branch, and do not write additional code until:
  1. The first PR has been reviewed
  2. Any requested changes have been addressed and committed
  3. The PR is confirmed merged into `main`
  - **Never branch a PR off another unmerged PR** — if the base PR changes, the dependent branch becomes wasted or broken work.
  - **Exception:** If the user explicitly asks for a stacked PR approach, ask first before doing it; even then, proceed only with explicit confirmation.

### Code Guidelines

- **`main` is protected.** All changes via PR from a branch. Branch naming: `feat/phase-N-slug`, `fix/slug`, `chore/slug`, `engine/slug`.
- **Engine is immutable.** Every `GameEngine` method returns a new instance. Never mutate state directly.
- **Scoring: locked rules only.** Base(1) × Multipliers system. No additive fan. Zero-sum invariant must hold on every hand.
- **Server is authoritative.** `game:snapshot` always replaces client state wholesale. No client-side game logic.
- **Redaction at the edge.** `toClientSnapshot(state, viewer)` hides concealed hands. Spectators and opponents never see `TileType[]`.
- **i18n: no literal strings in JSX.** All visible text goes through `t()`. EN and ZH keys must stay in parity.
- **PR scope discipline.** Engine-only changes → engine branch. Schema/API/FE changes → separate PRs. Never mix.
- **ALWAYS use texture tiles (`MahjongTile2D`) for ANY new features or refactors.** Every mahjong tile rendered on screen — whether in new code, refactored code, or feature additions — MUST use `MahjongTile2D` from `apps/web/src/components/2d/MahjongTile2D.tsx`, which renders SVG textures from `public/textures/Tiles/Regular/`. **Never use the legacy text-glyph `MahjongTile` from `components/mahjong-tile.tsx` for any new work.** That component is ONLY retained for the existing Learn/Replay/History pages that were built before the texture migration and have not yet been refactored to use textures. The moment any of those pages are touched for a new feature or refactor, migrate them to `MahjongTile2D`. The text-based tile component is deprecated and should be completely removed from the project once those three pages are migrated. When in doubt, **always use `MahjongTile2D`.**

---

## 4. Common Commands

**⚠️ NEVER use `cd "absolute\path"; command` compound syntax in PowerShell. It triggers a hardcoded security block that no allowlist can override. Always use pnpm workspace filters instead.**

```powershell
# Dev servers (local testing)
pnpm --filter @nanchang/api run dev            # NestJS API with watch (nest start --watch)
pnpm --filter @nanchang/web run dev            # Vite dev server

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

### Completed (Phase 12A — Push Backend, PR #26)

- VAPID key pair in config; graceful no-op if keys not set.
- `PushModule` (@Global) — `PushService` + `PushController`. Push subscriptions in DDB (`USER#<sub>/PUSH_SUB`). `GameService.startTurn()` fires turn notification when active seat has no live socket. 8 new tests (220 total API).

### Completed: 3D UI Migration (`feat/3d-ui` → `main`, PR #39 open)

Replaced the DOM `GameTable` compass layout with a React Three Fiber 3D scene. All other routes/pages, overlays, backend, and the DOM `MahjongTile` component (used in Learn/Replay/History) are untouched. See `2dTo3d.md` for the full blueprint.

**All phases merged into `feat/3d-ui`:**

- **Phase A (PR #32):** R3F deps (`three ^0.165`, `@react-three/fiber ^8.17`, `@react-three/drei ^9.109`). GLB inspected (single node `empty_2`, no UVs → two-mesh strategy). `tile-texture-map.ts`. Vitest include pattern widened to `*.{test,spec}.{ts,tsx}`. Assets committed: `public/models/mjtile.glb`, `public/textures/Tiles/Regular/*.svg` (40 files). (**Black SVG set has since been deleted — only Regular remains.**)
- **Phase B (PR #33):** `useTileGeometry.ts`, `useTileTextures.ts`, `table-layout.ts` (pure TS, no Three.js), `useGameLayout.ts` (Zustand transient subscribe → layout ref). Layout spec tests.
- **Phase D (PR #34):** Full 3D component library — `MahjongTile3D` (GLB body + PlaneGeometry face stamp, `useFrame` lerp, jing emissive + Html label + hit-box), `TileHand3D`, `OpponentHand3D`, `DiscardPool3D`, `OpenMelds3D`, `FeltSurface3D`.
- **Phase E (PR #35):** `GameCanvas.tsx` (`<Canvas>` + `GameScene`). `game-page.tsx` migrated: DOM compass layout removed, `GameCanvas` as `inset-0 aria-hidden` base layer, `SeatHUD` (4 corner nameplate chips), `AccessibleHand` (sr-only DOM buttons — a11y + test harness). All overlays preserved (SideRail z-20, ActionToast z-30, ConcedeSheet z-40, ReconnectingOverlay z-50).
- **Phase G (PR #36):** `subscribeWithSelector` middleware on `useGameStore`. `GameScene` reads `snapshot` directly from the store — canvas only re-renders on game-state changes, not on toast/claimWindow/connection updates.
- **Phase H (PR #37):** Jing gold BackSide outline shell (1.04× scale, opacity lerps 0 → 0.6 in `useFrame`). Three-layer Jing treatment complete: color pulse + outline shell + `节` Html label.
- **Phase I (PR #38):** `NOOP_RAYCAST` on outline shell, body, and face stamp meshes — only the hit-box participates in raycasting. `raycaster.firstHitOnly = true` via `onCreated`. Non-interactive tiles have zero raycasting cost.

**PRs #39 and #40 merged to `main` on 2026-06-05.** All tests passing (248 engine / 220 API / 167 web).

**3D bug fixes included (PRs #40 → #39):** SVG face transparency (transparent:true/depthWrite:false), tsumo auto-win, open-meld canWin fix, standing right/left opponent hands (rx=0 ry=π), uniform ry=π for all discards/melds, SvgHandTile in ViewerHandHUD, TileWall3D removed (Back.svg red background). **Two bugs remain open — see `3D-BUG-LOG.md`:** BUG-08 (viewer discards not visible) and BUG-09 (TileWall3D redesign).

### Next: Phase 12B — Push Frontend + A11y

- `public/sw.js` service worker — `push`, `notificationclick`, `pushsubscriptionchange`.
- `usePushNotifications` hook — SW registration, VAPID key fetch, permission flow, pushManager subscribe/unsubscribe.
- Push notification toggle in Home settings section.
- `prefers-reduced-motion` global CSS rule in `index.css`.
- A11y tests: `A11y·tile-aria` + `A11y·reduced-motion`.

---

## 6. Issues & Bug Management

### Open Issues

`Open-issues.md` (repo root) tracks all currently open bugs and improvements:

- **Gameplay bugs:** BUG-022 (rejoin fails), BUG-023 (invalid phase on continue), BUG-024 (winning tile missing)
- **3D UI bugs:** BUG-08 (viewer discards invisible), BUG-09 (TileWall redesign)
- **2D UI bugs:** BUG-020 (last-discard pulse), BUG-021 (hand-reveal grouping)
- **Improvements:** Settlement phase consolidation, end game animations, mobile UX

### Closed Issues & Learnings

`Closed-issues.md` (repo root) documents all fixed bugs with root causes and key learnings:

- BUG-001 through BUG-021 with full analysis
- 3D UI migration closed bugs
- Cross-cutting learnings (monorepo resolution, socket data flow, material transparency, etc.)

**Read closed issues before working on:**

- PowerShell scripts or dev tooling (BUG-001, BUG-002)
- DynamoDB seed scripts or schema keys (BUG-003)
- NestJS config / environment loading (BUG-004)
- Workspace package resolution (`exports` field, Jest, Vite) (BUG-006, BUG-007, BUG-011)
- Socket event handling or game phase logic (BUG-009, BUG-010, BUG-022, BUG-023)
- Game state and replay (BUG-017, BUG-019)

**When you find a non-trivial bug:** Document it immediately in `Open-issues.md` with symptom, suspected cause, and investigation paths. Once fixed, move it to `Closed-issues.md` with root cause, fix, and key learnings to prevent recurrence.

---

## 7. Command Self-Correction Rule

When I need to run a command in a sub-directory, I must use **one of these patterns** — never `cd "absolute\path"; ...`:

```powershell
# ✅ Correct
pnpm --filter @nanchang/web run typecheck

# ❌ Wrong — triggers hardcoded security block every time
cd "D:\FamilyMahjongApp\apps\web"; npx tsc --noEmit
```

If a pnpm filter script doesn't exist for what I need, I add the script to the relevant `package.json` first, then run it via filter.
