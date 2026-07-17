import { http } from './http';
import { TtlCache } from './ttl-cache';

export interface JwtResult {
  ok: true;
  token: string;
}

export interface JwtError {
  ok: false;
  status: number;
  error: string;
}

interface TokenCacheEntry {
  token: string;
  expiresAtMs: number;
}

const SESSION_COOKIE_NAME = 'better-auth.session_token';

const tokenCache = new TtlCache<string, TokenCacheEntry>(4 * 60 * 1000, 5_000);

function extractSessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName === SESSION_COOKIE_NAME && rest.length > 0) {
      return rest.join('=');
    }
  }
  return null;
}

export async function getJwtFromSession(
  cookieHeader: string | undefined,
): Promise<JwtResult | JwtError> {
  const sessionToken = extractSessionToken(cookieHeader);
  if (!sessionToken) {
    return { ok: false, status: 401, error: 'No session cookie' };
  }

  const cached = tokenCache.get(sessionToken);
  if (cached) {
    return { ok: true, token: cached.token };
  }

  try {
    const response = await http.get<{ token: string }>(
      `${process.env.AUTH_SERVICE_URL}/api/auth/token`,
      {
        headers: {
          cookie: cookieHeader,
          origin: process.env.BETTER_AUTH_URL!,
        },
        timeout: 3_000,
      },
    );

    if (response.status !== 200) {
      const status = response.status === 401 ? 401 : response.status;
      return {
        ok: false,
        status,
        error: status === 401 ? 'Invalid session' : `Auth service ${status}`,
      };
    }

    let data: { token?: string };
    try {
      const raw: unknown = response.data;
      const text: string = Buffer.isBuffer(raw)
        ? raw.toString('utf8')
        : typeof raw === 'string'
          ? raw
          : '';
      data = JSON.parse(text) as { token?: string };
    } catch {
      return { ok: false, status: 502, error: 'Invalid auth service response' };
    }

    if (!data.token) {
      return { ok: false, status: 401, error: 'Invalid session' };
    }

    tokenCache.set(sessionToken, {
      token: data.token,
      expiresAtMs: Date.now() + 4 * 60 * 1000,
    });

    return { ok: true, token: data.token };
  } catch {
    return { ok: false, status: 502, error: 'Auth service unavailable' };
  }
}

export function clearJwtCache(): void {
  tokenCache.clear();
}

export function destroyJwtCache(): void {
  tokenCache.destroy();
}
