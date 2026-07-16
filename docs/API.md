# API Reference

Single public entrypoint for all HTTP traffic. Everything else is proxied from here.

| | |
|---|---|
| **Base URL (dev)** | `http://localhost:3000` |
| **Content-Type** | `application/json` |
| **Auth header** | `Authorization: Bearer <jwt>` (except public routes) |
| **Rate limit** | `RATE_LIMIT_PER_MIN` per IP (default `60`, see `apps/api-gateway/.env`) |

The gateway forwards:

- `/api/auth/*` → `auth-service:3001/auth/*`
- `/api/profile/*` → `profile-service:3002/profile/*`

---

## Endpoints

1. POST /api/auth/register
2. POST /api/auth/login
3. GET /api/auth/me
4. GET /api/profile
5. PATCH /api/profile

---

## Authentication

All routes require a JWT except `POST /api/auth/register` and `POST /api/auth/login`.

1. Call `/api/auth/register` or `/api/auth/login` to obtain a `token`.
2. Send it on every protected request:

```http
Authorization: Bearer eyJhbGciOi...
```

Tokens are signed with `JWT_SECRET` (see `apps/api-gateway/.env` and `apps/auth-service/.env`). The same secret is used by the gateway and by `auth-service` to verify tokens.

---

## Endpoints

### Auth

#### `POST /api/auth/register`

Creates a new user.

- **Auth**: public
- **Body**

  ```json
  {
    "email": "ada@example.com",
    "password": "secret123"
  }
  ```

  `password` must be at least 6 characters.

- **Responses**

  | Status | Body |
  |---|---|
  | `201 Created` | `{ "user": { "id": "uuid", "email": "ada@example.com", "createdAt": "..." }, "token": "eyJ..." }` |
  | `400 Bad Request` | validation error (invalid email, password too short) |
  | `409 Conflict` | `{ "message": "Email already in use" }` |

#### `POST /api/auth/login`

Authenticates an existing user.

- **Auth**: public
- **Body**

  ```json
  {
    "email": "ada@example.com",
    "password": "secret123"
  }
  ```

- **Responses**

  | Status | Body |
  |---|---|
  | `200 OK` | `{ "user": { "id": "uuid", "email": "ada@example.com", "createdAt": "..." }, "token": "eyJ..." }` |
  | `401 Unauthorized` | `{ "message": "Invalid credentials" }` |

#### `GET /api/auth/me`

Returns the JWT payload of the current user.

- **Auth**: Bearer JWT
- **Body**: none
- **Responses**

  | Status | Body |
  |---|---|
  | `200 OK` | `{ "sub": "uuid", "email": "ada@example.com", "iat": 1700000000, "exp": 1700003600 }` |
  | `401 Unauthorized` | missing / malformed / expired token |

> Note: this returns the **JWT payload** (what the gateway decoded from the token), not a fresh DB read.

---

### Profile

#### `GET /api/profile`

Returns the profile of the currently authenticated user. Auto-creates an empty profile the first time it is called for a new user.

- **Auth**: Bearer JWT
- **Body**: none
- **Responses**

  | Status | Body |
  |---|---|
  | `200 OK` | `{ "id": "uuid", "userId": "uuid", "firstName": "", "lastName": "", "bio": "", "avatarUrl": "", "createdAt": "...", "updatedAt": "..." }` |
  | `401 Unauthorized` | missing / invalid token (also returned if `auth-service` is down — see notes below) |

#### `PATCH /api/profile`

Updates the current user's profile. Any field omitted is left unchanged. If no profile row exists yet, it is created with the provided fields.

- **Auth**: Bearer JWT
- **Body** (all fields optional)

  ```json
  {
    "firstName": "Ada",
    "lastName": "Lovelace",
    "bio": "First programmer.",
    "avatarUrl": "https://example.com/ada.png"
  }
  ```

  - `avatarUrl`, if provided, must be a valid URL.
  - The DTO uses `class-validator` with `whitelist: true`, so unknown fields are stripped.

- **Responses**

  | Status | Body |
  |---|---|
  | `200 OK` | updated profile (same shape as `GET /api/profile`) |
  | `400 Bad Request` | validation error (e.g. `avatarUrl` is not a URL) |
  | `401 Unauthorized` | missing / invalid token |

---

## gRPC (internal)

`profile-service` does not verify JWTs locally — it calls `auth-service` over gRPC.

| Service | RPC | Address (dev) | Request | Response |
|---|---|---|---|---|
| `auth.AuthService` | `ValidateToken` | `localhost:5001` | `{ "token": "eyJ..." }` | `{ "valid": true, "userId": "uuid", "email": "...", "error": "" }` |

This is also why `profile-service` can return `401` when `auth-service` is down or unreachable (the call goes through a circuit breaker in `apps/profile-service/src/common/circuit-breaker.ts`).

---

## Recommended test flow (Bruno / Postman)

1. **`POST /api/auth/register`** with a new email/password → copy the `token` from the response into a collection variable (e.g. `{{token}}`).
2. **`GET /api/auth/me`** with header `Authorization: Bearer {{token}}` → confirms the token works.
3. **`GET /api/profile`** with the same header → returns (and auto-creates) the profile.
4. **`PATCH /api/profile`** with the same header and any subset of fields → returns the updated profile.
5. **`POST /api/auth/login`** with the same credentials → returns the same shape (useful for testing re-auth).

---

## cURL examples

### Register
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"ada@example.com","password":"secret123"}'
```

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ada@example.com","password":"secret123"}'
```

### Me
```bash
TOKEN=eyJhbGciOi...   # paste token from register/login
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

### Get profile
```bash
curl http://localhost:3000/api/profile \
  -H "Authorization: Bearer $TOKEN"
```

### Update profile
```bash
curl -X PATCH http://localhost:3000/api/profile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"firstName":"Ada","lastName":"Lovelace","bio":"First programmer.","avatarUrl":"https://example.com/ada.png"}'
```

---

## Common error shapes

All errors come back as JSON from Nest's exception filter:

```json
{ "message": "Invalid credentials", "error": "Unauthorized", "statusCode": 401 }
```

- `400` → validation errors (class-validator)
- `401` → missing / invalid / expired JWT (or invalid credentials)
- `409` → conflict (email already in use)
- `429` → rate limit exceeded (`RATE_LIMIT_PER_MIN` per IP per minute)
- `500` → downstream service unreachable / unexpected error
