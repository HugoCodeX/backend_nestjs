# auth-profile

PNPM workspace (apps + libs) for a NestJS microservices setup with **Better Auth** and the **JWT plugin + JWKS** for stateless downstream verification.

## Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9
- Docker (for Postgres + Redis)

## Repo layout

```text
apps/
  api-gateway/        — reverse proxy, CORS, rate limiting, JWT translation
  auth-service/       — Better Auth + JWT plugin
  profile-service/    — stateless JWT verification via JWKS
libs/
  auth/               — shared Better Auth factory + Drizzle schema
docker-compose.yml    — local infrastructure (Postgres, Redis)
```

## One-time setup

```bash
pnpm install

# Copiar env files
cp apps/api-gateway/.env.example apps/api-gateway/.env
cp apps/auth-service/.env.example apps/auth-service/.env
cp apps/profile-service/.env.example apps/profile-service/.env

# Generar BETTER_AUTH_SECRET (≥32 chars). Mantenerlo en secreto: cifra las private keys del JWKS.
openssl rand -base64 32
# Pegar el resultado en apps/auth-service/.env como BETTER_AUTH_SECRET
```

## Build

```bash
# Compilar libs/auth primero (requerido antes de los apps)
pnpm build:libs

# Compilar todo
pnpm build
```

`libs/auth` debe compilarse a `dist/` porque los apps la consumen como paquete compilado (Node.js no resuelve `.ts` directamente).

## Run infrastructure

```bash
pnpm db:up               # Postgres + Redis
pnpm db:migrate:auth     # crea user, session, account, verification, jwks
pnpm db:migrate:profile  # crea profiles
pnpm db:logs
pnpm db:down
```

## Run services (dev)

**Opción 1 — los 3 a la vez (recomendado):**

```bash
pnpm dev
```

Este comando:
1. Compila `libs/auth`
2. Arranca docker compose (Postgres + Redis) si no están corriendo
3. Levanta los 3 servicios con output colorizado (azul=auth, verde=profile, magenta=gateway)
4. `Ctrl+C` detiene los 3 a la vez

En Windows también funciona vía `pnpm dev` (usa `concurrently` internamente, cross-platform).

Si prefieres un script nativo:

- PowerShell: `.\scripts\dev.ps1`

**Opción 2 — terminales separadas:**

```bash
pnpm run auth       # :3001
pnpm run profile    # :3002
pnpm run gateway    # :3000 (única entrada pública)
```

## Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │ Browser (frontend)                          │
                    │  - HttpOnly cookies only (SameSite=None)     │
                    │  - never sees the internal JWT               │
                    └──────────┬──────────────────────────────────┘
                               │ Cookie: better-auth.session_token=...
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│ api-gateway (:3000) — UNIQUE public entry point                      │
│  - CORS for the frontend (credentials: true)                         │
│  - Rate limiting (Redis, ThrottlerGuard)                             │
│  - trust proxy enabled (passes X-Forwarded-For / X-Real-IP)          │
│                                                                      │
│  /api/{*path} → routing por path, dos comportamientos:               │
│    • "api/auth*":   proxy transparente a auth-service                 │
│                     (Cookie, Set-Cookie, Location, Content-Type)     │
│    • "api/profile*": proxy autenticado                                │
│      1. Lee Cookie                                                   │
│      2. GET /api/auth/token en auth-service → { token } o 401        │
│      3. Strip spoofable headers                                      │
│      4. Add Authorization: Bearer <jwt>                              │
│      5. Add X-Forwarded-For / X-Real-IP con req.ip                   │
│      6. Proxy a profile-service                                      │
└────────────┬─────────────────────────────────────┬───────────────────┘
             │                                     │
   ┌─────────▼────────┐                  ┌─────────▼────────┐
   │ auth-service     │                  │ profile-service  │
   │ :3001 (privado)  │                  │ :3002 (privado)  │
   │                  │                  │                  │
   │ Better Auth +    │                  │ - jose           │
   │   plugin JWT     │                  │ - createRemote   │
   │   (EdDSA/Ed25519)│                  │   JWKSet         │
   │                  │                  │ - jwtVerify      │
   │ tables:          │                  │   (EdDSA,        │
   │   user           │                  │    iss, aud,     │
   │   session        │                  │    exp, sub)     │
   │   account        │                  │                  │
   │   verification   │                  │ No cookies.      │
   │   jwks           │                  │ No gRPC.         │
   └──────────────────┘                  └──────────────────┘
