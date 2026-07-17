import 'dotenv/config';
import { createRemoteJWKSet } from 'jose';

if (!process.env.BETTER_AUTH_URL) {
  throw new Error('BETTER_AUTH_URL is required for JWKS verification');
}

const baseUrl = process.env.BETTER_AUTH_URL.replace(/\/+$/, '');
const jwksUrl = new URL(`${baseUrl}/api/auth/jwks`);

export const JWKS = createRemoteJWKSet(jwksUrl, {
  cooldownDuration: 5_000,
  timeoutDuration: 3_000,
});
