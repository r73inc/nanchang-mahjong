# AI Replay Commentary — Plan & Roadmap

> **Status:** Draft for review. No implementation has started. This document is the
> single source of truth for the AI Replay Commentary feature. It is phased so each
> phase maps to one focused, independently reviewable PR.
>
> **Decisions:** all questions (Q-1…Q-13) resolved (2026-06-21) and folded into the plan
> below — see §7. Ready to implement from Phase 1.
>
> **Branching reminder:** every phase branches off `pre-prod` and is merged via PR
> into `pre-prod`. One PR at a time. Never target `main`.

---

## 1. Feature Summary

Add AI-generated, human-readable commentary to game replays using **Google Gemini**.

Two flavours of output:

1. **Normal match overview** — a "highlight reel" of a single finished game. Big plays,
   where a player blundered, lucky/unlucky tiles, general commentary. **3–12 sentences**
   (shorter for short games, longer for long ones). Tone: a lively mahjong **match
   reporter / commentator / play-breakdown reviewer** — readable, with a little
   personality, not a monotone stat dump.

2. **Challenge commentary** — for a completed Point Challenge (every participant plays
   the _same seeded deals_ solo vs bots), two parts:
   - **Challenge overview** — a lively after-action report telling the narrative of the
     whole challenge. Focuses on **where each player's games diverged hand-by-hand**
     (same deals, different decisions), who took a risk that paid off, who chased a
     non-standard hand and made it, whose plan fell apart, who got unlucky — painting
     the picture of _why the final scores ended up so far apart_. Length: open-ended but
     bounded by a **configurable word cap (default 400 words)**.
   - **Per-player breakdown** — for each participant, an individual game overview
     identical in spirit to the normal match overview.

**Languages:** every summary (normal overview, challenge overview, per-player breakdown)
is generated and stored in **both English and Chinese**. The viewer renders whichever
matches the user's current app language. See §4.3 (storage) and §4.4 (prompt).

**Model:** a single Gemini model — **Flash** — is used for _all_ generation (overviews
and challenge narrative alike). This may change later, but for now one model serves
everything (§4.4).

### Where the output appears

| Surface                                                | What shows                                                                                                                                                  | Availability         |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **Replay viewer** (`/replay/:id`)                      | Collapsible panel (collapsed by default) at the very top with the match overview. If no summary yet → a **"Request AI summary of this match"** button.      | All games            |
| **Challenge replay viewer** (`/challenges/:id/replay`) | Same collapsible panel; the per-player breakdown **switches with the selected participant**.                                                                | Completed challenges |
| **Challenge detail page** (`/challenges/:id`)          | The **challenge overview** is shown once the challenge is complete. For legacy/pre-existing challenges with no summary → a **"Request AI summary"** button. | Completed challenges |
| **Admin: AI request queue** (new screen)               | Pending user requests; approve/reject.                                                                                                                      | `admin-ai-features`  |
| **Admin: AI failed jobs** (new screen)                 | Failed generation jobs with surfaced error reason/code/logs; retry.                                                                                         | `admin-ai-features`  |

> **Permission gate (see §4.5):** all AI-feature admin surfaces and the
> auto-approve/retry powers require the new **`admin-ai-features`** permission — a
> grant _separate_ from the `admin` role. An account can be an `admin` and still be
> unable to touch any of this unless it also holds `admin-ai-features`.

### Generation triggers

- **Challenges (automatic):** when a challenge completes, the system **automatically**
  generates the challenge overview **and** a per-player game overview for every attached
  game. No approval needed.
- **Normal matches (on request):** never automatic. The replay viewer shows a request
  button to anyone allowed to view that replay.
  - **Requester lacks `admin-ai-features`** (any normal user, _and_ a plain `admin`) →
    request goes into the **approval queue**.
    - **Approved** (by an `admin-ai-features` holder) → game is sent to Gemini, result
      stored, panel updates.
    - **Rejected** → the request button is re-enabled in the replay viewer.
  - **Requester holds `admin-ai-features`** → treated as auto-approved; sent immediately.
- **Re-requests / recovery:** the same request + approval mechanism covers
  re-generating after a failure, and backfilling games/challenges that predate this
  feature. Retrying a **failed** job requires `admin-ai-features`.

---

## 2. Terminology: is this a "sidecar"?

**No — what's described is not a sidecar.** A _sidecar_ is a helper process/container
that runs **alongside the main app in the same host/pod/task**, sharing its lifecycle
and network namespace (e.g. a logging or proxy container in the same ECS task).

