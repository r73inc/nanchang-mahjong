# ─── Stage 1: install deps + build ───────────────────────────────────────────
# Single stage so pnpm workspace symlinks stay intact throughout.
# Dev deps are present here but are NOT carried into the final image.
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

# Copy full monorepo source (node_modules excluded via .dockerignore)
COPY . .

# Install all workspace deps (dev + prod) in one go so symlinks are correct
RUN pnpm install --frozen-lockfile

# Build workspace packages in dependency order, then the API
RUN pnpm --filter @nanchang/engine run build \
    && pnpm --filter @nanchang/shared run build \
    && pnpm --filter @nanchang/api run build

# pnpm deploy --legacy creates a self-contained production directory.
# Because @nanchang/engine, @nanchang/shared, and zod are declared in
# apps/api/package.json, pnpm includes them and all their transitive npm deps
# (e.g. zod) in /standalone/node_modules.
# In --legacy mode pnpm hard-links workspace package files (including already-
# built dist/) directly, so no manual cp of shared/engine dirs is needed.
# Only the API's own dist (gitignored, not part of the package deploy) needs
# to be added manually.
RUN pnpm --filter @nanchang/api deploy --legacy --prod /standalone \
    && cp -r apps/api/dist /standalone/dist

# ─── Stage 2: minimal production image ───────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

COPY --from=builder /standalone .

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["node", "dist/main"]
