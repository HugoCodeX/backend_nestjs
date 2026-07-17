# syntax=docker/dockerfile:1.7

# ---------- Stage 1: deps + build ----------
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++ \
    && corepack enable \
    && corepack prepare pnpm@9.12.0 --activate

WORKDIR /repo

# Copiar todo lo necesario para resolver workspaces e instalar deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY libs/ ./libs/
COPY apps/api-gateway/ ./apps/api-gateway/

# Instalar deps + build de la lib compartida + build del servicio
RUN pnpm install --frozen-lockfile \
    && pnpm --filter @auth-profile/auth build \
    && pnpm --filter api-gateway build \
    && pnpm --prod --filter @auth-profile/auth --filter api-gateway deploy /out

# ---------- Stage 2: runtime ----------
FROM node:20-alpine AS runner

RUN apk add --no-cache tini curl \
    && addgroup -S app \
    && adduser -S app -G app

WORKDIR /app
ENV NODE_ENV=production

# Copiar artefactos construidos (incluye node_modules prod-only)
COPY --from=builder /out ./
# dist de la app ya viene dentro de /out (nest build emite a ./dist)
# Copiamos explícitamente por seguridad
COPY --from=builder /repo/apps/api-gateway/dist ./dist
COPY --from=builder /repo/libs/auth/dist ./node_modules/@auth-profile/auth/dist
COPY --from=builder /repo/libs/auth/package.json ./node_modules/@auth-profile/auth/package.json

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:3000/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