What we need is a **separate, independently-deployed service in a different AWS region
(us-east-1)** that the Hong Kong app calls over the network to reach Gemini. The correct
terms are:

- **Egress proxy / forward proxy** — its job is to forward outbound requests from a
  blocked region to an allowed one.
- **Relay** or **broker** — a thin pass-through that brokers requests to a third-party
  API.
- **(Regional) API gateway / facade** — if it also reshapes the request/response.

Throughout this document we call it the **Gemini Relay** (a regional egress relay).

**Why it's needed:** the app is deployed in **ap-east-1 (Hong Kong)**, and Gemini rejects
requests originating from Hong Kong by default. The relay lives in **us-east-1**, accepts
a request from the HK app, calls Gemini from an allowed region, and returns the result.

---

## 3. Current-State Findings (what exists today)

Researched from the codebase so the plan slots into existing patterns.

### Replays

- Stored as a single JSON blob in S3: `replays/${gameId}.json` via
  [`StorageService.putReplay`](apps/api/src/storage/storage.service.ts:106). Read via
  `getReplay`.
- Written at game end inside
  [`GameService.endSession`](apps/api/src/game/game.service.ts:2109) — builds a
  `ReplayGamePayload` and calls `putReplay`.
- Served by [`GET /replays/:id`](apps/api/src/replay/replay.controller.ts:15) →
  [`ReplayService.getReplayForViewer`](apps/api/src/replay/replay.service.ts:25), access
  gated to players or accepted friends of a player.
- Payload shape: [`ReplayGamePayload`](packages/shared/src/replay.types.ts:21) —
  `gameId`, `seatMap`, `seatNames`, `settings`, `hands[]` (each with `seed`,
  `startingScores`, `dealerSeat`, `roundWind`, full `events[]`), `startedAt`, `endedAt`,
  `finalScores`, `placement`, `result`.
- Frontend: [`ReplayPage`](apps/web/src/pages/replay/replay-page.tsx) has a "summary
  header" card at the top — the natural anchor for the new collapsible panel.
- Replay timelines are rebuilt client-side from events via `buildOmniscientTimeline`
  (`apps/web/src/lib/replay-engine.ts`) and on the server via `replayHand()` from
  `@nanchang/engine`.

### Challenges

- Record: `CHALLENGE#<id>/META` with a `participants` map; each participant has
  `gameId`, `finalScore`, `status`. Lifecycle:
  `awaiting_creator → open → completed | cancelled`. See
  [`ChallengesService`](apps/api/src/challenges/challenges.service.ts).
- **Completion hook points:** a challenge becomes `completed` (and `winners` are set)
  inside [`recordParticipantResult`](apps/api/src/challenges/challenges.service.ts:322)
  and [`declineChallenge`](apps/api/src/challenges/challenges.service.ts:523) when
  `allDone` is true. **This is where auto-generation is triggered.**
- Each participant plays the _same_ pre-derived hand seeds (`handSeeds`) → games are
  directly comparable hand-by-hand by index. This alignment is the backbone of the
  divergence narrative.
- Challenge replay: [`ChallengeReplayPage`](apps/web/src/pages/replay/challenge-replay-page.tsx)
  - [`useChallengeReplay`](apps/web/src/hooks/use-replay.ts:49) load every participant's
    replay payload and let the user switch participants — switching `viewedSub` is exactly
    where the per-player breakdown must swap.

### Admin

- Backend: [`AdminController`](apps/api/src/admin/admin.controller.ts) (`/admin/*`,
  guarded by `@Roles('admin')`), [`AdminService`](apps/api/src/admin/admin.service.ts)
  with an **audit-log** helper (`writeAudit`).
- Existing **status-GSI pattern** to copy: invites use `gsi1pk = INVITE_STATUS#<status>`
  ([`DK.invitesByStatus`](apps/api/src/database/dynamodb.service.ts:86)) to list by
  status — the AI request queue will use the same pattern.
- Frontend: [`AdminPage`](apps/web/src/pages/admin/admin-page.tsx) is a single page with
  stacked sections + `AdminRoute` guard. New admin screens slot in as sections/tabs.

### Roles & permissions (today)

- Authorization is **role-only**: `UserRole = 'user' | 'admin'`
  ([`authenticated-user.interface.ts`](apps/api/src/common/interfaces/authenticated-user.interface.ts:1)).
