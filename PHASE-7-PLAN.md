# Phase 7 — Real-Time Gameplay · Implementation Sub-Plan

> **Status:** planning (authored during Phase 6). Not yet started.
> **Parent:** [`PLAN.md`](./PLAN.md) §4 → "Phase 7 — Real-Time Gameplay".
> **Split:** **BE-first PR (7A) → FE PR (7B)**, per `PLAN.md` §0.0. The phase is the
> largest in the project; 7A may itself be split if the diff grows beyond ~1500 LOC.
> **Goal (verbatim from PLAN):** _a full game can be played end to end with all four
> humans connected._ Checkpoint: a real game from deal to win works across 4 tabs,
> with one tab disconnecting and reconnecting mid-game.

This document is the detailed, self-contained brief to pick up when Phase 7 begins.
It assumes the reader has **not** re-derived the codebase. Everything needed —
file paths, signatures, event contracts, decisions, test mapping — is here.

---

## 0. How to use this document

1. Read §1 (dependencies) and confirm Phase 6 actually delivered what 7 assumes.
2. Confirm the open decisions in §10 with the user **before** writing code.
3. Land **7.0 (engine extensions)** first — it is pure `packages/engine` work and can
   even ship as its own tiny PR/commit ahead of 7A. Everything else depends on it.
4. Work 7A (backend) top-to-bottom using the task list in §11. Keep `main` green.
5. Work 7B (frontend) using the task list in §11.
6. Tick the Definition of Done in §12.

---

## 1. Context & dependencies

### 1.1 What exists today (end of Phase 5, `main` @ PR #10)

- **`packages/engine` (`@nanchang/engine`)** — pure, deterministic, immutable Nanchang
  rules engine. Fully tested (221 tests). This is the authoritative rules core.
  - `GameEngine` (class, immutable — every move returns a **new** instance):
    - `static create(seed: number)`
    - `deal()` → `jing_reveal`
    - `revealJing()` → `playing` (sets `jingPrimary`/`jingSecondary`, consumes indicator)
    - `discard(tile)` → `awaiting_claims`
    - `passClaims()` → next seat draws → `playing`
    - `declareWin(seatIdx)` → `finished`
    - `pung(seatIdx)`, `chow(seatIdx, sequence)`, `kongFromDiscard(seatIdx)`,
      `kongConcealed(seatIdx, tile)`
    - getters: `isFinished`, `currentSeatState`, public readonly `state`, `events`
  - Pure helpers (also exported): `canWin`, `canPung`, `canKongFromDiscard`,
    `concealedKongOptions`, `addToKongOptions`, `chowOptions`, `tenpaiTiles`, `isTenpai`,
    `isWinningHand`, `decomposeHand`, `shantenNumber`, `calculateFan`,
    `calculateSevenPairsFan`, `calculatePayment`, plus tile utilities.
  - `GameState` shape (see `packages/engine/src/types.ts`): `phase`, `seed`,
    `jingIndicator`, `jingPrimary`, `jingSecondary`, `wall: TileId[]`,
    `deadWall: TileId[]`, `seats: [SeatState×4]`, `currentSeat`, `pendingDiscard`,
    `discardedBySeat`, `kongsTotal`, `isKongDraw`.
  - `SeatState`: `{ wind, hand: TileType[], openMelds: Meld[], discards: TileType[], score }`.
  - `GameEvent` union (replay-ready): `deal`, `jing_indicator`, `draw`, `discard`,
    `pung`, `kong_open`, `kong_concealed`, `kong_added`, `chow`, `win`, `draw_game`.

- **`apps/api` (NestJS + Fastify)** — auth (custom HS256 JWT, **not** runtime Cognito
  verify), users, invites, admin, friends, i18n, DynamoDB single-table, global
  `ThrottlerGuard` + `AllExceptionsFilter`. No WebSocket layer yet.
  - JWT: `apps/api/src/auth/strategies/jwt.strategy.ts` verifies with
    `config.get('jwt.secret')` (HS256). Payload: `{ sub, email, handle, displayName,
role, type? }`. **Reuse this exact secret + shape for socket auth.**
  - DynamoDB: `apps/api/src/database/dynamodb.service.ts` exposes `get/put/update/
delete/query/scan/transactWrite` + a `DK` key-builder helper object.
- **`apps/web` (React 18 + Vite + Zustand + TanStack Query + react-i18next)** —
  auth store (`stores/auth.store.ts`, persisted tokens), axios `lib/api.ts` (bearer
  inject + 401-refresh queue), route guards, i18n. No socket layer yet.
- **`packages/shared` (`@nanchang/shared`)** — currently only `auth.schemas.ts` (zod).
  **This is where the socket event contract + tile map will live.**
- **`docs/final-nanchang-mahjong-rules.md`** — the locked rules (read for turn flow,
  claim priority `Win > Kong/Pung > Chow`, dealer retention, draw/washout, scoring).

### 1.2 What Phase 6 MUST hand off (verify before starting 7)

Phase 7 builds directly on Phase 6 (Room/Lobby). Confirm these exist; if Phase 6
shipped them differently, adjust §4/§5 accordingly:

