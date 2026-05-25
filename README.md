# Nanchang Mahjong (南昌麻将)

A mobile-first, browser-accessible web app for playing **Nanchang Mahjong** with close family and friends. Bilingual (English / 中文), invite-only, real-time 4-player.

## Status
🚧 Planning phase — not yet implemented.

## Documents
- **[PLAN.md](PLAN.md)** — full implementation plan: stack, infrastructure, data model, phased delivery, tests, risks.
- **[Family Mahjong webap-handoff/](Family%20Mahjong%20webap-handoff/)** — original design handoff bundle from Claude Design (HTML/CSS/JSX prototypes, design tokens, motion spec, a11y checklist).

## Tech (proposed — see PLAN.md §1)
- **Frontend**: React 18 + Vite + TypeScript + Tailwind + react-i18next + Socket.IO client
- **Backend**: Node.js + NestJS + Socket.IO + zod
- **Engine**: pure-TS, deterministic, shared between FE and BE
- **DB**: DynamoDB (single-table)
- **Auth**: AWS Cognito + invite-key gate
- **Infra**: AWS `ap-east-1` (Hong Kong) — App Runner, S3+CloudFront, DynamoDB, SES, WAF, deployed via CDK
- **Dev parity**: Docker stack (DynamoDB Local, MinIO, cognito-local, MailHog, Redis, LocalStack)

## Getting started
Not bootstrapped yet — Phase 0 of [PLAN.md](PLAN.md) covers the monorepo + Docker scaffold.
