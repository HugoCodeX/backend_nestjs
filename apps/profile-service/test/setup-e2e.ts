import 'dotenv/config';
import * as path from 'node:path';
import {
  setupTestSchema,
  teardownTestSchema,
  runSqlMigrations,
  type TestSchema,
} from '../../../scripts/test-setup';
import { generateKeyPair, exportJWK, type KeyLike } from 'jose';

const SCHEMA = 'profile_test';
const MIGRATIONS = path.resolve(__dirname, '..', 'drizzle');

export interface ProfileTestKeys {
  privateKey: KeyLike;
  publicKey: KeyLike;
  kid: string;
}

let testSchema: TestSchema | undefined;
let originalDbUrl: string | undefined;
let testKeys: ProfileTestKeys | undefined;

export async function setup(): Promise<void> {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error(
      'DATABASE_URL no está definida. El test e2e necesita acceso a Postgres.',
    );
  }
  originalDbUrl = baseUrl;
  testSchema = await setupTestSchema(baseUrl, SCHEMA);
  await runSqlMigrations(testSchema.databaseUrl, MIGRATIONS);

  // Hacer que db/index.ts use el schema de test
  process.env.DATABASE_URL = testSchema.databaseUrl;

  // Generar par de claves para firmar JWTs de test
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', {
    crv: 'Ed25519',
    extractable: true,
  });
  testKeys = {
    privateKey,
    publicKey,
    kid: 'test-key-1',
  };

  // Sobrescribir BETTER_AUTH_URL para que apunte a un host inexistente
  // (igual se mockea el JWKS en los tests)
  process.env.BETTER_AUTH_URL = 'http://test.invalid';
}

export async function teardown(): Promise<void> {
  if (testSchema && originalDbUrl) {
    await teardownTestSchema(originalDbUrl, testSchema.schema);
    process.env.DATABASE_URL = originalDbUrl;
  }
}

export function getTestSchema(): TestSchema {
  if (!testSchema) {
    throw new Error('Test schema not initialized. Call setup() first.');
  }
  return testSchema;
}

export function getTestKeys(): ProfileTestKeys {
  if (!testKeys) {
    throw new Error('Test keys not initialized. Call setup() first.');
  }
  return testKeys;
}

/**
 * Crea un JWK público a partir de la clave de test, listo para que el
 * mock de JWKS lo devuelva.
 */
export async function getTestPublicJwk() {
  if (!testKeys) {
    throw new Error('Test keys not initialized. Call setup() first.');
  }
  const jwk = await exportJWK(testKeys.publicKey);
  jwk.kid = testKeys.kid;
  jwk.alg = 'EdDSA';
  return jwk;
}