- A **Socket.IO server** wired into the Nest app (gateway + adapter + ws-jwt auth).
  - If Phase 6 only did room state over sockets, the **auth handshake middleware**,
    **ws throttling**, and **adapter setup** described in §5.2 may already exist —
    reuse them. If Phase 6 used REST-only for rooms, Phase 7 establishes the socket
    layer (so pull the §5.2 work into 7A).
- A **room** concept with: room id/code, host, **seat → userId mapping for 4 seats**,
  and a "start game" transition. Phase 7 consumes a _started_ room to create a game.
- DDB items `ROOM#<id>/META` and `ROOM#<id>/SEAT#<n>` (per `PLAN.md` §2.3).
- A client **Room screen** that, on host "Start", navigates to the Jing-reveal route
  with a `gameId` (or `roomId` from which the game is derived).

> **If Phase 6 did not create the Socket.IO foundation**, treat §5.2 ("Gateway &
> transport foundation") as the first chunk of 7A and budget extra time.

### 1.3 Key facts that shape the design

- Engine is **immutable + deterministic**: the server holds one `GameEngine` instance
  per active game in memory; each move replaces it. Snapshots/replays are trivial.
- API uses the **Fastify** adapter. NestJS Socket.IO (`@nestjs/platform-socket.io`)
  attaches Socket.IO to the underlying Node HTTP server — this coexists with Fastify.
  Use the standard `IoAdapter` (or a small subclass for the JWT handshake).
- Auth tokens are **app-issued HS256 JWTs** (shared secret), so a socket can be
  verified synchronously in the handshake with `@nestjs/jwt` `JwtService.verify`.
- `PLAN.md` §3.4: **never** store per-tick state in DynamoDB. Authoritative game state
  is in process memory; persist only on milestones (deal, score, end). In-progress
  games are lost if the single App Runner instance restarts — **accepted at MVP**.

---

## 2. Scope

### 2.1 In scope (maps to PLAN 7.1–7.8)

| PLAN | Deliverable                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------- |
| 7.1  | Jing-reveal screen wired to engine `revealJing()` output (real Primary+Secondary spirits).                                |
| 7.2  | Gameplay screen: hand, draw, **tap-to-select + Discard confirm** (locked), **side-rail call prompts** (locked), 8s timer. |
| 7.3  | Socket events: draw, discard, call (pung/kong/chow), pass, win, concede.                                                  |
| 7.4  | Server authoritative; client optimistic; server snapshot wins.                                                            |
| 7.5  | Reconnection: snapshot resend; "Reconnecting…" overlay if disconnect > 1.5s.                                              |
| 7.6  | AFK detection → auto-discard the **drawn tile** (locked default, §10).                                                    |
| 7.7  | Reduced-motion CSS for Jing reveal, pulses, shimmers.                                                                     |
| 7.8  | Spectator subscription (`spectate` flag); payload omits concealed hands.                                                  |
| 7.0  | **(new)** Engine extensions required for a full game (see §3).                                                            |

### 2.2 Explicitly OUT of scope (deferred to later phases)

- End-game screen content, stats, rating, history persistence → **Phase 8** (7 only
  fires the `game:ended` event + a minimal result; the rich screen is Phase 8).
- Replay storage to S3 / replay player → **Phase 9** (7 keeps the in-memory move log
  and persists a milestone snapshot; it does **not** build the replay UI).
- Theme/tile-pack switching on the table → **Phase 11** (7 uses default theme tokens).
- Push notifications → **Phase 12**.
- Bots / AFK auto-_play_ beyond auto-discard → post-MVP seam only.

---

## 3. Phase 7.0 — Engine extensions (do this first)

A full game from deal to win exercises engine paths Phase 5 stubbed. These are small,
pure, fully-unit-testable additions to `packages/engine`. **Land them before 7A.**

| #   | Gap (confirmed in code)                                                                                                                                                                                                | Required addition                                                                                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| E1  | `kong_added` event type exists and `addToKongOptions()` exists, but there is **no `addToKong()` engine method**.                                                                                                       | Add `addToKong(seatIdx, tile): GameEngine` — moves a tile from hand onto an existing open pung of `tile`, emits `kong_added`, draws replacement from dead wall (mirror `kongFromDiscard`'s tail-draw).                                                              |
| E2  | **Robbing a Kong (抢杠)** unsupported — `declareWin` hardcodes `isRobKong: false`. Rules §6.3: rob-kong is treated as self-draw; the konger pays for all.                                                              | Add an optional rob-kong path: when a player calls `addToKong`, open a short claim window for a `win` on that tile; if claimed, `declareWin(..., { robKong: true })`. Thread an options arg into `declareWin`.                                                      |
| E3  | **Dealer rotation & round wind** deferred — `declareWin` hardcodes `roundWind: 'east'`; no dealer tracking. Rules §2.2/§6.3: dealer retains on dealer-win or draw, else rotates CCW; dealer's win/loss is **doubled**. | Add `dealerSeat`/`roundWind` to `GameState` (default east/east). Pass real `seatWind`/`roundWind` to scoring. Apply dealer ×2 in `calculatePayment` (or a scoring modifier). Add a `nextDealer(prevState, winnerSeat                                                | null)` pure helper for the gateway to use when starting the next hand. |
| E4  | **Concede** has no engine representation.                                                                                                                                                                              | Add `concede(seatIdx): GameEngine` → marks the game `finished` with a `concede` event + applies the concede penalty per confirmed rule (design mock: −1000 base + streak break; **confirm real value** in §10). Emit a new `GameEvent` `{ kind: 'concede'; seat }`. |
| E5  | **Simultaneous-claim resolution** is not in the engine (by design — engine validates single moves).                                                                                                                    | Keep resolution in the **gateway** (§5.4) using the existing pure predicates `canWin`/`canPung`/`canKongFromDiscard`/`chowOptions`. No engine change, but add a tiny pure helper `claimantsFor(state, tile)` in the engine if convenient for testing.               |
| E6  | Scoring completeness: rules doc lists instant payouts (Kong 1/2 pts, Sacking the Dealer), Spirit payouts, Explosive/Indomitable Spirit, German/True German, Spirit Fishing. Phase 5 `scoring.ts` covers a subset.      | **Audit `scoring.ts` vs `final-nanchang-mahjong-rules.md` §6.** Anything missing that affects the _final score of a played game_ should be added here (with unit tests) so Phase 7's end-to-end game produces correct scores. Track richer breakdowns for Phase 8.  |

**Tests for 7.0** (extend `packages/engine/src/__tests__`):
`Engine·add-kong`, `Engine·rob-kong-scores-as-tsumo`, `Engine·dealer-doubles`,
`Engine·dealer-rotation`, `Engine·concede-penalty`, plus `Engine·scoring-*` for any
fan added under E6. Run via `cd packages/engine; npx vitest run` (Windows/PowerShell).

> **Note (Windows):** the Bash tool cannot `cd` into `D:\`. Use the PowerShell tool:
> `cd "D:\FamilyMahjongApp\packages\engine"; npx vitest run`.

---

## 4. Architecture

### 4.1 Authoritative model

```
        ┌─────────────────────────── apps/api (single instance) ──────────────────────────┐
        │  GameGateway (Socket.IO)                                                          │
        │     ├── ws-jwt handshake auth  (reuse jwt.secret)                                 │
        │     ├── per-event throttle (token bucket)                                         │
        │     └── delegates to ──► GameService (registry: Map<gameId, GameSession>)         │
        │                              └── GameSession                                       │
        │                                   ├── engine: GameEngine   (immutable, swapped)    │
        │                                   ├── seatMap: userId ↔ seatIdx(0..3)              │
        │                                   ├── spectators: Set<userId>                       │
        │                                   ├── conn: per-seat {connected, lastSeen, afk}    │
        │                                   ├── timers: turnTimer, claimWindow                │
        │                                   └── moveLog: GameEvent[]  (for milestone persist)│
        └───────────────────────────────────────────────────────────────────────────────────┘
                    ▲  socket events (zod-validated, @nanchang/shared)  ▼
        ┌───────────────────────────── apps/web (×4 players + N spectators) ──────────────────┐
        │  lib/socket.ts (singleton, auth, reconnect) → stores/game.store.ts (zustand)         │
        │     → pages/game/{jing-reveal,game}-page.tsx  → ported design components             │
        └───────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Locked architectural decisions

1. **Server is authoritative.** The engine instance on the server is the single source
   of truth. The client may apply _optimistic_ updates for its own discard only; every
   server `game:snapshot` **replaces** local state (server wins). Because we broadcast a
   fresh redacted snapshot after every applied move, reconciliation is "replace store" —
   no diff/patch logic, no desync class of bugs. (Granular `game:event` messages are
   sent **alongside** snapshots purely for animation/toast cues.)
2. **Redaction at the edge.** A pure `toClientSnapshot(state, viewer)` produces a
   per-viewer view: the viewer's own `hand` in full; **every other seat's `hand`
   replaced by a count** (`handCount: number`); the live `wall`/`deadWall` contents
   never sent (only `wallCount`). Spectators (`viewer = 'spectator'`) get **all** hands
   as counts. This single function enforces PLAN 7.4 + 7.8 and is unit-testable.
3. **In-memory authoritative, milestone persistence.** Per PLAN §3.4: no per-tick DDB
   writes. Persist `GAME#<id>/META` on create + on each scoring event + on end. The
   full `moveLog` is held in memory and written once on end (S3 in Phase 9). A server
   restart loses in-progress games — accepted at MVP, documented in DoD.
4. **Two timers, both server-owned** (client renders a mirror, server is truth):
   - **Turn timer** (active player's own move): default **8s** → on expiry, server
     auto-discards the **drawn tile** (locked, §10) and broadcasts.
   - **Claim window** (after a discard, for the other 3 seats): default **8s** →
     collect claims, resolve by priority, then proceed. Closes early once every
     eligible seat has responded (claim or pass).
5. **Reconnection = re-join.** Since snapshots are authoritative and idempotent, a
   reconnecting client simply re-emits `game:join {gameId}` and gets the current
   snapshot. No bespoke resume protocol/state-diff needed.
6. **Tile-ID adapter lives in `@nanchang/shared`** so server and client agree on the
   engine↔design mapping and the canonical a11y labels (§6.2).

---

## 5. Backend (PR 7A)

New module: `apps/api/src/game/`.

```
apps/api/src/game/
  game.module.ts
  game.gateway.ts            # @WebSocketGateway — thin: validate, authorize, delegate
  game.service.ts            # registry Map<gameId, GameSession>; lifecycle; persistence
  game-session.ts            # per-game wrapper: engine + seatMap + timers + conn state
  snapshot.ts                # toClientSnapshot(state, viewer) — redaction (pure)
  claim-resolver.ts          # collect + prioritize simultaneous claims (pure-ish)
  ws-auth.middleware.ts      # Socket.IO handshake JWT verify (reuse jwt.secret)
  ws-throttle.ts             # per-socket per-event token bucket
  game.gateway.spec.ts       # socket.io-client integration tests
  snapshot.spec.ts           # redaction unit tests
  claim-resolver.spec.ts     # priority resolution unit tests
  dto/                       # (re-exports shared zod schemas; thin validation pipes)
```

### 5.1 Dependencies to add (`apps/api`)

`@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`.
(Engine + shared already in the workspace: import `@nanchang/engine`, `@nanchang/shared`.)

### 5.2 Gateway & transport foundation

- **Adapter:** register the Socket.IO adapter in `main.ts`
  (`app.useWebSocketAdapter(new AuthIoAdapter(app))`). `AuthIoAdapter extends IoAdapter`
  overrides `createIOServer` to (a) set CORS to the web origin, (b) install the
  **handshake auth middleware**.
- **Handshake auth (`ws-auth.middleware.ts`):** `io.use((socket, next) => …)` reads
  `socket.handshake.auth.token` (client sends the access token here), verifies it with
  `JwtService.verify(token, { secret: jwt.secret })`, rejects (`next(new Error(...))`)
  on failure, and attaches `socket.data.user = { sub, handle, displayName, role }`.
  Mirror `JwtStrategy.validate` (including the **disabled-account** check via
  `UsersService.findBySub`). No token → connection refused (test `Gameplay·ws-auth`).
- **Namespace/rooms:** use a single namespace; one Socket.IO **room per gameId**
  (`socket.join(gameId)`); spectators join the same room but are tracked separately so
  redaction differs. Broadcast snapshots with `server.to(gameId).emit(...)` — but note
  each viewer needs a **different** redaction, so emit per-socket (iterate the room's
  sockets) rather than a single room broadcast for `game:snapshot`. Granular
  `game:event` (already redacted to public info) can be a room broadcast.
- **Throttle (`ws-throttle.ts`):** per-socket token bucket keyed by event name. Limits
  (initial): `game:discard` 2/sec, `game:claim` 4/sec, `game:join` 3/10s. On breach,
  emit `game:error { code: 'TOO_FAST' }` and drop. (Test `Gameplay·rate-limit-events`.)

### 5.3 GameSession lifecycle

- **Create:** `GameService.createGame(roomId)` reads the started room's seat→user map,
  picks a seed (crypto-random; store it for replay determinism), constructs
  `GameEngine.create(seed).deal()`, builds the `GameSession`, persists `GAME#<id>/META`
  `{ status:'active', seed, roomId, seatMap, dealerSeat, startedAt }`. Returns `gameId`.
  (Who calls this? The Phase 6 "Start" handler, or a `game:start` from the host —
  confirm the seam with Phase 6.)
- **Jing reveal:** the session is in engine phase `jing_reveal` after `deal()`. On the
  first `game:join` from all seats (or a host `game:reveal-jing`), call
  `engine.revealJing()` and broadcast. The FE plays the cinematic over the resulting
  Primary/Secondary spirit (no fake `b3`).
- **Turn loop:**
  1. Active seat receives `game:your-turn { deadline }`; turn timer armed (8s).
  2. Active seat `game:discard {tile}` (or auto-discard on timeout) → `engine.discard`.
  3. Open **claim window**: compute eligibility for the other 3 seats with the pure
     predicates; emit `game:claim-window { actions, deadline }` **only** to seats with
     ≥1 action. Arm claim timer (8s).
  4. Collect `game:claim`/`game:pass`. Resolve (§5.4). Apply the winning claim to the
     engine (`pung`/`kongFromDiscard`/`chow`/`declareWin`) or, if none, `passClaims()`
     (engine draws for next seat). Broadcast snapshot + event.
  5. Repeat until `engine.isFinished` (win or `draw_game`).
- **On-turn melds:** `game:kong-concealed {tile}` and `game:kong-add {tile}` are valid
  only for the current seat in `playing` phase; `kong-add` triggers the rob-kong window
  (E2). Each kong draws a replacement (engine already does this).
- **End:** on `win`/`draw_game`/`concede`, persist final `GAME#<id>/META`
  `{ status:'finished', result, scores }`, write the move log (in-memory now; S3 in P9),
  emit `game:ended`, then schedule session teardown (keep briefly for late snapshot
  requests / rematch hook in Phase 8).

### 5.4 Simultaneous-claim resolution (`claim-resolver.ts`)

- Priority (rules §4.2, PLAN 7.x): **Win > Kong/Pung > Chow**. Multiple winners
  possible (multi-ron) — confirm policy in §10; default: all valid winners score
  (head-bump alternative is a decision).
- Collect claims until the claim window closes or all eligible seats respond.
- Resolve highest priority; if a lower-priority claim loses to a higher one, send the
  losers a `game:contested { type }` so the FE shows the **600ms "two players called
  Pung" toast** (design §10) before the resolution snapshot.
- Validate every claim against the engine predicate again at apply-time (never trust
  the client). Illegal/late claim → `game:error`.
- Unit-test the resolver in isolation with synthetic claim sets (`claim-resolver.spec.ts`).

### 5.5 Connection / AFK / reconnection

- Track per-seat `{ connected, lastSeenAt, afk }`. On `disconnect`:
  - Start a **grace timer**. Emit `game:player-connection { seat, status:'reconnecting' }`
    to the room (FE shows `ReconnectingOverlay` only if the drop is the **viewer's own**
    and lasts > 1.5s; for _others_, show the AFK dot / `PlayerLeftOverlay` per design).
  - If the disconnected seat is the **active** player, the turn timer still runs →
    auto-discards the drawn tile on expiry (game never stalls).
  - **30s** seat-hold (design copy): still reconnectable; seat marked AFK so its turns
    auto-discard. **~45s+** continued absence (design `PlayerLeftOverlay`): offer
    remaining players "End match as washout" (confirm exact thresholds in §10).
- On reconnect: `game:join {gameId}` → verify the user is a seat/spectator of that game
  → send current redacted snapshot → `game:player-connection { seat, status:'connected' }`.

### 5.6 Persistence (DDB single-table, extends `DK` helper)

Add to `apps/api/src/database/dynamodb.service.ts` `DK`:

```ts
game:        (id: string)            => ({ PK: `GAME#${id}`, SK: 'META' }),
gameMove:    (id: string, n: number) => ({ PK: `GAME#${id}`, SK: `MOVE#${String(n).padStart(4,'0')}` }),
userGameIdx: (sub: string, ts: string, id: string) => ({ PK: `USER#${sub}`, SK: `GAME#${ts}#${id}` }),
```

Phase 7 writes `GAME#<id>/META` (create + milestones + end) and the `USER#…/GAME#…`
history index on end (so Phase 8 History has data). Move items vs. one S3 blob is a
**Phase 9** decision — Phase 7 keeps the move log in memory and may write the per-user
index + final meta only.

---

## 6. Shared contracts (`packages/shared`) — part of 7A

### 6.1 Socket event protocol (`packages/shared/src/game.events.ts`)

Define **zod schemas + inferred TS types** for every event, so FE and BE share one
contract (and the gateway validates inbound payloads with the same schema).

**Client → Server**
| Event | Payload | Notes |
|---|---|---|
| `game:join` | `{ gameId: string; spectate?: boolean }` | ack → snapshot |
| `game:discard` | `{ tile: TileType; fromDrawn?: boolean }` | current seat only; `fromDrawn` is an animation hint |
| `game:claim` | `{ kind: 'win'\|'pung'\|'kong'\|'chow'; sequence?: [TileType,TileType,TileType] }` | during claim window |
| `game:pass` | `{}` | decline current claim window |
| `game:kong-concealed` | `{ tile: TileType }` | current seat, `playing` |
| `game:kong-add` | `{ tile: TileType }` | current seat, `playing` (→ rob-kong window) |
| `game:concede` | `{}` | any seat |

**Server → Client**
| Event | Payload | Purpose |
|---|---|---|
| `game:snapshot` | `{ state: ClientGameState }` | authoritative, per-viewer redacted; sent after every applied move + on join |
| `game:event` | `{ event: PublicGameEvent }` | animation/toast cue (redacted) |
| `game:your-turn` | `{ deadline: number }` | arm turn timer UI |
| `game:claim-window` | `{ actions: ClaimAction[]; deadline: number }` | which side-rail buttons + 8s ring |
| `game:contested` | `{ kind: 'pung'\|'kong'\|'chow'\|'win' }` | 600ms loser toast |
| `game:player-connection` | `{ seat: 0\|1\|2\|3; status: 'connected'\|'reconnecting'\|'left' }` | overlays / AFK dot |
| `game:ended` | `{ result: 'win'\|'draw'\|'concede'; winnerSeat?: 0\|1\|2\|3; scores: number[]; fan?: FanResult }` | End screen (Phase 8 enriches) |
| `game:error` | `{ code: string; message: string }` | illegal move / too fast / not your turn |

`ClientGameState` (redacted view) — define explicitly in shared:

```ts
{
  gameId: string;
  phase: GamePhase;
  jingIndicator: TileType | null;
  jingPrimary: TileType | null;
  jingSecondary: TileType | null;
  currentSeat: 0 | 1 | 2 | 3;
  dealerSeat: 0 | 1 | 2 | 3;
  roundWind: SeatWind;
  wallCount: number;
  deadWallCount: number;
  pendingDiscard: TileType | null;
  discardedBySeat: 0 | 1 | 2 | 3 | null;
  viewerSeat: 0 | 1 | 2 | 3 | null; // null = spectator
  seats: Array<{
    wind: SeatWind;
    score: number;
    connected: boolean;
    afk: boolean;
    openMelds: Meld[];
    discards: TileType[];
    hand: TileType[] | null; // full for viewer's own seat; null otherwise
    handCount: number; // always present
  }>;
}
```

Use the engine's exported types (`TileType`, `Meld`, `GamePhase`, `SeatWind`,
`FanResult`) so the contract stays in lockstep with the rules core. Re-export from
`packages/shared/src/index.ts`.

### 6.2 Tile-ID + a11y map (`packages/shared/src/tile-map.ts`)

The design components use **different tile IDs** than the engine. One adapter, shared:

| Engine `TileType`       | Design id     | Canonical aria-label (EN / ZH)                 |
| ----------------------- | ------------- | ---------------------------------------------- |
| `1m`…`9m` (man/萬)      | `c1`…`c9`     | "{n} Character" / "{n}萬"                      |
| `1p`…`9p` (pin/筒)      | `d1`…`d9`     | "{n} Dot" / "{n}筒"                            |
| `1s`…`9s` (sou/條)      | `b1`…`b9`     | "{n} Bamboo" / "{n}條"                         |
| `east/south/west/north` | `we/ws/ww/wn` | "East/South/West/North Wind" / "東/南/西/北風" |
| `zhong/fa/bai`          | `dr/dg/dw`    | "Red/Green/White Dragon" / "紅中/發財/白板"    |

```ts
export function engineToDesignTile(t: TileType): string {
  /* … */
}
export function designToEngineTile(id: string): TileType {
  /* … */
}
export function tileAriaLabel(t: TileType, lang: 'en' | 'zh'): string {
  /* … */
}
```

The FE `MahjongTile` wrapper takes an engine `TileType`, maps to the design id for
rendering, and always sets `aria-label` from `tileAriaLabel` (Handoff §08 requirement).

---

## 7. Frontend (PR 7B)

```
apps/web/src/
  lib/socket.ts                       # Socket.IO client singleton (auth + reconnect)
  stores/game.store.ts                # zustand: snapshot, timers, local optimistic state
  hooks/use-game.ts                   # subscribe to socket, expose actions + selectors
  pages/game/
    jing-reveal-page.tsx              # ports project/wildcard.jsx, real spirits
    game-page.tsx                     # ports project/game.jsx, wired to store
    components/
      mahjong-tile.tsx                # ports project/tile.jsx (engine TileType + aria)
      nameplate.tsx  discard-pool.tsx  side-rail.tsx  player-hand.tsx
      game-status-bar.tsx  center-area.tsx  pause-menu.tsx
      reconnecting-overlay.tsx  player-left-overlay.tsx  concede-sheet.tsx  afk-badge.tsx
  i18n/ (add game namespace keys EN+ZH)
```

### 7.1 Socket client (`lib/socket.ts`)

- `socket.io-client` singleton. Connect with
  `io(BASE, { auth: { token: useAuthStore.getState().accessToken }, autoConnect:false })`.
- On `accessToken` change (refresh) update `socket.auth` and reconnect if needed.
- Built-in reconnection (exponential backoff). On `reconnect`, the store re-emits
  `game:join {gameId}` to resync. Expose typed `emit`/`on` helpers bound to the shared
  event types.
- **Disconnect → overlay timing (PLAN 7.5):** start a 1.5s timer on `disconnect`; if
  still down, set `store.connection='reconnecting'` (shows `ReconnectingOverlay`). Clear
  on reconnect+snapshot.

### 7.2 Game store (`stores/game.store.ts`, zustand)

- State: `snapshot: ClientGameState | null`, `selectedTileIdx`, `claimWindow`,
  `turnDeadline`, `connection: 'live'|'reconnecting'|'lost'`, `toast`.
- `game:snapshot` handler → **replace** `snapshot` wholesale (server wins; clears any
  optimistic flag). This is the reconciliation point.
- **Optimistic discard:** on local discard, immediately remove the tile from the
  rendered hand and disable the rail; mark `pendingMove`. The next snapshot confirms
  (or, on `game:error`, the snapshot restores the tile and a toast explains).
- Selectors map `viewerSeat` → compass positions (bottom = viewer; right/top/left =
  next seats CCW) for the existing design layout.

### 7.3 Screen wiring

- **Jing reveal (`jing-reveal-page.tsx`):** port `project/wildcard.jsx`. Replace the
  mock `jingTile='b3'`/`bonusTile='b4'` with `engineToDesignTile(snapshot.jingPrimary)`
  and `…(jingSecondary)`. Keep the cinematic; gate behind reduced-motion (§7.5). On
  "Begin round" (or auto after animation), route to `game-page`.
- **Gameplay (`game-page.tsx`):** port `project/game.jsx`. Replace all `useState` mock
  game state with store selectors. Wire:
  - `PlayerHand` tiles ← viewer seat's `hand`; `drawnTile` ← last drawn (from snapshot/
    event); `onDiscard(idx)` → `emit('game:discard', { tile })`.
  - `SideRail` `actions`/`ctx` ← `claimWindow`; `onAction` → `emit('game:claim'|'game:pass')`;
    the ring counts down to `claimWindow.deadline` (server-authoritative).
  - `GameStatusBar` `wallLeft` ← `wallCount`; `jingTile` ← `engineToDesignTile(jingPrimary)`;
    `round` ← `roundWind`+dealer.
  - Opponent hands render as `handCount` face-down tiles.
  - `PauseMenu` → `onConcede` → `ConcedeSheet` → `emit('game:concede')`.
  - Overlays driven by `connection` + `game:player-connection`, not Tweaks.
