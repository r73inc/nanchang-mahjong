# ── Stage 1: Install dependencies ────────────────────────────────────────────
# Separate stage so pnpm install is cached unless lockfile changes.
FROM node:22-alpine AS installer
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /repo

# Copy manifests only (optimises layer cache)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/engine/package.json packages/engine/
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ────────────────────────────────────────────────────────────
# Use --webpack so nest bundles everything (engine, shared, all deps) into a
# single dist/main.js — avoids Node.js needing to resolve workspace TS packages
# at runtime without a TypeScript loader.
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /repo

COPY --from=installer /repo/node_modules node_modules
COPY --from=installer /repo/packages/engine/node_modules packages/engine/node_modules
COPY --from=installer /repo/packages/shared/node_modules packages/shared/node_modules
COPY --from=installer /repo/apps/api/node_modules apps/api/node_modules
COPY . .

# Webpack bundle: includes @nanchang/engine + @nanchang/shared inline
RUN pnpm --filter @nanchang/api exec nest build --webpack

# ── Stage 3: Production image ─────────────────────────────────────────────────
# Minimal runtime — only the webpack bundle + native addon node_modules (none here).
FROM node:22-alpine AS runner
WORKDIR /app

# Health check (matches App Runner health check path)
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

# Copy the single-file webpack bundle
COPY --from=builder /repo/apps/api/dist ./dist

EXPOSE 3001
ENV NODE_ENV=production

CMD ["node", "dist/main"]