```

### How auth works end-to-end

1. Browser signs up via `POST /api/auth/sign-up/email` (proxied to auth-service).
2. auth-service returns a `Set-Cookie: better-auth.session_token=...` (HttpOnly, SameSite=None).
3. For protected routes (`/api/profile*`), the gateway:
   - Reads the cookie
   - Calls `GET /api/auth/token` on auth-service with the cookie
   - auth-service returns a short-lived EdDSA-signed JWT (5 min) with claims `iss`, `aud`, `exp`, `iat`, `sub`
   - Gateway forwards to profile-service with `Authorization: Bearer <jwt>`
4. profile-service verifies the JWT locally using the public keys fetched from `${BETTER_AUTH_URL}/api/auth/jwks` (proxied through the gateway). No shared secrets, no gRPC, no DB lookup.

### How profile-service maps data to accounts

- Better Auth signs the JWT with `sub = user.id` (random string generated at sign-up).
- The `JwtGuard` validates the JWT with JWKS, extracts `payload.sub`, and sets `req.user = { sub }`.
- `ProfileService` uses `eq(profiles.userId, user.sub)` to find the user's profile.
- `profiles.userId` has a `UNIQUE` constraint. `getProfile` and `updateProfile` use `INSERT ... ON CONFLICT DO NOTHING` to handle concurrent first-access auto-creation safely.
- Users can only see/edit their own profile because the `userId` is always taken from the verified JWT, never from a request body or query string.

## Required env vars

**auth-service** (`.env`):
- `DATABASE_URL` — Postgres for the auth DB
- `BETTER_AUTH_SECRET` — ≥32 chars; encrypts JWKS private keys
- `BETTER_AUTH_URL` — public gateway URL (e.g. `http://localhost:3000`)
- `FRONTEND_URL` — CORS origin (e.g. `http://localhost:5173`)
- `JWT_AUDIENCE` — JWT aud claim (e.g. `internal-services-dev`)

**api-gateway** (`.env`):
- `AUTH_SERVICE_URL` — internal URL (e.g. `http://localhost:3001`)
- `PROFILE_SERVICE_URL` — internal URL (e.g. `http://localhost:3002`)
- `BETTER_AUTH_URL` — same as auth-service
- `FRONTEND_URL` — CORS origin
- `REDIS_URL` — for rate limiting

**profile-service** (`.env`):
- `DATABASE_URL` — Postgres for the profile DB
- `BETTER_AUTH_URL` — used to build the JWKS URL
- `JWT_ISSUER` — must equal `BETTER_AUTH_URL`
- `JWT_AUDIENCE` — same as auth-service

## Better Auth endpoints

Available through the gateway at `http://localhost:3000`:

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/sign-up/email` | Create account with email + password |
| `POST` | `/api/auth/sign-in/email` | Sign in (sets `better-auth.session_token` cookie) |
| `POST` | `/api/auth/sign-out` | Sign out (clears cookie) |
| `GET`  | `/api/auth/get-session` | Returns the current session (200 or 401) |
| `GET`  | `/api/auth/token` | Returns `{ token }` (JWT signed with EdDSA, used internally by the gateway) |
| `GET`  | `/api/auth/jwks` | Public JWKS for downstream verification |

## Security notes

- `BETTER_AUTH_SECRET` must be kept secret and **backed up**: it encrypts the private keys in the `jwks` table. Losing it invalidates all previously issued JWTs.
- `profile-service` must not be publicly exposed. Only the gateway should reach it.
- The gateway strips spoofable headers before forwarding (`Authorization`, `X-User-*`, `X-Forwarded-*`, `Host`, etc.) and re-injects `X-Forwarded-For` / `X-Real-IP` with the verified client IP. Downstream services can trust these headers because they only accept traffic from the gateway.
- Cookies are `HttpOnly` + `SameSite=None` to allow cross-origin requests from the frontend. In dev this works on `localhost` without `Secure` (browser exception). In production `Secure` is auto-set from `NODE_ENV`, so HTTPS is mandatory.
- JWTs are short-lived (5 minutes). No caching in the first phase.
- `disableSettingJwtHeader: true` keeps the JWT out of the `set-auth-jwt` response header.
- The profile-service `getProfile`/`updateProfile` use `INSERT ... ON CONFLICT DO NOTHING` to handle concurrent first-access auto-creation safely.

## Troubleshooting

- **`Cannot find module '@auth-profile/auth'`**: run `pnpm build:libs`.
- **TypeScript errors on `betterAuth(...)` inferred type**: the libs/auth source uses `as unknown as ReturnType<typeof betterAuth>` to avoid pulling zod internal types into the .d.ts. Don't change this unless you know what you're doing.
- **Wildcard route errors on NestJS 11**: use `'{*path}'` not `'*'` in `@All()` and `@Get()` decorators. The bare `*` was removed in `path-to-regexp` v8.
- **`/api/profile` returns 404 but `/api/profile/` works**: the gateway route uses `'api/profile{/*path}'` (no slash before `{`). With the slash it only matches sub-paths. The current config matches both `/api/profile` and `/api/profile/anything`.
