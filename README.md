# Nanchang Mahjong (南昌麻将)

A **private, invite-only** web app for playing Nanchang-style Mahjong with close family. Four human players connect to a private room, play full sessions with spirit tiles, and accumulate ELO ratings over time. Bilingual (English / 中文), mobile-first, real-time.

---

## Contents

- [Prerequisites](#prerequisites)
- [First-time setup](#first-time-setup)
- [Day-to-day development](#day-to-day-development)
- [Project structure](#project-structure)
- [Running tests](#running-tests)
- [Local service reference](#local-service-reference)
- [Environment variables](#environment-variables)
- [Optional: push notifications (VAPID)](#optional-push-notifications-vapid)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Tool               | Version | Install                                                                  |
| ------------------ | ------- | ------------------------------------------------------------------------ |
| **Docker Desktop** | latest  | [docker.com](https://www.docker.com/products/docker-desktop/)            |
| **Node.js**        | 22 LTS  | [nodejs.org](https://nodejs.org/) or `nvm install 22`                    |
| **pnpm**           | 10+     | `npm install -g pnpm@latest`                                             |
| **PowerShell**     | 5.1+    | Windows: built-in (`powershell`). PS 7 (`pwsh`) also works if installed. |

> **Windows note:** all commands in this guide use `pnpm --filter` workspace syntax. Never use `cd path && command` compound syntax — the project enforces a security rule that blocks it.

---

## First-time setup

### Option A — automated (recommended)

Run the setup script from the repo root. It handles everything in order.

```powershell
# From the repo root
powershell scripts/dev-setup.ps1
```

To use a custom admin account instead of the defaults:

```powershell
powershell scripts/dev-setup.ps1 `
  -AdminEmail  "you@example.com" `
  -AdminPassword "Aa1!aaaa" `
  -AdminHandle   "dad"
```

The script:

1. Copies `.env.example` → `.env`
2. Runs `pnpm install`
3. Starts all Docker services (`docker compose up -d`)
4. Waits for DynamoDB Local and Cognito Local to be healthy
5. Creates the DynamoDB table and Cognito User Pool (idempotent)
6. Patches the Cognito IDs into `.env` automatically
7. Seeds the first admin user and prints the initial invite code

Skip to [Day-to-day development](#day-to-day-development) when it finishes.

---

### Option B — manual step-by-step

**1. Copy the env file**

```powershell
Copy-Item .env.example .env
```

**2. Install dependencies**

```powershell
pnpm install
```

**3. Start Docker services**

```powershell
docker compose up -d
```

This starts five local services (see [Local service reference](#local-service-reference) below).

Wait ~15 seconds for all containers to become healthy:

```powershell
docker compose ps
```

All services should show `healthy` or `running`.

**4. Create the DynamoDB table and Cognito User Pool**

```powershell
pnpm --filter @nanchang/api run setup:local
```

The script prints two values — copy them into `.env`:

```
COGNITO_USER_POOL_ID=local_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
```

Open `.env` and paste both lines, replacing the `local_placeholder` / `placeholder` values.

**5. Seed the admin user**

```powershell
# Defaults: admin@nanchang.local / Admin1234! / handle=admin
pnpm --filter @nanchang/api run seed:admin

# Custom credentials:
$env:ADMIN_EMAIL    = "you@example.com"
$env:ADMIN_PASSWORD = "Aa1!aaaa"
$env:ADMIN_HANDLE   = "dad"
pnpm --filter @nanchang/api run seed:admin
```

The script prints an **invite code** — share it with each family member so they can register.

**6. Seed the four test players**

```powershell
pnpm --filter @nanchang/api run seed:users
```

Creates four regular player accounts for local testing:

| Email                  | Password      | Handle   |
| ---------------------- | ------------- | -------- |
| player1@nanchang.local | `Player1234!` | @player1 |
| player2@nanchang.local | `Player1234!` | @player2 |
| player3@nanchang.local | `Player1234!` | @player3 |
| player4@nanchang.local | `Player1234!` | @player4 |

---

## Day-to-day development

**Start Docker services** (if not already running):

```powershell
docker compose up -d
```

> **⚠️ DynamoDB table after restart:** DynamoDB Local runs **in-memory** — the table and all user profiles are lost whenever the container stops or restarts. If you get a 500 or 401 "Invalid email or password" on login, re-create the table and restore the profiles (Cognito persists, so this is safe to re-run any time):
>
> ```powershell
> pnpm --filter @nanchang/api run setup:local
> pnpm --filter @nanchang/api run seed:admin
> pnpm --filter @nanchang/api run seed:users
> ```

### Option A — single terminal (combined output)

```powershell
pnpm dev
```

### Option B — separate terminals (recommended for debugging)

Run these in two separate terminals from the repo root:

**Terminal 1 — API:**

```powershell
pnpm --filter @nanchang/api run dev
```

**Terminal 2 — Web:**

```powershell
pnpm --filter @nanchang/web run dev
```

> **First time with separate terminals:** the shared packages (`engine`, `shared`) must be built before the apps start. If you see import errors, run this once first:
>
> ```powershell
> pnpm -r --filter './packages/**' run build
> ```
>
> `pnpm dev` does this automatically; separate terminals do not.

| Service | URL                   |
| ------- | --------------------- |
| Web app | http://localhost:5173 |
| API     | http://localhost:3001 |

The web Vite dev server proxies `/api/*` and `/socket.io/*` to the API automatically — no CORS config needed.

**Stop everything:**

```powershell
# Stop Node processes: Ctrl+C in each terminal (or the pnpm dev terminal)
# Stop Docker:
docker compose down
```

> Data in MinIO (replay files) persists across `docker compose down` via Docker named volumes. DynamoDB Local runs in-memory and resets on container restart — re-run `setup:local` if you need the table back.

---

## Project structure

```
nanchang-mahjong/
├── apps/
│   ├── api/          NestJS + Fastify + Socket.IO backend
│   │   ├── scripts/  Local setup helpers (setup-local.ts, seed-admin.ts)
│   │   └── src/
│   └── web/          React 18 + Vite frontend
├── packages/
│   ├── engine/       Pure TypeScript game engine (no deps)
│   └── shared/       Zod schemas, socket event types, tile map
├── infra/
│   └── aws/          AWS CDK v2 stacks (production deploy)
├── test/
│   └── e2e/          Playwright smoke tests (run against prod)
├── docker-compose.yml  Local dev services
├── .env.example        Environment variable template
└── scripts/
    └── dev-setup.ps1   First-time setup automation
```

---

## Running tests

```powershell
# All packages (engine + api + web)
pnpm test

# Individual packages
pnpm --filter @nanchang/engine run test    # 248 Vitest tests
pnpm --filter @nanchang/api    run test    # 220 Jest tests
pnpm --filter @nanchang/web    run test    # 286 Vitest + RTL tests

# Watch mode (engine example)
pnpm --filter @nanchang/engine run test -- --watch

# Type-check all packages
pnpm typecheck
```

---

## Local service reference

All services are started by `docker compose up -d`.

| Container       | Purpose                           | Port(s)                        | Prod equivalent       |
| --------------- | --------------------------------- | ------------------------------ | --------------------- |
| `mj-dynamodb`   | DynamoDB Local (in-memory)        | `8000`                         | AWS DynamoDB          |
| `mj-minio`      | S3-compatible object store        | `9000` (API), `9001` (console) | AWS S3                |
| `mj-minio-init` | Creates `nanchang-replays` bucket | —                              | (CDK lifecycle rule)  |
| `mj-cognito`    | Cognito Local (auth)              | `9229`                         | AWS Cognito User Pool |
| `mj-mailhog`    | Catches outbound email            | `1025` (SMTP), `8025` (web)    | AWS SES               |
| `mj-redis`      | Redis (Socket.IO pub/sub)         | `6379`                         | ElastiCache           |

### Useful console URLs

| Console               | URL                   | Credentials                 |
| --------------------- | --------------------- | --------------------------- |
| MinIO (S3 browser)    | http://localhost:9001 | `minioadmin` / `minioadmin` |
| MailHog (email inbox) | http://localhost:8025 | —                           |

---

## Environment variables

`.env` is gitignored. The full template is in `.env.example`. Key variables:

| Variable                       | Default                 | Notes                          |
| ------------------------------ | ----------------------- | ------------------------------ |
| `PORT`                         | `3001`                  | API listen port                |
| `JWT_SECRET`                   | `dev-secret-…`          | Change before any real deploy  |
| `JWT_REFRESH_SECRET`           | `dev-refresh-…`         | Change before any real deploy  |
| `AWS_ENDPOINT_URL_DYNAMODB`    | `http://localhost:8000` | Points to Docker DDB Local     |
| `AWS_ENDPOINT_URL_S3`          | `http://localhost:9000` | Points to Docker MinIO         |
| `AWS_ENDPOINT_URL_COGNITO_IDP` | `http://localhost:9229` | Points to Docker cognito-local |
| `DYNAMODB_TABLE_NAME`          | `nanchang_main`         | Single-table design            |
| `S3_REPLAY_BUCKET`             | `nanchang-replays`      | Created by minio-init service  |
| `COGNITO_USER_POOL_ID`         | _(set by setup-local)_  | Output by `pnpm setup:local`   |
| `COGNITO_CLIENT_ID`            | _(set by setup-local)_  | Output by `pnpm setup:local`   |
| `VAPID_PUBLIC_KEY`             | _(empty = disabled)_    | Optional — see below           |
| `VAPID_PRIVATE_KEY`            | _(empty = disabled)_    | Optional — see below           |

---

## Optional: push notifications (VAPID)

Push notifications are **disabled by default** in development (graceful no-op). To test them locally:

**1. Generate a VAPID key pair**

```powershell
pnpm --filter @nanchang/api exec npx web-push generate-vapid-keys
```

**2. Add to `.env`**

```
VAPID_SUBJECT=mailto:you@example.com
VAPID_PUBLIC_KEY=<paste public key>
VAPID_PRIVATE_KEY=<paste private key>
```

**3. Restart the API**

Push notifications will now fire when it's your turn and you have no live socket. Requires a browser that supports the Push API (Chrome / Edge / Firefox) and HTTPS **or** localhost.

---

## Troubleshooting

### Docker containers not starting

```powershell
docker compose logs          # all services
docker compose logs dynamodb # specific service
docker compose ps            # check status
```

### DynamoDB table missing / 500 or 401 on login

DynamoDB Local runs **in-memory** — the table **and all user profile records** are lost whenever the container stops or restarts.

Symptoms:

- **500** on sign-in → `ResourceNotFoundException: Cannot do operations on a non-existent table` in API logs — table is missing
- **401 "Invalid email or password"** on sign-in after the 500 is fixed → DDB table exists but user profiles are gone

Fix (all three commands are idempotent — safe to run any time):

```powershell
pnpm --filter @nanchang/api run setup:local   # re-creates the table
pnpm --filter @nanchang/api run seed:admin    # restores admin profile
pnpm --filter @nanchang/api run seed:users    # restores player1-4 profiles
```

Cognito persists user accounts in the `cognito-data` Docker volume, so the seed scripts detect the existing Cognito users, fetch their subs, and write only the missing DDB profiles. Passwords and invite codes are unaffected.

### "COGNITO_USER_POOL_ID is not set"

The `seed:admin` script needs the pool ID written to `.env`. Either:

- Run `setup:local` again and copy the printed IDs into `.env`, or
- Run the automated setup script (`scripts/dev-setup.ps1`), which patches `.env` automatically.

### Port already in use

```powershell
# Find what's using port 8000 (DynamoDB)
netstat -ano | findstr :8000

# Stop a conflicting container
docker rm -f mj-dynamodb
docker compose up -d dynamodb
```

### API starts but cannot reach Cognito

The `jagregory/cognito-local` image may take a moment after the port opens. If the API throws on first start, wait 5 seconds and restart it:

```powershell
# Ctrl+C the pnpm dev terminal, then:
pnpm dev
```

### cognito-local doesn't persist user pools across restarts

User pools **do** persist — they're stored in the `cognito-data` Docker named volume. If you delete the volume (`docker compose down -v`), re-run `setup:local` and `seed:admin`.

### MinIO bucket missing

The `mj-minio-init` one-shot container creates the bucket when MinIO first becomes healthy. If you see S3 errors, check whether it ran:

```powershell
docker compose logs minio-init
# If it failed, re-run it:
docker compose run --rm minio-init
```

### API typechecks fail

```powershell
pnpm --filter @nanchang/api run typecheck
```

Never run `cd apps/api && tsc` — use the pnpm filter form above.

---

## Tech stack quick reference

| Layer    | Stack                                                                                       |
| -------- | ------------------------------------------------------------------------------------------- |
| Monorepo | pnpm workspaces, TypeScript throughout                                                      |
| Engine   | `packages/engine` — pure TS, no deps, Vitest (248 tests)                                    |
| Shared   | `packages/shared` — Zod schemas, socket event types, tile map                               |
| API      | `apps/api` — NestJS + Fastify, Socket.IO, DynamoDB, Jest (220 tests)                        |
| Web      | `apps/web` — React 18, Vite, Zustand, TanStack Query, react-i18next, Vitest+RTL (286 tests) |
| Infra    | AWS App Runner, DynamoDB, S3, CloudFront, CDK in `infra/`                                   |
| CI/CD    | GitHub Actions: lint + typecheck + test on every PR; deploy on merge to `main`              |
