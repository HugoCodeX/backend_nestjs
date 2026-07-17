# API Reference

Single public entrypoint for all HTTP traffic. Everything else is proxied from here.

| | |
|---|---|
| **Base URL (dev)** | `http://localhost:3000` |
| **Content-Type** | `application/json` |
| **Auth** | HttpOnly cookie `better-auth.session_token` (browser) — `Authorization: Bearer <jwt>` (server-to-server / gateway → profile) |
| **Rate limit** | `RATE_LIMIT_PER_MIN` per IP at gateway (default 60/min, DDoS protection). Better Auth has its own per-endpoint rate limiting (sign-up: 5/min, sign-in: 10/min, etc.) configured in `libs/auth/src/auth.ts`. |

The gateway is the **only** public entrypoint. `auth-service:3001` and `profile-service:3002` are private.

The gateway forwards:

- `/api/auth/*` → `auth-service:3001` (cookie forward)
- `/api/profile/*` → `auth-service:3001` (cookie → JWT translation) → `profile-service:3002` (Bearer JWT)

> **Note:** `/api/profile/*` requires authentication. The gateway intercepts the request, calls `GET /api/auth/token` on `auth-service` to exchange the session cookie for a short-lived JWT (EdDSA, 5 min), then forwards the request to `profile-service` with `Authorization: Bearer <jwt>`. The JWT is cached in-memory in the gateway for 4 min.

---

## Endpoints

### Auth (Better Auth, via gateway)

All routes under `/api/auth/*` are proxied directly to Better Auth running on `auth-service`. The browser interacts with these using the `better-auth.session_token` cookie (HttpOnly, `SameSite=None`, `Secure` set automatically in production).

#### Sign up

```http
POST /api/auth/sign-up/email
Content-Type: application/json
Origin: http://localhost:3000

{
  "name": "Hugo",
  "email": "hugo@example.com",
  "password": "developer"
}
```

Response `200`:

```json
{
  "token": "<session-token>",
  "user": {
    "id": "abc123randomstring",
    "email": "hugo@example.com",
    "emailVerified": false,
    "name": "Hugo",
    "image": null,
    "createdAt": "2026-07-16T22:00:00.000Z",
    "updatedAt": "2026-07-16T22:00:00.000Z"
  }
}
```

Also sets `Set-Cookie: better-auth.session_token=<token>; HttpOnly; SameSite=None; Path=/`.

#### Sign in

```http
POST /api/auth/sign-in/email
Content-Type: application/json
Origin: http://localhost:3000

{
  "email": "hugo@example.com",
  "password": "developer"
}
```

Response `200`: same shape as sign-up. Sets `Set-Cookie: better-auth.session_token=<token>`.

#### Forgot password (request reset link)

```http
POST /api/auth/forget-password
Content-Type: application/json
Origin: http://localhost:3000

{
  "email": "hugo@example.com",
  "redirectTo": "http://localhost:5173/reset-password"
}
```

Response `200`. Sends an email with a reset link (via Resend, or console.log in dev if no API key). Token expires in 1 hour. Rate-limited to 3 requests per minute per IP.

#### Reset password

```http
POST /api/auth/reset-password
Content-Type: application/json
Origin: http://localhost:3000

{
  "token": "<token-from-email>",
  "newPassword": "new-secure-password"
}
```

Response `200`. Revokes all existing sessions for the user. Rate-limited to 3 requests per minute per IP.

#### Email verification

After sign-up, an email is sent (if `RESEND_API_KEY` is set) with a verification link. Email verification is **not required** by default (`requireEmailVerification: false`). To enforce it, change the flag in `libs/auth/src/auth.ts`.

#### Sign out

```http
POST /api/auth/sign-out
Origin: http://localhost:3000
Cookie: better-auth.session_token=<token>
```

Response `200`. Clears the session cookie.

#### Get current session

```http
GET /api/auth/get-session
Cookie: better-auth.session_token=<token>
```

Response `200`:

```json
{
  "user": { ... },
  "session": { ... }
}
```

Response `401` if no valid session.

#### Exchange session for JWT (internal use)

This endpoint is used by the gateway to translate the session cookie into a short-lived JWT for downstream services. It is **not intended for direct browser use**.

```http
GET /api/auth/token
Cookie: better-auth.session_token=<token>
Origin: http://localhost:3000
```

Response `200`:

```json
{ "token": "<jwt>" }
```

Response `401` if no valid session. The JWT is signed with EdDSA (Ed25519), has a 5-minute expiration, and includes `iss`, `aud`, `exp`, `iat`, `sub` claims. Downstream services verify it against the JWKS endpoint.

#### JWKS (public, used by profile-service)

```http
GET /api/auth/jwks
```

Response `200`:

```json
{
  "keys": [
    {
      "kid": "...",
      "kty": "OKP",
      "alg": "EdDSA",
      "crv": "Ed25519",
      "x": "..."
    }
  ]
}
```

The public keys used to verify JWTs. The gateway caches this response for 5 seconds (via `cooldownDuration` in `jose`).

### Profile (via gateway with JWT)

#### Get current user's profile

```http
GET /api/profile
Cookie: better-auth.session_token=<token>
```