- The role is **baked into the JWT** and re-derived client-side in
  [`auth.store.ts`](apps/web/src/stores/auth.store.ts:29) (`parseUser`).
- Server enforcement is `@Roles('admin')` + [`RolesGuard`](apps/api/src/common/guards/roles.guard.ts),
  which simply checks `requiredRoles.includes(request.user.role)`.
- [`JwtStrategy.validate`](apps/api/src/auth/strategies/jwt.strategy.ts:29) already does a
  **fresh `users.findBySub`** on every request (for the `disabled` check) — so an
  authoritative per-request permission lookup is cheap to add without re-issuing tokens.
- There is **no granular-permission concept yet** — `admin-ai-features` introduces the
  first one. See §4.5.

### Data layer

- DynamoDB single-table; key helpers centralised in
  [`DK`](apps/api/src/database/dynamodb.service.ts:82). Game META stores `seatMap`,
  `status`, and `challengeId` — so a replay/game already knows whether it belongs to a
  challenge.
- Auth user carries `role: 'user' | 'admin'` (`apps/web/src/stores/auth.store.ts`) — the
  frontend can branch request-button behaviour on role; the server re-checks
  authoritatively.

### Infra

- CDK in [`infra/aws`](infra/aws/lib/nanchang-stack.ts), single `NanchangStack` in
  **ap-east-1**. ECS Fargate (task role + execution role), DynamoDB, S3, CloudFront,
  **Secrets Manager** (JWT + VAPID secrets injected into the container). `main` pushes
  auto-deploy to prod.
- Config via env in [`configuration.ts`](apps/api/src/config/configuration.ts) +
  `.env.example`. Adding a relay URL + region follows the existing pattern.

### i18n

- EN + ZH must stay in parity; no literal strings in JSX (all via `t()`). New tiles must
  use `MahjongTile2D` (not the legacy text-glyph tile).

---

## 4. Architecture

### 4.1 The Gemini Relay (us-east-1)

**Recommended build: AWS Lambda + Lambda Function URL with `AWS_IAM` auth.**

