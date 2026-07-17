# syntax=docker/dockerfile:1.7

# ---------- Stage 1: deps + build ----------
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++ \
    && corepack enable \
    && corepack prepare pnpm@9.12.0 --activate

WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY libs/ ./libs/
COPY apps/profile-service/ ./apps/profile-service/

RUN pnpm install --frozen-lockfile \
    && pnpm --filter @auth-profile/auth build \
    && pnpm --filter profile-service build \
    && pnpm --prod --filter @auth-profile/auth --filter profile-service deploy /out

# ---------- Stage 2: runtime ----------
FROM node:20-alpine AS runner

RUN apk add --no-cache tini curl \
    && addgroup -S app \
    && adduser -S app -G app

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /out ./
COPY --from=builder /repo/apps/profile-service/dist ./dist
COPY --from=builder /repo/libs/auth/dist ./node_modules/@auth-profile/auth/dist
COPY --from=builder /repo/libs/auth/package.json ./node_modules/@auth-profile/auth/package.json

USER app
EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:3002/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