The gateway intercepts this, exchanges the cookie for a JWT via `auth-service`, then calls `profile-service` with `Authorization: Bearer <jwt>`. The profile-service verifies the JWT using JWKS.

Response `200`:

```json
{
  "id": "uuid",
  "userId": "abc123randomstring",
  "firstName": "Hugo",
  "lastName": "Pérez",
  "bio": "...",
  "avatarUrl": "https://...",
  "createdAt": "2026-07-16T22:00:00.000Z",
  "updatedAt": "2026-07-16T22:00:00.000Z"
}
```

If the profile does not exist yet, it is auto-created on first access (atomic upsert with `ON CONFLICT DO NOTHING`).

#### Update current user's profile

```http
PATCH /api/profile
Content-Type: application/json
Cookie: better-auth.session_token=<token>

{
  "firstName": "Hugo",
  "lastName": "Pérez",
  "bio": "Software engineer",
  "avatarUrl": "https://example.com/avatar.png"
}
```

All fields are optional. Validation:
- `firstName`, `lastName`: string, 1–100 chars, trimmed.
- `bio`: string, max 2000 chars, trimmed.
- `avatarUrl`: valid URL (http/https, allows localhost), max 2048 chars.

Response `200`: the updated profile.

---

## Error responses

All services return errors in this shape:

```json
{ "message": "..." }
```

| Status | Meaning |
|---|---|
| `400` | Validation error (unknown field, invalid format, etc.) |
| `401` | Missing or invalid session / JWT |
| `404` | Not found |
| `429` | Rate limit exceeded |
| `500` | Internal server error |
| `502` | Upstream service unavailable |
| `503` | Service shutting down |

---

## Environment variables

### `api-gateway/.env`

| Var | Required | Default | Description |
|---|---|---|---|
| `PORT` | no | `3000` | HTTP listen port |
| `REDIS_URL` | yes | — | Redis for rate limiting (e.g. `redis://localhost:6379`) |
| `RATE_LIMIT_PER_MIN` | no | `60` | Default bucket: requests per IP per minute (DDoS protection) |
| `AUTH_SERVICE_URL` | yes | — | Internal URL of auth-service (e.g. `http://localhost:3001`) |
| `PROFILE_SERVICE_URL` | yes | — | Internal URL of profile-service (e.g. `http://localhost:3002`) |
| `BETTER_AUTH_URL` | yes | — | Public gateway URL (e.g. `http://localhost:3000`) — used as JWT issuer |
| `FRONTEND_URL` | yes | — | Frontend origin allowed by CORS (e.g. `http://localhost:5173`) |

### `auth-service/.env`

| Var | Required | Default | Description |
|---|---|---|---|
| `PORT` | no | `3001` | HTTP listen port |
| `DATABASE_URL` | yes | — | Postgres connection (e.g. `postgres://auth:auth@localhost:5433/auth_db`) |
| `BETTER_AUTH_SECRET` | yes | — | ≥32 chars. Encrypts JWKS private keys. Generate with `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | yes | — | Public gateway URL (same as in gateway). |
| `FRONTEND_URL` | yes | — | CORS origin. |
| `JWT_AUDIENCE` | yes | — | JWT `aud` claim. Must match profile-service. |
| `RESEND_API_KEY` | no (required in prod) | — | Resend API key for email verification + password reset. Get one at https://resend.com/api-keys. In dev, if not set, emails are printed to console. |
| `RESEND_FROM_EMAIL` | no (required in prod) | — | Sender email (e.g. `noreply@yourdomain.com`). Must be a verified domain in Resend. |

### `profile-service/.env`

| Var | Required | Default | Description |
|---|---|---|---|
| `PORT` | no | `3002` | HTTP listen port |
| `DATABASE_URL` | yes | — | Postgres connection (e.g. `postgres://profile:profile@localhost:5434/profile_db`) |
| `BETTER_AUTH_URL` | yes | — | Public gateway URL. Used to fetch JWKS. |
| `JWT_ISSUER` | yes | — | Must equal `BETTER_AUTH_URL`. |
| `JWT_AUDIENCE` | yes | — | Must equal auth-service. |

---

## Security notes

- **CORS**: only `FRONTEND_URL` is allowed. Credentials are enabled.
- **Cookies**: `HttpOnly`, `SameSite=None`, `Path=/`. `Secure` is set automatically in production (`NODE_ENV=production`).
- **JWTs**: short-lived (5 min). No caching at the auth-service (the gateway caches for 4 min).
- **JWKS rotation**: keys rotate every 7 days with a 24-hour grace period.
- **Rate limiting**: per-IP buckets in Redis. Auth endpoints are more strictly limited (20/min) than general traffic (60/min).
- **Header stripping**: the gateway strips `Authorization`, `Cookie`, `X-User-*`, `X-Forwarded-*`, `Host`, `Connection`, `Transfer-Encoding`, `Content-Length`, and others before forwarding. It re-injects `X-Forwarded-For` / `X-Real-IP` with the verified client IP.
- **Trust proxy**: the gateway trusts only `loopback`, `linklocal`, and `uniquelocal` proxies (prevents IP spoofing).
- **Helmet**: security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options) are set by `helmet` in the gateway.
- **TLS**: assumed to be terminated upstream (load balancer). Services themselves are HTTP only.