```
┌─────────────────────────── ap-east-1 (Hong Kong) ───────────────────────────┐
│  ECS Fargate (NestJS API)                                                    │
│    AiSummaryService ──► GeminiRelayClient ──(HTTPS + SigV4 signed)──┐        │
└────────────────────────────────────────────────────────────────────┼────────┘
                                                                       │
                                  cross-region invoke (same AWS acct)  │
                                                                       ▼
┌─────────────────────────── us-east-1 (N. Virginia) ─────────────────────────┐
│  Lambda Function URL (authType = AWS_IAM)                                    │
│    gemini-relay handler:                                                     │
│      1. validate request (shared contract, size caps)                       │
│      2. read Gemini API key from Secrets Manager (us-east-1)                 │
│      3. map provider-agnostic request → Gemini API call                     │
│      4. call Gemini ──► generativelanguage.googleapis.com                    │
│      5. map response/errors → shared contract → return                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Why this design (cheap + secure + low-maintenance):**

- **Lambda Function URL with `AWS_IAM`** = no servers, no API Gateway, near-zero idle
  cost (well within free tier at family scale). Only a caller that signs requests with an
  **IAM principal we explicitly allow** can invoke — no shared API key to leak/rotate.
  The HK ECS **task role** is granted `lambda:InvokeFunctionUrl` on this one function.
  IAM is global, so a same-account cross-region grant works cleanly.
- **Latency tolerance:** Function URLs allow long (up to 15 min) responses, so a 30–90 s
  Gemini generation is fine. (ALB/API Gateway cap at ~29–30 s and would be risky.)
- **Secret isolation:** the Gemini API key lives only in **us-east-1 Secrets Manager**,
  read by the Lambda. The HK app never sees it.
- **Thin & stable:** the relay does Gemini-API mechanics only (endpoint, auth envelope,
  request/response mapping). It does **not** own prompt content — see §4.4 — so it
  rarely needs redeploying.

**Security layers:**

1. `AWS_IAM` auth on the Function URL (**sole gate** — identity-based, per Q-7).
2. Resource policy scoping invoke to the specific HK task-role ARN — every request that
   is not SigV4-signed by that one principal is rejected.
3. Request validation + strict size caps in the handler (defend against abuse/cost).

> **Q-7 resolved:** IAM alone is the gate. No rotating shared-secret header — IAM blocks
> all callers except the explicitly-allowed HK task role, which satisfies the
> "easy to maintain but secure" bar.

**Alternatives considered (and why not):**

- _API Gateway (REST/HTTP) + API key_ — more moving parts, 29 s timeout, key management.
- _Always-on container (ECS/App Runner) in us-east-1_ — idle cost + patching for a
  rarely-called endpoint. Overkill.
- _Direct call to Gemini through a generic forward proxy_ — still needs a compute host in
  an allowed region and doesn't give us validation/secret-isolation for free.

### 4.2 Repo placement (relay: same repo or its own?)

**Recommendation: keep it in this monorepo** as a new workspace, e.g.
`services/gemini-relay/`, with its **own CDK stack** (`infra/aws` second stack or
`infra/relay`) that targets **us-east-1** and is deployed **manually / via a separate
pipeline** — explicitly _not_ wired into the `main` auto-deploy to ap-east-1.

Rationale:

- The request/response **contract lives in `packages/shared`** and stays in lockstep with
  the app — no cross-repo version drift for a tiny service.
- One CI, one place to read, trivial code size.
- Region isolation is achieved at the **stack/pipeline** level, not the repo level.

**Q-6 resolved:** monorepo is fine provided it stays a clean, maintainable pattern — a
separate repo would give a harder deploy boundary and smaller blast radius at the cost of
a synced contract, but at family scale the monorepo (with the relay's own us-east-1 stack
and manual deploy) wins.

### 4.3 Data model (DynamoDB)

New single-table items (following existing `DK` conventions):

| Purpose                   | PK / SK                                                     | Notes                                                                                                                     |
| ------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Game summary**          | `GAME#<id>` / `AI_SUMMARY`                                  | The per-game overview + status. Used by the normal replay panel **and** as the per-player breakdown in challenge replays. |
| **Challenge summary**     | `CHALLENGE#<id>` / `AI_SUMMARY`                             | The challenge overview narrative + status.                                                                                |
| **AI request (queue)**    | `AIREQ#<reqId>` / `META` + `gsi1pk = AIREQ_STATUS#<status>` | User-initiated request awaiting admin decision. GSI lists pending. Mirrors invites' status-GSI.                           |
| **AI job (worker/audit)** | embedded in the summary item (status machine)               | Tracks `processing/done/failed`, attempts, error code/message for the failed-jobs screen.                                 |

**Summary item status machine:**
`none → requested → approved → processing → done` (terminal) and
`processing → failed` (retryable). Rejected requests do not write a summary item; they
just resolve the request record and leave the game with no summary (button re-enabled).

**Summary item fields (sketch):**

```
status            'requested'|'approved'|'processing'|'done'|'failed'
text              { en: string; zh: string }   // both languages — present when done
requestedBy/At    string            // who asked + when
approvedBy/At     string            // 'auto' (challenge) / actor sub (admin-ai-features holder)
model             string            // Gemini model id used (Flash)
promptVersion     string            // for reproducibility / A-B of prompts
generatedAt       string
attempts          number
errorCode         string            // '404'|'403'|'5xx'|'timeout'|'validation'|...
errorMessage      string            // surfaced (sanitised) reason
```

**Both languages (Q-5).** `text` always carries `{ en, zh }`. The viewer picks the field
matching the current app language; if one language is somehow missing it falls back to the
other. Generation produces both in a **single-pass JSON call** (§4.4) so a summary is
never half-translated in the `done` state — a job missing either language fails whole
rather than writing a partial item.

