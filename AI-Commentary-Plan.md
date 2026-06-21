# AI Replay Commentary — Plan & Roadmap

> **Status:** Draft for review. No implementation has started. This document is the
> single source of truth for the AI Replay Commentary feature. It is phased so each
> phase maps to one focused, independently reviewable PR.
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
     the picture of _why the final scores ended up so far apart_. Length: as long as the
     narrative needs.
   - **Per-player breakdown** — for each participant, an individual game overview
     identical in spirit to the normal match overview.

### Where the output appears

| Surface                                                | What shows                                                                                                                                                  | Availability         |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **Replay viewer** (`/replay/:id`)                      | Collapsible panel (collapsed by default) at the very top with the match overview. If no summary yet → a **"Request AI summary of this match"** button.      | All games            |
| **Challenge replay viewer** (`/challenges/:id/replay`) | Same collapsible panel; the per-player breakdown **switches with the selected participant**.                                                                | Completed challenges |
| **Challenge detail page** (`/challenges/:id`)          | The **challenge overview** is shown once the challenge is complete. For legacy/pre-existing challenges with no summary → a **"Request AI summary"** button. | Completed challenges |
| **Admin: AI request queue** (new screen)               | Pending user requests; admins approve/reject.                                                                                                               | Admins               |
| **Admin: AI failed jobs** (new screen)                 | Failed generation jobs with surfaced error reason/code/logs; retry.                                                                                         | Admins               |

### Generation triggers

- **Challenges (automatic):** when a challenge completes, the system **automatically**
  generates the challenge overview **and** a per-player game overview for every attached
  game. No approval needed.
- **Normal matches (on request):** never automatic. The replay viewer shows a request
  button.
  - **Requester is a normal user** → request goes into an **admin approval queue**.
    - **Approved** → game is sent to Gemini, result stored, panel updates.
    - **Rejected** → the request button is re-enabled in the replay viewer.
  - **Requester is an admin** → treated as auto-approved; sent immediately.
- **Re-requests / recovery:** the same request + approval mechanism covers
  re-generating after a failure, and backfilling games/challenges that predate this
  feature.

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

1. `AWS_IAM` auth on the Function URL (primary gate — identity-based).
2. Resource policy scoping invoke to the specific HK task-role ARN.
3. Request validation + strict size caps in the handler (defend against abuse/cost).
4. Optional: a rotating shared secret header as defence-in-depth (decide in Q-7).

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

Trade-off to confirm (Q-6): a separate repo gives a harder deploy boundary and smaller
blast radius, at the cost of a synced contract. Given family scale, monorepo wins — but
this is a decision for you.

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
text              string            // the overview (game) — present when done
requestedBy/At    string            // who asked + when
approvedBy/At     string            // admin or 'auto' (challenge) / 'self' (admin requester)
model             string            // Gemini model id used
promptVersion     string            // for reproducibility / A-B of prompts
generatedAt       string
attempts          number
errorCode         string            // '404'|'403'|'5xx'|'timeout'|'validation'|...
errorMessage      string            // surfaced (sanitised) reason
```

The challenge summary item additionally references the per-participant game summary ids
(or the per-player breakdowns are simply read from each participant's `GAME#<id>/AI_SUMMARY`).

### 4.4 Prompt & "facts digest" design

**Do not dump raw tile-by-tile event logs to Gemini.** Instead, the HK API builds a
compact **structured facts digest** from `ReplayGamePayload` (reusing the engine's replay
capability) and sends _that_ plus a versioned prompt template. This:

- controls token cost and improves output quality/consistency;
- for challenges, **aligns participants' games by hand index** (same seeds) and computes
  per-hand divergence (who won/dealt-in/drew, score swing, special hands, jing, risky
  vs safe discards) — the raw material for the divergence narrative.

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
- Challenge overview: as long as the narrative needs; structured around hand-by-hand
  divergence and risk/reward/heroes/failures.
