const UNSAFE_HEADERS = new Set([
  'authorization',
  'cookie',
  'x-user-id',
  'x-user-email',
  'x-user-role',
  'x-roles',
  'x-admin',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-for',
  'x-real-ip',
  'x-http-method-override',
  'x-method-override',
  'expect',
  'te',
  'upgrade',
  'proxy-authorization',
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-length',
]);

export function stripUnsafeHeaders(
  headers: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (UNSAFE_HEADERS.has(key.toLowerCase())) continue;
    result[key] = value;
  }
  return result;
}
