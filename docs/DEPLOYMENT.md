# Deployment

## Estructura del proyecto

```
nestjs-microservices-grpc/
├── docker-compose.yml           ← opción A: deploy todo junto
├── docker-compose.local.yml     ← dev local con todo (Postgres + Redis + 3 servicios)
├── apps/
│   ├── api-gateway/Dockerfile
│   ├── auth-service/Dockerfile
│   └── profile-service/Dockerfile
├── libs/auth/                   ← compartida, compilada a dist/ en cada build
└── docs/
```

---

## Hay 2 formas de deployar

| Opción | Cuándo usarla | Setup |
|---|---|---|
| **A. Compose único en Dokploy** | 1 servicio nuevo, todo junto | `docker-compose.yml` |
| **B. 1 app por servicio** (recomendada para producción) | Microservicios reales, escalar/iterar independientemente | 3 apps en Dokploy, cada una con su propio .env |

**Opción B es la recomendada** para producción porque te da deploys, rollbacks y escalado independientes por servicio.

---

## Opción B: 1 app por servicio en Dokploy

### 1. Crea las bases de datos y Redis en Dokploy

En el panel de Dokploy, crea 3 servicios:
- Postgres para `auth_db`
- Postgres para `profile_db`
- Redis

Apunta los nombres de host/credenciales.

### 2. Crea 3 apps desde el mismo repo

**Para cada servicio** (api-gateway, auth-service, profile-service):

1. Dokploy → New → Application
2. Repository: tu repo (el mismo para los 3)
3. Build Method: **Dockerfile**
4. Dockerfile Path: el path correspondiente:
   - api-gateway: `apps/api-gateway/Dockerfile`
   - auth-service: `apps/auth-service/Dockerfile`
   - profile-service: `apps/profile-service/Dockerfile`
5. Configura las env vars (ver abajo)

> El contexto de build es la raíz del repo en los 3 casos. Los Dockerfiles compilan `libs/auth` antes de buildear el servicio.

### 3. Variables de entorno por servicio

Crea estas env vars en el panel de Dokploy de **cada app**:

**App `api-gateway`:**
```
PORT=3000
RATE_LIMIT_PER_MIN=60
REDIS_URL=redis://redis-interno:6379
AUTH_SERVICE_URL=http://auth-service-interno:3001
PROFILE_SERVICE_URL=http://profile-service-interno:3002
BETTER_AUTH_URL=https://api.tu-dominio.com
FRONTEND_URL=https://tu-frontend.com
```

**App `auth-service`:**
```
PORT=3001
DATABASE_URL=postgres://user:pass@auth-db-interno:5432/auth_db
BETTER_AUTH_SECRET=<genera con: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))">
BETTER_AUTH_URL=https://api.tu-dominio.com
FRONTEND_URL=https://tu-frontend.com
JWT_AUDIENCE=internal-services-prod
RESEND_API_KEY=re_xxxxx
RESEND_FROM_EMAIL=noreply@tu-dominio.com
```

**App `profile-service`:**
```
PORT=3002
DATABASE_URL=postgres://user:pass@profile-db-interno:5432/profile_db
BETTER_AUTH_URL=https://api.tu-dominio.com
JWT_ISSUER=https://api.tu-dominio.com
JWT_AUDIENCE=internal-services-prod
```

> Los nombres de host (`auth-db-interno`, `profile-db-interno`, `redis-interno`, `auth-service-interno`, etc.) son los que asignaste en Dokploy. Ajústalos a tu naming.

### 4. Genera `BETTER_AUTH_SECRET`

Una sola vez, desde tu máquina local:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Pega el resultado en la variable `BETTER_AUTH_SECRET` de la app `auth-service`.

### 5. Corre las migraciones ANTES del primer deploy

Necesitas acceso a las DBs desde tu máquina local:

