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

# pnpm deploy creates a self-contained production directory.
# It copies the API's prod deps + materialises workspace packages,
# but skips gitignored dist/ directories — patch them back in after.
RUN pnpm --filter @nanchang/api deploy --legacy --prod /standalone \
    && cp -r apps/api/dist /standalone/dist \
    && rm -rf /standalone/node_modules/@nanchang/engine \
       /standalone/node_modules/@nanchang/shared \
    && mkdir -p /standalone/node_modules/@nanchang/engine \
    && cp -r packages/engine/dist /standalone/node_modules/@nanchang/engine/ \
    && cp packages/engine/package.json /standalone/node_modules/@nanchang/engine/ \
    && mkdir -p /standalone/node_modules/@nanchang/shared \
    && cp -r packages/shared/dist /standalone/node_modules/@nanchang/shared/ \
    && cp packages/shared/package.json /standalone/node_modules/@nanchang/shared/

# ─── Stage 2: minimal production image ───────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

COPY --from=builder /standalone .

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["node", "dist/main"]