The challenge summary item additionally references the per-participant game summary ids
(or the per-player breakdowns are simply read from each participant's `GAME#<id>/AI_SUMMARY`).

**Permission storage (`admin-ai-features`).** This is a property of the **user profile**,
not a new summary/queue item. Add it to the `UserProfile`/user record (e.g.
`permissions: string[]` or a boolean `aiFeatures` flag) so it can be granted/revoked from
the admin user-management screen and checked authoritatively server-side. See §4.5.

### 4.4 Prompt & "facts digest" design

**Do not dump raw tile-by-tile event logs to Gemini.** Instead, the HK API builds a
compact **structured facts digest** from `ReplayGamePayload` (reusing the engine's replay
capability) and sends _that_ plus a versioned prompt template. This:

- controls token cost and improves output quality/consistency;
- for challenges, **aligns participants' games by hand index** (same seeds) and computes
  per-hand divergence (who won/dealt-in/drew, score swing, special hands, jing, risky
  vs safe discards) — the raw material for the divergence narrative.

**Payload boundary safeguard (mandatory).** Before dispatching to the us-east-1 relay, the
NestJS API layer **MUST validate the total character size of the serialized facts-digest
string** (the full JSON request body) and reject anything that would breach the
**synchronous AWS Lambda request payload limit of 6 MB**. Enforce a conservative ceiling
well under 6 MB (e.g. a configurable cap such as ~4 MB of UTF-8 bytes) to leave headroom
for the prompt template, system instruction, and JSON envelope overhead. A digest that
exceeds the cap is **never sent**: the job is marked `failed` with `errorCode: 'validation'`
(payload too large) and surfaces in the failed-jobs screen rather than triggering an opaque
relay/Lambda 413/500. The challenge digest — which aggregates every participant's
per-hand divergence — is the most likely to approach the bound, so the size check runs on
the **final assembled request**, after the digest is built, for both normal and challenge
generations.

**Prompt ownership split:**

- **HK API owns prompt content** (system instruction, tone spec, length spec, the facts
  digest, generation params). Prompts are _versioned_ so we can iterate without touching
  the relay.
- **Relay owns Gemini mechanics only** (maps the provider-agnostic request → Gemini's
  request body, injects the key, calls the model, maps the response/errors back).

**Tone & length spec captured for the prompt:**

- Persona: mahjong match reporter / commentator / breakdown reviewer; lively, a little
  personality, more engaging than a stat dump — but accurate to the facts digest.
- Normal overview: **3–12 sentences**, scaled to game length.
- Challenge overview: structured around hand-by-hand divergence and
  risk/reward/heroes/failures, **bounded by a configurable word cap (default 400 words)**.
  The cap lives in API config (not the relay) so it can be tuned without redeploying.
- Per-player challenge breakdown: same as a normal overview.
- **Nanchang Mahjong only** — the prompt must forbid any other-variant concepts (no
  minimum-fan talk, etc.), consistent with the project's Tier-0 rule.

**Model (Q-1).** One model for everything: **Gemini Flash**. The relay takes a model id
from the API request rather than hard-coding it, so swapping models later is an API-config
change, not a relay redeploy.

**Player identity (Q-9).** Send **full real player handles** in the facts digest — no
anonymised seat labels. For this private family app there are no restricted fields; the
digest may carry **all replay facts, including full-hand info** (which players already see
in the omniscient replay). The whole replay payload is fair game.

**Bilingual generation (Q-5) — mandatory single-pass JSON.** Each job must yield
`{ en, zh }` in **one** Gemini call. This is a **strict system constraint, not a choice**:
the prompt MUST instruct Gemini to return a **single JSON object** with structured `en`
and `zh` string properties — e.g.

```json
{ "en": "...", "zh": "..." }
```

and the relay request MUST pin the Gemini response to JSON (response MIME type
`application/json` + a response schema declaring both properties as required strings).
Per-language fan-out (two separate calls) is **explicitly disallowed** — it doubles token
spend and latency and risks a half-translated `done` state. Single-pass JSON gives:

- **Minimum token expenditure** — one prompt/context, not two.
- **Atomic generation** — both languages land together or the job fails together; a
  `done` summary is never half-translated.
- **Deterministic parsing** — the API parses one object instead of stitching two
  free-text responses.

The persona/length/Nanchang constraints apply identically to both `en` and `zh`. If the
returned object is missing either property or fails schema validation, the job is marked
`failed` (not partially stored) and surfaces in the failed-jobs screen.

### 4.5 The `admin-ai-features` permission (Q-10)

This feature introduces the project's **first granular permission**, gating _everything_
privileged in the AI-commentary feature. It is **orthogonal to the `admin` role**: an
account may be `admin` yet lack `admin-ai-features`, in which case it has no AI powers at
all (its summary requests go through the normal approval queue like any user's).

**What the permission gates:**

- Auto-approval of one's own summary requests (instant generation, no queue).
- Approving / rejecting other users' queued requests.
- Retrying failed jobs (Q-11).
- Visibility of the AI request-queue and failed-jobs admin screens.

**What it does _not_ gate:** requesting a summary (any viewer of a replay/challenge may
request — it just queues) and viewing finished summaries.

**Design (recommended):**

- **Storage:** a field on the user profile (`permissions: string[]`, holding e.g.
  `'admin-ai-features'`, future-proofed for more permissions; or a simple boolean if we
  never expect others). Granted/revoked from the admin user-management screen.
- **Server enforcement (authoritative):** a new `@RequirePermission('admin-ai-features')`
  decorator + guard that reads the **fresh user profile** (the same `users.findBySub`
  lookup `JwtStrategy` already performs for the `disabled` check) rather than trusting a
  JWT claim. This makes **revocation take effect immediately** — no waiting for token
  refresh — which matters for an authorization gate on a paid external service.
- **Frontend (UI-gating only, non-authoritative):** expose the permission to the client
  (cleanest via the existing `/users/me` profile fetch; embedding it as a JWT claim is an
  alternative but suffers revocation lag, so prefer the profile field) so `AdminPage` can
  show/hide the AI sections and the replay panel can decide instant-vs-queued. The server
  always re-checks.

**Granting authority (Q-13 resolved):** **any `admin`** may grant/revoke
`admin-ai-features` from the user-management screen, with grants written to the audit log
like `SET_ROLE`. Crucially, **holding `admin-ai-features` does _not_ grant the right to
hand it out** — only the `admin` role does — so the permission cannot self-propagate.

---

## 5. Phased Implementation Plan

Each phase = one PR off `pre-prod`. Order is dependency-driven; earlier phases can be
built and reviewed while their UI counterparts wait.

### Phase 1 — Shared contract & data model (no behaviour)

**Scope:** types only, zero runtime behaviour change.

- `packages/shared`: relay request/response contract (provider-agnostic), AI-summary
  payload types (game + challenge) with **bilingual `{ en, zh }` text**, request/job
  status enums, facts-digest types.
- `DK` key helpers for `GAME#<id>/AI_SUMMARY`, `CHALLENGE#<id>/AI_SUMMARY`, `AIREQ#<id>`,
  and the `AIREQ_STATUS#<status>` GSI tuple.
- **Permission groundwork:** add the `admin-ai-features` permission to the shared
  user/permission types and the `UserProfile` shape (e.g. `permissions: string[]`).
- Doc the status machine in code comments.
  **Deliverables:** shared types compile; no API/web wiring.
  **Tests:** type-level only (typecheck). Tiny PR.

### Phase 2 — Gemini Relay service (us-east-1)

**Scope:** the standalone relay, deployable & testable on its own.

- `services/gemini-relay/` — Lambda handler implementing the Phase-1 contract: validate →
  read key from Secrets Manager → call Gemini → map response/errors.
- CDK stack (separate, us-east-1): Lambda + Function URL (`AWS_IAM`), Secrets Manager
  entry for the Gemini key, log group, resource policy placeholder for the HK task role.
- README with manual deploy steps (mirrors `docs/DEPLOYMENT.md` style).
  **Deliverables:** relay deployable to us-east-1; smoke-tested with a real Gemini key from
  a non-blocked location; **no HK app changes yet.**
  **Tests:** handler unit tests (contract in/out, error mapping) with Gemini mocked.

### Phase 3 — API: AiSummary service + relay client (internal only)

**Scope:** the HK-side engine, callable internally, not yet exposed to users.

- `AiSummaryModule`: `GeminiRelayClient` (SigV4-signed call to the relay Function URL),
  `AiSummaryService` (facts-digest extraction from `ReplayGamePayload`, prompt building
  - versioning, summary item lifecycle in DDB, store/read results).
- Config: relay URL + region + model id in `configuration.ts` / `.env.example`; graceful
  no-op when unset (mirrors VAPID pattern).
- Infra (`infra/aws`): grant the ECS **task role** `lambda:InvokeFunctionUrl` on the relay
  - the relay's resource policy allows that role.
- Optional admin-only debug endpoint to trigger a single generation (for end-to-end test).
  **Deliverables:** an admin can manually drive a real generation end-to-end (HK → relay →
  Gemini → stored summary).
  **Tests:** facts-digest extraction unit tests; service lifecycle tests with the relay
  client mocked.

### Phase 4 — Request queue + admin approval (backend)

**Scope:** the request/approval workflow + the `admin-ai-features` permission infra.

- **Permission infra:** `@RequirePermission('admin-ai-features')` decorator + guard doing
  an authoritative fresh user-profile lookup (mirrors the `disabled` check in
  `JwtStrategy`). Grant/revoke endpoint under `/admin/users/...` (audit-logged like
  `SET_ROLE`); expose the permission on `/users/me`.
- `POST /replays/:id/request-summary` and `POST /challenges/:id/request-summary`:
  - requester **holds `admin-ai-features`** → auto-approve → enqueue generation;
  - everyone else (normal user _or_ plain admin) → create `AIREQ` pending record
    (idempotent; one open request per target).
- Queue-management endpoints (all `@RequirePermission('admin-ai-features')`):
  `GET /admin/ai-requests?status=pending`, `POST /admin/ai-requests/:id/approve`
  (→ generate), `POST /admin/ai-requests/:id/reject` (→ resolve, leave target
  summary-less). Write audit-log entries.
- Failed-jobs listing: `GET /admin/ai-jobs?status=failed` (+ retry endpoint), also gated
  on `admin-ai-features` (Q-11).
- Access control: requester must be allowed to view that replay/challenge.
  **Tests:** permission grant/revoke + guard gating (admin-without-permission is blocked),
  approval/rejection transitions, auto-approve only for permission holders, idempotency,
  failed-job listing + retry gating.

### Phase 5 — Auto-generation on challenge completion (backend)

**Scope:** the automatic path for challenges.

- Hook the challenge-completion transition in
  [`recordParticipantResult`](apps/api/src/challenges/challenges.service.ts:322) /
  [`declineChallenge`](apps/api/src/challenges/challenges.service.ts:523): on
  `→ completed`, enqueue **auto-approved** jobs for (a) each **completed** participant's
  game overview and (b) the challenge overview. **Declined participants are skipped**
  (Q-3).
- **Only `completed` challenges generate** — a challenge that ends `cancelled` (all
  challenged players declined) produces **no summary** (Q-12).
- Generation runs async with status tracking; failures land in the failed-jobs screen and
  are retryable. Dedupe so re-completion/retries don't double-generate.
- **Staggered fan-out (DynamoDB write-throttle defence).** A challenge completion fans out
  to _N_ participant jobs **plus** the challenge overview, each of which mutates a summary
  item through its `processing → done/failed` lifecycle. Firing all of these at once would
  produce a burst of near-simultaneous single-table writes. The async completion runner
  **must therefore apply a lightweight staggered-dispatch / jittered-backoff pattern** —
  e.g. spread the per-participant job kick-offs across a small randomised delay window
  rather than dispatching them in a tight synchronous loop. This keeps the burst from
  saturating the table's provisioned write throughput (and smooths the Gemini call rate as
  a bonus), while staying simple — no queue infrastructure, just jittered scheduling of the
  existing async jobs. Combined with idempotent dedupe, a retried completion re-spreads
  rather than re-bursts.
- **No "ready" notification** — summaries surface **silently on the next page load**
  (Q-8); no push, no badge.
  **Tests:** completion fan-out enqueues the right jobs once (declined skipped); cancelled
  challenge enqueues nothing; idempotency on repeat calls; jittered dispatch does not fire
  all participant jobs in the same synchronous tick.

### Phase 6 — Frontend: replay viewers (panel + request button)

**Scope:** the player-facing surfaces.

- Collapsible panel (collapsed by default) at the top of `ReplayPage`: shows the overview
  in the **current app language** (`{ en, zh }`, fall back to the other) when present;
  otherwise the **"Request AI summary of this match"** button.
  - `admin-ai-features` holder → instant request; everyone else → queued + "pending
    review" state; **re-enabled** if rejected.
- `ChallengeReplayPage`: same panel; the per-player breakdown **switches with the selected
  participant** (`viewedSub`).
- `ChallengeDetailPage`: show the **challenge overview** when complete; **request button**
  for legacy challenges with no summary (same approval flow).
- Hooks (`use-replay` / `use-challenges`) + EN/ZH i18n (parity), `MahjongTile2D` if any
  tiles are rendered.
  **Tests:** RTL — collapsed-by-default, button→pending, summary render, participant switch
  swaps the breakdown.

### Phase 7 — Frontend: admin screens

**Scope:** admin tooling + permission management UI.

- **Permission management:** in the existing user-management section, a grant/revoke
  control for `admin-ai-features` (alongside the role/disable controls).
- **AI request queue** screen/section: list pending, approve/reject, optimistic updates.
- **AI failed jobs** screen/section: list failed jobs with surfaced error reason/code and
  any logs; retry action.
- The AI sections render only for users holding `admin-ai-features` (the permission flag
  from `/users/me`); they slot into `AdminPage` under `AdminRoute`, but a plain `admin`
  without the permission does not see them. EN/ZH i18n.
  **Tests:** RTL — list/approve/reject/retry; permission gating (admin-without-permission
  sees no AI sections); grant/revoke control.

### Phase 8 — Polish, observability, backfill (optional)

**Scope:** hardening.

- Dedupe windows, retry/backoff tuning. (No per-user/per-day request caps or app-side
  spend caps for now — Q-2, Q-10; the `admin-ai-features` gate is the throttle.)
- Metrics + structured logging (relay + API) for the failed-jobs view.
- Backfill tooling for pre-existing replays/challenges.
- Prompt-version A/B notes.

---

## 6. Cross-Cutting Concerns

- **Privacy / data egress (Q-9 resolved):** sending replay facts to Google is **accepted**.
  All replay facts — including full-hand info and the **whole replay payload** — plus
  **full real player handles** may be sent. No restricted fields exist today; no
  anonymisation.
- **Nanchang-only correctness:** the prompt must explicitly constrain Gemini to Nanchang
  rules and forbid other-variant vocabulary (no min-fan, etc.).
- **Idempotency:** never regenerate a `done` summary unless an explicit retry/force is
  issued; one open request per target. **No spend cap or request cap** app-side (Q-2,
  Q-10) — the user pre-funds the Gemini billing project and the `admin-ai-features` gate
  bounds who can spend.
- **Failure surfacing:** capture HTTP status (404/403/5xx), timeouts, and validation
  errors distinctly so the admin failed-jobs screen can show a real reason.
- **No `main` deploy coupling:** the relay stack deploys to us-east-1 on a separate,
  manual pipeline; the HK app degrades gracefully if the relay/config is absent.
- **Backwards-compat:** per project policy, no compat shims — build the best design;
  legacy items simply have no summary until requested.

---

## 7. Resolved Questions

> All questions Q-1…Q-13 fully resolved (2026-06-21) and integrated into the plan above.
> No open questions remain.

| #    | Decision                                                                                                                                                                                                         |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-1  | **One model for everything: Gemini Flash.** Relay takes the model id from the request, so it can change later without a redeploy. (§4.4)                                                                         |
| Q-2  | Key already in hand; billing project **pre-funded**. **No app-side spend cap.** (§6)                                                                                                                             |
| Q-3  | **Confirmed:** on completion auto-generate the challenge overview **and** a per-player overview for each completed participant; **declined participants skipped.** (Phase 5)                                     |
| Q-4  | Normal overview **3–12 sentences** confirmed. Challenge overview gets a **configurable word cap, default 400 words** (in API config). (§1, §4.4)                                                                 |
| Q-5  | **Generate & store both EN and ZH** for every summary; viewer renders the current app language. (§4.3, §4.4)                                                                                                     |
| Q-6  | **Same monorepo** (`services/gemini-relay`) — acceptable as long as it stays a clean, maintainable pattern (own us-east-1 stack + manual deploy). (§4.2)                                                         |
| Q-7  | **IAM alone** is the gate — Function URL `AWS_IAM` + resource policy scoped to the HK task role. **No shared-secret header.** (§4.1)                                                                             |
| Q-8  | **No notification** — summaries load **silently on next page load.** (Phase 5)                                                                                                                                   |
| Q-9  | **Send everything:** all replay facts, the whole replay, and **full real player handles.** No restricted data today. (§4.4, §6)                                                                                  |
| Q-10 | **No caps.** Instead gate the whole feature behind a **new `admin-ai-features` permission**, separate from the `admin` role. (§4.5)                                                                              |
| Q-11 | **Anyone with `admin-ai-features`** can retry failed jobs. (Phase 4, §4.5)                                                                                                                                       |
| Q-12 | **Cancelled challenges generate no summary.** (Phase 5)                                                                                                                                                          |
| Q-13 | **Any `admin`** can grant/revoke `admin-ai-features` (user-management screen, audit-logged like `SET_ROLE`). Holding the permission does **not** confer the right to grant it — prevents self-escalation. (§4.5) |

All questions resolved. The plan is ready to implement starting at Phase 1.

---

## 8. Out of Scope (for now)

- Streaming the summary token-by-token to the UI (generate-then-store is simpler).
- Editing/curating summaries by hand.
- Non-Gemini providers / multi-provider abstraction beyond the thin contract.
- Voice/audio commentary.