```bash
cd apps/auth-service
DATABASE_URL="postgres://user:pass@host:puerto/auth_db" pnpm exec drizzle-kit migrate

cd ../profile-service
DATABASE_URL="postgres://user:pass@host:puerto/profile_db" pnpm exec drizzle-kit migrate
```

### 6. Deploy

1. Desplegar la app `auth-service` primero (Dokploy hace health check)
2. Desplegar `profile-service`
3. Desplegar `api-gateway` (depende de los otros 2, así que al final)
4. Verifica:
   ```bash
   curl https://api.tu-dominio.com/health
   # → {"status":"ok"}
   ```

---

## Opción A: Compose único en Dokploy

Si preferís 1 sola app con todo junto, usá `docker-compose.yml`. Las env vars se configuran igual que en la Opción B, pero en una sola app.

**Ventaja:** setup más simple (1 deploy, 1 rollback).
**Desventaja:** escalar/iterar es todo-o-nada.

---

## Dev local con Docker (todo en containers)

Para probar el stack completo sin instalar Node ni Postgres en tu máquina:

```bash
# 1. Crea un .env en la raíz con solo el BETTER_AUTH_SECRET
echo 'BETTER_AUTH_SECRET=tu-secret-de-32-chars' > .env

# 2. Levanta todo
docker compose -f docker-compose.local.yml up -d --build

# Endpoints:
#   Gateway:  http://localhost:3000
#   Postgres: localhost:5433 (auth) | localhost:5434 (profile)
#   Redis:    localhost:6379
```

Detener:
```bash
docker compose -f docker-compose.local.yml down        # mantiene datos
docker compose -f docker-compose.local.yml down -v     # borra datos
```

---

## Dev híbrido (DBs en Docker + servicios en host con pnpm)

Lo que ya usabas. Solo necesitás las DBs:
```bash
docker compose up -d   # solo Postgres + Redis
pnpm dev               # los 3 servicios con pnpm start:dev
```

---

## Health checks

Los 3 servicios exponen `/health` (o `/api/health` para profile):

```bash
curl http://localhost:3000/health        # api-gateway
curl http://localhost:3001/health        # auth-service
curl http://localhost:3002/api/health    # profile-service
```

Dokploy los usa para determinar si el container está listo.

---

## Troubleshooting

| Problema | Causa | Fix |
|---|---|---|
| `ECONNREFUSED auth-service:3001` desde gateway | DNS interno no resuelve | Verifica que `auth-service` existe en la red interna de Dokploy y que el nombre coincide con `AUTH_SERVICE_URL` |
| `BETTER_AUTH_SECRET is still the placeholder` | No configuraste la env var en Dokploy | Genera uno y agrégalo a la app `auth-service` |
| `pg_isready` falla | Postgres no terminó de arrancar | Espera al healthcheck |
| `Port 3000 already in use` | Otro proceso en el host | Cambia el port mapping de la app `api-gateway` en Dokploy |
| Emails no se envían | `RESEND_API_KEY` vacío | Configúralo en la app `auth-service` |
| Cookie no persiste | `BETTER_AUTH_URL` usa HTTP en prod | Usa HTTPS |
| `CORS: origin not allowed` | `FRONTEND_URL` no coincide | Debe ser exactamente el origen del frontend |
| Build falla con "cannot find pnpm-workspace.yaml" | El Dockerfile Path es incorrecto | Verificá que el path apunta a `apps/<servicio>/Dockerfile` (no a un subdirectorio) |

---

## Checklist pre-producción

- [ ] `BETTER_AUTH_SECRET` ≥32 chars, en Dokploy (NO en el repo)
- [ ] `BETTER_AUTH_URL` y `FRONTEND_URL` con HTTPS
- [ ] `RESEND_API_KEY` configurado y dominio verificado
- [ ] Migraciones ejecutadas en las DBs de producción
- [ ] Health checks respondiendo 200 en los 3 servicios
- [ ] Backups automáticos de las DBs configurados en Dokploy
- [ ] `.env` (con datos reales) NO commiteado (está en `.gitignore`)