- Per-player challenge breakdown: same as a normal overview.
- **Nanchang Mahjong only** — the prompt must forbid any other-variant concepts (no
  minimum-fan talk, etc.), consistent with the project's Tier-0 rule.

---

## 5. Phased Implementation Plan

Each phase = one PR off `pre-prod`. Order is dependency-driven; earlier phases can be
built and reviewed while their UI counterparts wait.

### Phase 1 — Shared contract & data model (no behaviour)

**Scope:** types only, zero runtime behaviour change.

- `packages/shared`: relay request/response contract (provider-agnostic), AI-summary
  payload types (game + challenge), request/job status enums, facts-digest types.
- `DK` key helpers for `GAME#<id>/AI_SUMMARY`, `CHALLENGE#<id>/AI_SUMMARY`, `AIREQ#<id>`,
  and the `AIREQ_STATUS#<status>` GSI tuple.
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

**Scope:** the request/approval workflow.

- `POST /replays/:id/request-summary` and `POST /challenges/:id/request-summary`:
  - admin requester → auto-approve → enqueue generation;
  - normal user → create `AIREQ` pending record (idempotent; one open request per target).
- Admin endpoints: `GET /admin/ai-requests?status=pending`,
  `POST /admin/ai-requests/:id/approve` (→ generate), `POST /admin/ai-requests/:id/reject`
  (→ resolve, leave target summary-less). Write audit-log entries.
- Failed-jobs listing: `GET /admin/ai-jobs?status=failed` (+ retry endpoint).
- Access control: requester must be allowed to view that replay/challenge.
  **Tests:** approval/rejection transitions, role gating, idempotency, failed-job listing.

### Phase 5 — Auto-generation on challenge completion (backend)

**Scope:** the automatic path for challenges.

- Hook the challenge-completion transition in
  [`recordParticipantResult`](apps/api/src/challenges/challenges.service.ts:322) /
  [`declineChallenge`](apps/api/src/challenges/challenges.service.ts:523): on
  `→ completed`, enqueue **auto-approved** jobs for (a) each completed participant's game
  overview and (b) the challenge overview.
- Generation runs async with status tracking; failures land in the failed-jobs screen and
  are retryable. Dedupe so re-completion/retries don't double-generate.
- Decide push-notification-on-ready (Q-8).
  **Tests:** completion fan-out enqueues the right jobs once; idempotency on repeat calls.

### Phase 6 — Frontend: replay viewers (panel + request button)

**Scope:** the player-facing surfaces.

- Collapsible panel (collapsed by default) at the top of `ReplayPage`: shows the overview
  when present; otherwise the **"Request AI summary of this match"** button.
  - admin → instant request; user → queued + "pending review" state; **re-enabled** if
    rejected.
- `ChallengeReplayPage`: same panel; the per-player breakdown **switches with the selected
  participant** (`viewedSub`).
- `ChallengeDetailPage`: show the **challenge overview** when complete; **request button**
  for legacy challenges with no summary (same approval flow).
- Hooks (`use-replay` / `use-challenges`) + EN/ZH i18n (parity), `MahjongTile2D` if any
  tiles are rendered.
  **Tests:** RTL — collapsed-by-default, button→pending, summary render, participant switch
  swaps the breakdown.

### Phase 7 — Frontend: admin screens

**Scope:** admin tooling.

- **AI request queue** screen/section: list pending, approve/reject, optimistic updates.
- **AI failed jobs** screen/section: list failed jobs with surfaced error reason/code and
  any logs; retry action.
- Slots into `AdminPage` (new sections or tabs) under `AdminRoute`. EN/ZH i18n.
  **Tests:** RTL — list/approve/reject/retry; admin-only gating.

### Phase 8 — Polish, observability, backfill (optional)

**Scope:** hardening.

- Cost guards / rate limits on requests, dedupe windows, retry/backoff tuning.
- Metrics + structured logging (relay + API) for the failed-jobs view.
- Backfill tooling for pre-existing replays/challenges.
- Prompt-version A/B notes.

