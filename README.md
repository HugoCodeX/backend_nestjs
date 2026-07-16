# auth-profile

PNPM workspace (apps + libs) for a small NestJS microservices setup:

- `apps/api-gateway`: API gateway service
- `apps/auth-service`: auth service
- `apps/profile-service`: profile service
- `libs/shared`: shared library code

`docker-compose.yml` provides local infrastructure:

- **Redis** on `localhost:6379` (used by the API gateway for throttling).
- **auth-postgres** (Postgres 16) on `localhost:5433` (DB `auth_db`, user/password `auth`).
- **profile-postgres** (Postgres 16) on `localhost:5434` (DB `profile_db`, user/password `profile`).

Each service has its own database (database-per-service pattern).

## Setup

Create local env files from the templates:

```bash
cp apps/api-gateway/.env.example apps/api-gateway/.env
cp apps/auth-service/.env.example apps/auth-service/.env
cp apps/profile-service/.env.example apps/profile-service/.env
```

Then edit the `.env` files as needed (e.g. `DATABASE_URL`, `JWT_SECRET`).

## Install

```bash
pnpm install
```

## Run infrastructure (Redis + Postgres)

```bash
pnpm db:up           # docker compose up -d
pnpm db:migrate      # runs drizzle-kit migrate for auth-service and profile-service
pnpm db:logs         # tail logs of all infra containers
pnpm db:down         # stop and remove containers (volumes are preserved)
```

## Run services (dev)

In separate terminals:

```bash
pnpm run gateway
```

```bash
pnpm run auth
```

```bash
pnpm run profile
```

## Repo layout

```text
apps/
  api-gateway/
  auth-service/
  profile-service/
libs/
  shared/
```

