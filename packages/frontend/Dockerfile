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
COPY packages/frontend/package.json ./packages/frontend/

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
COPY --from=deps /app/packages/frontend/node_modules ./packages/frontend/node_modules

# Copy workspace configuration
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy shared package source and build it
COPY packages/shared ./packages/shared
RUN pnpm --filter @struct-pass/shared build

# Copy frontend source
COPY packages/frontend ./packages/frontend

# Build arguments for environment variables
ARG NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
ARG DOCKER_BUILD=1

# rete リンク（global-nav）と CSP 接続先（next.config）の焼き込み値（ref-0087）。
# 意図的に既定値を置かない＝未設定のままビルドすると、コード側フォールバック localhost:3010/3011 が
# 本番成果物へ黙って焼き込まれる（今回の欠落がまさにそれ）。下の RUN で明示的に失敗させる。
ARG NEXT_PUBLIC_RETE_URL
ARG NEXT_PUBLIC_RETE_API_URL
# 見た目のみの 2 変数（未設定でもビルドは通る）。APP_ENV は空なら env バッジ非表示。
# APP_SUBTITLE の既定はコード側（layout.tsx の ?? 判定）と同値＝空文字で潰さない。
ARG NEXT_PUBLIC_APP_ENV=
ARG NEXT_PUBLIC_APP_SUBTITLE=商品管理システム

# 非空だけでなく http(s) 形式まで検査する＝消費者側のスキームガード（global-nav.tsx ほかの
# /^https?:\/\// 判定）と同じ条件をビルド時に前倒しする。プレースホルダ（<https://...> 等）の
# 置換し忘れは非空チェックを素通りし、実行時に黙って localhost へフォールバックしてしまうため。
RUN for pair in "NEXT_PUBLIC_RETE_URL=$NEXT_PUBLIC_RETE_URL" "NEXT_PUBLIC_RETE_API_URL=$NEXT_PUBLIC_RETE_API_URL"; do \
      case "${pair#*=}" in \
        http://*|https://*) ;; \
        *) echo "ERROR: build arg ${pair%%=*} must be an http(s) URL (got: '${pair#*=}')." \
                "Pass it via compose build args (docker-compose*.yml) or --build-arg." \
                "Building without it would silently bake localhost:3010/3011 into the bundle (ref-0087)." && exit 1 ;; \
      esac; \
    done

ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_RETE_URL=${NEXT_PUBLIC_RETE_URL}
ENV NEXT_PUBLIC_RETE_API_URL=${NEXT_PUBLIC_RETE_API_URL}
ENV NEXT_PUBLIC_APP_ENV=${NEXT_PUBLIC_APP_ENV}
ENV NEXT_PUBLIC_APP_SUBTITLE=${NEXT_PUBLIC_APP_SUBTITLE}
ENV DOCKER_BUILD=${DOCKER_BUILD}
ENV NEXT_TELEMETRY_DISABLED=1

# Ensure public directory exists (may be empty)
RUN mkdir -p /app/packages/frontend/public

# Build frontend (standalone output)
RUN pnpm --filter @struct-pass/frontend build

# ============================================================
# Stage 3: Production
# ============================================================
FROM node:${NODE_VERSION} AS production

# Add non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy standalone build output
COPY --from=build /app/packages/frontend/.next/standalone ./
COPY --from=build /app/packages/frontend/.next/static ./packages/frontend/.next/static

# Copy public directory if it exists (handled gracefully)
COPY --from=build /app/packages/frontend/public ./packages/frontend/public

# Set ownership
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1

CMD ["node", "packages/frontend/server.js"]
