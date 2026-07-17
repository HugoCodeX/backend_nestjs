import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { jwt } from 'better-auth/plugins';
import { authDb } from './db.js';
import * as schema from './schema.js';
import { getEmailSender } from './email.js';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(`${name} is required`);
  }
  return v;
}

function requireSecret(name: string, minLength = 32): string {
  const v = requireEnv(name);
  if (v.length < minLength) {
    throw new Error(
      `${name} must be at least ${minLength} characters (got ${v.length}). Generate one with: openssl rand -base64 32`,
    );
  }
  if (v === 'replace-with-a-long-random-secret-of-at-least-32-chars') {
    throw new Error(
      `${name} is still the placeholder value. Replace it with a real secret.`,
    );
  }
  return v;
}

function emailHtml(params: {
  title: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
}): string {
  return `
<!doctype html>
<html>
  <body style="font-family: system-ui, sans-serif; max-width: 560px; margin: 24px auto; padding: 0 16px; color: #1a1a1a;">
    <h1 style="font-size: 20px; margin-bottom: 16px;">${params.title}</h1>
    <p style="line-height: 1.5;">${params.body}</p>
    <p style="margin: 24px 0;">
      <a href="${params.ctaUrl}" style="background: #1a1a1a; color: #fff; padding: 10px 18px; text-decoration: none; border-radius: 6px; display: inline-block;">
        ${params.ctaLabel}
      </a>
    </p>
    <p style="font-size: 12px; color: #666; margin-top: 32px;">
      Si no solicitaste esto, ignora este mensaje. El enlace expira en 1 hora.
    </p>
  </body>
</html>`.trim();
}

// El tipo de retorno de betterAuth() incluye referencias internas a zod
// que no son portables en archivos de declaración. Hacemos cast al tipo
// base para poder exportar la declaración sin romper el build de libs/auth.
export const auth = betterAuth({
  baseURL: requireEnv('BETTER_AUTH_URL'),
  basePath: '/api/auth',
  secret: requireSecret('BETTER_AUTH_SECRET'),
  trustedOrigins: [
    requireEnv('BETTER_AUTH_URL'),
    requireEnv('FRONTEND_URL'),
  ],
  database: drizzleAdapter(authDb, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      jwks: schema.jwks,
      rateLimit: schema.rateLimit,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
    maxPasswordLength: 256,
    autoSignIn: true,
    sendResetPassword: async ({ user, url }) => {
      const sender = getEmailSender();
      await sender.send({
        to: user.email,
        subject: 'Restablece tu contraseña',
        html: emailHtml({
          title: 'Restablece tu contraseña',
          body: `Hola ${user.name}, recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón para continuar.`,
          ctaLabel: 'Restablecer contraseña',
          ctaUrl: url,
        }),
        text: `Hola ${user.name}, restablece tu contraseña aquí: ${url}`,
      });
    },
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const sender = getEmailSender();
      await sender.send({
        to: user.email,
        subject: 'Verifica tu email',
        html: emailHtml({
          title: 'Verifica tu email',
          body: `Hola ${user.name}, confirma tu email para activar tu cuenta.`,
          ctaLabel: 'Verificar email',
          ctaUrl: url,
        }),
        text: `Hola ${user.name}, verifica tu email aquí: ${url}`,
      });
    },
  },
  rateLimit: {
    enabled: true,
    storage: 'database',
    modelName: 'rateLimit',
    window: 60,
    max: 100,
    customRules: {
      '/sign-up/email': { window: 60, max: 5 },
      '/sign-in/email': { window: 60, max: 10 },
      '/forget-password': { window: 60, max: 3 },
      '/reset-password': { window: 60, max: 3 },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
      strategy: 'compact',
    },
  },
  account: {
    accountLinking: {
      enabled: false,
    },
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === 'production',
    defaultCookieAttributes: {
      sameSite: 'none',
    },
    ipAddress: {
      ipAddressHeaders: ['x-forwarded-for', 'x-real-ip'],
    },
  },
  plugins: [
    jwt({
      jwks: {
        keyPairConfig: {
          alg: 'EdDSA',
          crv: 'Ed25519',
        },
        rotationInterval: 60 * 60 * 24 * 7,
        gracePeriod: 60 * 60 * 24,
      },
      jwt: {
        issuer: requireEnv('BETTER_AUTH_URL'),
        audience: requireEnv('JWT_AUDIENCE'),
        expirationTime: '5m',
      },
      disableSettingJwtHeader: true,
    }),
  ],
}) as unknown as ReturnType<typeof betterAuth>;

export type Auth = typeof auth;
