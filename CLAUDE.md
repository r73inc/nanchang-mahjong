# Nanchang Mahjong — Claude Context

## 1. Project Overview

Private family Nanchang Mahjong web app. Four human players connect to a private room, play a full session (East or East+South rounds, or bust mode), and accumulate ELO ratings over time. Server-authoritative; engine is the single source of truth for rules. GitHub: `r73inc/nanchang-mahjong`.

**Phases shipped:** 0 (scaffold) → 1 (auth/invites) → 2 (i18n EN+ZH) → 3 (admin) → 4 (profile/friends) → 5 (engine) → 6 (rooms/lobby) → 7 (real-time gameplay) → 8 (ELO/history) → 9 (replay BE+FE) → 10 (Learn/Tutorial) → 11 (Customize) → 12A (Push Backend). **3D UI migration complete — bug-fix PR #40 (`fix/3d-bugs` → `feat/3d-ui`) open for review; PR #39 (`feat/3d-ui` → `main`) follows after #40 merges. Phase 12B (Push Frontend + A11y) is next after both merge.**

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

**Key files:** `PLAN.md` (phase roadmap), `PHASE-7-PLAN.md` (Phase 7 detailed brief), `docs/final-nanchang-mahjong-rules.md` (locked rules), `BUG-LOG.md` (bug history and learnings — read before touching infra, scripts, or socket events), `2dTo3d.md` (3D UI migration blueprint — phases A–I), `3D-BUG-LOG.md` (bugs found during 3D UI local testing — status/fixes tracked here).

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
- **3D UI branch override (active — two PRs open).** PR #40 (`fix/3d-bugs` → `feat/3d-ui`) must merge first, then PR #39 (`feat/3d-ui` → `main`) can be finalized. Once PR #39 merges this override is retired and the normal one-PR-at-a-time rule resumes.

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

**Final PR #39 (`feat/3d-ui` → `main`):** Open, blocked on PR #40 merging first.

### In Progress: 3D Bug Fixes (`fix/3d-bugs`, PR #40 open → `feat/3d-ui`)

Two commits on `fix/3d-bugs`, PR #40 open. All tests passing (248 engine / 220 API / 165 web).

**Commit 1 — engine & gameplay fixes (`505626d`):**

- **MAJOR-02 fixed:** `canWin()` in `calls.ts` now accepts optional `openMeldTiles` parameter and builds the full 14-tile hand before checking. `claim-resolver.ts` passes each seat's open meld tiles when computing eligible claims. 3 new engine unit tests + 1 claim-resolver integration test.
- **MAJOR-01 fixed:** `startTurn()` in `game.service.ts` now auto-detects tsumo: if the active player's full hand (open melds + concealed) = 14 tiles and `isWinningHand` = true, it auto-declares win immediately (appropriate for family game where declining wins is never desired).
- **BUG-02 fixed:** `tex.flipY = true` in `useTileTextures.ts` (was incorrectly `false` — caused upside-down tile characters).
- **BUG-03 fixed:** Face stamp material changed `MeshPhysicalMaterial` → `MeshBasicMaterial` (unlit — clearcoat blow-out on flat tiles eliminated).
- **IMP-01 fixed:** Camera `position: [0, 8, 13]`, `fov: 58` (was `[0, 14, 10]`, 48° — shallower, more natural table perspective).
- **IMP-02 fixed:** Tile body `clearcoat: 0.2`, `roughness: 0.45` (was 0.75 / 0.18).

**Commit 2 — UX improvements (`cacdc64`):**

- **Tiles always Regular:** `TilePaletteVariant` narrowed to `'Regular'` only; `themeToVariant()` always returns `'Regular'` (Black SVG folder deleted from repo). 4 Black palette tests removed from spec.
- **Tile body fully unlit:** Body material changed `MeshPhysicalMaterial` → `MeshBasicMaterial` — zero clearcoat, unlit, always legible regardless of orientation (completes BUG-03/IMP-02 fix).
- **Tile wall (`TileWall3D` new):** Single `InstancedMesh` of 136 box slots arranged as four wall sides around the table. Visible count = `snapshot.wallCount`; tiles drain from the South side first (clockwise draw direction). Gives a tactile sense of remaining tiles.
- **Viewer hand HUD (`ViewerHandHUD` new):** Viewer's tiles moved from 3D canvas into a DOM overlay at the bottom of the screen. Tiles use the 2D `MahjongTile` component at `size="lg"` (46×62 px) — much larger and easier to read. HTML5 drag-and-drop reordering with live swap-on-hover; order resets after each draw/discard cycle. `GameCanvas` no longer takes `onSelectTile`/`onDiscard` props. `AccessibleHand` sr-only layer preserved for a11y and tests.
- **History panel (`GameHistoryPanel` new):** Collapsible right-side panel (z-15) with a toggle tab (≡). Tracks discards, pungs, chows, kongs, wins, concedes by diffing successive snapshots + watching toast events. Auto-scrolls to newest entry. 4 new i18n keys EN+ZH: `gameHistoryTitle`, `gameHistoryDiscard`, `gameHistoryOpen`, `gameHistoryClose`.
- **Scene lighting simplified:** `Environment` IBL preset and heavy directional key light removed. Only ambient + one soft directional fill remain (affect felt surface only — tiles are MeshBasicMaterial and ignore all lighting).

**Still pending re-test after merge:**

- BUG-01 — confirm white-background Regular tiles appear (likely resolved by MeshBasicMaterial).
- BUG-04 — left/right side tile elongation (may improve with flat materials + shallower camera).
- BUG-05 — side player discard/meld tile face direction (likely improved by MeshBasicMaterial making faces always visible).

**Merge flow:**

1. Review + merge PR #40 (`fix/3d-bugs` → `feat/3d-ui`)
2. Test locally on `feat/3d-ui`
3. Merge PR #39 (`feat/3d-ui` → `main`)
4. Proceed to Phase 12B

### Next: Phase 12B — Push Frontend + A11y

- `public/sw.js` service worker — `push`, `notificationclick`, `pushsubscriptionchange`.
- `usePushNotifications` hook — SW registration, VAPID key fetch, permission flow, pushManager subscribe/unsubscribe.
- Push notification toggle in Home settings section.
- `prefers-reduced-motion` global CSS rule in `index.css`.
- A11y tests: `A11y·tile-aria` + `A11y·reduced-motion`.

---

## 6. Bug Log

`BUG-LOG.md` (repo root) is the authoritative record of bugs discovered during development — including root causes, fixes, and the recurring patterns that caused them.

**Read it before working on:**

- PowerShell scripts or dev tooling (BUG-001, BUG-002)
- DynamoDB seed scripts or schema keys (BUG-003)
- NestJS config / environment loading (BUG-004)
- Workspace package resolution (`exports` field, Jest, Vite) (BUG-006, BUG-007, BUG-011)
- Socket event handling or game phase logic (BUG-009, BUG-010)

**`3D-BUG-LOG.md`** (repo root) tracks bugs found during 3D UI local testing. All items in the log have been addressed in `fix/3d-bugs` (PR #40). Append new entries here for any further 3D-specific bugs.

**Append a new entry whenever a non-trivial bug is found and fixed.** Use the template at the bottom of `BUG-LOG.md`. Include: symptom, root cause, fix, and the learning/rule to prevent recurrence.

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
