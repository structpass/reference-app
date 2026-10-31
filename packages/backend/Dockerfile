# Node の版はこの 1 行だけ（下の 3 ステージが同じ値を参照する・v2-416）。
# 開発・CI は .nvmrc を読み、本番イメージはこの既定値を使う。両者がずれたら
# scripts/check-node-version.mjs（CI の test ジョブ）が止める。
# 別の版で試す時は --build-arg NODE_VERSION=<tag> で差し替える。
ARG NODE_VERSION=24-alpine

# ============================================================
# Stage 1: Install dependencies
# ============================================================
FROM node:${NODE_VERSION} AS deps

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy workspace configuration
# patches は pnpm install より前に要る（patchedDependencies が当てる patch の実体。
# 無いと --frozen-lockfile が patch を見つけられず install が止まる）。
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY patches ./patches
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# ============================================================
# Stage 2: Build
# ============================================================
FROM node:${NODE_VERSION} AS build

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/backend/node_modules ./packages/backend/node_modules

# Copy workspace configuration
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy shared package source and build it
COPY packages/shared ./packages/shared
RUN pnpm --filter @struct-pass/shared build

# Copy backend source
COPY packages/backend ./packages/backend

# Generate Prisma client
RUN pnpm --filter @struct-pass/backend prisma:generate

# Build backend
RUN pnpm --filter @struct-pass/backend build

# ============================================================
# Stage 3: Production
# ============================================================
FROM node:${NODE_VERSION} AS production

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Add non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

WORKDIR /app

# Copy workspace config
# production の install も patch を当てるため、patches を先に置く。
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY patches ./patches
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/

# Copy Prisma schema
COPY --from=build /app/packages/backend/prisma ./packages/backend/prisma

# Install all dependencies, generate Prisma client, then prune to prod only
RUN pnpm install --frozen-lockfile \
    && pnpm --filter @struct-pass/backend prisma:generate \
    && pnpm install --frozen-lockfile --prod

# Copy built shared package
COPY --from=build /app/packages/shared/dist ./packages/shared/dist

# Copy built backend
COPY --from=build /app/packages/backend/dist ./packages/backend/dist

# Set ownership
RUN chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/v1/health || exit 1

WORKDIR /app/packages/backend

CMD ["node", "dist/main"]
