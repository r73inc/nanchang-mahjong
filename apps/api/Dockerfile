# ─── Stage 1: install all workspace deps (dev + prod) ────────────────────────
# Separate layer so source changes don't bust the npm install cache.
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

# Copy only the manifests needed for pnpm install
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/engine/package.json ./packages/engine/
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile

# ─── Stage 2: build workspace packages + API ─────────────────────────────────
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

# Re-use the installed node_modules from the deps stage
COPY --from=deps /app/node_modules ./node_modules
# Copy full source (package.json files already present from node_modules copy,
# but COPY . . refreshes them and adds src/)
COPY . .

# Build workspace dependencies in order, then the API
RUN pnpm --filter @nanchang/engine run build \
    && pnpm --filter @nanchang/shared run build \
    && pnpm --filter @nanchang/api run build

# pnpm deploy copies the API's production deps + dereferences workspace packages.
# It respects .gitignore and will skip the dist/ directories, so we patch them
# back in immediately after.
RUN pnpm --filter @nanchang/api deploy --prod /standalone \
    && cp -r apps/api/dist /standalone/dist \
    && cp -r packages/engine/dist /standalone/node_modules/@nanchang/engine/dist \
    && cp -r packages/shared/dist /standalone/node_modules/@nanchang/shared/dist

# ─── Stage 3: minimal production image ───────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

COPY --from=builder /standalone .

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["node", "dist/main"]