- **Spectator:** route `?spectate=1` → `emit('game:join',{gameId,spectate:true})`; store
  hides the rail/hand controls; all hands render as counts.

### 7.4 Optimistic vs authoritative (PLAN 7.4)

Only the viewer's own **discard** is optimistic (immediate local removal). Everything
else (draws, others' moves, calls, scoring) renders **only** from server snapshots.
This keeps perceived latency low on the one action the player initiates, with zero
desync risk because the next snapshot is authoritative.

### 7.5 Accessibility & reduced motion (Handoff §08; PLAN 7.7 + 3.5)

- Every `MahjongTile` → `aria-label` from `tileAriaLabel` (never glyph-only).
- Wrap **Jing reveal**, **last-discard pulse**, **skeleton shimmer** in
  `@media (prefers-reduced-motion: reduce)` → static states. **Keep** the tile-discard
  animation (it conveys info).
- Tab order: Menu → status bar → opponent nameplates (CW from top) → hand (L→R) →
  drawn tile → call rail → Discard. Visible 2px gold focus ring on every interactive.
- **Polite ARIA live region** for the auto-discard timer: when the 8s timer crosses
  **3s**, announce "3 seconds left to discard" (EN/ZH). Do **not** fire under 3s.
- `<html lang>` already handled by Phase 2 i18n; ensure game strings are keyed (no
  literals — the `no-literal-string` lint rule applies).

### 7.6 i18n

Add a `game` namespace to `en.json`/`zh.json` with every visible string (actions
pung/kong/chow/win/pass, "Drawn", "Discard", "Tap below", round/wall/jing labels,
overlay copy, concede sheet, timer announcement). CI key-parity check (Phase 2) must
pass.

---

## 8. Decisions to confirm with the user (BEFORE coding) — Handoff §10 + new

These are still open (the rules open-questions in `docs/answers-to-open-questions.md`
were answered; the **UX/runtime** ones below were not). Proposed defaults in **bold**.

1. **Auto-discard target on turn timeout:** **the drawn tile** (design default; matches
   most clients). Alt: rightmost in hand.
2. **Claim window length:** **8s** (matches the design SideRail ring). Confirm it should
   also be the active-player turn-timer length, or whether the turn timer is longer.
3. **Multi-winner ron:** **all valid winners score** vs. head-bump (only the next seat
   CCW from discarder). Affects `claim-resolver`.
4. **Seat-hold / washout thresholds:** **1.5s** → Reconnecting overlay; **30s** → AFK
   auto-discard; **45s** → offer washout to remaining players (design copy uses 30s and
   45s in different overlays — confirm the exact ladder).
5. **Concede penalty:** design mock shows **−1000 base + streak break**. Confirm the
   real value/formula for the engine `concede()` (E4) — likely expressed in the rules'
   point system (base 1 × multipliers), not a flat 1000.
6. **Who starts the game / triggers Jing reveal:** host action vs. auto when all 4
   seated+connected. (Couples to the Phase 6 seam.)
7. **Spectator eligibility:** anyone with the link, or family/friends-only (mirror the
   Phase 9 replay decision). Affects `game:join` authorization.

---

## 9. Data model additions (summary)

- `GAME#<id> / META` — `{ status, seed, roomId, seatMap, dealerSeat, roundWind,
startedAt, endedAt?, result?, scores? }` (TTL optional while active).
- `USER#<sub> / GAME#<ts>#<id>` — per-user history index (written on end; feeds Phase 8).
- Move log: in memory during play; persisted as one blob in **Phase 9** (S3) — Phase 7
  must keep it intact and ordered so Phase 9 can serialize it.

---

## 10. Testing strategy (feature-keyed, per PLAN)

Run engine tests with vitest (PowerShell, see §3). API socket tests with Jest +
`socket.io-client`. FE with Vitest + RTL.

**PLAN-listed (must exist & pass):**

- `Gameplay·discard-flow` — tap → confirm → tile leaves hand → other clients' snapshots
  show it in the discard pool.
- `Gameplay·call-priority` — **integration of the engine over the wire**: stage a
  discard claimable as both Pung and Chow; assert Pung wins and Chow seat gets
  `game:contested`.
- `Gameplay·timeout-auto-discard` — no action before turn deadline → drawn tile
  auto-discarded; snapshot reflects it.
- `Gameplay·reconnect` — socket drops mid-game, re-`game:join` → receives a correct,
  fully-redacted snapshot matching server truth.
- `Gameplay·spectator-cannot-see-concealed` — spectator (and opponent) snapshot has
  `hand === null` + `handCount` for non-self seats; assert no `TileType[]` leaks.
- `Gameplay·rate-limit-events` — spamming `game:discard` past the bucket → `game:error
{ code:'TOO_FAST' }`.
- `Engine·*` — update/extend per §3 (7.0) and any rule reconciliation under E6.

**Added in this plan:**

- `Gameplay·ws-auth` — connect with no/invalid token → refused; valid → connected.
- `snapshot.spec` (`Gameplay·snapshot-redaction`) — unit: own hand full, others null,
  wall hidden, spectator all-null.
- `claim-resolver.spec` — unit: Win>Kong/Pung>Chow; contested losers reported.
- `Gameplay·illegal-move-rejected` — discard not-your-turn / tile-not-held → `game:error`,
  state unchanged.
- `Gameplay·claim-window-expiry` — no claims before deadline → engine `passClaims`,
  next seat draws.
- `Gameplay·concede` — concede → `game:ended { result:'concede' }`, penalty applied.
- Engine 7.0: `Engine·add-kong`, `Engine·rob-kong-scores-as-tsumo`,
  `Engine·dealer-doubles`, `Engine·dealer-rotation`, `Engine·concede-penalty`.

---

## 11. Task breakdown (ordered)

### 7.0 — Engine extensions (own commit/PR, before 7A)

1. `addToKong()` + `kong_added` wiring + replacement draw. Tests.
2. Rob-kong path: `declareWin(seat, { robKong })` + scoring `isRobKong`. Tests.
3. `dealerSeat`/`roundWind` in `GameState`; real winds into scoring; dealer ×2;
   `nextDealer()` helper. Tests.
4. `concede()` + `GameEvent` `concede` + penalty. Tests.
5. Audit `scoring.ts` vs rules §6; add missing fan/payouts that affect final scores. Tests.
6. Bump engine version; export any new helpers from `index.ts`.

### 7A — Backend

7. Add deps; `AuthIoAdapter` + handshake JWT middleware in `main.ts`. Test `ws-auth`.
8. `@nanchang/shared` `game.events.ts` (zod) + `tile-map.ts` + index re-exports.
9. `snapshot.ts` (redaction) + unit tests.
10. `claim-resolver.ts` + unit tests.
11. `game-session.ts` (engine wrapper, seat map, timers, conn state).
12. `game.service.ts` (registry, create/lookup/teardown, milestone persistence; `DK`
    additions).
13. `game.gateway.ts` (validate via shared zod, authorize, delegate; per-event throttle).
14. Turn loop + claim window + rob-kong window + AFK/auto-discard + reconnection.
15. `game:ended` + persist final meta + per-user history index.
16. Gateway integration tests (discard-flow, call-priority, timeout, reconnect,
    spectator, rate-limit, illegal-move, claim-expiry, concede). Green lint/typecheck.

### 7B — Frontend

17. `lib/socket.ts` singleton (auth, reconnect, typed emit/on; 1.5s overlay timer).
18. `stores/game.store.ts` + `hooks/use-game.ts` (snapshot replace, optimistic discard).
19. `components/mahjong-tile.tsx` (engine TileType + aria-label via shared map).
20. Port `nameplate`, `discard-pool`, `side-rail`, `player-hand`, `game-status-bar`,
    `center-area`, `pause-menu`, overlays, `afk-badge`.
21. `jing-reveal-page.tsx` wired to real spirits + reduced-motion.
22. `game-page.tsx` fully wired (discard, calls, melds, kong, concede, spectator).
23. Reduced-motion + a11y pass (aria-labels, focus order, polite live region at 3s).
24. `game` i18n namespace EN+ZH; key-parity passes; no-literal lint passes.
25. FE tests (discard-flow render, optimistic+reconcile, spectator hides hands,
    reconnect overlay). Green lint/typecheck.

---

## 12. Definition of Done (Phase 7)

Per `PLAN.md` §7:

- [ ] All 4 seats can play deal → Jing reveal → full hand → win/draw across 4 browser tabs.
- [ ] One tab disconnects mid-game and reconnects to a correct snapshot (no desync).
- [ ] Server is authoritative: a forged/illegal client move is rejected; snapshot wins.
- [ ] Spectator and opponents never receive concealed hands (redaction test green).
- [ ] Turn timeout auto-discards the drawn tile; claim window resolves by Win>Pung/Kong>Chow.
- [ ] All Phase 7 feature-keyed tests (PLAN + §10 additions) green; engine tests green
      after 7.0; lint + typecheck + key-parity all pass.
- [ ] EN and ZH correct on Jing-reveal + Gameplay; a11y items (aria tiles, focus order,
      reduced motion, polite live region) checked off.
- [ ] Docker dev stack still boots from a fresh `pnpm install`.
- [ ] §8 decisions confirmed and reflected in code/config.

---

## 13. Phase-7-specific risks

| #     | Risk                                                                    | Mitigation                                                                                                                         |
| ----- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| P7-R1 | Phase 6 didn't deliver the Socket.IO foundation/seat map → 7A balloons. | Verify §1.2 first; if missing, fold §5.2 into 7A and re-estimate.                                                                  |
| P7-R2 | Scoring gaps (rules §6) surface only when a full game scores.           | Front-load the E6 audit in 7.0 with unit tests before wiring the gateway.                                                          |
| P7-R3 | Per-viewer snapshot redaction tempts a single room broadcast (leak).    | Emit `game:snapshot` per-socket; `snapshot.spec` asserts no foreign `hand` leaks.                                                  |
| P7-R4 | Reconnection races (claim window open when a seat drops).               | Server-owned timers continue regardless of connection; auto-discard/auto-pass keep the loop alive; reconnection only resyncs view. |
| P7-R5 | Fastify + Socket.IO adapter friction.                                   | Use the standard `IoAdapter`; Socket.IO attaches to the underlying HTTP server. Smoke-test the handshake early (task 7).           |
| P7-R6 | Optimistic discard diverging from server.                               | Optimism limited to own discard; every snapshot is a full replace — divergence self-heals on the next message.                     |
| P7-R7 | Single-instance in-memory state lost on restart.                        | Accepted at MVP (PLAN §3.4); document it; milestone persistence lets Phase 8 still record finished games.                          |

```

```