---

## 6. Cross-Cutting Concerns

- **Privacy / data egress:** replay facts (including full-hand info, which players already
  see in the omniscient replay) are sent to Google via the relay. For a private family app
  this is likely acceptable — confirm in Q-9. The digest should avoid PII beyond display
  handles; consider sending seat labels instead of handles (Q-9).
- **Nanchang-only correctness:** the prompt must explicitly constrain Gemini to Nanchang
  rules and forbid other-variant vocabulary (no min-fan, etc.).
- **Idempotency & cost:** never regenerate a `done` summary unless an explicit retry/force
  is issued; one open request per target.
- **Failure surfacing:** capture HTTP status (404/403/5xx), timeouts, and validation
  errors distinctly so the admin failed-jobs screen can show a real reason.
- **No `main` deploy coupling:** the relay stack deploys to us-east-1 on a separate,
  manual pipeline; the HK app degrades gracefully if the relay/config is absent.
- **Backwards-compat:** per project policy, no compat shims — build the best design;
  legacy items simply have no summary until requested.

---

## 7. Open Questions (please answer inline)

> Answer by editing under each question. My recommendation is marked **(rec)**.

**Q-1. Gemini model.** Which model should the relay call?

- (rec) `gemini-2.x Flash` for cost/latency on overviews; consider `Pro` for the longer
  challenge overview. Or one model for everything?
- **Answer:**

**Q-2. Gemini access.** Do you already have a Google AI Studio / Gemini API key (and a
billing project), or do we need to set that up? Any per-day spend cap you want enforced?

- **Answer:**

**Q-3. Auto-generation scope on challenge completion.** Confirm: on completion, generate
**both** the challenge overview **and** a per-player game overview for **every** completed
participant automatically. Declined participants → skipped. Correct?

- **Answer:**

**Q-4. Length controls.** Normal overview **3–12 sentences** (scaled to game length) —
confirmed. For the challenge overview, any hard upper bound (e.g. ≤ ~400 words) or truly
open-ended?

- **Answer:**

**Q-5. Language.** Should summaries be generated in the user's current app language
(EN/ZH), always English, or both (store both)? This affects prompt + storage shape.

- **Answer:**

**Q-6. Relay repo placement.** (rec) Same monorepo (`services/gemini-relay`) with a
separate us-east-1 CDK stack + manual deploy. OK, or do you want a dedicated repo?

- **Answer:**

**Q-7. Relay auth.** (rec) Lambda Function URL with `AWS_IAM` (SigV4) as the sole gate.
Add a rotating shared-secret header as belt-and-braces, or is IAM alone sufficient?

- **Answer:**

**Q-8. "Summary ready" notification.** When an auto/approved summary finishes, should we
fire a push notification (we already have web-push infra) and/or surface a badge, or just
update silently on next page load?

- **Answer:**

**Q-9. Data sent to Google + handles.** Acceptable to send replay facts to Gemini? And
should we send real player handles or anonymised seat labels (e.g. "East/South/...") in
the digest?

- **Answer:**

**Q-10. Request limits.** Per-user cap on pending AI requests (e.g. N open at once / per
day) to bound the admin queue and cost? Suggested default?

- **Answer:**

**Q-11. Retry ownership.** For failed jobs, who can retry — any admin only, or also the
original requester? (rec) admins only, from the failed-jobs screen.

- **Answer:**

**Q-12. Cancelled challenges.** Challenges can end as `cancelled` (all challenged players
declined). Generate any summary for those, or skip? (rec) skip.

- **Answer:**

---

## 8. Out of Scope (for now)

- Streaming the summary token-by-token to the UI (generate-then-store is simpler).
- Editing/curating summaries by hand.
- Non-Gemini providers / multi-provider abstraction beyond the thin contract.
- Voice/audio commentary.
